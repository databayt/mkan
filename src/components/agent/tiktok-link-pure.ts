/**
 * A TikTok link in a tenant's message (2026-11-14). On 11-07 a viewer wrote "Hello", pasted the share link
 * of one of Mkan's posts and "You posted this on ur TikTok" — and got a generic search, because only a
 * K-code named a home. The link names it just as well: Mkan's own post of it, the broker's video it was
 * made from, or the ad a lead was read from. Pure: the lookup is tiktok-link.ts.
 */

/** The share link (vt./vm.tiktok.com/<code>, tiktok.com/t/<code>) or a full video / photo URL. */
export const TIKTOK_LINK_RE = /https?:\/\/(?:(?:vm|vt)\.tiktok\.com\/[A-Za-z0-9]+\/?|(?:www\.|m\.)?tiktok\.com\/(?:@[\w.-]+\/(?:video|photo)\/\d+|t\/[A-Za-z0-9]+)[^\s]*)/i;
const VIDEO_ID_RE = /\/(?:video|photo)\/(\d{8,25})(?:[/?#]|$)/;

/** The first TikTok link in the text, or null. */
export const tiktokLink = (text: string): string | null => text.match(TIKTOK_LINK_RE)?.[0] ?? null;

/** The post's id in a full TikTok URL, or null (a share link has none until it is followed). */
export const videoIdOf = (url: string): string | null => url.match(VIDEO_ID_RE)?.[1] ?? null;

/** The message without its TikTok link: what the tenant said beside it. */
export const withoutTikTokLink = (text: string): string => text.replace(new RegExp(TIKTOK_LINK_RE.source, "gi"), " ").replace(/\s+/g, " ").trim();

/** Only TikTok's own hosts are ever fetched or followed. */
export function isTikTokHost(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && /(?:^|\.)tiktok\.com$/i.test(u.hostname);
  } catch {
    return false;
  }
}
