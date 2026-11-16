import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";

/** An anonymous browser idle this long has its chats and memory deleted. */
const IDLE_DAYS = 180;
/** SiteSignal rows (one per visitor per day) older than this are deleted. */
const SIGNAL_DAYS = 120;

/**
 * Daily (03:00 UTC, cf/crons.json) — the rental agent keeps what a tenant
 * told it only while they use it: an anonymous profile untouched for 180
 * days goes with its chats, its memory and its trace (cascade), as do chats
 * from before profiles whose browser never came back. Signed-in accounts are
 * kept; they delete chats themselves, or the account.
 */
export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  const cutoff = new Date(Date.now() - IDLE_DAYS * 86_400_000);
  const [profiles, orphans] = await Promise.all([
    // Idle means no chat either: a profile's updatedAt moves only with its memory, so a tenant who keeps
    // chatting (every WhatsApp profile has no userId) must not lose their chats (2026-11-06).
    db.agentProfile.deleteMany({ where: { userId: null, updatedAt: { lt: cutoff }, tasks: { none: { updatedAt: { gte: cutoff } } } } }),
    db.agentTask.deleteMany({ where: { profileId: null, updatedAt: { lt: cutoff } } }),
  ]);
  // The upstream signals (analytics/signals.ts) are kept 120 days: long enough for the weekly and monthly reads (2026-11-16).
  const signals = await db.siteSignal.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - SIGNAL_DAYS * 86_400_000) } } }).catch(() => ({ count: 0 }));
  return NextResponse.json({ ok: true, profiles: profiles.count, orphanChats: orphans.count, signals: signals.count });
}
