import type { Metadata } from "next";
import { createMetadata } from "@/lib/metadata";
import { db } from "@/lib/db";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { BlurImage } from "@/components/atom/blur-image";
import { formatCurrency } from "@/lib/i18n/formatters";
import { scrubTitle } from "@/lib/redact";
import { fill } from "@/components/agent/format";
import { continueOnWhatsApp } from "@/components/agent/wa-link";
import { TIKTOK_BIO_MARK } from "@/components/agent/whatsapp-format";
import { loadTtHomes, type TtHome } from "@/lib/tt/homes";
import { TtCta } from "./tt-cta";

/**
 * /tt — the page the TikTok profile's Website link opens (Abdout, 2026-11-07). A viewer no longer copies a
 * code out of a caption: each home posted today and in the last 3 days has its photo, price and code and
 * one tap into a WhatsApp chat about that home. The message carries `tiktok_bio`, which the WhatsApp
 * agent reads as RefSource "tiktok_bio" so these chats are counted apart from the captions' codes.
 * Rebuilt every 5 minutes; kept out of search engines like every lead page.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params;
  const d = await getDictionary(lang);
  return createMetadata({ title: d.tt?.title ?? "Homes from our TikTok", description: d.tt?.lead, locale: lang, path: "/tt", noIndex: true });
}

const langOf = (lang: string): "en" | "ar" | "rw" => (lang === "ar" || lang === "rw" ? lang : "en");

export default async function TtPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params;
  const l = langOf(lang);
  const d = await getDictionary(lang);
  const t = d.tt;
  const card = d.agent?.card;
  const homes: TtHome[] = await loadTtHomes(db).catch(() => []);
  const general = continueOnWhatsApp(null, `${t?.generalMessage ?? "Hi Mkan, I'm looking for a home in Kigali."} ${TIKTOK_BIO_MARK}`);

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-6">
      <h1 className="text-xl font-semibold">{t?.title ?? "Homes from our TikTok"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t?.lead ?? "Tap a home to ask about it on WhatsApp. It's free for you."}</p>
      <TtCta href={general} className="mt-4 w-full py-3 text-[15px]">
        {t?.general ?? "Chat with Mkan on WhatsApp"}
      </TtCta>

      {homes.length === 0 ? (
        <p className="mt-6 rounded-xl bg-muted p-4 text-sm">{t?.empty ?? "New homes are posted every day. Tap the button above and tell us what you need."}</p>
      ) : (
        <ul className="mt-6 space-y-6">
          {homes.map((h, i) => (
            <li key={h.id}>
              <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-muted">
                <BlurImage
                  src={h.photo}
                  alt={scrubTitle(h.title) || h.ref}
                  fill
                  sizes="(min-width: 512px) 480px, 100vw"
                  className="object-cover"
                  {...(i === 0 ? { loading: "eager" as const, fetchPriority: "high" as const } : {})}
                />
              </div>
              <div className="mt-3 flex items-baseline justify-between gap-3">
                <p>
                  <span className="text-lg font-semibold">{formatCurrency(h.priceMonth, lang, h.currency)}</span>{" "}
                  <span className="text-sm text-muted-foreground">{card?.perMonth ?? "/ month"}</span>
                </p>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium tabular-nums" dir="ltr">
                  {h.ref}
                </span>
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {[h.place[l], h.bedrooms != null ? fill(card?.beds ?? "{n} bd", { n: h.bedrooms }) : null].filter(Boolean).join(" · ")}
              </p>
              <TtCta
                href={continueOnWhatsApp(null, `${fill(card?.checkWords ?? "Check {ref} for me", { ref: h.ref })} ${TIKTOK_BIO_MARK}`)}
                listingId={h.id}
                className="mt-3 w-full py-2.5 text-sm"
              >
                {t?.ask ?? "Ask on WhatsApp"}
              </TtCta>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
