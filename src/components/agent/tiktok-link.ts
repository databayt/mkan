import "server-only";

/**
 * The home a TikTok link shows (tiktok-link-pure.ts): the share link is followed to the post's URL —
 * TikTok's own hosts only, three hops, three seconds — and the post's id is looked up as Mkan's own post,
 * the broker's video behind it, or the ad a lead was read from.
 */
import { db } from "@/lib/db";
import { isTikTokHost, tiktokLink, videoIdOf } from "./tiktok-link-pure";

const HOPS = 3;
const TIMEOUT_MS = 3_000;

/** Follow a share link to the post's own URL. Null when it leaves TikTok, never lands on a post, or is slow. */
async function expand(link: string): Promise<string | null> {
  let url = link;
  const until = Date.now() + TIMEOUT_MS;
  for (let hop = 0; hop < HOPS; hop++) {
    if (videoIdOf(url)) return url;
    if (!isTikTokHost(url) || Date.now() >= until) return null;
    const res = await fetch(url, { method: "GET", redirect: "manual", signal: AbortSignal.timeout(Math.max(500, until - Date.now())), headers: { "user-agent": "Mozilla/5.0 (compatible; Mkan/1.0)" } }).catch(() => null);
    const next = res?.headers.get("location");
    if (!next) return null;
    try {
      url = new URL(next, url).toString();
    } catch {
      return null;
    }
  }
  return videoIdOf(url) ? url : null;
}

/** The listing a TikTok link in `text` shows, or null when there is no link or no home behind it. */
export async function homeForTikTokLink(text: string): Promise<number | null> {
  const link = tiktokLink(text);
  if (!link) return null;
  const id = videoIdOf((await expand(link)) ?? "");
  if (!id) return null;
  // Mkan's own post of the home, or the broker's video that post was made from.
  const post = await db.tikTokPost.findFirst({ where: { OR: [{ tiktokId: id }, { sourceVideoId: id }, { tiktokUrl: { contains: id } }] }, orderBy: { pickedAt: "desc" }, select: { listingId: true } });
  if (post) return post.listingId;
  // The broker's ad the lead was read from (a post with several homes is tiktok:<id>#2 …: the first one).
  const lead = await db.listing.findFirst({ where: { OR: [{ sourceListingId: `tiktok:${id}` }, { sourceListingId: { startsWith: `tiktok:${id}#` } }] }, orderBy: { id: "asc" }, select: { id: true } });
  if (lead) return lead.id;
  const ad = await db.listingBroker.findFirst({ where: { sourceUrl: { contains: id } }, select: { listingId: true } });
  return ad?.listingId ?? null;
}
