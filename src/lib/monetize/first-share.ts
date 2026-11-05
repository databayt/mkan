import "server-only";

import { db } from "@/lib/db";

import { shapeFirstShare, type ChatRow, type FirstShareView, type PostRow } from "./first-share-shape";

const DAY = 86_400_000;
const POST_SELECT = {
  id: true,
  listingId: true,
  ref: true,
  brokerHandle: true,
  status: true,
  reason: true,
  pickedAt: true,
  cleanAt: true,
  postedAt: true,
  tiktokUrl: true,
  views: true,
  likes: true,
} as const;

/**
 * The first-share funnel from Neon: TikTokPost rows (written by the Mac's post
 * lane), the chats that opened with a TikTok code (AgentTask.refSource), the
 * chatbot's work on them, and the deals they became. Null when the tables
 * cannot be read — the page then says "unknown", never a quiet zero.
 */
export async function loadFirstShare(days: number): Promise<FirstShareView | null> {
  const since = new Date(Date.now() - days * DAY);
  try {
    const [posts, tasks, firstContacts] = await Promise.all([
      db.tikTokPost.findMany({
        where: { OR: [{ pickedAt: { gte: since } }, { postedAt: { gte: since } }] },
        orderBy: { pickedAt: "desc" },
        take: 200,
        select: POST_SELECT,
      }),
      db.agentTask.findMany({
        where: { refSource: "tiktok", createdAt: { gte: since } },
        select: { id: true, profileId: true, refListingId: true, createdAt: true, status: true },
      }),
      db.agentProfile.findMany({ where: { firstSource: "tiktok", createdAt: { gte: since } }, select: { id: true } }),
    ]);
    const ids = tasks.map((t) => t.id);
    const listingIds = [...new Set(tasks.map((t) => t.refListingId).filter((x): x is number => x != null))];
    const [shortlisted, requests, deals, posted] = await Promise.all([
      ids.length
        ? db.agentEvent.findMany({ where: { taskId: { in: ids }, kind: "shortlist_ready" }, select: { taskId: true }, distinct: ["taskId"] })
        : [],
      ids.length
        ? db.brokerRequest.findMany({ where: { taskId: { in: ids }, channel: { not: "joined" } }, select: { taskId: true, status: true } })
        : [],
      ids.length ? db.deal.findMany({ where: { taskId: { in: ids } }, select: { taskId: true, status: true, mkanShare: true } }) : [],
      listingIds.length
        ? db.tikTokPost.findMany({ where: { listingId: { in: listingIds }, status: "POSTED", postedAt: { not: null } }, select: POST_SELECT })
        : [],
    ]);
    const short = new Set(shortlisted.map((e) => e.taskId));
    const asked = new Set(requests.map((r) => r.taskId));
    const answered = new Set(requests.filter((r) => r.status === "AVAILABLE" || r.status === "RENTED").map((r) => r.taskId));
    const chats: ChatRow[] = tasks.map((t) => ({
      id: t.id,
      profileId: t.profileId,
      refListingId: t.refListingId,
      createdAt: t.createdAt,
      failed: t.status === "FAILED",
      shortlisted: short.has(t.id),
      asked: asked.has(t.id),
      answered: answered.has(t.id),
    }));
    return shapeFirstShare({
      days,
      since,
      posts: posts as PostRow[],
      postedForAttribution: posted as PostRow[],
      chats,
      firstContacts: firstContacts.map((p) => p.id),
      deals: deals.map((d) => ({ taskId: d.taskId, status: d.status, mkanShare: d.mkanShare })),
    });
  } catch (err) {
    console.error("[monetize] first-share funnel unreadable:", err instanceof Error ? err.message : err);
    return null;
  }
}
