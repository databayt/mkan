/**
 * Backtest of the first-contact classifier (src/components/agent/contact-kind.ts) on the line's own history.
 *
 *   pnpm wa:classify-backtest --dry               last 21 days, each chat judged at its latest burst
 *   pnpm wa:classify-backtest --dry --first       …judged at its first burst instead (what the bot saw at first contact)
 *   pnpm wa:classify-backtest --dry --no-model    rules only (what the model would be asked: the "unknown" rows)
 *   --with-agent  count "the agent already showed this person homes" (production does; off here so the words are judged)
 *   --days=N   --write (keep the labels in WaState like production; without it nothing is written)
 *
 * Reads Evolution (findMessages) and the database, sends nothing, writes nothing to WaState unless `--write`. The only
 * write a run can make is the cents its model calls cost, into the ApiSpend ledger. It prints, per chat: the
 * phone masked to its last 3 digits, the predicted kind, and whether a rule or the model said so (plus the reason
 * CODE) — never a word of any message. Where the personal list or the broker directory already settled a chat, a
 * second column shows what the classifier alone would have said.
 *
 * The Anthropic key for a local run is read from the Keychain (`mkan-ANTHROPIC_API_KEY`) into AGENT_ANTHROPIC_API_KEY.
 */
import { config } from 'dotenv';
config({ override: true, quiet: true } as Parameters<typeof config>[0]);
process.env.PRISMA_QUIET ??= '1';

import { keychain } from './evolution';
import { isDirectChat, resolveAddresses } from './tenant-pure';

if (!process.env.AGENT_ANTHROPIC_API_KEY?.trim()) process.env.AGENT_ANTHROPIC_API_KEY = keychain('mkan-ANTHROPIC_API_KEY');

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const flag = (name: string) => process.argv.includes(`--${name}`);
const DAYS = Number(arg('days')) > 0 ? Number(arg('days')) : 21;
const WRITE = flag('write') && !flag('dry');
const FIRST = flag('first');
const NO_MODEL = flag('no-model');
/** Count a home the agent already showed as proof of a tenant (production does); off by default, so the words are judged. */
const WITH_AGENT = flag('with-agent');
const BURST_GAP_MS = 3 * 60_000;

async function main() {
  const evo = await import('./evolution');
  const { db } = await import('../../src/lib/db');
  const { phonesOfLids } = await import('../../src/components/agent/wa-state');
  const { botMarks, contactKind, toLine } = await import('../../src/components/agent/contact-kind');
  const { HISTORY_LINES, maskAddress } = await import('../../src/components/agent/contact-kind-pure');
  type Line = NonNullable<ReturnType<typeof toLine>>;

  const now = new Date();
  const since = new Date(now.getTime() - DAYS * 86_400_000);
  const messages = await evo.findMessages(since, now, 3000);
  const marks = await botMarks();

  // One person, two addresses: the phone is the chat's name, the lid its other half (alias rows + keys that carry both).
  const lids = [...new Set(messages.map((m) => (m.key?.remoteJid?.endsWith('@lid') ? m.key.remoteJid : null)).filter((l): l is string => !!l))];
  const alias = await phonesOfLids(lids);
  const pairs = new Map<string, string>(alias);
  for (const m of messages) {
    const a = resolveAddresses(m.key);
    if (a.lid && a.phone) pairs.set(a.lid, a.phone);
  }
  const chats = new Map<string, { phone: string; lid: string | null; lines: Line[] }>();
  for (const m of messages) {
    if (!isDirectChat(m.key?.remoteJid)) continue;
    const a = resolveAddresses(m.key, phoneFromPairs(m.key?.remoteJid, pairs));
    const phone = a.phone ?? '';
    const id = phone || a.lid || '';
    if (!id) continue;
    const line = toLine(m, marks);
    const chat = chats.get(id) ?? { phone, lid: a.lid, lines: [] };
    if (a.lid) chat.lid = a.lid;
    if (line) chat.lines.push(line);
    chats.set(id, chat);
  }

  const kinds = new Map<string, number>();
  const hows = new Map<string, number>();
  const alone = new Map<string, number>();
  let modelCalls = 0;
  let spendUsd = 0;
  let skipped = 0;
  const onSpend = (usd: number, calls: number) => {
    spendUsd += usd;
    modelCalls += calls;
  };
  const rows: { at: number; text: string }[] = [];

  for (const [id, chat] of chats) {
    const lines = chat.lines.sort((a, b) => a.at - b.at);
    const start = burstStart(lines, FIRST);
    if (start < 0) {
      skipped += 1;
      continue;
    }
    const burst = [lines[start]!];
    for (let i = start + 1; i < lines.length; i += 1) {
      const l = lines[i]!;
      if (l.fromMe || l.at - burst[burst.length - 1]!.at > BURST_GAP_MS) break;
      burst.push(l);
    }
    const history = lines.slice(0, start).slice(-HISTORY_LINES);
    const opts = { dry: !WRITE, fresh: true, noModel: NO_MODEL, history, onSpend, ...(WITH_AGENT ? {} : { agentShowedHomes: false }) };
    const read = await contactKind(chat.phone, chat.lid, burst.map((l) => l.text), opts);
    let text = `${maskAddress(chat.phone || id).padEnd(8)} ${read.kind.padEnd(9)} ${howOf(read.source)} ${read.why}`;
    kinds.set(read.kind, (kinds.get(read.kind) ?? 0) + 1);
    hows.set(howOf(read.source), (hows.get(howOf(read.source)) ?? 0) + 1);
    if (read.source === 'list' || read.source === 'broker') {
      const solo = await contactKind(chat.phone, chat.lid, burst.map((l) => l.text), { ...opts, broker: false, skipList: true });
      text += `   (${read.source} says so; the classifier alone: ${solo.kind} ${howOf(solo.source)} ${solo.why})`;
      alone.set(solo.kind, (alone.get(solo.kind) ?? 0) + 1);
    }
    rows.push({ at: lines[lines.length - 1]!.at, text });
  }

  rows.sort((a, b) => b.at - a.at);
  for (const r of rows) console.log(r.text);
  const fmt = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(' · ') || '—';
  console.log(`\n${rows.length} chats in ${DAYS} days (${skipped} with no typed message from them), judged at their ${FIRST ? 'first' : 'latest'} burst${NO_MODEL ? ', rules only' : ''}${WRITE ? ', labels WRITTEN' : ', nothing written'}`);
  console.log(`kinds:   ${fmt(kinds)}`);
  console.log(`by:      ${fmt(hows)}`);
  if (alone.size) console.log(`list/broker chats, classifier alone: ${fmt(alone)}`);
  console.log(`model calls: ${modelCalls} (~$${spendUsd.toFixed(4)})`);
  process.exit(0);
}

/** The lid's phone, when an earlier message taught us one. */
function phoneFromPairs(jid: string | undefined, pairs: Map<string, string>): string | null {
  const lid = jid?.endsWith('@lid') ? `${(jid.split('@')[0] ?? '').replace(/:\d+$/, '')}@lid` : null;
  return lid ? (pairs.get(lid) ?? null) : null;
}

/** Index of the first line of the burst to judge: the first or the last run of inbound lines (a pause or the owner's reply ends one). */
function burstStart(lines: { fromMe: boolean; at: number }[], first: boolean): number {
  const inbound = lines.map((l, i) => (l.fromMe ? -1 : i)).filter((i) => i >= 0);
  if (inbound.length === 0) return -1;
  if (first) return inbound[0]!;
  let start = inbound[inbound.length - 1]!;
  for (let i = start - 1; i >= 0; i -= 1) {
    const l = lines[i]!;
    if (l.fromMe || lines[i + 1]!.at - l.at > BURST_GAP_MS) break;
    start = i;
  }
  return start;
}

const howOf = (source: string) => (source === 'model' ? 'model' : source === 'default' ? 'none ' : 'rule ');

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
