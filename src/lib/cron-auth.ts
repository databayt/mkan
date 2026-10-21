import "server-only";

import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * The crons run on Cloudflare: `cf/worker.js` calls each route on the schedule
 * in `cf/crons.json` with `Authorization: Bearer $CRON_SECRET`, and only that
 * token opens them. Vercel's `x-vercel-cron` header used to be accepted on its
 * own — but the Worker forwards request headers unchanged, so anyone could
 * send it and run every cron. Returns the 401 to send, or null when allowed.
 */
export function cronUnauthorized(request: NextRequest): NextResponse | null {
  const expected = process.env.CRON_SECRET;
  if (expected) {
    const given = Buffer.from(request.headers.get("authorization") ?? "");
    const wanted = Buffer.from(`Bearer ${expected}`);
    if (given.length === wanted.length && timingSafeEqual(given, wanted)) return null;
  }
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
