/**
 * The Mac sender — drains the WhatsApp outbox the Worker fills.
 *
 *   pnpm wa:outbox             send what the caps allow now, then read replies
 *   pnpm wa:outbox --dry-run   print the plan and the replies; send, write and post nothing
 *   pnpm wa:outbox --once      same as the default (one pass); kept for the launchd job's readability
 *
 * The Cloudflare Worker cannot reach the Evolution bridge on this Mac
 * (ops/evolution, 127.0.0.1:8081), so `sendToBroker` only writes
 * OutboundMessage rows. launchd runs this every 2 minutes
 * (scripts/wa/install-outbox.sh):
 *
 *   1. Bridge check — Evolution unreachable or instance not "open": nothing is
 *      sent, no row loses an attempt, `recordRun` counts the failure (#mkan
 *      hears after a streak), exit 0.
 *   2. Send — QUEUED rows oldest first under scripts/wa/outbox-pure.ts (Kigali
 *      08:00–20:00, MKAN_WA_DAILY_CAP a day, one per broker a day, 20–60 s
 *      apart). SENT stamps sentAt (and the BrokerRequest rows it carries);
 *      a failed send costs an attempt; the third makes it FAILED and posts a
 *      #mkan card with a wa.me link so a person sends it by hand.
 *   3. Replies — polls /chat/findMessages (no public webhook). STOP / HAGARIKA /
 *      ARRÊTE / UNSUBSCRIBE from a broker's number sets Broker.optOut. Every
 *      other broker burst (an album + its caption) goes to agent/broker-inbox:
 *      a home becomes a lead in the tenant's chat, "How much?" gets the need,
 *      "taken" answers an availability ask; the rest is posted to #mkan.
 *      Photos are copied to S3 (pending-photos.json holds them until the price
 *      comes). Message ids are remembered in scripts/crm/.data/wa/seen.json.
 *
 * A lock file keeps two runs from overlapping (a full day's sends take ~30 min).
 */
import { config } from 'dotenv';
config({ override: true });
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postToMkan, recordRun } from '../crm/notify';
import { waLink } from '../crm/public-links';
import { EVOLUTION_URL, INSTANCE, connectionState, findMessages, isBridgeDown, mediaBytes, sendText } from './evolution';
import { answerTenant, noteFromMe, recordSent } from './tenant';
import { isDirectChat } from './tenant-pure';
import {
  MAX_ATTEMPTS,
  type OutboxRow,
  dailyCap,
  groupByPhone,
  inSendWindow,
  isImage,
  isOptOut,
  messageText,
  phoneKey,
  planOutbox,
  randomGapMs,
  recipientKey,
  senderPhone,
  startOfKigaliDay,
} from './outbox-pure';

const JOB = 'wa-outbox';
const DATA = join(__dirname, '..', 'crm', '.data', 'wa');
const LOCK = join(DATA, 'outbox.lock');
const SEEN = join(DATA, 'seen.json');
const STALE_LOCK_MS = 90 * 60 * 1000;
const REPLY_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const SEEN_KEEP = 3000;

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toISOString();
const log = (msg: string) => console.log(`${stamp()} ${DRY ? '[dry] ' : ''}${msg}`);

// ---------------------------------------------------------------- lock

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function takeLock(): boolean {
  mkdirSync(DATA, { recursive: true });
  for (let i = 0; i < 2; i++) {
    try {
      const fd = openSync(LOCK, 'wx');
      writeFileSync(fd, String(process.pid));
      closeSync(fd);
      return true;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const pid = Number(readFileSync(LOCK, 'utf8').trim());
      const age = Date.now() - statSync(LOCK).mtimeMs;
      if (pid && pidAlive(pid) && age < STALE_LOCK_MS) return false;
      unlinkSync(LOCK); // stale: the holder died or hung
    }
  }
  return false;
}

function releaseLock() {
  try {
    if (existsSync(LOCK) && readFileSync(LOCK, 'utf8').trim() === String(process.pid)) unlinkSync(LOCK);
  } catch {
    /* best effort */
  }
}

// ---------------------------------------------------------------- seen ids

function loadSeen(): string[] {
  try {
    return existsSync(SEEN) ? (JSON.parse(readFileSync(SEEN, 'utf8')) as string[]) : [];
  } catch {
    return [];
  }
}

function saveSeen(ids: string[]) {
  writeFileSync(SEEN, JSON.stringify(ids.slice(-SEEN_KEEP)));
}

// ---------------------------------------------------------------- main

type Db = (typeof import('../../src/lib/db'))['db'];

/** Phones are stored "+250…"; numbers from WhatsApp come as digits. */
const phoneVariants = (keys: string[]) => keys.flatMap((k) => [`+${k}`, k]);

async function drain(db: Db): Promise<{ bridgeError?: string }> {
  const now = new Date();
  const rows = await db.outboundMessage.findMany({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' }, take: 500 });
  if (!rows.length) {
    log('outbox empty');
    return {};
  }

  const sentRows = await db.outboundMessage.findMany({
    where: { status: 'SENT', sentAt: { gte: startOfKigaliDay(now) } },
    select: { brokerId: true, to: true, kind: true, sentAt: true },
  });
  const lastSentAt = new Map<string, Date>();
  for (const s of sentRows) if (s.kind !== 'TENANT_ALERT' && s.sentAt) lastSentAt.set(recipientKey(s), s.sentAt);

  const brokerIds = [...new Set(rows.map((r) => r.brokerId).filter((id): id is string => !!id))];
  const brokers = brokerIds.length ? await db.broker.findMany({ where: { id: { in: brokerIds } }, select: { id: true, optOut: true } }) : [];
  const bareKeys = [...new Set(rows.filter((r) => !r.brokerId).map((r) => phoneKey(r.to)))];
  const optedOutByPhone = bareKeys.length
    ? await db.broker.findMany({ where: { optOut: true, phones: { hasSome: phoneVariants(bareKeys) } }, select: { phones: true } })
    : [];

  const cap = dailyCap();
  const plan = planOutbox<(typeof rows)[number] & OutboxRow>({
    now,
    rows,
    sentToday: sentRows.length,
    lastSentAt,
    optedOutBrokers: new Set(brokers.filter((b) => b.optOut).map((b) => b.id)),
    optedOutPhones: new Set(optedOutByPhone.flatMap((b) => b.phones.map(phoneKey))),
    cap,
  });
  const held = plan.hold.reduce<Record<string, number>>((acc, h) => ({ ...acc, [h.reason]: (acc[h.reason] ?? 0) + 1 }), {});
  log(`queued ${rows.length} · sent today ${sentRows.length}/${cap} · send ${plan.send.length} · skip ${plan.skip.length} · hold ${JSON.stringify(held)}`);

  for (const { row } of plan.skip) {
    log(`skip ${row.id} ${row.kind} → ${row.to}: broker opted out`);
    if (!DRY) await db.outboundMessage.update({ where: { id: row.id }, data: { status: 'SKIPPED', error: 'broker opted out' } });
  }

  for (const [i, row] of plan.send.entries()) {
    if (DRY) {
      log(`would send ${row.id} ${row.kind} → ${row.to}: ${row.body.slice(0, 80).replace(/\s+/g, ' ')}…`);
      continue;
    }
    if (i > 0) await sleep(randomGapMs());
    if (!inSendWindow(new Date())) {
      log('window closed mid-run — the rest waits for 08:00');
      break;
    }
    try {
      const sent = await sendText(row.to, row.body);
      if (row.kind === 'TENANT_ALERT') recordSent(phoneKey(row.to), sent?.key?.id);
      const sentAt = new Date();
      await db.outboundMessage.update({ where: { id: row.id }, data: { status: 'SENT', sentAt, attempts: { increment: 1 }, error: null } });
      if (row.kind === 'BROKER_REQUEST' && row.brokerRequestIds.length) {
        await db.brokerRequest.updateMany({ where: { id: { in: row.brokerRequestIds } }, data: { channel: 'evolution', sentAt } });
      }
      log(`sent ${row.id} ${row.kind} → ${row.to}`);
    } catch (err) {
      const message = (err as Error).message;
      if (isBridgeDown(err)) {
        log(`bridge down mid-run, ${row.id} keeps its attempts: ${message}`);
        return { bridgeError: message };
      }
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await db.outboundMessage.update({
        where: { id: row.id },
        data: { attempts, error: message.slice(0, 500), ...(failed ? { status: 'FAILED' as const } : {}) },
      });
      log(`${failed ? 'FAILED' : 'retry later'} ${row.id} (${attempts}/${MAX_ATTEMPTS}): ${message}`);
      if (failed) {
        if (row.kind === 'BROKER_REQUEST' && row.brokerRequestIds.length) {
          await db.brokerRequest.updateMany({ where: { id: { in: row.brokerRequestIds } }, data: { channel: 'manual' } });
        }
        await postToMkan(
          `⚠️ WhatsApp could not send this ${row.kind.toLowerCase().replace('_', ' ')} after ${attempts} tries — ${row.label ?? row.to}\n` +
            `<${waLink(row.to, row.body)}|Send it by hand on WhatsApp> · last error: \`${message.slice(0, 200)}\``,
        );
      }
    }
  }
  return {};
}

const PENDING = join(DATA, 'pending-photos.json');
/** Photos sent before the price wait this long for it. */
const PENDING_MS = 2 * 60 * 60 * 1000;
/** Photos kept from one burst. */
const MAX_PHOTOS = 12;

type Pending = Record<string, { urls: string[]; at: string }>;
const loadPending = (): Pending => {
  try {
    return existsSync(PENDING) ? (JSON.parse(readFileSync(PENDING, 'utf8')) as Pending) : {};
  } catch {
    return {};
  }
};

/** A broker's photos → our bucket, so a lead never points at WhatsApp's expiring media. */
async function storePhotos(brokerId: string, ids: string[]): Promise<string[]> {
  const { buildUploadKey, putObject } = await import('../../src/lib/s3');
  const urls: string[] = [];
  for (const id of ids.slice(0, MAX_PHOTOS)) {
    const media = await mediaBytes(id);
    if (!media) continue;
    const ext = media.mimetype.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
    const url = await putObject({ key: buildUploadKey(`broker-${brokerId}`, ext), body: media.bytes, contentType: media.mimetype, cacheControl: 'public, max-age=31536000, immutable' }).catch(() => null);
    if (url) urls.push(url);
  }
  return urls;
}

async function replies(db: Db): Promise<void> {
  const now = new Date();
  const records = await findMessages(new Date(now.getTime() - REPLY_LOOKBACK_MS), now, 200);
  const seen = loadSeen();
  const seenSet = new Set(seen);
  const all = records
    .map((m) => ({
      id: m.key?.id ?? m.id ?? '',
      phone: senderPhone(m.key),
      text: messageText(m.message),
      image: isImage(m.message, m.messageType),
      type: m.messageType ?? 'message',
      name: m.pushName ?? '',
      fromMe: !!m.key?.fromMe,
      direct: isDirectChat(m.key?.remoteJid),
      sentAt: new Date(Number(m.messageTimestamp ?? 0) * 1000 || now.getTime()),
    }))
    .filter((m) => m.id && !seenSet.has(m.id))
    .reverse(); // oldest first
  const fresh = all.filter((m) => !m.fromMe);
  if (!all.length) return;

  const phones = [...new Set(all.map((m) => m.phone).filter((p): p is string => !!p))];
  const brokers = phones.length
    ? await db.broker.findMany({ where: { phones: { hasSome: phoneVariants(phones) } }, select: { id: true, name: true, phones: true, optOut: true } })
    : [];
  const byPhone = new Map<string, (typeof brokers)[number]>();
  for (const b of brokers) for (const p of b.phones) byPhone.set(phoneKey(p), b);

  let optOuts = 0;
  let posted = 0;
  let homes = 0;
  let answered = 0;
  const rest: typeof fresh = [];
  const tenants: typeof fresh = [];
  for (const m of all) {
    // A person at Mkan typing in a tenant's chat pauses the agent there (tenant.ts).
    if (m.fromMe && m.direct && m.phone && !byPhone.has(m.phone) && !DRY) noteFromMe(m.phone, m.id, m.sentAt);
  }
  for (const m of fresh) {
    if (m.phone && m.direct && !byPhone.has(m.phone)) {
      tenants.push(m);
      continue;
    }
    const broker = m.phone ? byPhone.get(m.phone) : undefined;
    if (broker && isOptOut(m.text)) {
      optOuts += 1;
      log(`opt-out from ${broker.name} (+${m.phone})`);
      if (!DRY && !broker.optOut) {
        await db.broker.update({ where: { id: broker.id }, data: { optOut: true, optOutAt: new Date() } });
        broker.optOut = true;
        await postToMkan(`🚫 *${broker.name}* (+${m.phone}) replied "${m.text}" — opted out; no more WhatsApp asks.`);
      }
    } else if (broker) rest.push(m);
  }

  // An album and its caption arrive as several messages: read each broker's burst as one reply.
  const { handleBrokerReply } = await import('../../src/components/agent/broker-inbox');
  const pending = loadPending();
  for (const g of groupByPhone(rest)) {
    const broker = byPhone.get(g.phone)!;
    const words = g.text || `[${g.items.map((m) => m.type).join(', ')}]`;
    log(`reply from ${broker.name} (+${g.phone}): ${words.slice(0, 80)}${g.imageIds.length ? ` + ${g.imageIds.length} photo(s)` : ''}`);
    if (DRY) continue;
    const stored = await storePhotos(broker.id, g.imageIds);
    const held = pending[broker.id] && now.getTime() - new Date(pending[broker.id]!.at).getTime() < PENDING_MS ? pending[broker.id]!.urls : [];
    const photoUrls = [...held, ...stored].slice(0, MAX_PHOTOS);
    const action = await handleBrokerReply({ brokerId: broker.id, text: g.text, photoUrls, at: now }).catch((err) => {
      log(`inbox failed for ${broker.name}: ${(err as Error).message}`);
      return { kind: 'none' } as const;
    });
    if (action.kind === 'home') {
      homes += 1;
      delete pending[broker.id];
      await postToMkan(
        `🏠 *${broker.name}* (+${g.phone}) sent a home on WhatsApp → lead #${action.listingId}${photoUrls.length ? ` with ${photoUrls.length} photo(s)` : ''}${action.matched ? ', now in the tenant\'s chat' : ''}.\n> ${g.text.replace(/\n/g, '\n> ').slice(0, 600)}`,
      );
    } else if (action.kind === 'reply') {
      answered += 1;
      if (action.why === 'photos-need-price' && photoUrls.length) pending[broker.id] = { urls: photoUrls, at: now.toISOString() };
      try {
        await sendText(g.phone, action.text);
        log(`answered ${broker.name} (${action.why})`);
      } catch (err) {
        await db.outboundMessage.update({ where: { id: action.outboundId }, data: { status: 'FAILED', error: (err as Error).message.slice(0, 500) } });
        log(`answer to ${broker.name} failed: ${(err as Error).message}`);
      }
    } else if (action.kind === 'availability') {
      await postToMkan(`✅ *${broker.name}* (+${g.phone}) answered "${g.text.slice(0, 80)}" → home #${action.listingId} marked ${action.answer === 'RENTED' ? 'rented' : 'available'}.`);
    } else {
      posted += 1;
      if (stored.length) pending[broker.id] = { urls: photoUrls, at: now.toISOString() };
      await postToMkan(
        `💬 *${broker.name}* (+${g.phone}) replied on WhatsApp${stored.length ? ` (${stored.length} photo(s) kept)` : ''}:\n> ${words.replace(/\n/g, '\n> ')}\n<${waLink(g.phone, '')}|Open the chat> — turn it into a home in this thread.`,
      );
    }
  }
  // Tenants the inbox server missed (it was down, the webhook failed); the Worker answers each id once.
  let tenantAnswers = 0;
  for (const m of tenants) {
    if (DRY) {
      log(`would pass tenant +${m.phone} to the agent: ${m.text.slice(0, 60)}`);
      continue;
    }
    if ((await answerTenant({ phone: m.phone!, text: m.text, msgId: m.id, sentAt: m.sentAt }, log)) === 'sent') tenantAnswers += 1;
  }
  for (const m of all) seen.push(m.id);
  if (!DRY) {
    saveSeen(seen);
    writeFileSync(PENDING, JSON.stringify(pending, null, 2));
  }
  log(`replies: ${fresh.length} new · ${optOuts} opt-out · ${homes} home(s) · ${answered} answered · ${posted} posted · ${tenants.length} tenant (${tenantAnswers} answered here)`);
}

async function main() {
  if (!takeLock()) {
    log('another run holds the lock — exiting');
    return;
  }
  try {
    let state: string;
    try {
      state = await connectionState();
    } catch (err) {
      state = `unreachable (${(err as Error).message})`;
    }
    const open = state === 'open';
    if (!open) {
      const detail = `Evolution ${EVOLUTION_URL} instance "${INSTANCE}" is ${state} — run ops/evolution/up.sh, then pnpm wa:pair`;
      log(detail);
      if (!DRY) {
        await recordRun(JOB, false, detail);
        return;
      }
      // A dry run still shows the plan, so the queue can be checked before pairing.
    }

    const { db } = await import('../../src/lib/db');
    try {
      const { bridgeError } = await drain(db);
      if (bridgeError) {
        if (!DRY) await recordRun(JOB, false, bridgeError);
        return;
      }
      if (open) await replies(db);
      if (!DRY) await recordRun(JOB, true);
    } finally {
      await db.$disconnect().catch(() => {});
    }
  } finally {
    releaseLock();
  }
}

main().catch(async (err) => {
  log(`✗ ${(err as Error).stack ?? err}`);
  if (!DRY) await recordRun(JOB, false, (err as Error).message);
  releaseLock();
  process.exit(1);
});
