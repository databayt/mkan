/**
 * pnpm agent:eval — the /find reader against the golden set
 * (tests/agent/fixtures/reader-golden.json): Claude Haiku 5.5 (billed to the
 * `agent-eval` lane of the ApiSpend ledger, inside the agent's $15 cap), the
 * Groq free tier and the deterministic rules, case by case.
 *
 * Prints field accuracy per reader and language, every Claude miss, Claude's
 * p50 / p95 latency and cost, and the ship gate: Claude at least as good as
 * the rules on every field kind, ≥ 90% overall, p95 ≤ 2.5 s. Exits 1 on a miss.
 *
 *   pnpm agent:eval                 # all cases, all readers
 *   pnpm agent:eval --only=ar-usd   # one case
 *   pnpm agent:eval --no-groq       # skip the free tier
 *
 * Key: AGENT_ANTHROPIC_API_KEY, else the Keychain item mkan-ANTHROPIC_API_KEY.
 * About 45 calls ≈ $0.03.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { priceOf } from '../../src/components/agent/claude';
import { readRequirementsWithGroq } from '../../src/components/agent/llm';
import { coerceMemory } from '../../src/components/agent/memory';
import { readWithClaude } from '../../src/components/agent/reader';
import { EMPTY_REQUIREMENTS, coerceRequirements, parseAdjustments, parseRequirements, type Requirements } from '../../src/components/agent/requirements';
import type { ShortlistItem } from '../../src/components/agent/types';

if (!process.env.AGENT_ANTHROPIC_API_KEY) {
  try {
    process.env.AGENT_ANTHROPIC_API_KEY = execFileSync('security', ['find-generic-password', '-s', 'mkan-ANTHROPIC_API_KEY', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    // No key: the Claude column reports every case as unread.
  }
}



type Expect = unknown;
interface Case {
  id: string;
  lang: string;
  message: string;
  current?: Partial<Requirements>;
  newChat?: boolean;
  shown?: { bedrooms: number; district: string; price: number }[];
  memory?: unknown;
  expect?: Record<string, Expect>;
  absent?: string[];
  clear?: string[];
  intent?: string;
  like?: string;
  notLike?: string;
  remember?: number;
  forget?: string[];
}
interface Got {
  set: Record<string, unknown>;
  clear: string[];
  intent?: string;
  like?: string | null;
  notLike?: string | null;
  remember?: string[];
  forget?: string[];
}

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith('--only='))?.slice(7);
const withGroq = !args.includes('--no-groq');
const NOW = new Date('2026-10-21T09:00:00Z');

const golden = JSON.parse(readFileSync(join(process.cwd(), 'tests/agent/fixtures/reader-golden.json'), 'utf8')) as { cases: Case[] };
const cases = golden.cases.filter((c) => !only || c.id === only);

function matches(exp: Expect, actual: unknown): boolean {
  if (exp && typeof exp === 'object' && !Array.isArray(exp)) {
    const e = exp as Record<string, unknown>;
    if (Array.isArray(e.between)) return typeof actual === 'number' && actual >= (e.between[0] as number) && actual <= (e.between[1] as number);
    if (typeof e.near === 'string') return !!actual && (actual as { name?: string }).name === e.near;
    if (Array.isArray(e.has)) return Array.isArray(actual) && (e.has as unknown[]).every((v) => actual.includes(v));
    if (e.placed) return !!actual;
  }
  return JSON.stringify(actual) === JSON.stringify(exp);
}

/** One row per checked thing: its kind (a field, or intent / like / …) and whether it held. */
function score(c: Case, got: Got | null): { kind: string; ok: boolean; detail: string }[] {
  const rows: { kind: string; ok: boolean; detail: string }[] = [];
  const set = got?.set ?? {};
  for (const [k, exp] of Object.entries(c.expect ?? {})) rows.push({ kind: k, ok: !!got && matches(exp, set[k]), detail: `${k}: want ${JSON.stringify(exp)}, got ${JSON.stringify(set[k])}` });
  for (const k of c.absent ?? []) rows.push({ kind: k, ok: !!got && set[k] == null, detail: `${k}: want unset, got ${JSON.stringify(set[k])}` });
  for (const k of c.clear ?? []) rows.push({ kind: 'clear', ok: !!got?.clear.includes(k), detail: `clear ${k}: got ${JSON.stringify(got?.clear)}` });
  if (c.intent) rows.push({ kind: 'intent', ok: got?.intent === c.intent, detail: `intent: want ${c.intent}, got ${got?.intent}` });
  if (c.like) rows.push({ kind: 'like', ok: got?.like === c.like, detail: `like: want ${c.like}, got ${got?.like}` });
  if (c.notLike) rows.push({ kind: 'notLike', ok: got?.notLike === c.notLike, detail: `notLike: want ${c.notLike}, got ${got?.notLike}` });
  if (c.remember) rows.push({ kind: 'remember', ok: (got?.remember?.length ?? 0) >= c.remember, detail: `remember: want ≥${c.remember}, got ${JSON.stringify(got?.remember)}` });
  if (c.forget) rows.push({ kind: 'forget', ok: c.forget.every((id) => got?.forget?.includes(id)), detail: `forget: want ${JSON.stringify(c.forget)}, got ${JSON.stringify(got?.forget)}` });
  return rows;
}

const shownOf = (c: Case): ShortlistItem[] =>
  (c.shown ?? []).map((h, i) => ({ id: i + 1, bedrooms: h.bedrooms, district: h.district, currency: 'RWF', cost: { headline: h.price, period: 'month' } }) as unknown as ShortlistItem);
const currentOf = (c: Case): Requirements => ({ ...EMPTY_REQUIREMENTS, ...(c.current ?? {}) });

function readRules(c: Case): Got {
  const parsed = coerceRequirements(parseRequirements(c.message));
  const adjust = parseAdjustments(c.message, currentOf(c));
  return { set: { ...parsed, ...adjust.set }, clear: adjust.clear };
}

const results: Record<'claude' | 'groq' | 'rules', { c: Case; rows: ReturnType<typeof score> }[]> = { claude: [], groq: [], rules: [] };
const latencies: number[] = [];
let usd = 0;
let calls = 0;

async function main() {
for (const c of cases) {
  const input = { latest: c.message, current: currentOf(c), history: [], shown: shownOf(c), memory: coerceMemory(c.memory), newChat: c.newChat ?? true, now: NOW };
  const started = Date.now();
  const reading = await readWithClaude(input, {
    timeoutMs: 15_000,
    lane: 'agent-eval',
    onUsage: (u) => {
      usd += priceOf({ input_tokens: u.input_tokens, output_tokens: u.output_tokens, cache_read_input_tokens: u.cache_read_input_tokens ?? 0, cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0 });
      calls++;
    },
  });
  if (reading) latencies.push(Date.now() - started);
  results.claude.push({ c, rows: score(c, reading ? { ...reading, set: reading.set as Record<string, unknown> } : null) });
  results.rules.push({ c, rows: score(c, readRules(c)) });
  if (withGroq) {
    const g = await readRequirementsWithGroq(c.message, input.current, [], 8_000);
    results.groq.push({ c, rows: score(c, g ? { set: g.set as Record<string, unknown>, clear: g.clear } : null) });
    await new Promise((r) => setTimeout(r, 1_500)); // the free tier counts tokens per minute
  }
  process.stdout.write(reading ? '.' : 'x');
}
process.stdout.write('\n\n');

const pct = (rows: { ok: boolean }[]) => (rows.length ? Math.round((100 * rows.filter((r) => r.ok).length) / rows.length) : 0);
const flat = (k: keyof typeof results) => results[k].flatMap((r) => r.rows);
const langs = [...new Set(cases.map((c) => c.lang))];

console.log(`reader   all    ${langs.map((l) => l.padEnd(5)).join(' ')}`);
for (const k of ['claude', 'groq', 'rules'] as const) {
  if (!results[k].length) continue;
  const byLang = langs.map((l) => `${pct(results[k].filter((r) => r.c.lang === l).flatMap((r) => r.rows))}%`.padEnd(5));
  console.log(`${k.padEnd(8)} ${`${pct(flat(k))}%`.padEnd(6)} ${byLang.join(' ')}`);
}

const kinds = [...new Set(flat('rules').map((r) => r.kind))];
const worse = kinds.filter((kind) => pct(flat('claude').filter((r) => r.kind === kind)) < pct(flat('rules').filter((r) => r.kind === kind)));

latencies.sort((a, b) => a - b);
const p = (q: number) => latencies[Math.min(latencies.length - 1, Math.floor(q * latencies.length))] ?? 0;
console.log(`\nclaude: ${latencies.length}/${cases.length} read · p50 ${p(0.5)} ms · p95 ${p(0.95)} ms · $${usd.toFixed(4)} for ${calls} calls`);

const misses = results.claude.flatMap(({ c, rows }) => rows.filter((r) => !r.ok).map((r) => `  ${c.id.padEnd(22)} ${r.detail}`));
if (misses.length) console.log(`\nclaude misses:\n${misses.join('\n')}`);

const pass = latencies.length === cases.length && pct(flat('claude')) >= 90 && worse.length === 0 && p(0.95) <= 2_500;
console.log(`\ngate: ${pass ? 'PASS' : 'FAIL'}${worse.length ? ` — worse than the rules on: ${worse.join(', ')}` : ''}`);
process.exit(pass ? 0 : 1);
}

void main();
