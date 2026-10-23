import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { coerceMemory, mergeMemory } from "./memory";

/**
 * Who a rental-agent chat belongs to.
 *
 * A browser is known by its httpOnly `mkan_agent` cookie — a random UUID of
 * which the database keeps only the sha256. Signing in attaches that
 * browser's profile to the account, or folds it into the account's profile
 * from another device. From then on the profile opens only with the session,
 * so signing out on a shared phone leaves nothing for the next person: the
 * browser gets a fresh cookie and an empty profile.
 *
 * Reads (a page render, the poll) never write: they may open the account's
 * profile and a not-yet-merged anonymous one. Writes (server actions, the chat
 * list) adopt old chats, merge, create and rotate — cookies can only be set
 * there — and roll the cookie for a year only when it is new, rotated or a
 * month old. A Server Action that sets a cookie makes Next re-render the whole
 * current page into its response; every send used to (2026-10-24).
 */

export const AGENT_COOKIE = "mkan_agent";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
/** A cookie this old is rolled for another year on the next write. */
const ROLL_AFTER_DAYS = 30;

const dayNumber = (ms = Date.now()) => Math.floor(ms / 86_400_000);

/**
 * The cookie is `<uuid>.<issue day, base 36>`; only the uuid is the key (and
 * hashed). A bare uuid is a cookie from before the stamp — rolled on its next write.
 */
function readCookie(raw: string | undefined): { key: string; issued: number | null } | null {
  if (!raw) return null;
  const [key, stamp] = raw.split(".");
  if (!key) return null;
  const issued = stamp ? parseInt(stamp, 36) : NaN;
  return { key, issued: Number.isFinite(issued) ? issued : null };
}

const SELECT = { id: true, userId: true, memory: true, lastSearchAt: true } satisfies Prisma.AgentProfileSelect;
export type AgentProfileRow = Prisma.AgentProfileGetPayload<{ select: typeof SELECT }>;

export interface Viewer {
  /** The profile new chats go to — null for a read with nothing stored yet. */
  profile: AgentProfileRow | null;
  /** Every profile whose chats this viewer may open. */
  ids: string[];
  /** The raw cookie, for tasks from before profiles (`AgentTask.sessionKey`). */
  legacyKey: string | null;
}

export const hashKey = (key: string): string => createHash("sha256").update(key).digest("hex");

/** The `where` that limits a task query to what this viewer owns. */
export function ownedBy(viewer: Viewer): Prisma.AgentTaskWhereInput {
  const or: Prisma.AgentTaskWhereInput[] = [];
  if (viewer.ids.length) or.push({ profileId: { in: viewer.ids } });
  if (viewer.legacyKey) or.push({ sessionKey: viewer.legacyKey, profileId: null });
  return or.length ? { OR: or } : { id: "__none__" };
}

/** Fold an anonymous profile into the account's: its chats move, its memory merges, it is gone. */
async function absorb(into: AgentProfileRow, from: AgentProfileRow): Promise<AgentProfileRow> {
  const memory = mergeMemory(coerceMemory(into.memory), coerceMemory(from.memory));
  const times = [into.lastSearchAt, from.lastSearchAt].filter((d): d is Date => !!d).map((d) => d.getTime());
  const [, merged] = await db.$transaction([
    db.agentTask.updateMany({ where: { profileId: from.id }, data: { profileId: into.id } }),
    db.agentProfile.update({
      where: { id: into.id },
      data: { memory: memory as unknown as Prisma.InputJsonValue, lastSearchAt: times.length ? new Date(Math.max(...times)) : null },
      select: SELECT,
    }),
    db.agentProfile.deleteMany({ where: { id: from.id } }),
  ]);
  return merged;
}

export async function resolveViewer({ write }: { write: boolean }): Promise<Viewer> {
  const jar = await cookies();
  const cookie = readCookie(jar.get(AGENT_COOKIE)?.value);
  let key = cookie?.key ?? null;
  const userId = (await auth().catch(() => null))?.user?.id ?? null;
  let byKey = key ? await db.agentProfile.findUnique({ where: { keyHash: hashKey(key) }, select: SELECT }) : null;

  // A cookie from before profiles: its chats carry the raw key. The first write gives it a profile and brings them along.
  if (write && key && !byKey && (await db.agentTask.count({ where: { sessionKey: key, profileId: null } })) > 0) {
    byKey = await db.agentProfile.upsert({ where: { keyHash: hashKey(key) }, create: { keyHash: hashKey(key) }, update: {}, select: SELECT });
    await db.agentTask.updateMany({ where: { sessionKey: key, profileId: null }, data: { profileId: byKey.id, sessionKey: null } });
  }

  let profile: AgentProfileRow | null = null;
  const ids: string[] = [];
  if (userId) {
    profile = await db.agentProfile.findUnique({ where: { userId }, select: SELECT });
    const anonymous = byKey && !byKey.userId ? byKey : null;
    if (write) {
      if (anonymous) {
        profile = profile
          ? await absorb(profile, anonymous)
          : await db.agentProfile.update({ where: { id: anonymous.id }, data: { userId }, select: SELECT });
      }
      profile ??= await db.agentProfile.upsert({ where: { userId }, create: { userId }, update: {}, select: SELECT });
    } else if (anonymous) {
      ids.push(anonymous.id);
      profile ??= anonymous;
    }
  } else if (byKey?.userId) {
    // This browser signed out: the profile is the account's, not the next visitor's.
    if (write) key = null;
  } else {
    profile = byKey;
  }

  if (write) {
    key ??= randomUUID();
    if (!userId) {
      profile ??= await db.agentProfile.upsert({ where: { keyHash: hashKey(key) }, create: { keyHash: hashKey(key) }, update: {}, select: SELECT });
    }
    const stale = cookie?.issued == null || dayNumber() - cookie.issued >= ROLL_AFTER_DAYS;
    if (key !== cookie?.key || stale) {
      jar.set(AGENT_COOKIE, `${key}.${dayNumber().toString(36)}`, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: COOKIE_MAX_AGE,
        path: "/",
      });
    }
  }
  if (profile && !ids.includes(profile.id)) ids.unshift(profile.id);
  return { profile, ids, legacyKey: key && !byKey?.userId ? key : null };
}

/** A write-side viewer always has a profile. */
export async function requireProfile(): Promise<Viewer & { profile: AgentProfileRow }> {
  const viewer = await resolveViewer({ write: true });
  if (!viewer.profile) throw new Error("agent profile missing after a write resolve");
  return viewer as Viewer & { profile: AgentProfileRow };
}
