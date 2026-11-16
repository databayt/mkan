import "server-only";
/**
 * Loads the inbound overview (inbound-pure.ts): the people from the chat funnel's facts, reach and intent
 * from SiteSignal, TikTok views from the posts that went out. Read-only (2026-11-16).
 */
import { db } from "@/lib/db";

import { loadChatFacts } from "./chat-funnel";
import { addDays, buildInbound, kigaliDayOf, type InboundOverview } from "./inbound-pure";

export async function loadInbound(now: Date = new Date()): Promise<InboundOverview | null> {
  const today = kigaliDayOf(now);
  // Two weeks of signals (this week and last); TikTok posts from the same window, with a day's margin for Kigali's offset.
  const from = addDays(today, -13);
  const [facts, signals, first, posts] = await Promise.all([
    loadChatFacts(db, 45, now),
    db.siteSignal.findMany({ where: { day: { gte: from } }, select: { day: true, kind: true, visitorHash: true } }),
    db.siteSignal.findFirst({ orderBy: { day: "asc" }, select: { day: true } }),
    db.tikTokPost.findMany({
      where: { status: "POSTED", postedAt: { gte: new Date(now.getTime() - 15 * 86_400_000) } },
      select: { postedAt: true, views: true },
    }),
  ]);
  return buildInbound({
    facts,
    signals,
    posts: posts.flatMap((p) => (p.postedAt ? [{ postedAt: p.postedAt, views: p.views }] : [])),
    signalsSince: first?.day ?? null,
    now,
  });
}
