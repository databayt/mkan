"use server";

/**
 * What a tenant teaches the agent with one tap, and what they can see and
 * undo of it: ♥ a home, pass on one, ask a broker if one is still free, and
 * the ☰ Saved / Memory views. Every action is scoped to the viewer's profile.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Locale } from "@/components/internationalization/config";
import { listingPath } from "@/lib/listing-code";
import { appendTaskEvent } from "./broker";
import { askAvailabilityFor } from "./availability";
import { coerceMemory, emptyMemory, MAX_IDS, PREF_FIELDS, type AgentMemory, type PrefField } from "./memory";
import { ownedBy, requireProfile } from "./profile";
import { LEAD_SOURCES } from "./search";

const json = (v: unknown) => v as Prisma.InputJsonValue;

/** Read, change and write the viewer's memory in one transaction (two tabs cannot overwrite each other). */
async function changeMemory(profileId: string, change: (m: AgentMemory) => AgentMemory): Promise<AgentMemory> {
  return db.$transaction(async (tx) => {
    const row = await tx.agentProfile.findUnique({ where: { id: profileId }, select: { memory: true } });
    const next = change(coerceMemory(row?.memory));
    await tx.agentProfile.update({ where: { id: profileId }, data: { memory: json(next) } });
    return next;
  });
}

const front = (ids: number[], id: number) => [id, ...ids.filter((x) => x !== id)].slice(0, MAX_IDS);

export type HomeFeedback = "like" | "unlike" | "dismiss";

/**
 * ♥ / un-♥ / "Not for me" on a card. A passed-on home never comes back in a
 * search; a saved one is remembered (and lives in the site's favorites too).
 */
export async function noteHomeFeedback(input: { taskId: string; listingId: number; kind: HomeFeedback; reason?: string }): Promise<{ ok: boolean }> {
  if (!Number.isInteger(input.listingId) || !["like", "unlike", "dismiss"].includes(input.kind)) return { ok: false };
  const viewer = await requireProfile();
  const task = input.taskId ? await db.agentTask.findFirst({ where: { id: input.taskId, ...ownedBy(viewer) }, select: { id: true } }) : null;
  await changeMemory(viewer.profile.id, (m) => ({
    ...m,
    liked: input.kind === "like" ? front(m.liked, input.listingId) : m.liked.filter((x) => x !== input.listingId),
    dismissed: input.kind === "dismiss" ? front(m.dismissed, input.listingId) : m.dismissed,
  }));
  if (task && input.kind !== "unlike") {
    await appendTaskEvent(task.id, input.kind === "like" ? "home_saved" : "home_dismissed", "done", {
      listingId: input.listingId,
      ...(input.reason ? { reason: String(input.reason).slice(0, 40) } : {}),
    });
  }
  return { ok: true };
}

/**
 * "Check availability" on a broker home the agent did not ask about (the stay
 * type was a guess): the tenant's tap is the consent, and the same one-message
 * broker loop runs for this one home.
 */
export async function askAvailability(input: { taskId: string; listingId: number }): Promise<{ ok: boolean; asked: boolean }> {
  const viewer = await requireProfile();
  const task = await db.agentTask.findFirst({ where: { id: input.taskId, ...ownedBy(viewer) }, select: { id: true } });
  if (!task) return { ok: false, asked: false };
  return askAvailabilityFor(task.id, input.listingId);
}

export interface SavedHome {
  id: number;
  title: string;
  photo: string | null;
  district: string | null;
  price: number | null;
  period: "night" | "month";
  currency: string;
  path: string;
  external: boolean;
}

/** The ☰ Saved view: the homes behind the hearts (the site's favorites), newest first as given. */
export async function getSavedHomes(ids: number[], lang: Locale): Promise<SavedHome[]> {
  const wanted = [...new Set(ids.filter((n) => Number.isInteger(n) && n > 0))].slice(0, 60);
  if (wanted.length === 0) return [];
  const rows = await db.listing.findMany({
    where: { id: { in: wanted } },
    select: {
      id: true,
      code: true,
      sourceListingId: true,
      title: true,
      photoUrls: true,
      currency: true,
      rentPeriod: true,
      pricePerNight: true,
      priceMonth: true,
      isPublished: true,
      source: true,
      sourceUrl: true,
      location: { select: { state: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return wanted.flatMap((id) => {
    const r = byId.get(id);
    if (!r) return [];
    const lead = !r.isPublished && (LEAD_SOURCES as readonly string[]).includes(r.source ?? "");
    const monthly = r.rentPeriod === "MONTHLY";
    return [
      {
        id: r.id,
        title: r.title ?? "",
        photo: r.photoUrls[0] ?? null,
        district: r.location?.state ?? null,
        price: monthly ? r.priceMonth : r.pricePerNight,
        period: monthly ? "month" : "night",
        currency: r.currency,
        path: lead ? r.sourceUrl ?? "" : listingPath(lang, r),
        external: lead,
      } satisfies SavedHome,
    ];
  });
}

/** The ☰ Memory view: drop remembered fields or notes, change a budget or a size, or let the passed-on homes back. */
export async function updateAgentMemory(input: {
  removePrefs?: string[];
  removeNotes?: string[];
  clearDismissed?: boolean;
  set?: { maxPrice?: number; pricePeriod?: "night" | "month"; bedrooms?: number };
}): Promise<AgentMemory> {
  const viewer = await requireProfile();
  const at = new Date().toISOString();
  return changeMemory(viewer.profile.id, (m) => {
    const prefs = { ...m.prefs };
    for (const k of input.removePrefs ?? []) if ((PREF_FIELDS as readonly string[]).includes(k)) delete prefs[k as PrefField];
    // A budget is one thing to the tenant: its ceiling and its period go together.
    if (input.removePrefs?.includes("maxPrice")) delete prefs.pricePeriod;
    const set = input.set ?? {};
    if (set.maxPrice && set.maxPrice >= 1_000 && set.maxPrice <= 50_000_000) {
      prefs.maxPrice = { value: Math.round(set.maxPrice), at, source: "tapped" };
      if (set.pricePeriod) prefs.pricePeriod = { value: set.pricePeriod, at, source: "tapped" };
    }
    if (set.bedrooms != null && Number.isInteger(set.bedrooms) && set.bedrooms >= 0 && set.bedrooms <= 10) {
      prefs.bedrooms = { value: set.bedrooms, at, source: "tapped" };
    }
    const drop = new Set(input.removeNotes ?? []);
    return { ...m, prefs, notes: m.notes.filter((n) => !drop.has(n.id)), dismissed: input.clearDismissed ? [] : m.dismissed };
  });
}

/** "Forget everything": the memory goes; the chats stay (they are deleted one by one). */
export async function forgetAgentMemory(): Promise<AgentMemory> {
  const viewer = await requireProfile();
  await db.agentProfile.update({ where: { id: viewer.profile.id }, data: { memory: json(emptyMemory()), lastSearchAt: null } });
  return emptyMemory();
}
