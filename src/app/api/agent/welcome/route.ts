import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { i18n, type Locale } from "@/components/internationalization/config";
import { coerceMemory } from "@/components/agent/memory";
import { resolveViewer } from "@/components/agent/profile";
import { rankCandidates } from "@/components/agent/rank";
import { coerceRequirements, EMPTY_REQUIREMENTS, type Requirements } from "@/components/agent/requirements";
import { searchKigali, toShortlist } from "@/components/agent/search";
import type { AgentWelcomeView } from "@/components/agent/types";

export const dynamic = "force-dynamic";

/** Fields that make a remembered search worth continuing on their own. */
const SEARCHABLE: (keyof Requirements)[] = ["district", "neighbourhood", "near", "bedrooms", "maxPrice", "mustHaves", "area"];

/**
 * Every empty /find and every bubble mount asks for this, and a returning
 * tenant's answer is a search, a rank and the display rows. The answer only
 * moves when the profile's memory or last search does (both are in the key),
 * or when homes are listed — so it is kept for ten minutes.
 */
const CACHE_MS = 10 * 60_000;
const CACHE_MAX = 500;
const cache = new Map<string, { at: number; view: AgentWelcomeView }>();

function remember(key: string, view: AgentWelcomeView) {
  cache.set(key, { at: Date.now(), view });
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

/**
 * The empty /find for a returning tenant: the search they last settled on
 * (one tap continues it) and up to 6 homes that match it, listed since that
 * search and not yet seen or passed on. Fetched after the page renders, so it
 * never slows the first paint; a read — nothing is created.
 */
export async function GET(req: NextRequest) {
  const langParam = req.nextUrl.searchParams.get("lang") ?? "";
  const lang: Locale = (i18n.locales as readonly string[]).includes(langParam) ? (langParam as Locale) : i18n.defaultLocale;
  const none: AgentWelcomeView = { search: null, homes: [], since: null };
  const viewer = await resolveViewer({ write: false });
  if (!viewer.profile) return NextResponse.json(none, { headers: { "Cache-Control": "no-store" } });

  const memory = coerceMemory(viewer.profile.memory);
  const search = coerceRequirements(Object.fromEntries(Object.entries(memory.prefs).map(([k, p]) => [k, p?.value])));
  // Monthly rentals only (2026-10-24): a remembered short stay, or a nightly budget, is not offered again.
  if (search.stay === "short" || search.pricePeriod === "night") {
    for (const k of ["stay", "nights", "guests", "maxPrice", "pricePeriod"] as const) delete search[k];
  }
  if (!SEARCHABLE.some((k) => search[k] != null)) return NextResponse.json(none, { headers: { "Cache-Control": "no-store" } });

  const key = [
    viewer.profile.id,
    viewer.profile.lastSearchAt?.getTime() ?? 0,
    lang,
    createHash("sha1").update(JSON.stringify(viewer.profile.memory ?? null)).digest("base64url").slice(0, 16),
  ].join(":");
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return NextResponse.json(hit.view, { headers: { "Cache-Control": "no-store" } });

  const since = viewer.profile.lastSearchAt;
  let homes: AgentWelcomeView["homes"] = [];
  if (since) {
    const query: Requirements = { ...EMPTY_REQUIREMENTS, ...search, stay: "long" };
    const { candidates } = await searchKigali(query, { createdAfter: since, excludeIds: [...memory.seen, ...memory.dismissed] });
    const { ranked } = rankCandidates(candidates, query, 6);
    homes = await toShortlist(ranked, lang, query.near?.name).catch(() => []);
  }
  const view: AgentWelcomeView = { search, homes, since: since?.toISOString() ?? null };
  remember(key, view);
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
