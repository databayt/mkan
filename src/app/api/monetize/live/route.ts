import { NextResponse } from "next/server";

import { auth, isAdminNow } from "@/lib/auth";
import { loadLive } from "@/lib/monetize/live";
import { publicLive } from "@/lib/monetize/live-shape";

// The sprint loop right now, for /monetize's live card (polled every 15 s while the tab is visible).
// Uncached: three small reads. Admins get the prompts and the asks; anyone else the state and titles.
export const dynamic = "force-dynamic";

export async function GET() {
  const [live, session] = await Promise.all([loadLive(), auth().catch(() => null)]);
  const admin = !!session?.user?.id && (await isAdminNow(session).catch(() => false));
  return NextResponse.json(admin ? live : publicLive(live), { headers: { "Cache-Control": "no-store" } });
}
