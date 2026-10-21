import "server-only";

/**
 * Demand the agent could not meet. A search with no home (or only widened
 * ones) opens a `TenantRequest`: the brokers and agencies whose ads cover the
 * area are asked for a home, and every home that comes in later — a broker's
 * reply through `/b/d/<token>` or tomorrow's scrape — is matched against it.
 * A tenant who left a number gets a WhatsApp when it finds something.
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { publicAppUrl } from "../../../scripts/crm/public-links";
import { appendTaskEvents } from "./broker";
import { demandMessage, needSummary, tenantAlertMessage } from "./broker-message";
import { BROKER_ASK_GAP_HOURS, DEMAND_TTL_DAYS, pickBrokersForDemand } from "./demand-pure";
import { rankCandidates } from "./rank";
import { coerceRequirements, EMPTY_REQUIREMENTS, mergeRequirements, type Requirements } from "./requirements";
import { searchKigali, toShortlist } from "./search";
import type { EventKind, ShortlistItem, StepStatus } from "./types";
import { sendMessages, type Outgoing } from "./whatsapp";

const json = (v: unknown) => v as Prisma.InputJsonValue;
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export const demandLink = (token: string, lang = "en") => `${publicAppUrl()}/${lang}/b/d/${token}`;
export const chatLink = (taskId: string, lang = "en") => `${publicAppUrl()}/${lang}/find?c=${taskId}`;

/** Brokers loaded per request before scoring: the most recently active first. */
const BROKER_POOL = 400;

/**
 * Open (or refresh) the request for a task and ask the brokers who cover it.
 * A request asks brokers once per day at most; a later turn in the same chat
 * only updates what the tenant wants. Returns how many brokers were asked now.
 */
export async function openDemand(taskId: string, profileId: string | null, r: Requirements, lang: string): Promise<{ requestId: string; asked: number }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + DEMAND_TTL_DAYS * 86_400_000);
  const request = await db.tenantRequest.upsert({
    where: { taskId },
    create: { taskId, profileId, requirements: json(r), locale: lang, expiresAt },
    update: { requirements: json(r), locale: lang, expiresAt, status: "OPEN" },
    select: { id: true },
  });
  const askedToday = await db.outboundMessage.count({
    where: { tenantRequestId: request.id, kind: "BROKER_ASK", createdAt: { gte: new Date(now.getTime() - BROKER_ASK_GAP_HOURS * 3_600_000) } },
  });
  if (askedToday > 0) return { requestId: request.id, asked: 0 };

  const pool = await db.broker.findMany({
    where: { optOut: false, phones: { isEmpty: false } },
    orderBy: [{ lastSeenAt: { sort: "desc", nulls: "last" } }],
    take: BROKER_POOL,
    select: {
      id: true, kind: true, name: true, tiktokHandle: true, phones: true, districts: true, neighbourhoods: true, stays: true,
      priceMin: true, priceMax: true, lastSeenAt: true, lastAskedAt: true, asks: true, answers: true, optOut: true,
    },
  });
  const picked = pickBrokersForDemand(pool, r, now);
  if (picked.length === 0) return { requestId: request.id, asked: 0 };

  const need = needSummary(r);
  const messages: Outgoing[] = picked.map((b) => {
    const token = randomBytes(18).toString("base64url");
    const name = b.tiktokHandle ? `@${b.tiktokHandle}` : b.kind === "AGENCY" ? b.name : null;
    return {
      kind: "BROKER_ASK",
      to: b.phones[0]!,
      body: demandMessage(name, need, demandLink(token, "en")),
      label: name ?? b.name,
      brokerId: b.id,
      tenantRequestId: request.id,
      tokenHash: hash(token),
    };
  });
  const channel = await sendMessages(messages, `Rental agent → no home for "${need.en}", asking ${picked.length} brokers`);
  await Promise.all([
    db.broker.updateMany({ where: { id: { in: picked.map((b) => b.id) } }, data: { lastAskedAt: now, asks: { increment: 1 } } }),
    appendTaskEvents(taskId, [["broker_contact_started", "waiting_person", { demand: true, count: picked.length, channel }]]),
  ]);
  return { requestId: request.id, asked: picked.length };
}

/** The tenant's opt-in: their number, for an alert when a home comes in. */
export async function optInDemand(taskId: string, phone: string): Promise<boolean> {
  const res = await db.tenantRequest.updateMany({ where: { taskId, status: { in: ["OPEN", "MATCHED"] } }, data: { phone, optInAt: new Date() } });
  return res.count > 0;
}

/**
 * Match one open request against homes listed after `since` (or the given
 * listings). New fits go to the top of the chat's shortlist with a trace row,
 * and an opted-in tenant gets one WhatsApp. Returns the new listing ids.
 */
export async function matchRequest(
  request: { id: string; taskId: string; requirements: Prisma.JsonValue; locale: string; phone: string | null; matchedListingIds: number[] },
  since: Date,
): Promise<number[]> {
  const r = mergeRequirements(EMPTY_REQUIREMENTS, coerceRequirements(request.requirements));
  const query: Requirements = r.stay ? r : { ...r, stay: "long" };
  const { candidates } = await searchKigali(query, { createdAfter: since, excludeIds: request.matchedListingIds });
  const ranked = rankCandidates(candidates, query).ranked;
  if (ranked.length === 0) return [];
  const lang = (["en", "ar", "rw"].includes(request.locale) ? request.locale : "en") as "en" | "ar" | "rw";
  const cards = await toShortlist(ranked.slice(0, 6), lang, query.near?.name);
  const ids = cards.map((c) => c.id);

  const task = await db.agentTask.findUnique({ where: { id: request.taskId }, select: { shortlist: true } });
  const current = ((task?.shortlist as unknown as ShortlistItem[] | null) ?? []).filter((s) => !ids.includes(s.id));
  await db.$transaction([
    db.agentTask.update({ where: { id: request.taskId }, data: { shortlist: json([...cards, ...current].slice(0, 12)) } }),
    db.tenantRequest.update({
      where: { id: request.id },
      data: { status: "MATCHED", matchedListingIds: { push: ids }, lastMatchedAt: new Date() },
    }),
  ]);
  const events: [EventKind, StepStatus, Record<string, unknown>][] = [["shortlist_ready", "done", { count: cards.length, demand: true }]];
  await appendTaskEvents(request.taskId, events);
  if (request.phone) {
    await sendMessages(
      [{ kind: "TENANT_ALERT", to: request.phone, body: tenantAlertMessage(lang, cards.length, chatLink(request.taskId, lang)), label: "tenant", tenantRequestId: request.id }],
      `Rental agent → tenant alert (${cards.length} new)`,
    );
  }
  return ids;
}

/** Every open request against what was listed since `since`; expired ones close. */
export async function matchOpenDemand(since: Date, now = new Date()): Promise<{ requests: number; matched: number; homes: number }> {
  await db.tenantRequest.updateMany({ where: { status: { in: ["OPEN", "MATCHED"] }, expiresAt: { lt: now } }, data: { status: "EXPIRED" } });
  const open = await db.tenantRequest.findMany({
    where: { status: { in: ["OPEN", "MATCHED"] }, expiresAt: { gte: now } },
    select: { id: true, taskId: true, requirements: true, locale: true, phone: true, matchedListingIds: true },
  });
  let matched = 0;
  let homes = 0;
  for (const req of open) {
    const ids = await matchRequest(req, since).catch((err) => {
      console.warn(`[demand] ${req.id}: ${(err as Error).message}`);
      return [] as number[];
    });
    if (ids.length) {
      matched += 1;
      homes += ids.length;
    }
  }
  return { requests: open.length, matched, homes };
}
