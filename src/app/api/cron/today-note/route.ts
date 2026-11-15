import { NextRequest, NextResponse } from "next/server";
import { cronUnauthorized } from "@/lib/cron-auth";
import { writeDailyNote } from "@/components/today/note";
import { kigaliDay } from "@/lib/tt/homes";

/**
 * 21:30 Kigali (19:30 UTC, cf/crons.json), after the last TikTok slot: writes the day's "Today on Mkan"
 * note from the homes @mkan.rw posted (src/components/today/note.ts). No posts, no note. Gated by
 * `CRON_SECRET` like the other crons.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const denied = cronUnauthorized(request);
  if (denied) return denied;
  return NextResponse.json({ ok: true, ...(await writeDailyNote(kigaliDay(Date.now()))) });
}
