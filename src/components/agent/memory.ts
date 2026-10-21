/**
 * What the rental agent remembers about a tenant across chats — the JSON in
 * `AgentProfile.memory`. Pure data and merges, no database: profile.ts folds
 * two browsers' memories together on sign-in, a finished turn writes the
 * search it settled on, and the ☰ Memory panel edits or forgets it.
 *
 * Only what helps the next search is kept: the sticky search fields, a few
 * short facts the tenant said, and the homes they saved, passed on or saw.
 * Phone numbers and emails never go into a note.
 */

export const MAX_NOTES = 10;
export const MAX_NOTE_CHARS = 80;
export const MAX_IDS = 200;

/** Search fields worth carrying into the next chat. Dates and nights are not: they belong to one trip. */
export const PREF_FIELDS = [
  "stay",
  "pricePeriod",
  "maxPrice",
  "bedrooms",
  "bathrooms",
  "furnished",
  "family",
  "compound",
  "district",
  "neighbourhood",
  "area",
  "mustHaves",
  "near",
] as const;
export type PrefField = (typeof PREF_FIELDS)[number];

/** said — typed; tapped — a chip or card; inferred — read from a figure ("450k" → a month). */
export type PrefSource = "said" | "tapped" | "inferred";

export interface RememberedPref {
  value: unknown;
  at: string;
  source: PrefSource;
}

export interface MemoryNote {
  id: string;
  text: string;
  at: string;
}

export interface AgentMemory {
  v: 1;
  prefs: Partial<Record<PrefField, RememberedPref>>;
  /** Newest first. */
  notes: MemoryNote[];
  /** Listing ids, newest first. */
  liked: number[];
  dismissed: number[];
  seen: number[];
}

export const emptyMemory = (): AgentMemory => ({ v: 1, prefs: {}, notes: [], liked: [], dismissed: [], seen: [] });

const SOURCES: readonly PrefSource[] = ["said", "tapped", "inferred"];

const ids = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map(Number).filter((n) => Number.isInteger(n) && n > 0))].slice(0, MAX_IDS) : [];

/** Read whatever is stored, dropping anything malformed instead of failing the turn. */
export function coerceMemory(raw: unknown): AgentMemory {
  const out = emptyMemory();
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  if (r.prefs && typeof r.prefs === "object") {
    for (const field of PREF_FIELDS) {
      const p = (r.prefs as Record<string, unknown>)[field] as Partial<RememberedPref> | undefined;
      if (!p || p.value == null || typeof p.at !== "string" || Number.isNaN(Date.parse(p.at))) continue;
      out.prefs[field] = { value: p.value, at: p.at, source: SOURCES.includes(p.source as PrefSource) ? (p.source as PrefSource) : "said" };
    }
  }
  if (Array.isArray(r.notes)) {
    out.notes = r.notes
      .filter((n): n is MemoryNote => !!n && typeof n === "object" && typeof (n as MemoryNote).text === "string" && typeof (n as MemoryNote).id === "string")
      .map((n) => ({ id: n.id, text: n.text.slice(0, MAX_NOTE_CHARS), at: typeof n.at === "string" ? n.at : new Date(0).toISOString() }))
      .slice(0, MAX_NOTES);
  }
  out.liked = ids(r.liked);
  out.dismissed = ids(r.dismissed);
  out.seen = ids(r.seen);
  return out;
}

export const isEmptyMemory = (m: AgentMemory): boolean =>
  Object.keys(m.prefs).length === 0 && m.notes.length === 0 && m.liked.length === 0 && m.dismissed.length === 0;

/**
 * A fact worth keeping, minus anything that identifies a person: emails and
 * long digit runs (phones, IDs) are cut. Null when nothing useful is left.
 */
export function sanitizeNote(text: string): string | null {
  const clean = text
    .replace(/\S+@\S+\.\S+/g, "")
    .replace(/\+?\d[\d\s().-]{5,}\d/g, (m) => (m.replace(/\D/g, "").length >= 7 ? "" : m))
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, MAX_NOTE_CHARS)
    .trim();
  return clean.length >= 3 ? clean : null;
}

const newest = (a: string, b: string) => (Date.parse(a) >= Date.parse(b) ? a : b);

/** Union two id lists, the first list's order first, capped. */
const unionIds = (a: number[], b: number[]) => [...new Set([...a, ...b])].slice(0, MAX_IDS);

/**
 * Two memories become one (sign-in folds a second browser into the account):
 * each search field keeps its newest value, notes and homes are unioned.
 */
export function mergeMemory(a: AgentMemory, b: AgentMemory): AgentMemory {
  const prefs: AgentMemory["prefs"] = { ...a.prefs };
  for (const field of PREF_FIELDS) {
    const theirs = b.prefs[field];
    const ours = prefs[field];
    if (theirs && (!ours || newest(ours.at, theirs.at) === theirs.at)) prefs[field] = theirs;
  }
  const seenText = new Set<string>();
  const notes = [...a.notes, ...b.notes]
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
    .filter((n) => {
      const key = n.text.trim().toLowerCase();
      if (seenText.has(key)) return false;
      seenText.add(key);
      return true;
    })
    .slice(0, MAX_NOTES);
  return {
    v: 1,
    prefs,
    notes,
    liked: unionIds(a.liked, b.liked),
    dismissed: unionIds(a.dismissed, b.dismissed),
    seen: unionIds(a.seen, b.seen),
  };
}
