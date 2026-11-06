/**
 * The sprint loop's heartbeat row (WaState 'sprint-loop') — written by the runner on every state change
 * (scripts/sprint.ts beat) and by the cycle while its planner runs; read by /monetize's live card
 * (src/app/api/monetize/live). `since` survives a repeat of the same state, so the page can say
 * "parked for 2 h". A sleeping Mac writes nothing: the page reads that from the row's age.
 */
type Db = (typeof import('../../src/lib/db'))['db'];

export const LOOP_STATES = ['checking', 'planning', 'running', 'idle', 'waiting', 'parked', 'stopped'] as const;
export type LoopState = (typeof LOOP_STATES)[number];

export async function writeBeat(db: Db, state: LoopState, opts: { promptId?: string | null; until?: string | null; note?: string | null } = {}) {
  const now = new Date().toISOString();
  const value: Record<string, string | null> = {
    state,
    promptId: opts.promptId ?? null,
    since: now,
    at: now,
    until: opts.until ? new Date(/^\d+$/.test(opts.until) ? Number(opts.until) * 1000 : opts.until).toISOString() : null,
    // Shown to admins only (the public card says the state, never this line).
    note: (opts.note ?? '').replace(/\s+/g, ' ').slice(0, 200) || null,
  };
  const prev = (await db.waState.findUnique({ where: { key: 'sprint-loop' } }))?.value as Record<string, unknown> | null | undefined;
  if (prev && prev.state === value.state && (prev.promptId ?? null) === value.promptId && typeof prev.since === 'string') value.since = prev.since;
  await db.waState.upsert({ where: { key: 'sprint-loop' }, create: { key: 'sprint-loop', value }, update: { value } });
  return value;
}
