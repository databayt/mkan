/**
 * Pseudonymous visitor identity for marketplace analytics.
 *
 * mkan counts unique visitors WITHOUT a tracking cookie. Three reasons:
 *
 *  1. The consent banner is binary (`cookieConsent` = "all" or not), and it
 *     already suppresses Vercel Analytics for anyone who picks "Only
 *     necessary". A tracking cookie inherits that gate and undercounts.
 *  2. `src/proxy.ts` documents that a `Set-Cookie` on every response marks the
 *     response uncacheable at the CDN — a visitor cookie would either break ISR
 *     on the home and search pages or need the same set-only-when-absent dance.
 *  3. The proxy early-bails on `/api/*`, so a proxy-minted cookie would never
 *     reach the tracking endpoint's own responses anyway.
 *
 * Instead the visitor is identified by sha256(dailySalt ‖ ip ‖ user-agent) —
 * the standard privacy-preserving approach (Plausible, Fathom). The hash is
 * unlinkable across days because the salt rotates, and it is never reversible
 * to an IP.
 *
 * THE SALT MUST BE DERIVED, NOT RANDOM. A randomly generated in-memory salt
 * looks correct locally and fails silently in production: every serverless
 * instance would hold a different salt, so the same visitor hashes differently
 * depending on which lambda served the request, and deduplication quietly
 * stops working. Deriving it from a server secret plus the date gives the same
 * value on every instance, with no storage and no coordination.
 */

import { createHash, createHmac } from "node:crypto";

/**
 * Domain separator, so a salt derived here can never collide with any other
 * HMAC the app computes from the same secret.
 */
const SALT_DOMAIN = "mkan:analytics:visitor-salt:v1";

/**
 * Falls back to NEXTAUTH_SECRET, which is always present in every environment
 * that can serve a session. That keeps analytics from silently degrading to a
 * constant salt if `ANALYTICS_SALT_SECRET` is never provisioned, without
 * making a new env var a hard deploy requirement.
 */
function saltSecret(): string {
  return (
    process.env.ANALYTICS_SALT_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    process.env.AUTH_SECRET ||
    // Last resort. Analytics still work; they are just linkable across days
    // for anyone who already knows this string, which is nobody in a
    // correctly-configured deploy.
    "mkan-analytics-unconfigured"
  );
}

/** `YYYY-MM-DD` in UTC — the bucket every event is deduplicated within. */
export function dayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Midnight UTC for a `YYYY-MM-DD` key, for the `@db.Date` column. Postgres
 * stores a bare date, but Prisma still wants a Date instance.
 */
export function dayDate(day: string): Date {
  return new Date(`${day}T00:00:00.000Z`);
}

/** Deterministic across instances, rotates daily, never persisted. */
export function dailySalt(day: string): string {
  return createHmac("sha256", saltSecret()).update(`${SALT_DOMAIN}:${day}`).digest("hex");
}

/**
 * The visitor identifier. Two people behind the same NAT with the same browser
 * collapse into one visitor — accepted: over-counting a household as one
 * visitor is a far smaller distortion than counting one person's five page
 * refreshes as five visitors, which is what a naive counter does.
 */
export function visitorHash(input: {
  ip: string;
  userAgent: string;
  day?: string;
}): string {
  const day = input.day ?? dayKey();
  return createHash("sha256")
    .update(`${dailySalt(day)}:${input.ip}:${input.userAgent}`)
    .digest("hex");
}

/**
 * Crawler filter. The listing pages are public and in the sitemap, so without
 * this "views" would substantially measure Googlebot rather than demand.
 *
 * Deliberately a denylist on the user-agent: it is the only signal available on
 * a beacon request, and a false negative (a bot we fail to name) merely inflates
 * a number, while a false positive would silently drop real traffic.
 */
const BOT_PATTERN =
  /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|preview|monitor|uptime|pingdom|lighthouse|headless|phantom|puppeteer|playwright|curl|wget|python-requests|axios|go-http-client|java\/|okhttp|scrapy|semrush|ahrefs|mj12|dotbot|petalbot|yandex|baidu|duckduck|gptbot|claudebot|ccbot|perplexity|bytespider|applebot/i;

export function isBot(userAgent: string | null | undefined): boolean {
  if (!userAgent || userAgent.trim().length === 0) return true;
  return BOT_PATTERN.test(userAgent);
}
