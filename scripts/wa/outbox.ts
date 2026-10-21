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
 *      ARRÊTE / UNSUBSCRIBE from a broker's number sets Broker.optOut; any other
 *      broker reply is posted to #mkan. Message ids are remembered in
 *      scripts/crm/.data/wa/seen.json.
 *
 * A lock file keeps two runs from overlapping (a full day's sends take ~30 min).
 */
import { config } from 'dotenv';
config({ override: true });
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postToMkan, recordRun } from '../crm/notify';
import { waLink } from '../crm/public-links';
import { EVOLUTION_URL, INSTANCE, connectionState, findMessages, isBridgeDown, sendText } from './evolution';
import {
  MAX_ATTEMPTS,
  type OutboxRow,
  dailyCap,
  inSendWindow,
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
      await sendText(row.to, row.body);
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

async function replies(db: Db): Promise<void> {
  const now = new Date();
  const records = await findMessages(new Date(now.getTime() - REPLY_LOOKBACK_MS), now, 200);
  const seen = loadSeen();
  const seenSet = new Set(seen);
  const fresh = records
    .filter((m) => !m.key?.fromMe)
    .map((m) => ({ id: m.key?.id ?? m.id ?? '', phone: senderPhone(m.key), text: messageText(m.message), type: m.messageType ?? 'message', name: m.pushName ?? '' }))
    .filter((m) => m.id && !seenSet.has(m.id))
    .reverse(); // oldest first
  if (!fresh.length) return;

  const phones = [...new Set(fresh.map((m) => m.phone).filter((p): p is string => !!p))];
  const brokers = phones.length
    ? await db.broker.findMany({ where: { phones: { hasSome: phoneVariants(phones) } }, select: { id: true, name: true, phones: true, optOut: true } })
    : [];
  const byPhone = new Map<string, (typeof brokers)[number]>();
  for (const b of brokers) for (const p of b.phones) byPhone.set(phoneKey(p), b);

  let optOuts = 0;
  let posted = 0;
  for (const m of fresh) {
    const broker = m.phone ? byPhone.get(m.phone) : undefined;
    if (broker) {
      if (isOptOut(m.text)) {
        optOuts += 1;
        log(`opt-out from ${broker.name} (+${m.phone})`);
        if (!DRY && !broker.optOut) {
          await db.broker.update({ where: { id: broker.id }, data: { optOut: true, optOutAt: new Date() } });
          broker.optOut = true;
          await postToMkan(`🚫 *${broker.name}* (+${m.phone}) replied "${m.text}" — opted out; no more WhatsApp asks.`);
        }
      } else {
        posted += 1;
        const words = m.text || `[${m.type}]`;
        log(`reply from ${broker.name} (+${m.phone}): ${words.slice(0, 80)}`);
        if (!DRY) {
          await postToMkan(
            `💬 *${broker.name}* (+${m.phone}) replied on WhatsApp:\n> ${words.replace(/\n/g, '\n> ')}\n<${waLink(m.phone ?? '', '')}|Open the chat> — turn it into a home in this thread.`,
          );
        }
      }
    }
    seen.push(m.id);
  }
  if (!DRY) saveSeen(seen);
  log(`replies: ${fresh.length} new · ${optOuts} opt-out · ${posted} posted`);
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
