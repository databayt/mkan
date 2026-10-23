/**
 * The /find agent's turn latency, read-only — where the seconds go.
 *
 *   pnpm agent:latency [--days=7]
 *
 * A turn is a tenant message and the agent's reply right after it. Each is
 * split by its trace rows (every step writes one when it starts):
 *   start   message → first step: the send action, the wait for `after()`, the task read
 *   reader  first step → search step: Claude / Groq / rules (a tap skips the model)
 *   search  search step → grouped: the candidate query and ranking
 *   cards   grouped → reply: the display rows, localize, the reply write
 * `shortlist_ready` rows from 2026-10-24 also carry the server's own clock (`ms`).
 */
import { config } from 'dotenv';
config({ override: true });

type Db = (typeof import('../../src/lib/db'))['db'];

interface Turn {
  id: string;
  text: string;
  tap: boolean;
  start: Date;
  kind: string | null;
  total: number;
  first: number | null;
  searchAt: number | null;
  groupedAt: number | null;
  reader: string | null;
  candidates: number | null;
  ms: Record<string, number> | null;
}

export async function agentLatency(db: Db, days = 7): Promise<Turn[]> {
  const since = new Date(Date.now() - days * 86_400_000);
  // Seconds from the tenant's message to each step's first row, per turn.
  return db.$queryRaw<Turn[]>`
    WITH m AS (
      SELECT t.id, e.ord, e.val->>'role' AS role, (e.val->>'at')::timestamptz AS at,
             e.val->>'text' AS text, e.val->>'kind' AS kind, (e.val ? 'filters') AS tap
      FROM "AgentTask" t, jsonb_array_elements(t.messages) WITH ORDINALITY e(val, ord)
      WHERE t."updatedAt" >= ${since}
    ), turns AS (
      SELECT u.id, u.text, u.tap, u.at AS start, a.at AS fin, a.kind
      FROM m u JOIN m a ON a.id = u.id AND a.ord = u.ord + 1
      WHERE u.role = 'user' AND a.role = 'agent' AND u.at >= ${since}
    )
    SELECT tu.id, left(tu.text, 48) AS text, tu.tap, tu.start, tu.kind,
      extract(epoch FROM tu.fin - tu.start)::float8 AS total,
      extract(epoch FROM min(e."createdAt") FILTER (WHERE e.kind = 'requirements_extracted') - tu.start)::float8 AS first,
      extract(epoch FROM min(e."createdAt") FILTER (WHERE e.kind = 'search_done') - tu.start)::float8 AS "searchAt",
      extract(epoch FROM min(e."createdAt") FILTER (WHERE e.kind = 'dedup_grouped') - tu.start)::float8 AS "groupedAt",
      max(e.payload->>'reader') FILTER (WHERE e.kind = 'requirements_extracted') AS reader,
      max((e.payload->>'candidates')::int) FILTER (WHERE e.kind = 'search_done') AS candidates,
      (array_agg(e.payload->'ms') FILTER (WHERE e.kind = 'shortlist_ready' AND e.payload ? 'ms'))[1] AS ms
    FROM turns tu
    LEFT JOIN "AgentEvent" e ON e."taskId" = tu.id AND e."createdAt" BETWEEN tu.start - interval '1 second' AND tu.fin + interval '3 seconds'
    GROUP BY tu.id, tu.text, tu.tap, tu.start, tu.fin, tu.kind
    ORDER BY tu.start`;
}

const pct = (xs: number[], p: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
};
const sec = (n: number | null | undefined) => (n == null ? '   –  ' : `${n.toFixed(1).padStart(5)}s`);

/** The four splits of a turn, in seconds; null where the turn never reached that step. */
function splits(t: Turn) {
  const first = t.first;
  return {
    start: first,
    reader: first != null && t.searchAt != null ? t.searchAt - first : null,
    search: t.searchAt != null && t.groupedAt != null ? t.groupedAt - t.searchAt : null,
    cards: t.groupedAt != null ? t.total - t.groupedAt : null,
  };
}

export function latencyReport(turns: Turn[], days: number): string {
  const lines = [`/find turns, last ${days}d: ${turns.length} (taps ${turns.filter((t) => t.tap).length}, errors ${turns.filter((t) => t.kind === 'error').length})`];
  const row = (label: string, xs: number[]) =>
    `  ${label.padEnd(8)} p50 ${sec(pct(xs, 50))}  p90 ${sec(pct(xs, 90))}  max ${sec(pct(xs, 100))}  (n=${xs.length})`;
  const totals = turns.map((t) => t.total);
  lines.push(row('total', totals));
  lines.push(`  over 6s  ${totals.filter((x) => x > 6).length} of ${totals.length}`);
  for (const key of ['start', 'reader', 'search', 'cards'] as const) {
    lines.push(row(key, turns.map((t) => splits(t)[key]).filter((x): x is number => x != null)));
  }
  const timed = turns.filter((t) => t.ms);
  if (timed.length) {
    const keys = [...new Set(timed.flatMap((t) => Object.keys(t.ms!)))];
    lines.push(`  server clock (${timed.length} turns): ` + keys.map((k) => `${k} p50 ${pct(timed.map((t) => t.ms![k] ?? 0), 50)}ms`).join(' · '));
  }
  lines.push('  slowest:');
  for (const t of [...turns].sort((a, b) => b.total - a.total).slice(0, 10)) {
    const s = splits(t);
    lines.push(
      `    ${t.start.toISOString().slice(5, 16)} ${sec(t.total)} = start ${sec(s.start)} reader ${sec(s.reader)} search ${sec(s.search)} cards ${sec(s.cards)}` +
        `  ${(t.reader ?? '-').padEnd(6)} ${String(t.candidates ?? '-').padStart(4)} ${t.kind ?? ''}  "${t.text}"`,
    );
  }
  return lines.join('\n');
}

if (process.argv[1] && /latency\.ts$/.test(process.argv[1])) {
  (async () => {
    const { db } = await import('../../src/lib/db');
    const days = Number((process.argv.find((a) => a.startsWith('--days=')) ?? '').split('=')[1]) || 7;
    console.log(latencyReport(await agentLatency(db, days), days));
    await db.$disconnect();
  })().catch((e) => {
    console.error(`❌ ${(e as Error).message}`);
    process.exit(1);
  });
}
