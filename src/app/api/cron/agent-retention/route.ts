import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { db } from "@/lib/db";

/** An anonymous browser idle this long has its chats and memory deleted. */
const IDLE_DAYS = 180;

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
    db.agentProfile.deleteMany({ where: { userId: null, updatedAt: { lt: cutoff } } }),
    db.agentTask.deleteMany({ where: { profileId: null, updatedAt: { lt: cutoff } } }),
  ]);
  return NextResponse.json({ ok: true, profiles: profiles.count, orphanChats: orphans.count });
}
