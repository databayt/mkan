/**
 * The CRM queue's rules, without I/O (2026-11-15): which Twenty object is written how, coalescing, the
 * call budget, retries, the backlog alert and echo suppression. crm-ops.ts does the database and Twenty.
 */

/** The Twenty objects mkan writes, with REST plural, the field mkan's key lives in, and whether a newer op replaces an older one. */
export const CRM_OBJECTS = {
  tenant: { plural: "tenants", keyField: "mkanProfileId", coalesce: true },
  deal: { plural: "deals", keyField: "mkanKey", coalesce: true },
  /** A viewing Task: one per deal and time — a moved viewing PATCHes the same Task. */
  task: { plural: "tasks", keyField: null, coalesce: true },
  /** A note is a record of its own — two notes are two notes. */
  note: { plural: "notes", keyField: null, coalesce: false },
} as const;
export type CrmObject = keyof typeof CRM_OBJECTS;
export const isCrmObject = (o: string): o is CrmObject => o in CRM_OBJECTS;

/** Twenty allows 100 calls / 60 s, shared with the Mac scripts: the Worker keeps to 40. */
export const CALLS_PER_MINUTE = 40;
export const MAX_TRIES = 8;
/** A backlog this old is worth a card; one card per ALERT_EVERY_MS. */
export const BACKLOG_MS = 30 * 60_000;
export const ALERT_EVERY_MS = 6 * 3_600_000;
/** Echo window: an event for a field we wrote this recently is ours coming back. */
export const ECHO_MS = 2 * 60_000;

/** Merge a newer payload onto a queued one: newer fields win, fields only the older one had are kept. */
export function mergePayload(older: Record<string, unknown>, newer: Record<string, unknown>): Record<string, unknown> {
  return { ...older, ...newer };
}

/**
 * Whether a new op for (object, key) should merge into the QUEUED one instead of piling up. Only
 * upserts coalesce, and never past a note/task that depends on them (those carry their own key).
 */
export function coalesces(object: string): boolean {
  return isCrmObject(object) && CRM_OBJECTS[object].coalesce;
}

/** Fields whose names start with "$" are mkan-side references the drain resolves; they are not Twenty fields. */
export const isRef = (field: string) => field.startsWith("$");

/** The Twenty field names an op writes (what `CrmLink.pushedFields` records for echo suppression). */
export function pushedFieldsOf(fields: Record<string, unknown>, resolvedRefs: string[] = []): string[] {
  return [...new Set([...Object.keys(fields).filter((k) => !isRef(k)), ...resolvedRefs])];
}

/**
 * Echo suppression: Twenty emits `x.updated` for our own PATCH too. An event is ours when every field it
 * lists was among the fields mkan pushed, and the push was within ECHO_MS. `updatedAt`-style housekeeping
 * fields Twenty adds itself do not count.
 */
const HOUSEKEEPING = new Set(["updatedAt", "updatedBy", "position", "searchVector"]);
export function isEcho(updatedFields: string[], link: { pushedFields: string[]; pushedAt: Date | null } | null | undefined, now = Date.now()): boolean {
  if (!link?.pushedAt || updatedFields.length === 0) return false;
  if (now - link.pushedAt.getTime() > ECHO_MS) return false;
  const pushed = new Set(link.pushedFields);
  const real = updatedFields.filter((f) => !HOUSEKEEPING.has(f));
  return real.length > 0 && real.every((f) => pushed.has(f) || pushed.has(f.replace(/Id$/, "")));
}

/** How many calls the next pass may make, given the window of the last one (WaState `crm-window`). */
export function callBudget(window: { at?: string; used?: number } | null | undefined, now = Date.now(), cap = CALLS_PER_MINUTE): number {
  const at = window?.at ? Date.parse(window.at) : NaN;
  if (!Number.isFinite(at) || now - at >= 60_000) return cap;
  return Math.max(0, cap - (window?.used ?? 0));
}

/** What a failed attempt does to an op: transient stays QUEUED until MAX_TRIES, a real error fails at once. */
export function afterFailure(tries: number, transient: boolean): { status: "QUEUED" | "FAILED"; tries: number } {
  const next = tries + 1;
  if (!transient || next >= MAX_TRIES) return { status: "FAILED", tries: next };
  return { status: "QUEUED", tries: next };
}

/** A card when the oldest queued op is older than BACKLOG_MS, at most once per ALERT_EVERY_MS. */
export function backlogAlertDue(oldestQueuedAt: Date | null, lastAlertAt: Date | null, now = Date.now()): boolean {
  if (!oldestQueuedAt || now - oldestQueuedAt.getTime() < BACKLOG_MS) return false;
  return !lastAlertAt || now - lastAlertAt.getTime() >= ALERT_EVERY_MS;
}

export function backlogCard(count: number, oldestQueuedAt: Date, now = Date.now()): string {
  const minutes = Math.round((now - oldestQueuedAt.getTime()) / 60_000);
  return `📡 *Twenty is behind* — ${count} CRM write${count === 1 ? "" : "s"} waiting, the oldest for ${minutes >= 120 ? `${Math.round(minutes / 60)} h` : `${minutes} min`}. The line keeps working on its own copy; the record catches up when crm-api.databayt.org answers.`;
}

/** Twenty returns the stage in UPPER_SNAKE; a person may also type a lower-case or spaced label. */
export const normStage = (s: unknown): string => String(s ?? "").trim().toUpperCase().replace(/[\s-]+/g, "_");
