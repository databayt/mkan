import Link from "next/link";
import { BlurImage } from "@/components/atom/blur-image";
import { TtCta } from "@/app/[lang]/tt/tt-cta";
import { homePath } from "@/components/agent/home-path";
import { fill } from "@/components/agent/format";
import { continueOnWhatsApp } from "@/components/agent/wa-link";
import { TODAY_MARK } from "@/components/agent/whatsapp-format";
import type { Dictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { formatCurrency } from "@/lib/i18n/formatters";
import { scrubTitle } from "@/lib/redact";
import type { TodayHome } from "@/lib/tt/homes";

type Lang3 = "en" | "ar" | "rw";

/**
 * One posted home on /today: its video poster (the video itself, muted, when it has no poster) linking to
 * Mkan's own page for it, the facts, and one tap into the WhatsApp line with its code. The message carries
 * `mkan_today`, so the chat counts as /today's (whatsapp-format.ts refSourceOf) and the agent reads the code
 * with "check" as the pick (asksToCheck). The broker's ad, handle and number never appear.
 */
export function HomeCard({ home, lang, l, d, priority = false }: { home: TodayHome; lang: string; l: Lang3; d: Dictionary; priority?: boolean }) {
  const t = d.today;
  const card = d.agent?.card;
  const label = scrubTitle(home.title) || home.ref;
  const poster = home.videoPosterUrl ?? (home.videoUrl ? null : home.photo);
  return (
    <li>
      <Link
        href={homePath(lang, home.id)}
        prefetch={false}
        aria-label={label}
        className="relative block aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted"
      >
        {poster ? (
          <BlurImage
            src={poster}
            alt={label}
            fill
            sizes="(min-width: 512px) 480px, 100vw"
            className="object-cover"
            {...(priority ? { loading: "eager" as const, fetchPriority: "high" as const } : {})}
          />
        ) : (
          <video
            src={`${home.videoUrl}#t=0.1`}
            muted
            playsInline
            loop
            preload="metadata"
            aria-label={t?.video ?? "Video of the home"}
            className="absolute inset-0 size-full object-cover"
          />
        )}
      </Link>
      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p>
          <span className="text-lg font-semibold">{formatCurrency(home.priceMonth, lang as Locale, home.currency)}</span>{" "}
          <span className="text-sm text-muted-foreground">{card?.perMonth ?? "/ month"}</span>
        </p>
        <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums" dir="ltr">
          {home.ref}
        </span>
      </div>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {[home.place[l], home.bedrooms != null ? fill(card?.beds ?? "{n} bd", { n: home.bedrooms }) : null].filter(Boolean).join(" · ")}
      </p>
      <TtCta
        href={continueOnWhatsApp(null, `${fill(card?.checkWords ?? "Check {ref} for me", { ref: home.ref })} ${TODAY_MARK}`)}
        listingId={home.id}
        place="today"
        className="mt-3 w-full py-2.5 text-sm"
      >
        {t?.check ?? "Check availability on WhatsApp"}
      </TtCta>
    </li>
  );
}
