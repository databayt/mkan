import Link from "next/link";
import { BlurImage } from "@/components/atom/blur-image";
import { homePath } from "@/components/agent/home-path";
import { fill } from "@/components/agent/format";
import type { Dictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { formatCurrency } from "@/lib/i18n/formatters";
import { scrubTitle } from "@/lib/redact";
import { continueOnWhatsApp } from "@/components/agent/wa-link";
import { TODAY_MARK } from "@/components/agent/whatsapp-format";
import { TtCta } from "@/app/[lang]/tt/tt-cta";
import { loadLatest } from "./load";

const MAX_POSTERS = 5;

/**
 * "Today on Mkan" on the homepage, under the hero (2026-11-15): up to 5 of the latest day's video posters
 * in a row, each to Mkan's page for the home, and "See today's homes". Hidden when nothing was posted in
 * the last 3 days — the two calls to action stay either way (the hero is the generic nightly search, so this is
 * what points a Kigali renter to the chat: "Tell Mkan what you need" → /find, "Chat on WhatsApp" tagged `today`). One cached read (the homepage is ISR, 5 minutes): two queries like /tt, no more.
 */
export async function TodayStrip({ lang, d }: { lang: string; d: Dictionary }) {
  const latest = await loadLatest();
  const t = d.today;
  const perMonth = d.agent?.card?.perMonth ?? "/ month";
  const homes = (latest?.homes ?? []).filter((h) => h.videoPosterUrl ?? h.photo).slice(0, MAX_POSTERS);
  const whatsapp = continueOnWhatsApp(null, `${t?.generalMessage ?? "Hi Mkan, I'm looking for a home in Kigali."} ${TODAY_MARK}`);
  return (
    <section className="layout-container pt-6" aria-label={t?.stripTitle ?? "Today on Mkan"}>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href={`/${lang}/find`} prefetch={false} className="flex flex-1 items-center justify-center rounded-full bg-foreground py-3 text-[15px] font-medium text-background">
          {t?.ctaFind ?? "Tell Mkan what you need"}
        </Link>
        <TtCta href={whatsapp} className="flex-1 border border-foreground/20 bg-transparent py-3 text-[15px] !text-foreground">
          {t?.ctaWhatsApp ?? "Chat on WhatsApp"}
        </TtCta>
      </div>
      {latest && homes.length > 0 && (
        <>
      <div className="mt-6 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{latest?.isToday ? t?.stripTitle ?? "Today on Mkan" : t?.stripLatest ?? "Latest homes on Mkan"}</h2>
        <Link href={`/${lang}/today`} prefetch={false} className="shrink-0 text-sm font-medium underline-offset-4 hover:underline">
          {latest?.isToday ? t?.seeToday ?? "See today's homes" : t?.seeLatest ?? "See the latest homes"}
        </Link>
      </div>
      <ul className="-mx-4 mt-3 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-4 pb-2 no-scrollbar sm:mx-0 sm:px-0">
        {homes.map((h, i) => {
          const label = scrubTitle(h.title) || h.ref;
          return (
            <li key={h.id} className="w-32 shrink-0 snap-start sm:w-40">
              <Link href={homePath(lang, h.id)} prefetch={false} className="block" aria-label={label}>
                <span className="relative block aspect-[3/4] overflow-hidden rounded-xl bg-muted">
                  <BlurImage
                    src={(h.videoPosterUrl ?? h.photo)!}
                    alt={label}
                    fill
                    sizes="160px"
                    className="object-cover"
                    {...(i === 0 ? { fetchPriority: "high" as const } : {})}
                  />
                </span>
                <span className="mt-1.5 block text-xs font-semibold">
                  {formatCurrency(h.priceMonth, lang as Locale, h.currency)} <span className="font-normal text-muted-foreground">{perMonth}</span>
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {[h.place[lang === "ar" || lang === "rw" ? lang : "en"], h.bedrooms != null ? fill(d.agent?.card?.beds ?? "{n} bd", { n: h.bedrooms }) : null].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
        </>
      )}
    </section>
  );
}
