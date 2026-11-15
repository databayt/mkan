import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { fill } from "@/components/agent/format";
import { continueOnWhatsApp } from "@/components/agent/wa-link";
import { TODAY_MARK } from "@/components/agent/whatsapp-format";
import type { Dictionary } from "@/components/internationalization/dictionaries";
import { TtCta } from "@/app/[lang]/tt/tt-cta";
import type { TodayHome } from "@/lib/tt/homes";
import { HomeCard } from "./home-card";

type Lang3 = "en" | "ar" | "rw";

const TIKTOK_PROFILE = "https://www.tiktok.com/@mkan.rw";

/** "Sunday, 15 November" — Kigali's day, named in the reader's language (rw reads the English names). */
export function dayLabel(day: string, lang: string): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "en", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
}

/**
 * The body of /today and /today/[date]: the day's note, its homes in post order, "follow @mkan.rw", and
 * the other days of the week that have homes. `showing` is the day on screen; `mode` says why it is that
 * day: today's own, the latest one because today has no post yet, or one picked from the archive.
 */
export function TodayView({
  lang,
  l,
  d,
  showing,
  mode,
  homes,
  note,
  days,
}: {
  lang: string;
  l: Lang3;
  d: Dictionary;
  showing: string | null;
  mode: "today" | "earlier" | "day";
  homes: TodayHome[];
  note: string | null;
  days: string[];
}) {
  const t = d.today;
  const general = continueOnWhatsApp(null, `${t?.generalMessage ?? "Hi Mkan, I'm looking for a home in Kigali."} ${TODAY_MARK}`);
  const others = days.filter((x) => x !== showing);
  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
      <h1 className="text-xl font-semibold">{t?.title ?? "Today on Mkan"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {homes.length === 0 || mode === "today" || !showing
          ? t?.lead ?? "The homes we posted today."
          : mode === "earlier"
            ? fill(t?.earlier ?? "Nothing posted yet today. Here are the latest homes, from {date}.", { date: dayLabel(showing, lang) })
            : fill(t?.leadDay ?? "The homes we posted on {date}.", { date: dayLabel(showing, lang) })}
      </p>

      {note && homes.length > 0 && <p className="mt-4 rounded-2xl bg-muted/70 p-4 text-[15px] leading-relaxed">{note}</p>}

      {homes.length === 0 ? (
        <>
          <p className="mt-6 rounded-xl bg-muted p-4 text-sm">{t?.empty ?? "No homes were posted in the last few days. New homes go up every day: tell Mkan what you need on WhatsApp."}</p>
          <TtCta href={general} className="mt-4 w-full py-3 text-[15px]">
            {t?.general ?? "Chat with Mkan on WhatsApp"}
          </TtCta>
        </>
      ) : (
        <ul className="mt-6 space-y-8">
          {homes.map((h, i) => (
            <HomeCard key={h.id} home={h} lang={lang} l={l} d={d} priority={i === 0} />
          ))}
        </ul>
      )}

      <a
        href={TIKTOK_PROFILE}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-8 flex items-center justify-between gap-3 rounded-2xl bg-muted/70 px-4 py-3 text-sm font-medium transition-colors hover:bg-muted"
      >
        {t?.follow ?? "Follow @mkan.rw for new homes every day"}
        <ArrowUpRight className="size-4 shrink-0 rtl:-scale-x-100" aria-hidden />
      </a>

      {others.length > 0 && (
        <nav aria-label={t?.archive ?? "Earlier this week"} className="mt-8">
          <h2 className="text-sm font-semibold text-muted-foreground">{t?.archive ?? "Earlier this week"}</h2>
          <ul className="mt-2 flex flex-wrap gap-2">
            {others.map((day) => (
              <li key={day}>
                <Link href={`/${lang}/today/${day}`} prefetch={false} className="inline-block rounded-full bg-muted px-3 py-1.5 text-sm hover:bg-muted/70">
                  {dayLabel(day, lang)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}

