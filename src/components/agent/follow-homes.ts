import "server-only";

/**
 * The next best homes for a chat, found from its own brief (2026-11-22): what the line offers by itself when a
 * tenant went quiet (quiet-nudge.ts) or passed on a home after the viewing (deal.ts recordAfterViewing). Read
 * only — it uses search.ts and rank.ts as they are and writes nothing. A home the tenant was already shown, in
 * this chat or any other of theirs, is never offered again; a home a broker said is taken never loads
 * (search.ts keeps out `lostAt`). Empty when the brief names nothing to search for, or on any failure: the
 * caller then asks the one question that unblocks the search instead.
 */
import { db } from "@/lib/db";
import type { OfferHome } from "./deal-pure";
import { rankCandidates } from "./rank";
import { coerceRequirements, EMPTY_REQUIREMENTS, type Requirements } from "./requirements";
import { searchKigali, toShortlist } from "./search";
import type { ShortlistItem } from "./types";

/** The ids this tenant has been shown: the chat's own shortlist and their other chats'. */
async function shownTo(task: { id: string; profileId: string | null; shortlist: unknown }): Promise<number[]> {
  const ids = new Set<number>(((task.shortlist as ShortlistItem[] | null) ?? []).map((s) => s.id));
  if (task.profileId) {
    const others = await db.agentTask.findMany({ where: { profileId: task.profileId, id: { not: task.id } }, orderBy: { updatedAt: "desc" }, take: 8, select: { shortlist: true } }).catch(() => []);
    for (const o of others) for (const s of (o.shortlist as ShortlistItem[] | null) ?? []) ids.add(s.id);
  }
  return [...ids];
}

/** Does the brief name anything to search by? An empty one would offer "the best-rated home in Kigali". */
export const hasBrief = (r: Partial<Requirements>) => !!(r.maxPrice || r.bedrooms != null || r.district || r.neighbourhood || r.neighbourhoods?.length || r.area || r.near || r.homeType || r.cheap);

/** Up to `n` homes that match the chat's brief and were not shown yet, best first. */
export async function newHomesFor(task: { id: string; profileId: string | null; requirements: unknown; shortlist: unknown }, n = 2): Promise<OfferHome[]> {
  try {
    const brief = coerceRequirements(task.requirements);
    // The agent covers monthly rentals only on this line.
    const query: Requirements = { ...EMPTY_REQUIREMENTS, ...brief, stay: "long" };
    if (!hasBrief(brief)) return [];
    const excludeIds = await shownTo(task);
    const { candidates } = await searchKigali(query, { excludeIds });
    const { ranked } = rankCandidates(candidates, query, n);
    const fresh = ranked.filter((r) => !excludeIds.includes(r.id)).slice(0, n);
    if (fresh.length === 0) return [];
    const items = await toShortlist(fresh, "en", query.near?.name);
    return items.map((s) => ({ id: s.id, bedrooms: s.bedrooms, zone: s.zone ?? null, rent: s.cost?.period === "month" ? Math.round(s.cost.headline) : null }));
  } catch (err) {
    console.warn(`[agent] new homes: ${(err as Error).message}`);
    return [];
  }
}
