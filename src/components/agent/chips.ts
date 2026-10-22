import type { Locale } from "@/components/internationalization/config";
import type { Dictionary } from "@/components/internationalization/dictionaries";
import { districtName } from "@/lib/geo/rwanda-places";
import { zoneLabel } from "@/lib/geo/kigali-zones";
import { neighbourhoodNamed } from "./areas";
import { fill } from "./format";
import type { Requirements } from "./requirements";

type AgentDict = Dictionary["agent"] | undefined;

/** "2026-11-01" → "1 Nov" in the reader's language; the date is a calendar day, so UTC. */
const dayLabel = (iso: string, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "rw" ? "en" : locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

/** A neighbourhood in the reader's language ("Kimihurura" → "كيميهورورا"); the stored name otherwise. */
const hoodLabel = (name: string, locale: Locale) => zoneLabel(neighbourhoodNamed(name)?.slug, locale === "ar" ? "ar" : locale === "rw" ? "rw" : "en") ?? name;

/**
 * A search as the chips a tenant reads — "Long stay · Kicukiro · 2 bedrooms ·
 * Up to RWF 500,000 a month". The "Looking for" row, the ☰ chat titles, the
 * welcome-back card and the memory panel all say a search this one way. A
 * neighbourhood named like its district ("Kicukiro") reads once.
 */
export function requirementChips(req: Partial<Requirements> | null | undefined, a: AgentDict, locale: Locale, money: (n: number) => string): string[] {
  if (!req) return [];
  return [
    req.stay === "short" ? a?.req?.short : req.stay === "long" ? a?.req?.long : null,
    req.district ? districtName(req.district, locale) : null,
    req.bedrooms === 0 ? a?.req?.studio : req.bedrooms != null ? fill(a?.req?.beds ?? "{n} bedrooms", { n: req.bedrooms }) : null,
    req.furnished === true ? a?.req?.furnished : req.furnished === false ? a?.req?.unfurnished : null,
    req.maxPrice ? fill((req.pricePeriod === "night" ? a?.req?.maxNight : a?.req?.maxMonth) ?? "{price}", { price: money(req.maxPrice) }) : null,
    req.nights ? fill(a?.req?.nights ?? "{n} nights", { n: req.nights }) : null,
    req.guests ? fill(a?.req?.guests ?? "{n} guests", { n: req.guests }) : null,
    req.maxUpfront ? fill(a?.req?.upfront ?? "{price}", { price: money(req.maxUpfront) }) : null,
    req.neighbourhood ? hoodLabel(req.neighbourhood, locale) : null,
    req.area ? (a?.req?.area as Record<string, string> | undefined)?.[req.area] ?? null : null,
    req.bathrooms ? fill(a?.req?.baths ?? "{n}+ bathrooms", { n: req.bathrooms }) : null,
    req.homeType && req.homeType !== "studio" ? (a?.req?.homeType as Record<string, string> | undefined)?.[req.homeType] ?? null : null,
    req.purpose ? (a?.req?.purpose as Record<string, string> | undefined)?.[req.purpose] ?? null : null,
    req.waterIncluded ? a?.req?.waterIncluded : null,
    req.noCommission ? a?.req?.noCommission : null,
    req.cheap ? a?.req?.cheap : null,
    req.near ? fill(a?.req?.near ?? "Near {place}", { place: req.near.name }) : null,
    ...(req.mustHaves ?? []).map((k) => (a?.mustHaves as Record<string, string> | undefined)?.[k] ?? k),
    req.moveIn ? fill(a?.req?.moveIn ?? "From {date}", { date: dayLabel(req.moveIn, locale) }) : null,
    req.months ? fill(a?.req?.months ?? "{n} months", { n: req.months }) : null,
  ].filter((x, i, all): x is string => !!x && all.indexOf(x) === i);
}

/** A chat's name in the ☰ list: what was searched for, else the tenant's first words. */
export function chatTitle(
  chat: { title: string | null; requirements: Partial<Requirements> | null },
  a: AgentDict,
  locale: Locale,
  money: (n: number) => string,
): string {
  // The stay type alone says little; lead with place and size.
  const chips = requirementChips(chat.requirements, a, locale, money).filter((c) => c !== a?.req?.short && c !== a?.req?.long);
  if (chips.length > 0) return chips.slice(0, 3).join(" · ");
  return chat.title?.trim() || (a?.chat?.untitled ?? "New search");
}
