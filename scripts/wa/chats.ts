/**
 * Abdout's own WhatsApp (the desktop app on this Mac) → the broker directory.
 *
 *   pnpm wa:chats              write .data/whatsapp/brokers.json + channel-posts.json
 *   pnpm wa:chats --dry-run    print the table, write nothing
 *
 * He rents through Kigali brokers on WhatsApp; those chats name who answers,
 * where they work, what they quote and the visit fee. This reads a snapshot of
 * the app's database (WhatsApp keeps the live one open), keeps only chats
 * labelled in .data/whatsapp/review.json, and writes facts — never messages.
 * `crm:brokers` merges brokers.json in as the `whatsapp` source; the web-ads
 * `wa-channel` adapter reads channel-posts.json.
 *
 * review.json: { "+2507…": "broker" | "agency" | "landlord" | "exclude" }.
 * Housing chats not in it are listed as "to review" and never imported.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { normaliseRwPhone } from '../crm/brokers-pure';
import { brokerFromChat, classifyChat, isRentalPost, phoneFromLabel, type ChannelPost, type ChatMessage, type ReviewKind, type WaBroker } from './chats-pure';

const APP = join(homedir(), 'Library/Group Containers/group.net.whatsapp.WhatsApp.shared');
const DATA = join(__dirname, '..', 'crm', '.data', 'whatsapp');
const SNAP = join(DATA, 'snap');
const REVIEW = join(DATA, 'review.json');
const CHANNELS = join(DATA, 'channels.json');
const DRY = process.argv.includes('--dry-run');
/** Apple's epoch (2001-01-01) in unix seconds. */
const APPLE_EPOCH = 978_307_200;

function snapshot(name: string): string {
  mkdirSync(SNAP, { recursive: true });
  for (const ext of ['', '-wal', '-shm']) {
    const from = join(APP, name + ext);
    if (existsSync(from)) copyFileSync(from, join(SNAP, name + ext));
  }
  return join(SNAP, name);
}

const readJson = <T>(file: string, empty: T): T => {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : empty;
  } catch {
    return empty;
  }
};

interface SessionRow {
  pk: number;
  jid: string;
  label: string | null;
}

function main() {
  if (!existsSync(join(APP, 'ChatStorage.sqlite'))) {
    console.error(`No WhatsApp desktop database at ${APP} — is WhatsApp installed and signed in on this Mac?`);
    process.exit(1);
  }
  const chats = new DatabaseSync(snapshot('ChatStorage.sqlite'));
  const contacts = new DatabaseSync(snapshot('ContactsV2.sqlite'));
  const phoneByLid = new Map<string, string>();
  for (const c of contacts.prepare('select ZLID lid, ZPHONENUMBER phone from ZWAADDRESSBOOKCONTACT where ZLID is not null and ZPHONENUMBER is not null').all() as { lid: string; phone: string }[]) {
    const p = normaliseRwPhone(c.phone);
    if (p) phoneByLid.set(c.lid, p);
  }

  const pushNames = new Map<string, string>();
  for (const r of chats.prepare('select ZJID jid, ZPUSHNAME name from ZWAPROFILEPUSHNAME where ZPUSHNAME is not null').all() as { jid: string; name: string }[]) pushNames.set(r.jid, r.name);

  const review = readJson<Record<string, ReviewKind>>(REVIEW, {});
  const sessions = chats
    .prepare("select Z_PK pk, ZCONTACTJID jid, ZPARTNERNAME label from ZWACHATSESSION where ZCONTACTJID like '%@lid' or ZCONTACTJID like '%@s.whatsapp.net' or ZCONTACTJID like '%@newsletter'")
    .all() as unknown as SessionRow[];
  // A photo's caption lives on its media item, not the message.
  const messagesOf = chats.prepare(
    'select m.ZISFROMME fromMe, m.ZMESSAGETYPE type, coalesce(m.ZTEXT, mi.ZTITLE) text, m.ZMESSAGEDATE at, m.ZSTANZAID id from ZWAMESSAGE m left join ZWAMEDIAITEM mi on mi.ZMESSAGE = m.Z_PK where m.ZCHATSESSION = ? order by m.ZMESSAGEDATE',
  );

  const brokers: WaBroker[] = [];
  const toReview: { phone: string; label: string | null; messages: number }[] = [];
  const posts: ChannelPost[] = [];
  const followed = readJson<string[]>(CHANNELS, ['FREDY REAL ESTATE']);

  for (const s of sessions) {
    const rows = messagesOf.all(s.pk) as { fromMe: number; type: number; text: string | null; at: number; id: string | null }[];
    if (s.jid.endsWith('@newsletter')) {
      if (!s.label || !followed.some((f) => f.toLowerCase() === s.label!.toLowerCase())) continue;
      for (const r of rows) {
        if (!r.text || !isRentalPost(r.text)) continue;
        posts.push({ channel: s.label, id: r.id ?? `${s.pk}:${r.at}`, text: r.text, at: new Date((r.at + APPLE_EPOCH) * 1000).toISOString(), hasMedia: r.type !== 0 });
      }
      continue;
    }
    const phone = s.jid.endsWith('@s.whatsapp.net') ? normaliseRwPhone(`+${s.jid.split('@')[0]}`) : (phoneByLid.get(s.jid) ?? phoneFromLabel(s.label));
    if (!phone) continue; // outside Rwanda, or a number WhatsApp hides
    const msgs: ChatMessage[] = rows.map((r) => ({ fromMe: r.fromMe === 1, type: r.type, text: r.text, at: new Date((r.at + APPLE_EPOCH) * 1000) }));
    const cls = classifyChat(phone, msgs, review);
    if (cls === 'review') toReview.push({ phone, label: s.label, messages: msgs.length });
    if (cls === 'review' || cls === 'other' || cls === 'exclude') continue;
    const b = brokerFromChat(phone, cls, s.label, msgs, pushNames.get(s.jid) ?? null);
    if (b) brokers.push(b);
  }

  brokers.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  console.log(`📱 WhatsApp chats: ${brokers.length} broker(s) · ${toReview.length} housing chat(s) to review · ${posts.length} channel ad(s)`);
  for (const b of brokers) {
    const prices = b.quotes.map((q) => q.price);
    const band = prices.length ? ` ${Math.min(...prices) / 1000}k–${Math.max(...prices) / 1000}k` : '';
    const where = [...new Set([...b.quotes.map((q) => q.place).filter(Boolean), ...b.places])].slice(0, 4).join('/');
    console.log(
      `   ${b.kind.padEnd(8)} ${b.phone}  ${(b.name ?? '—').slice(0, 14).padEnd(14)} ${where.padEnd(30)}${band}${b.visitFee ? ` · visit ${b.visitFee / 1000}k` : ''}${b.replyMinutes != null ? ` · replies ~${b.replyMinutes}m` : ''}${b.sentMedia ? ' · photos' : ''}${b.altPhones.length ? ` · also ${b.altPhones.join(',')}` : ''}`,
    );
  }
  if (toReview.length) {
    console.log(`\n   To review — add each to ${REVIEW} as broker / agency / landlord / exclude:`);
    for (const r of toReview) console.log(`   ${r.phone}  ${r.label ?? ''}  (${r.messages} messages)`);
  }
  if (DRY) return;
  mkdirSync(DATA, { recursive: true });
  writeFileSync(join(DATA, 'brokers.json'), JSON.stringify({ at: new Date().toISOString(), brokers }, null, 2));
  writeFileSync(join(DATA, 'channel-posts.json'), JSON.stringify({ at: new Date().toISOString(), posts }, null, 2));
  console.log(`\n   wrote ${join(DATA, 'brokers.json')} and channel-posts.json`);
}

main();
