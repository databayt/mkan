import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { MessageCircle } from "lucide-react";
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
import { homeIdOfRef } from "@/components/agent/home-path";
import { LEAD_SOURCES } from "@/components/agent/search";
import { continueOnWhatsApp } from "@/components/agent/wa-link";

/**
 * Mkan's own page for a broker home — /en/k/K5808 (Abdout, 2026-11-01). Every link a tenant
 * can follow to a broker's home comes here instead of the broker's ad, whose caption carries the
 * broker's phone: the home's photos, facts and move-in cost, and "check it's free" on Mkan's
 * WhatsApp line, which opens that home by its code. Never the broker's handle, ad or number.
 * Kept out of search engines, like every lead. A published home has its own listing page.
 */

interface HomePageProps {
  params: Promise<{ lang: Locale; ref: string }>;
}

const COPY = {
  en: { code: "Code {ref}", taken: "This home was just taken.", more: "More homes like this", approx: "Approximate area" },
  ar: { code: "الرمز {ref}", taken: "تم تأجير هذا المنزل للتو.", more: "منازل أخرى مثل هذا", approx: "منطقة تقريبية" },
  rw: { code: "Kode {ref}", taken: "Iyi nzu imaze gukodeshwa.", more: "Andi mazu nk'iyi", approx: "Agace kegereye" },
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

const isBrokerHome = (h: Home) => !h.isPublished && (LEAD_SOURCES as readonly string[]).includes(h.source ?? "") && h.rentPeriod === "MONTHLY";

const langOf = (lang: string): "en" | "ar" | "rw" => (lang === "ar" || lang === "rw" ? lang : "en");

function placeOf(h: Home, lang: "en" | "ar" | "rw"): string | null {
  const zone = zoneLabel(h.location?.neighbourhood ?? h.location?.sector ?? null, lang);
  if (zone) return zone;
  const district = (h.location?.state ?? "").toUpperCase();
  return district ? districtName(district, lang) || h.location?.state || null : null;
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
    title: home.title ?? `K${home.id}`,
    // What WhatsApp shows under the link: the price, the place, the size.
    description: [price, placeOf(home, l), home.bedrooms != null ? fill((c?.beds as string) ?? "{n} bd", { n: home.bedrooms }) : null].filter(Boolean).join(" · "),
    locale: lang,
    path,
    image: home.photoUrls?.[0],
    noIndex: true,
  });
}

export default async function BrokerHomePage({ params }: HomePageProps) {
  const { lang, ref } = await params;
  const id = homeIdOfRef(ref);
  if (!id) notFound();
  const home = await fetchHome(id);
  if (!home) notFound();
  // A published home has its listing page; only a broker's home lives here.
  if (home.isPublished) permanentRedirect(listingPath(lang, home));
  if (!isBrokerHome(home)) notFound();

  const l = langOf(lang);
  const t = COPY[l];
  const d = await getDictionary(lang);
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
    <main className="mx-auto w-full max-w-lg px-4 pb-16 pt-4">
      {photos.length > 0 && (
        <div className="-mx-4 flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1 no-scrollbar">
          {photos.map((src, i) => (
            <div key={src} className="relative aspect-[4/5] w-[85%] shrink-0 snap-center overflow-hidden rounded-2xl bg-muted">
              <BlurImage
                src={src}
                alt={i === 0 ? home.title ?? ref_ : ""}
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
          {home.title ?? ref_}
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
          <span className="text-2xl font-semibold">{money(cost.headline)}</span>{" "}
          <span className="text-sm text-muted-foreground">{say("perMonth", "/ month")}</span>
        </p>
      )}

      {lost && <p className="mt-4 rounded-xl bg-muted p-3 text-sm font-medium">{t.taken}</p>}

      {cost && !lost && (
        <details open className="mt-4 rounded-xl bg-muted/60 p-3 text-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
            <span>{say("moveIn", "Estimated to move in")}</span>
            <span className="font-semibold">{range(cost.total - fee, cost.totalHigh - fee)}</span>
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
          <a
            href={continueOnWhatsApp(null, ref_)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-full bg-foreground py-3 text-[15px] font-medium text-background"
          >
            <MessageCircle className="size-4" aria-hidden />
            {say("checkOnWhatsApp", "Check availability on WhatsApp")}
          </a>
          <p className="text-center text-xs text-muted-foreground">
            {say("checkOnWhatsAppHint", "Mkan checks with the broker and sets up the viewing. It's free for you.")}
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
  );
}
