import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/db";
import { createMetadata } from "@/lib/metadata";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";
import { BlurImage } from "@/components/atom/blur-image";
import { formatCurrency } from "@/lib/i18n/formatters";
import { listingPath } from "@/lib/listing-code";
import { districtName } from "@/lib/geo/rwanda-places";
import { zoneLabel } from "@/lib/geo/kigali-zones";
import { longStayCost, type CostLine } from "@/components/agent/cost";
import { fill } from "@/components/agent/format";
import { ChatHeader, headerButton } from "@/components/agent/header";
import { homeIdOfRef } from "@/components/agent/home-path";
import { LEAD_SOURCES } from "@/components/agent/search";
import { continueOnWhatsApp } from "@/components/agent/wa-link";
import { brokerSendMode } from "@/components/agent/broker-sends";
import { K_PAGE_MARK } from "@/components/agent/whatsapp-format";
import { scrubTitle } from "@/lib/redact";
import { Signal } from "@/components/analytics/signal";
import TrackView from "@/components/analytics/track-view";
import { WhatsAppCta } from "./whatsapp-cta";
import { VideoHero } from "@/components/listings/video-hero";
import { pickSimilar } from "./similar-pure";

/**
 * Mkan's own page for a broker home — /en/k/K5808 (Abdout, 2026-11-01). Every link a tenant
 * can follow to a broker's home comes here instead of the broker's ad, whose caption carries the
 * broker's phone: the home's photos, facts and move-in cost, and "check it's free" on Mkan's
 * WhatsApp line, which opens that home by its code. Never the broker's handle, ad or number.
 * Out of search engines until the trust gate publishes it (listing-gate-pure.ts, 2026-11-15); a published
 * broker home stays here too — /listings/<code> sends it back, since that page is built for nightly stays.
 */

interface HomePageProps {
  params: Promise<{ lang: Locale; ref: string }>;
}

const COPY = {
  en: { code: "Code {ref}", taken: "This one is taken.", takenHint: "Here are a few like it that are still free.", takenWords: "Hi, {ref} is taken. Can you show me similar homes?", more: "More homes like this", approx: "Approximate area", mute: "Mute", unmute: "Turn sound on", ask: "Ask about this home", video: "Video of the home" },
  ar: { code: "الرمز {ref}", taken: "تم تأجير هذا المنزل.", takenHint: "هذه منازل مشابهة لا تزال متاحة.", takenWords: "مرحباً، {ref} مؤجَّر. هل تعرض عليّ منازل مشابهة؟", more: "منازل أخرى مثل هذا", approx: "منطقة تقريبية", mute: "كتم الصوت", unmute: "تشغيل الصوت", ask: "اسأل عن هذا المنزل", video: "فيديو المنزل" },
  rw: { code: "Kode {ref}", taken: "Iyi nzu yamaze gufatwa.", takenHint: "Dore andi asa nayo acyahari.", takenWords: "Mwiriwe, {ref} yamaze gufatwa. Mwanyereka andi asa nayo?", more: "Andi mazu nk'iyi", approx: "Agace kegereye", mute: "Funga ijwi", unmute: "Fungura ijwi", ask: "Baza kuri iyi nzu", video: "Videwo y'inzu" },
} as const;

const fetchHome = cache(async (id: number) =>
  db.listing
    .findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        sourceListingId: true,
        title: true,
        photoUrls: true,
        videoUrl: true,
        videoPosterUrl: true,
        currency: true,
        rentPeriod: true,
        priceMonth: true,
        bedrooms: true,
        bathrooms: true,
        isPublished: true,
        source: true,
        lostAt: true,
        depositMonths: true,
        commissionPct: true,
        noCommission: true,
        viewingFee: true,
        waterIncluded: true,
        electricityIncluded: true,
        location: { select: { state: true, sector: true, neighbourhood: true } },
        brokers: { where: { role: "OWNER" }, select: { id: true }, take: 1 },
      },
    })
    .catch(() => null),
);

type Home = NonNullable<Awaited<ReturnType<typeof fetchHome>>>;

// Published or not: a broker home always lives here, never on the nightly listing page (2026-11-15).
const isBrokerHome = (h: Home) => (LEAD_SOURCES as readonly string[]).includes(h.source ?? "") && h.rentPeriod === "MONTHLY";

const langOf = (lang: string): "en" | "ar" | "rw" => (lang === "ar" || lang === "rw" ? lang : "en");

function placeOf(h: Home, lang: "en" | "ar" | "rw"): string | null {
  const zone = zoneLabel(h.location?.neighbourhood ?? h.location?.sector ?? null, lang);
  if (zone) return zone;
  const district = (h.location?.state ?? "").toUpperCase();
  return district ? districtName(district, lang) || h.location?.state || null : null;
}

/** Free broker homes near a taken one's size and rent (similar-pure.ts picks the 3). */
async function similarHomes(home: Home) {
  const district = home.location?.state ?? null;
  const rows = await db.listing.findMany({
    where: {
      id: { not: home.id },
      lostAt: null,
      rentPeriod: "MONTHLY",
      currency: "RWF",
      source: { in: [...LEAD_SOURCES] },
      sourceUrl: { not: null },
      ...(home.priceMonth ? { priceMonth: { gte: Math.round(home.priceMonth * 0.6), lte: Math.round(home.priceMonth * 1.4) } } : {}),
      location: { city: { equals: "Kigali", mode: "insensitive" }, ...(district ? { state: { equals: district, mode: "insensitive" } } : {}) },
    },
    select: {
      id: true, title: true, propertyType: true, rentPeriod: true, priceMonth: true, bedrooms: true, lostAt: true, photoUrls: true, videoPosterUrl: true,
      location: { select: { state: true, sector: true, neighbourhood: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 30,
  });
  return pickSimilar(
    { id: home.id, priceMonth: home.priceMonth, bedrooms: home.bedrooms, district },
    rows.map((r) => ({ ...r, district: r.location?.state ?? null })),
  );
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { lang, ref } = await params;
  const id = homeIdOfRef(ref);
  const home = id ? await fetchHome(id) : null;
  const path = `/k/${encodeURIComponent(ref)}`;
  if (!home || !isBrokerHome(home)) return createMetadata({ title: "Mkan", description: "Homes for rent in Kigali", locale: lang, path, noIndex: true });
  const l = langOf(lang);
  const d = await getDictionary(lang);
  const c = d.agent?.card as Record<string, unknown> | undefined;
  const price = home.priceMonth ? `${formatCurrency(home.priceMonth, lang, home.currency ?? "RWF")} ${(c?.perMonth as string) ?? "/ month"}` : null;
  return createMetadata({
    title: scrubTitle(home.title) || `K${home.id}`,
    // What WhatsApp shows under the link: the price, the place, the size.
    description: [price, placeOf(home, l), home.bedrooms != null ? fill((c?.beds as string) ?? "{n} bd", { n: home.bedrooms }) : null].filter(Boolean).join(" · "),
    locale: lang,
    path,
    image: home.videoPosterUrl ?? home.photoUrls?.[0],
    // Indexed once it passes the trust gate (published); a draft lead stays out of search engines.
    noIndex: !home.isPublished || !!home.lostAt,
  });
}

export default async function BrokerHomePage({ params }: HomePageProps) {
  const { lang, ref } = await params;
  const id = homeIdOfRef(ref);
  if (!id) notFound();
  const home = await fetchHome(id);
  if (!home) notFound();
  // A host's published stay has its listing page; a broker's home lives here, published or not.
  if (!isBrokerHome(home)) {
    if (home.isPublished) permanentRedirect(listingPath(lang, home));
    notFound();
  }

  const l = langOf(lang);
  const t = COPY[l];
  const [d, sendMode] = await Promise.all([getDictionary(lang), brokerSendMode().catch(() => "off" as const)]);
  const c = d.agent?.card as Record<string, unknown> | undefined;
  const say = (key: string, fallback: string) => ((c?.[key] as string | undefined) ?? fallback);
  const lines = c?.lines as Record<string, string> | undefined;
  const status = c?.status as Record<string, string> | undefined;
  const source = c?.source as Record<string, string> | undefined;
  const currency = home.currency ?? "RWF";
  const money = (n: number) => formatCurrency(n, lang, currency);
  const num = (n: number) => n.toLocaleString(l === "ar" ? "ar" : "en", { maximumFractionDigits: 1 });
  const ref_ = `K${home.id}`;
  const lost = !!home.lostAt;
  // A taken home leads somewhere: 2–3 like it that are still free, and the WhatsApp line (2026-11-22).
  const similar = lost ? await similarHomes(home).catch(() => []) : [];

  const cost = home.priceMonth
    ? longStayCost({
        rentPeriod: "MONTHLY",
        priceMonth: home.priceMonth,
        pricePerNight: null,
        monthlyDiscount: null,
        cleaningFee: null,
        terms: {
          depositMonths: home.depositMonths,
          commissionPct: home.commissionPct,
          noCommission: home.noCommission,
          viewingFee: home.viewingFee,
          waterIncluded: home.waterIncluded,
          electricityIncluded: home.electricityIncluded,
          owner: home.brokers.length > 0,
        },
      })
    : null;
  // The viewing fee is Mkan's, never the tenant's: the move-in total leaves it out (deal-pure.ts).
  const fee = cost?.lines.find((x) => x.key === "viewingFee")?.amount ?? 0;
  const shownLines = (cost?.lines ?? []).filter((x) => x.key !== "viewingFee");
  const noCommission = !!cost && !cost.lines.some((x) => x.key === "commission");
  const lineLabel = (x: CostLine) => {
    const key =
      x.key === "deposit"
        ? x.qty === 0 ? "depositNone" : x.qty === 0.5 ? "depositHalf" : x.qty === 1 ? "depositOne" : "deposit"
        : x.key === "commission" && x.qtyHigh != null
          ? "commissionRange"
          : x.key;
    return fill(lines?.[key] ?? key, { qty: x.qty != null ? num(x.qty) : "", qtyHigh: x.qtyHigh != null ? num(x.qtyHigh) : "" });
  };
  const range = (low: number, high: number) => (high !== low ? fill(say("range", "{low} – {high}"), { low: money(low), high: money(high) }) : money(low));
  const photos = home.photoUrls.slice(0, 8);
  const place = placeOf(home, l);

  return (
    <div className="mx-auto w-full max-w-lg">
      {/* /find's own bar: a tenant who opened this from WhatsApp sees whose page it is, one tap from more homes. */}
      <ChatHeader
        title="Mkan"
        scrolled
        start={
          <Link href={`/${lang}/find`} aria-label={t.more} className={headerButton}>
            <ArrowLeft className="rtl:-scale-x-100" aria-hidden />
          </Link>
        }
      />
    {/* One VIEW per visit (the TikTok funnel's first step on Mkan's side; leads count since 2026-11-07). */}
    <TrackView listingId={home.id} />
    <Signal kind="visit" place="k" />
    <main className="w-full px-4 pb-16 pt-4">
      {home.videoUrl && (
        <VideoHero src={home.videoUrl} poster={home.videoPosterUrl} alt={`${t.video} ${ref_}`} labels={{ mute: t.mute, unmute: t.unmute }}>
          <div className="rounded-2xl bg-background/90 p-3 text-foreground shadow-lg backdrop-blur-md">
            {cost && (
              <p>
                <span className="text-xl font-semibold">{money(cost.headline)}</span>{" "}
                <span className="text-sm text-muted-foreground">{say("perMonth", "/ month")}</span>
              </p>
            )}
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {[place, home.bedrooms != null ? fill(say("beds", "{n} bd"), { n: home.bedrooms }) : null, ref_].filter(Boolean).join(" · ")}
            </p>
            {lost ? (
              <p className="mt-2 text-sm font-medium">{t.taken}</p>
            ) : (
              <WhatsAppCta
                href={continueOnWhatsApp(null, `${fill(say("checkWords", "Check {ref} for me"), { ref: ref_ })} ${K_PAGE_MARK}`)}
                listingId={home.id}
                className="mt-2.5 flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-2.5 text-[15px] font-medium text-background"
              >
                {t.ask}
              </WhatsAppCta>
            )}
          </div>
        </VideoHero>
      )}

      {/* A TikTok home is its video: no photos taken from it (Abdout, 2026-11-15). */}
      {!home.videoUrl && photos.length > 0 && (
        <div className={`-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 no-scrollbar`}>
          {photos.map((src, i) => (
            <div key={src} className={`relative aspect-[4/5] w-[85%] shrink-0 snap-center overflow-hidden rounded-2xl bg-muted`}>
              <BlurImage
                src={src}
                alt={i === 0 ? scrubTitle(home.title) || ref_ : ""}
                fill
                sizes="(min-width: 512px) 430px, 85vw"
                className="object-cover"
                {...(i === 0 ? { loading: "eager" as const, fetchPriority: "high" as const } : {})}
              />
            </div>
          ))}
        </div>
      )}

      <div className="mt-4 space-y-1">
        <h1 dir="auto" className="text-start text-xl font-semibold leading-snug">
          {scrubTitle(home.title) || ref_}
        </h1>
        <p className="text-sm text-muted-foreground">
          {[
            place,
            home.bedrooms != null ? fill(say("beds", "{n} bd"), { n: home.bedrooms }) : null,
            home.bathrooms != null ? fill(say("baths", "{n} ba"), { n: home.bathrooms }) : null,
            fill(t.code, { ref: ref_ }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {place && <p className="text-xs text-muted-foreground">{t.approx}</p>}
      </div>

      {cost && (
        <p className="mt-4">
          <span className="text-2xl font-semibold text-foreground">{money(cost.headline)}</span>{" "}
          <span className="text-sm text-muted-foreground">{say("perMonth", "/ month")}</span>
        </p>
      )}

      {lost && (
        <section className="mt-4 space-y-3">
          <p className="rounded-xl bg-muted p-3 text-sm font-medium">
            {t.taken} {similar.length > 0 && <span className="font-normal text-muted-foreground">{t.takenHint}</span>}
          </p>
          {similar.length > 0 && (
            <ul className="space-y-2">
              {similar.map((s) => (
                <li key={s.id}>
                  <Link href={`/${lang}/k/K${s.id}`} className="flex gap-3 rounded-xl p-2 ring-1 ring-border transition-colors hover:bg-muted">
                    <span className="relative size-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                      {(s.videoPosterUrl ?? s.photoUrls[0]) && <BlurImage src={(s.videoPosterUrl ?? s.photoUrls[0])!} alt="" fill sizes="64px" className="object-cover" />}
                    </span>
                    <span className="min-w-0 text-sm">
                      <span dir="auto" className="block truncate font-medium">{scrubTitle(s.title) || `K${s.id}`}</span>
                      <span className="block text-muted-foreground">{s.priceMonth ? `${money(s.priceMonth)} ${say("perMonth", "/ month")}` : null}</span>
                      <span className="block truncate text-xs text-muted-foreground">{[placeOf(s as unknown as Home, l), s.bedrooms != null ? fill(say("beds", "{n} bd"), { n: s.bedrooms }) : null].filter(Boolean).join(" · ")}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <WhatsAppCta href={continueOnWhatsApp(null, `${fill(t.takenWords, { ref: ref_ })} ${K_PAGE_MARK}`)} listingId={home.id}>
            {t.ask}
          </WhatsAppCta>
        </section>
      )}

      {cost && !lost && (
        <details open className="mt-4 rounded-xl bg-muted/60 p-3 text-sm">
          <summary className="flex cursor-pointer list-none flex-col gap-0.5">
            <span className="text-muted-foreground">{say("moveIn", "Estimated to move in")}</span>
            <span className="text-base font-semibold text-foreground">{range(cost.total - fee, cost.totalHigh - fee)}</span>
          </summary>
          <dl className="mt-2 space-y-1">
            {shownLines.map((x) => (
              <div key={x.key} className="flex justify-between gap-2 text-muted-foreground">
                <dt className="min-w-0">
                  {lineLabel(x)}
                  {x.source && <span className="ms-1.5 text-[11px] text-muted-foreground/80">· {source?.[x.source] ?? x.source}</span>}
                </dt>
                <dd className="shrink-0 tabular-nums">{x.status ? status?.[x.status] ?? x.status : x.amountHigh != null ? range(x.amount, x.amountHigh) : money(x.amount)}</dd>
              </div>
            ))}
            {noCommission && (
              <div className="flex justify-between gap-2 text-muted-foreground">
                <dt>{say("noCommission", "No broker commission")}</dt>
                <dd className="shrink-0 tabular-nums">{money(0)}</dd>
              </div>
            )}
          </dl>
          <p className="mt-2 text-xs text-muted-foreground">{say("estimateNote", "Estimate. A broker or host confirms the final terms.")}</p>
        </details>
      )}

      {!lost && (
        <div className="mt-5 space-y-1.5">
          <WhatsAppCta href={continueOnWhatsApp(null, `${fill(say("checkWords", "Check {ref} for me"), { ref: ref_ })} ${K_PAGE_MARK}`)} listingId={home.id}>
            {say("brokerAnswer", "Get the broker's answer on WhatsApp")}
          </WhatsAppCta>
          <p className="text-center text-xs text-muted-foreground">
            {/* "Asks the broker right away" is true only while broker sends are on for WhatsApp tenants. */}
            {sendMode === "gated"
              ? say("brokerAnswerHint", "Send the message that opens, and Mkan asks the broker right away. The answer comes to you on WhatsApp, and it's free.")
              : say("brokerAnswerHintPerson", "Send the message that opens, and someone at Mkan checks with the broker. The answer comes to you on WhatsApp, and it's free.")}
          </p>
        </div>
      )}

      <Link
        href={`/${lang}/find`}
        className="mt-3 flex w-full items-center justify-center rounded-full py-3 text-[15px] font-medium ring-1 ring-border transition-colors hover:bg-muted"
      >
        {t.more}
      </Link>
    </main>
    </div>
  );
}
