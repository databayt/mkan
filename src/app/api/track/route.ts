import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ListingEventType } from "@prisma/client";

import { auth } from "@/lib/auth";
import { recordListingEvent } from "@/lib/analytics/events";
import { recordSignal, SIGNAL_KINDS, SIGNAL_PLACES } from "@/lib/analytics/signals";
import { cleanSource } from "@/lib/analytics/source";
import { TEAM_COOKIE } from "@/lib/analytics/team-cookie";
import { isBot, visitorHash } from "@/lib/analytics/visitor";
import { isAutomatedBrowser } from "@/lib/monetize/team";
import { getClientId, rateLimitWithFallback, rateLimitResponse } from "@/lib/rate-limit";

/**
 * Marketplace funnel beacon.
 *
 * Why this is a route handler and not a counter in the listing page:
 * `src/app/[lang]/listings/[id]/page.tsx` wraps its fetch in React `cache()` to
 * dedupe `generateMetadata` against the page body, so a write placed there
 * would fire an unpredictable number of times — and side effects during an RSC
 * render are wrong regardless of caching. Counting belongs on an explicit
 * request the browser makes after paint.
 *
 * Fire-and-forget by contract: the client uses `navigator.sendBeacon` and never
 * reads the response, so every failure path still returns quickly and quietly.
 * Analytics must not be able to break a listing page.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  listingId: z.coerce.number().int().positive(),
  type: z.enum(ListingEventType),
});

/**
 * The second body shape (2026-11-16): `{ signal: { kind, place, source } }` — a visit, a WhatsApp tap or
 * a chat opened, counted per person per Kigali day (analytics/signals.ts). `source` is cleaned to
 * [a-z0-9-_]{1,32} or "direct".
 */
const signalSchema = z.object({
  signal: z.object({
    kind: z.enum(SIGNAL_KINDS),
    place: z.enum(SIGNAL_PLACES),
    source: z.unknown().optional(),
  }),
});

/** sendBeacon posts an opaque body; 204 keeps the response as small as possible. */
const NO_CONTENT = new NextResponse(null, { status: 204 });

export async function POST(request: NextRequest) {
  const rl = await rateLimitWithFallback(request, "track");
  if (!rl.success) return rateLimitResponse("Too many requests");

  const userAgent = request.headers.get("user-agent") ?? "";

  let parsed: z.infer<typeof bodySchema>;
  try {
    // Beacons are sent as a text/plain Blob so the browser never needs a
    // preflight; the payload is still JSON. Read as text and parse by hand
    // rather than trusting the content type.
    const raw = await request.text();
    const json: unknown = JSON.parse(raw);
    if (json && typeof json === "object" && "signal" in json) return await handleSignal(request, json, userAgent);
    const result = bodySchema.safeParse(json);
    if (!result.success) return NO_CONTENT;
    parsed = result.data;
  } catch {
    return NO_CONTENT;
  }

  const session = await auth();
  const userId = session?.user?.id ?? null;

  // Crawlers hit every published listing; unfiltered they would dominate the
  // view counts. A signed-in user is a real person whatever their UA claims.
  if (!userId && isBot(userAgent)) return NO_CONTENT;

  const ip = await getClientId(request);

  await recordListingEvent({
    listingId: parsed.listingId,
    type: parsed.type,
    visitorHash: visitorHash({ ip, userAgent }),
    userId,
  });

  return NO_CONTENT;
}

/**
 * Never counts us: a crawler, an automated browser, a browser the team marked as its own on /monetize
 * (mkan_team), or anyone signed in as an admin. Every one of those answers 204 and writes nothing.
 */
async function handleSignal(request: NextRequest, json: unknown, userAgent: string): Promise<NextResponse> {
  const result = signalSchema.safeParse(json);
  if (!result.success) return NO_CONTENT;
  if (isBot(userAgent) || isAutomatedBrowser(userAgent)) return NO_CONTENT;
  if (request.cookies.get(TEAM_COOKIE)) return NO_CONTENT;

  const session = await auth();
  const role = session?.user?.role;
  if (role === "ADMIN" || role === "SUPER_ADMIN") return NO_CONTENT;

  const { kind, place, source } = result.data.signal;
  const ip = await getClientId(request);
  await recordSignal({ kind, place, source: cleanSource(source), visitorHash: visitorHash({ ip, userAgent }) });
  return NO_CONTENT;
}
