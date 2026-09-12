/**
 * Mkan-specific adapter for the shared report pipeline.
 *
 * Mkan has rich auth (UserRole enum: SUPER_ADMIN, ADMIN, HOST, GUEST, ...) and
 * a Prisma User model. Phase 1 reads role + ipHash; Phase 2 will add
 * priorAccepted/priorRejected from the upcoming Report Prisma model.
 *
 * Team detection — the signal the human gate sorts by: SUPER_ADMIN / ADMIN /
 * DEVELOPER roles, a databayt email, or REPORT_TEAM_EMAILS (comma-separated).
 *
 * Hosts: the live site is www.mkan.sd (moved off *.databayt.org). A host
 * missing from the allowlist is a silent black hole — HF5 rejects and the
 * dialog still shows "Submitted. Thank you!".
 *
 * Captcha: mkan never wired Turnstile; `captcha: "optional"` keeps anonymous
 * reports at degraded trust instead of refusing them (kun refuses).
 *
 * Rate-limit + dedup + corroboration use Upstash (the existing mkan pattern).
 */

import { createHash } from "crypto";

import { auth } from "@/lib/auth";
import { assertRateLimit, RateLimitError as MkanRateLimitError } from "@/lib/rate-limit";

import { RateLimitError, type ReportAdapter } from "./adapters/adapter";
import type { PipelineEvent, ReporterContext, ReportInput } from "./types";

import { Redis } from "@upstash/redis";
import { headers } from "next/headers";

// Trim env values — a stray trailing newline in GITHUB_REPO builds a malformed
// GitHub URL and silently breaks every report submission.
const REPO = (process.env.GITHUB_REPO || "databayt/mkan").trim();
const SALT = (process.env.REPORT_IP_SALT || "mkan-default-salt").trim();

const TEAM_ROLES = new Set(["SUPER_ADMIN", "ADMIN", "DEVELOPER"]);
const TEAM_EMAILS = new Set(
  (process.env.REPORT_TEAM_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
);
const TEAM_EMAIL_DOMAINS = ["@databayt.org", "@mkan.sd"];

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? Redis.fromEnv()
    : null;

export const mkanReportAdapter: ReportAdapter = {
  repo: REPO,
  hostAllowlist: [
    "mkan.sd",
    "www.mkan.sd",
    "*.mkan.sd",
    "mkan.databayt.org",
    "mkan.com.sa",
    "*.mkan.com.sa",
    "*.databayt.org",
    "localhost",
    "127.0.0.1",
  ],
  captcha: "optional",

  async getReporter(_input: ReportInput): Promise<ReporterContext> {
    const ip = await getClientIpFromHeaders();
    const ipHash = hashIp(ip);

    const session = await auth().catch(() => null);
    if (session?.user?.id) {
      const role = String(session.user.role ?? "USER");
      return {
        kind: "authenticated",
        userId: session.user.id,
        role,
        emailVerified: Boolean(session.user.email),
        accountAgeDays: 30, // Phase 1: rough constant; Phase 2 reads from DB
        isSuspended: false,
        ipHash,
        isTeam: isTeamReporter(role, session.user.email),
      };
    }
    return { kind: "anonymous", ipHash };
  },

  async checkRateLimit(identifier: string): Promise<void> {
    try {
      await assertRateLimit("report", identifier);
      await assertRateLimit("report-tenant", "mkan");
    } catch (err) {
      if (err instanceof MkanRateLimitError) {
        throw new RateLimitError(err.message);
      }
      throw err;
    }
  },

  async getRecentSelfSubmissions(identifier: string, withinSec: number): Promise<string[]> {
    if (!redis) return [];
    const key = `report:dedup:${identifier}`;
    const raw = (await redis.lrange<string>(key, 0, 19).catch(() => null)) ?? [];
    const cutoff = Date.now() - withinSec * 1000;
    return raw
      .map((s) => {
        const idx = s.indexOf("|");
        if (idx < 0) return null;
        const ts = Number(s.slice(0, idx));
        const head = s.slice(idx + 1);
        return ts >= cutoff ? head : null;
      })
      .filter((v): v is string => v !== null);
  },

  async getCorroborationCount(host: string, path: string, withinDays: number): Promise<number> {
    if (!redis) return 0;
    const key = `report:page:${host}:${normalizedPath(path)}`;
    const count = await redis.get<number>(key).catch(() => null);
    void withinDays;
    return count == null ? 0 : Number(count);
  },

  async isBanned(identifier: string): Promise<boolean> {
    if (!redis) return false;
    const banned = await redis.sismember("report:banned", identifier).catch(() => 0);
    return banned === 1;
  },

  async recordPipelineEvent(event: PipelineEvent): Promise<void> {
    console.info("[report]", JSON.stringify(event));

    if (!redis) return;

    // HF9 ledger — keyed by the identifier the pipeline computed. Deriving it
    // again here is what once keyed the write on `user:<ipHash>` while the read
    // used `user:<userId>`: written, never found, dedup dead for signed-in users.
    if (
      event.dedupIdentifier &&
      event.outcome !== "silent-reject" &&
      event.outcome !== "duplicate-corroborated"
    ) {
      const key = `report:dedup:${event.dedupIdentifier}`;
      const entry = `${Date.now()}|${event.path.slice(0, 60)}`;
      await redis.lpush(key, entry).catch(() => {});
      await redis.ltrim(key, 0, 19).catch(() => {});
      await redis.expire(key, 60).catch(() => {});
    }

    if (event.outcome === "verified-report" && event.host && event.path) {
      const key = `report:page:${event.host}:${normalizedPath(event.path)}`;
      await redis.incr(key).catch(() => {});
      await redis.expire(key, 60 * 60 * 24 * 7).catch(() => {});

      // Remember which issue covers this URL so the next report about the same
      // page corroborates it instead of opening a duplicate. findExistingForUrl
      // reads this key; nothing wrote it before 2026-09-13.
      if (event.issueNumber) {
        const issueKey = `report:issue:${event.host}:${normalizedPath(event.path)}`;
        await redis.set(issueKey, event.issueNumber, { ex: 60 * 60 * 24 * 30 }).catch(() => {});
      }
    }
  },

  async findExistingForUrl(host: string, path: string): Promise<{ issueNumber: number } | null> {
    if (!redis) return null;
    const key = `report:issue:${host}:${normalizedPath(path)}`;
    const num = await redis.get<number>(key).catch(() => null);
    return num ? { issueNumber: Number(num) } : null;
  },
};

function isTeamReporter(role: string, email: string | null | undefined): boolean {
  if (TEAM_ROLES.has(role.toUpperCase())) return true;
  const mail = (email ?? "").trim().toLowerCase();
  if (!mail) return false;
  if (TEAM_EMAILS.has(mail)) return true;
  return TEAM_EMAIL_DOMAINS.some((d) => mail.endsWith(d));
}

async function getClientIpFromHeaders(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    h.get("cf-connecting-ip") ||
    "0.0.0.0"
  );
}

function hashIp(ip: string): string {
  return createHash("sha256").update(`${ip}:${SALT}`).digest("hex").slice(0, 16);
}

function normalizedPath(path: string): string {
  const beforeQuery = path.split("?")[0] ?? path;
  return beforeQuery.replace(/\/$/, "") || "/";
}
