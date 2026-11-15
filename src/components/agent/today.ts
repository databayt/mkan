import "server-only";

/**
 * "Today on Mkan" for the chatbots (2026-11-15): the homes @mkan.rw posted on the Kigali day as the usual
 * shortlist cards, in post order. No search and no ranking by fit — the day's posts are the list; the
 * scoring only prices each home's move-in cost for its card. Today's homes when there are any, else the
 * latest day in /tt's window (the reply says so).
 */
import { db } from "@/lib/db";
import type { Locale } from "@/components/internationalization/config";
import { latestDay } from "@/lib/tt/homes";
import { scoreCandidate, type Ranked } from "./rank";
import { EMPTY_REQUIREMENTS, type Requirements } from "./requirements";
import { candidatesByIds, toShortlist } from "./search";
import type { ShortlistItem } from "./types";

/** Cards shown: a day posts at most 5, so this is every one of them. WhatsApp lists the first 3. */
export const TODAY_MAX = 6;

export interface TodayCards {
  items: ShortlistItem[];
  day: string;
  /** False when today had no post yet and these are the latest day's. */
  isToday: boolean;
}

const MONTHLY: Requirements = { ...EMPTY_REQUIREMENTS, stay: "long" };

export async function todayCards(lang: Locale, now = Date.now()): Promise<TodayCards | null> {
  const latest = await latestDay(db, now);
  if (!latest) return null;
  const ids = latest.homes.map((h) => h.id).slice(0, TODAY_MAX);
  const candidates = await candidatesByIds(ids);
  const byId = new Map(candidates.map((c) => [c.id, c]));
  // Post order, not score order: the first video of the day is the first card.
  const ranked = ids.flatMap((id) => {
    const c = byId.get(id);
    const r = c ? scoreCandidate(c, MONTHLY, 0, new Date(now)) : null;
    return r ? [r satisfies Ranked] : [];
  });
  if (ranked.length === 0) return null;
  const items = await toShortlist(ranked, lang);
  return items.length ? { items, day: latest.day, isToday: latest.isToday } : null;
}

/** How many homes were posted today — the welcome's line. Kept 5 minutes: every /find visit asks. */
let counted: { at: number; n: number } | null = null;
export async function todayCount(now = Date.now()): Promise<number> {
  if (counted && now - counted.at < 5 * 60_000) return counted.n;
  const latest = await latestDay(db, now).catch(() => null);
  const n = latest?.isToday ? latest.homes.length : 0;
  counted = { at: now, n };
  return n;
}
