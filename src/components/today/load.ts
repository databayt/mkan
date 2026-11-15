import "server-only";

/**
 * What the /today pages and the homepage strip read (2026-11-15): the Kigali day's posted homes, the
 * day's note and the days of the week that have homes. A failed read is logged and shown as "no homes",
 * never thrown — the WhatsApp button must still render (the 2026-11-08 /tt lesson).
 */
import { cache } from "react";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { latestDay, postedDays, todayPosts, type LatestDay, type TodayHome } from "@/lib/tt/homes";
import { noteFacts, templateNote, type NoteLang } from "./note-pure";

export const loadLatest = cache(async (): Promise<LatestDay | null> =>
  latestDay(db).catch((err) => {
    logger.error("today_latest_not_loaded", err);
    return null;
  }),
);

export const loadDay = cache(async (day: string): Promise<TodayHome[]> =>
  todayPosts(db, day).catch((err) => {
    logger.error("today_day_not_loaded", err);
    return [];
  }),
);

export const loadDays = cache(async (): Promise<string[]> =>
  postedDays(db).catch((err) => {
    logger.error("today_days_not_loaded", err);
    return [];
  }),
);

/**
 * The day's note in the reader's language: the stored one (cron, 21:30 Kigali), else the template read
 * live from the homes — a day's note exists only after the cron, but the page is useful from the first post.
 */
export async function loadNote(day: string, homes: TodayHome[], lang: NoteLang): Promise<string | null> {
  const row = await db.dailyNote.findUnique({ where: { day }, select: { en: true, ar: true, rw: true } }).catch(() => null);
  const stored = row ? (lang === "ar" ? row.ar : lang === "rw" ? row.rw : row.en) ?? row.en : null;
  if (stored) return stored;
  const facts = noteFacts(day, homes);
  return facts ? templateNote(facts, lang) : null;
}
