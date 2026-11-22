/**
 * Abdout's own contacts on the Mkan line — numbers the rental agent never answers
 * (src/components/agent/personal.ts reads the list; WaState rows `personal:<address>`).
 *
 *   pnpm wa:personal suggest            study the Mac's WhatsApp (this line's history) and print who is personal
 *   pnpm wa:personal suggest --apply    …and put them on the list
 *   pnpm wa:personal add <+250…|<id>@lid> [--name="…"]   one number by hand
 *   pnpm wa:personal remove <address>
 *   pnpm wa:personal list
 *   pnpm wa:personal list-kinds         who the first-contact classifier took each person for (counts; phones masked)
 *   pnpm wa:personal set <address> <tenant|broker|landlord|personal|vendor|unknown|clear>
 *                                       a label by hand — always wins over the classifier; `clear` hands it back
 *
 * Personal = a chat that began before the agent went live on this number
 * (2026-10-24), or a contact saved in the address book — unless it is a broker
 * (review.json broker/agency/landlord, or a Broker row's phone): a broker's
 * answers feed the deal flow and must keep reaching it. Abdout's own test
 * phone (+249 919 071 294) stays off the list so the phone test still works.
 * Reads a snapshot of the app's database (WhatsApp keeps the live one open);
 * writes only the list, never a message.
 */
import { config } from 'dotenv';
config({ override: true, quiet: true });
process.env.PRISMA_QUIET ??= '1';

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const APP = join(homedir(), 'Library/Group Containers/group.net.whatsapp.WhatsApp.shared');
const DATA = join(__dirname, '..', 'crm', '.data', 'whatsapp');
const SNAP = join(DATA, 'snap-personal');
const REVIEW = join(DATA, 'review.json');
/** The day the agent began answering this number. */
const BOT_LIVE = '2026-10-24';
const KEEP_OFF = new Set(['249919071294']);
const APPLE_EPOCH = 978_307_200;

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const digits = (s: string | null | undefined) => (s ?? '').replace(/@.*$/, '').replace(/[^\d]/g, '');
const keyOf = (address: string) => `personal:${address.replace(/^\+/, '').trim()}`;

function snapshot(name: string): string {
  mkdirSync(SNAP, { recursive: true });
  for (const ext of ['', '-wal', '-shm']) {
    const from = join(APP, name + ext);
    if (existsSync(from)) copyFileSync(from, join(SNAP, name + ext));
  }
  return join(SNAP, name);
}

export interface Candidate {
  lid: string;
  phone: string | null;
  name: string | null;
  firstAt: string;
  messages: number;
  why: 'before the agent' | 'saved contact';
}

async function brokerPhones(): Promise<Set<string>> {
  const out = new Set<string>();
  const review = existsSync(REVIEW) ? (JSON.parse(readFileSync(REVIEW, 'utf8')) as Record<string, string>) : {};
  for (const [phone, label] of Object.entries(review)) if (label !== 'exclude') out.add(digits(phone));
  const { db } = await import('../../src/lib/db');
  const rows = await db.broker.findMany({ select: { phones: true, whatsapp: true } });
  for (const r of rows) for (const p of [...r.phones, r.whatsapp]) if (digits(p).length >= 9) out.add(digits(p));
  return out;
}

async function suggest(): Promise<Candidate[]> {
  if (!existsSync(join(APP, 'ChatStorage.sqlite'))) throw new Error(`No WhatsApp desktop database at ${APP}`);
  const chats = new DatabaseSync(snapshot('ChatStorage.sqlite'), { readOnly: true });
  const contacts = new DatabaseSync(snapshot('ContactsV2.sqlite'), { readOnly: true });
  const book = new Map<string, { name: string | null; phone: string | null }>();
  for (const c of contacts.prepare('select ZLID lid, ZFULLNAME name, ZPHONENUMBER phone, ZWHATSAPPID wa from ZWAADDRESSBOOKCONTACT where ZLID is not null').all() as {
    lid: string;
    name: string | null;
    phone: string | null;
    wa: string | null;
  }[]) {
    book.set(c.lid, { name: c.name, phone: digits(c.wa) || digits(c.phone) || null });
  }
  const rows = chats
    .prepare(
      `select s.ZCONTACTJID lid, s.ZPARTNERNAME partner, min(m.ZMESSAGEDATE) first, count(m.Z_PK) n,
              sum(case when m.ZISFROMME = 1 and m.ZTEXT like '%mkan.sd%' then 1 else 0 end) homes
       from ZWACHATSESSION s join ZWAMESSAGE m on m.ZCHATSESSION = s.Z_PK
       where s.ZCONTACTJID like '%@lid' group by s.Z_PK`,
    )
    .all() as { lid: string; partner: string | null; first: number; n: number; homes: number }[];
  const brokers = await brokerPhones();
  const out: Candidate[] = [];
  for (const r of rows) {
    const b = book.get(r.lid);
    const phone = b?.phone ?? null;
    if (phone && (brokers.has(phone) || KEEP_OFF.has(phone))) continue;
    const firstAt = new Date((r.first + APPLE_EPOCH) * 1000).toISOString();
    // After the agent went live, only a contact saved under a real name (WhatsApp files unsaved
    // numbers under the number itself) who was never sent homes — anyone sent homes is a tenant.
    const named = !!b?.name && /\p{L}/u.test(b.name);
    const why = firstAt.slice(0, 10) < BOT_LIVE ? 'before the agent' : named && r.homes === 0 ? 'saved contact' : null;
    if (!why) continue;
    out.push({ lid: r.lid, phone, name: b?.name ?? r.partner ?? null, firstAt: firstAt.slice(0, 10), messages: r.n, why });
  }
  return out.sort((a, b) => a.firstAt.localeCompare(b.firstAt));
}

async function put(address: string, value: Record<string, unknown>) {
  const { db } = await import('../../src/lib/db');
  const key = keyOf(address);
  await db.waState.upsert({ where: { key }, create: { key, value: value as never }, update: { value: value as never } });
}

/** Both addresses of a person (a phone and its @lid), so a label set on one covers the other. */
async function addressesOfPerson(address: string): Promise<string[]> {
  const { addressesOf } = await import('../../src/components/agent/wa-state');
  const clean = address.replace(/^\+/, '').trim();
  return [...new Set([clean, ...(await addressesOf(clean).catch(() => [clean]))])];
}

async function listKinds() {
  const { db } = await import('../../src/lib/db');
  const { CONTACT_KINDS, maskAddress } = await import('../../src/components/agent/contact-kind-pure');
  type Row = { kind: string; source: string; why: string; at: string };
  const rows = await db.waState.findMany({ where: { key: { startsWith: 'kind:' } }, orderBy: { updatedAt: 'asc' } });
  const listed = await db.waState.findMany({ where: { key: { startsWith: 'personal:' } }, select: { key: true } });
  // One person is stored under their phone and their @lid with the same label: show the phone, the lid only when alone.
  const people = new Map<string, Row>();
  const sig = (v: Row) => `${v.kind}|${v.at}`;
  const phoneSigs = new Set<string>();
  const entries = rows.map((r) => ({ address: r.key.slice('kind:'.length), v: (r.value ?? {}) as Partial<Row> }));
  for (const { address, v } of entries) if (!address.endsWith('@lid')) phoneSigs.add(sig(v as Row));
  for (const { address, v } of entries) {
    if (address.endsWith('@lid') && phoneSigs.has(sig(v as Row))) continue;
    people.set(address, { kind: v.kind ?? '?', source: v.source ?? '', why: v.why ?? '', at: (v.at ?? '').slice(0, 10) });
  }
  for (const r of listed) {
    const a = r.key.slice('personal:'.length);
    if (!a.endsWith('@lid') && !people.has(a)) people.set(a, { kind: 'personal', source: 'list', why: 'personal-list', at: '' });
  }
  const counts = new Map<string, number>();
  for (const [address, v] of people) {
    counts.set(v.kind, (counts.get(v.kind) ?? 0) + 1);
    console.log(`${maskAddress(address).padEnd(8)} ${v.kind.padEnd(9)} ${v.source.padEnd(8)} ${v.why.padEnd(22)} ${v.at}`);
  }
  console.log(`\n${[...CONTACT_KINDS].map((k) => `${k} ${counts.get(k) ?? 0}`).join(' · ')}  (${people.size} people)`);
}

async function main() {
  const [cmd, target] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const { db } = await import('../../src/lib/db');
  if (cmd === 'list') {
    const rows = await db.waState.findMany({ where: { key: { startsWith: 'personal:' } }, orderBy: { updatedAt: 'asc' } });
    for (const r of rows) console.log(`${r.key.slice(9).padEnd(28)} ${JSON.stringify(r.value)}`);
    console.log(`${rows.length} address(es) — the agent stays out of these chats`);
  } else if (cmd === 'add' && target) {
    await put(target, { name: arg('name') ?? null, why: 'by hand', at: new Date().toISOString() });
    console.log(`added ${target}`);
  } else if (cmd === 'list-kinds') {
    await listKinds();
  } else if (cmd === 'set' && target) {
    const { isContactKind, kindKey, maskAddress } = await import('../../src/components/agent/contact-kind-pure');
    const kind = process.argv.slice(2).filter((a) => !a.startsWith('--'))[2];
    const addresses = await addressesOfPerson(target);
    if (kind === 'clear') {
      await db.waState.deleteMany({ where: { key: { in: addresses.map(kindKey) } } });
      console.log(`cleared the label of ${maskAddress(target)} — the classifier reads them afresh`);
    } else if (isContactKind(kind)) {
      const value = { kind, why: 'set-by-hand', at: new Date().toISOString(), source: 'manual' };
      for (const a of addresses) await db.waState.upsert({ where: { key: kindKey(a) }, create: { key: kindKey(a), value }, update: { value } });
      console.log(`${maskAddress(target)} is ${kind} (by hand, ${addresses.length} address${addresses.length === 1 ? '' : 'es'})`);
    } else {
      console.log('usage: pnpm wa:personal set <address> <tenant|broker|landlord|personal|vendor|unknown|clear>');
    }
  } else if (cmd === 'remove' && target) {
    await db.waState.deleteMany({ where: { key: keyOf(target) } });
    // Off the list also forgets what the classifier thought: they are read afresh the next time they write.
    const { kindKey } = await import('../../src/components/agent/contact-kind-pure');
    await db.waState.deleteMany({ where: { key: { in: (await addressesOfPerson(target)).map(kindKey) } } });
    console.log(`removed ${target}`);
  } else if (cmd === 'suggest') {
    const list = await suggest();
    for (const c of list) console.log(`${c.firstAt}  ${(c.phone ? `+${c.phone}` : '(number hidden)').padEnd(16)} ${String(c.messages).padStart(4)} msgs  ${c.why.padEnd(16)} ${c.name ?? ''}`);
    console.log(`${list.length} personal chat(s) found (brokers and the test phone left out)`);
    if (process.argv.includes('--apply')) {
      for (const c of list) {
        const value = { name: c.name, why: c.why, firstAt: c.firstAt };
        await put(c.lid, value);
        if (c.phone) await put(c.phone, value);
      }
      console.log(`applied: ${list.length} chat(s) on the personal list`);
    }
  } else {
    console.log('usage: pnpm wa:personal suggest [--apply] | add <address> [--name=…] | remove <address> | list | list-kinds | set <address> <kind>');
  }
  process.exit(0);
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
