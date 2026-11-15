import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { loadDays, loadLatest, loadNote } from "@/components/today/load";
import { TodayView } from "@/components/today/today-view";

/**
 * /today — "Today on Mkan" (2026-11-15): the homes @mkan.rw posted today, in post order, with the day's
 * note; when today has no post yet, the latest day that has (said so). Indexable, in the sitemap. Rebuilt
 * every 5 minutes like /tt; the older days are /today/<YYYY-MM-DD> (the last 7).
 */
export const revalidate = 300;

const langOf = (lang: string): "en" | "ar" | "rw" => (lang === "ar" || lang === "rw" ? lang : "en");

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({ title: d.today?.metaTitle ?? "Today on Mkan", description: d.today?.metaDescription, locale: lang, path: "/today" });
}

export default async function TodayPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params;
  const l = langOf(lang);
  const [d, latest, days] = await Promise.all([getDictionary(lang), loadLatest(), loadDays()]);
  const homes = latest?.homes ?? [];
  const note = latest ? await loadNote(latest.day, homes, l) : null;
  return <TodayView lang={lang} l={l} d={d} showing={latest?.day ?? null} mode={latest && !latest.isToday ? "earlier" : "today"} homes={homes} note={note} days={days} />;
}
