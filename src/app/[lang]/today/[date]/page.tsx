import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { inArchive, kigaliDay } from "@/lib/tt/homes";
import { loadDay, loadDays, loadNote } from "@/components/today/load";
import { dayLabel, TodayView } from "@/components/today/today-view";

/**
 * /today/<YYYY-MM-DD> — one earlier day of "Today on Mkan": today and the 6 days before; anything older, a
 * date that is not a day, or one in the future is a 404 (2026-11-15). Today's own date shows the same page
 * as /today. A day inside the week with no post renders the empty state, not a 404.
 */
export const revalidate = 300;

const langOf = (lang: string): "en" | "ar" | "rw" => (lang === "ar" || lang === "rw" ? lang : "en");

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale; date: string }> }): Promise<Metadata> {
  const { lang, date } = await params;
  if (!inArchive(date)) return {};
  const d = await getDictionary(lang);
  return createMetadata({
    title: `${d.today?.metaTitle ?? "Today on Mkan"} · ${dayLabel(date, lang)}`,
    description: d.today?.metaDescription,
    locale: lang,
    path: `/today/${date}`,
  });
}

export default async function TodayDatePage({ params }: { params: Promise<{ lang: Locale; date: string }> }) {
  const { lang, date } = await params;
  if (!inArchive(date)) notFound();
  const l = langOf(lang);
  const [d, homes, days] = await Promise.all([getDictionary(lang), loadDay(date), loadDays()]);
  const note = await loadNote(date, homes, l);
  return <TodayView lang={lang} l={l} d={d} showing={date} mode={date === kigaliDay(Date.now()) ? "today" : "day"} homes={homes} note={note} days={days} />;
}
