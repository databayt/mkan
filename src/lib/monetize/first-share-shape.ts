/**
 * The first-share funnel, pure: one listing → one clean broker video → one
 * TikTok post → the people who sent its code → how the chatbot did with them →
 * who got the home and what Mkan earned. The loader (first-share.ts) reads the
 * rows; this file joins them so the tests can check the arithmetic.
 *
 * Attribution is last touch: a chat that opened with home K1234 belongs to
 * the latest POSTED post of that listing at or before the chat began.
 */

export interface PostRow {
  id: string;
  listingId: number;
  ref: string;
  brokerHandle: string | null;
  status: string;
  reason: string | null;
  pickedAt: Date;
  cleanAt: Date | null;
  postedAt: Date | null;
  tiktokUrl: string | null;
  views: number | null;
  likes: number | null;
}

export interface ChatRow {
  id: string;
  profileId: string | null;
  refListingId: number | null;
  createdAt: Date;
  failed: boolean;
  shortlisted: boolean;
  asked: boolean;
  answered: boolean;
}

export interface DealRow {
  taskId: string | null;
  status: string;
  mkanShare: number | null;
}

export interface FunnelCounts {
  contacts: number;
  chats: number;
  shortlisted: number;
  asked: number;
  answered: number;
  failedChats: number;
  viewings: number;
  signed: number;
  paid: number;
  paidShareRwf: number;
}

export interface FirstSharePost extends FunnelCounts {
  id: string;
  ref: string;
  listingId: number;
  brokerHandle: string | null;
  status: string;
  reason: string | null;
  pickedAt: string;
  postedAt: string | null;
  tiktokUrl: string | null;
  views: number | null;
  likes: number | null;
}

export interface FirstShareView extends FunnelCounts {
  days: number;
  /** Listings picked for a post (the "featured" homes). */
  featured: number;
  /** Videos stripped clean of every text and logo. */
  clean: number;
  rejected: number;
  posted: number;
  failedUploads: number;
  /** Views of the posts with a stats reading; null until tt:stats has read any (not 0). */
  views: number | null;
  /** Code chats no post could claim (the home was never posted, or posted after the chat). */
  unattributedChats: number;
  rejectReasons: { reason: string; count: number }[];
  /** Posted and in-flight posts in the window, newest first. */
  posts: FirstSharePost[];
}

const SIGNED = new Set(["SIGNED", "PAID"]);

function counts(chats: ChatRow[], deals: Map<string, DealRow[]>): FunnelCounts {
  const ds = chats.flatMap((c) => deals.get(c.id) ?? []);
  return {
    contacts: new Set(chats.map((c) => c.profileId ?? c.id)).size,
    chats: chats.length,
    shortlisted: chats.filter((c) => c.shortlisted).length,
    asked: chats.filter((c) => c.asked).length,
    answered: chats.filter((c) => c.answered).length,
    failedChats: chats.filter((c) => c.failed).length,
    viewings: ds.length,
    signed: ds.filter((d) => SIGNED.has(d.status)).length,
    paid: ds.filter((d) => d.status === "PAID").length,
    paidShareRwf: ds.filter((d) => d.status === "PAID").reduce((s, d) => s + (d.mkanShare ?? 0), 0),
  };
}

/** The post a chat belongs to: the latest one of its listing posted at or before it. */
export function attribute(chat: Pick<ChatRow, "refListingId" | "createdAt">, posted: PostRow[]): PostRow | null {
  if (chat.refListingId == null) return null;
  let best: PostRow | null = null;
  for (const p of posted) {
    if (p.listingId !== chat.refListingId || !p.postedAt || p.postedAt > chat.createdAt) continue;
    if (!best || p.postedAt > best.postedAt!) best = p;
  }
  return best;
}

export function shapeFirstShare(input: {
  days: number;
  since: Date;
  /** Posts picked or posted in the window. */
  posts: PostRow[];
  /** Every POSTED post a window chat could belong to (may reach before the window). */
  postedForAttribution: PostRow[];
  /** Chats in the window that opened with a TikTok home code. */
  chats: ChatRow[];
  /** People whose first message to Mkan was a TikTok code, in the window (some never got a chat). */
  firstContacts: string[];
  deals: DealRow[];
}): FirstShareView {
  const { since, posts } = input;
  const inWin = (d: Date | null) => !!d && d >= since;
  const dealsByTask = new Map<string, DealRow[]>();
  for (const d of input.deals) if (d.taskId) dealsByTask.set(d.taskId, [...(dealsByTask.get(d.taskId) ?? []), d]);

  const byPost = new Map<string, ChatRow[]>();
  let unattributed = 0;
  for (const c of input.chats) {
    const p = attribute(c, input.postedForAttribution);
    if (!p) unattributed += 1;
    else byPost.set(p.id, [...(byPost.get(p.id) ?? []), c]);
  }

  const reasons = new Map<string, number>();
  for (const p of posts) if (p.status === "REJECTED" && inWin(p.pickedAt)) reasons.set(p.reason ?? "unknown", (reasons.get(p.reason ?? "unknown") ?? 0) + 1);

  const total = counts(input.chats, dealsByTask);
  const contacts = new Set([...input.chats.map((c) => c.profileId ?? c.id), ...input.firstContacts]).size;
  const shown = [...posts].sort((a, b) => (b.postedAt ?? b.pickedAt).getTime() - (a.postedAt ?? a.pickedAt).getTime());

  return {
    days: input.days,
    featured: posts.filter((p) => inWin(p.pickedAt)).length,
    clean: posts.filter((p) => inWin(p.cleanAt)).length,
    rejected: posts.filter((p) => p.status === "REJECTED" && inWin(p.pickedAt)).length,
    posted: posts.filter((p) => p.status === "POSTED" && inWin(p.postedAt)).length,
    failedUploads: posts.filter((p) => p.status === "FAILED" && inWin(p.pickedAt)).length,
    // Unknown is not zero: "Views 0" beside "views per post 151" read as a broken post (2026-11-06).
    views: posts.some((p) => p.status === "POSTED" && p.views != null) ? posts.filter((p) => p.status === "POSTED").reduce((s, p) => s + (p.views ?? 0), 0) : null,
    ...total,
    contacts,
    unattributedChats: unattributed,
    rejectReasons: [...reasons].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 5),
    posts: shown.map((p) => ({
      id: p.id,
      ref: p.ref,
      listingId: p.listingId,
      brokerHandle: p.brokerHandle,
      status: p.status,
      reason: p.reason,
      pickedAt: p.pickedAt.toISOString(),
      postedAt: p.postedAt?.toISOString() ?? null,
      tiktokUrl: p.tiktokUrl,
      views: p.views,
      likes: p.likes,
      ...counts(byPost.get(p.id) ?? [], dealsByTask),
    })),
  };
}
