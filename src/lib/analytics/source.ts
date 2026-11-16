/**
 * Where a person came from, kept as a first-touch cookie (2026-11-16).
 *
 * Every growth experiment is a link someone shares (a Facebook group post with `?s=fb-kimironko`, a
 * WhatsApp status with `?s=wa-status`). The marker must survive from the first page to the WhatsApp chat
 * it produces, so it is remembered 30 days in `mkan_src`, written ONCE (the first touch) and never
 * overwritten while it lives. The pure parts (classify, sanitise, rewrite a wa.me link) are tested;
 * the cookie parts only run in a browser and never throw.
 */

export const SOURCE_COOKIE = "mkan_src";
export const SOURCE_MAX_AGE = 30 * 24 * 3600;

const MARKER_RE = /^[a-z0-9_-]{1,32}$/;

/** A source marker as the route stores it: lowercase, [a-z0-9-_], 1 to 32 characters; else null. */
export function sanitizeSource(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  return MARKER_RE.test(v) ? v : null;
}

/** The stored source, "direct" when there is none or it is not clean. */
export const cleanSource = (raw: unknown): string => sanitizeSource(raw) ?? "direct";

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

/**
 * The referrer's host as a source name. "direct" for no referrer or the same site; "other" for any
 * other external host. Android apps send `android-app://<package>` instead of a URL.
 */
export function classifyReferrer(referrer: string | null | undefined, ownHost?: string | null): string {
  if (!referrer) return "direct";
  let url: URL;
  try {
    url = new URL(referrer);
  } catch {
    return "direct";
  }
  if (url.protocol === "android-app:") {
    const pkg = url.hostname;
    if (/facebook|katana|orca/.test(pkg)) return "facebook";
    if (/instagram/.test(pkg)) return "instagram";
    if (/tiktok|musically/.test(pkg)) return "tiktok";
    if (/whatsapp/.test(pkg)) return "whatsapp";
    if (/twitter/.test(pkg)) return "x";
    if (/google/.test(pkg)) return "google";
    return "other";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "direct";
  const host = bareHost(url.hostname);
  if (!host) return "direct";
  if (ownHost && (host === bareHost(ownHost) || host.endsWith(`.${bareHost(ownHost)}`))) return "direct";
  if (/(^|\.)tiktok\.com$/.test(host)) return "tiktok";
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch)$/.test(host)) return "facebook";
  if (/(^|\.)instagram\.com$/.test(host)) return "instagram";
  if (/(^|\.)google\.[a-z]{2,3}(\.[a-z]{2})?$/.test(host)) return "google";
  if (host === "wa.me" || /(^|\.)whatsapp\.com$/.test(host)) return "whatsapp";
  if (/(^|\.)(twitter\.com|x\.com)$/.test(host) || host === "t.co") return "x";
  return "other";
}

/** First page of a visit: a `?s=` marker wins, else the referrer. `search` is `location.search`. */
export function sourceOfVisit(input: { search?: string | null; referrer?: string | null; ownHost?: string | null }): string {
  try {
    const q = new URLSearchParams(input.search ?? "");
    // /find?c=<chat>&s=<signature> is a signed chat link (chat-link.ts), not a share marker.
    const marker = q.has("c") ? null : sanitizeSource(q.get("s"));
    if (marker) return marker;
  } catch {
    // fall through to the referrer
  }
  return classifyReferrer(input.referrer, input.ownHost);
}

/** `mkan_src` out of a Cookie header / document.cookie string. */
export function readSourceCookie(cookieString: string | null | undefined): string | null {
  if (!cookieString) return null;
  for (const part of cookieString.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SOURCE_COOKIE) return sanitizeSource(decodeURIComponent(v.join("=") || ""));
  }
  return null;
}

/**
 * The wa.me link with ` s:<source>` after its prefilled text, so the WhatsApp chat can be attributed
 * (whatsapp-format.ts refSourceOf reads it). Untouched for "direct", for a link with no text, and
 * for one that already carries a marker.
 */
export function withSourceMarker(href: string, source: string): string {
  const clean = sanitizeSource(source);
  if (!clean || clean === "direct") return href;
  const m = href.match(/([?&]text=)([^&#]*)/);
  if (!m) return href;
  let text: string;
  try {
    text = decodeURIComponent(m[2]!);
  } catch {
    return href;
  }
  if (/(?:^|\s)s:[a-z0-9_-]+(?=\s|$)/i.test(text)) return href;
  return href.replace(m[0], `${m[1]}${encodeURIComponent(`${text} s:${clean}`)}`);
}

/**
 * Browser: the first-touch source. Reads the cookie; on the first page of a visit with no cookie works
 * it out and keeps it (a "direct" first touch is not kept, so a later shared link can still count).
 * Never throws; "direct" when anything is unavailable.
 */
export function currentSource(): string {
  try {
    if (typeof document === "undefined") return "direct";
    const kept = readSourceCookie(document.cookie);
    if (kept) return kept;
    const found = sourceOfVisit({ search: location.search, referrer: document.referrer, ownHost: location.hostname });
    if (found !== "direct") {
      document.cookie = `${SOURCE_COOKIE}=${encodeURIComponent(found)}; path=/; max-age=${SOURCE_MAX_AGE}; SameSite=Lax`;
    }
    return found;
  } catch {
    return "direct";
  }
}
