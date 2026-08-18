/**
 * Multi-Touch Outreach Cadence Engine (Mkan CRM Growth Engine).
 *
 * Implements the 3-Stage Landlord Onboarding Lifecycle:
 *   - Touch 1 (Day 0): Initial Intro + Mkan Value Prop + Claim Link
 *   - Touch 2 (Day 3): Gentle Follow-up if delivered but unclaimed
 *   - Touch 3 (Day 7): High-priority sales rep call reminder & escalation
 *
 * Usage:
 *   npx tsx scripts/crm/outreach-cadence.ts                   # Dry-run cadence evaluation
 *   npx tsx scripts/crm/outreach-cadence.ts --apply           # BLOCKED — see below
 *
 * ── Status, stated plainly (2026-08-18) ─────────────────────────────────────
 *
 * This script does NOT yet read the database or Twenty. It reads
 * `.data/airbnb-scored.json` and falls back to three hardcoded fixture hosts,
 * and it mints placeholder claim URLs that no `HostClaimToken` row backs. The
 * write path therefore throws rather than risk handing a real host a dead link.
 *
 * It also carried a divisor bug for its whole life — `1000 * 86400 * 1000`
 * instead of `86400000` — which floored every gap to 0 days and meant Touch 2
 * and Touch 3 could never fire. It reported "0 hosts due" forever while looking
 * healthy. Fixed, with `tests/crm/outreach-cadence.test.ts` as the guard.
 *
 * The ladder logic below is correct and now tested; what it still needs is a
 * real HostLead query and real token minting.
 *
 * ── Why it STILL prints "0 hosts due", and why that is now correct ──────────
 *
 * Two independent things produced the same zero, which is why the divisor bug
 * survived so long. Fixing the arithmetic does not change the output today:
 * `.data/airbnb-scored.json` holds 3 scored hosts and **none has a phone**, so
 * `if (!phone) continue` skips every one. That filter is right — Airbnb hides
 * host phone numbers, which is the entire reason `contact-hunt.ts` exists.
 *
 * So: a zero here means "no reachable host is due", not "the cadence works".
 * The proof that the ladder fires lives in tests/crm/outreach-cadence.test.ts,
 * which exercises the exported helpers directly. Do not read a zero from this
 * script as evidence about the arithmetic in either direction.
 */
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { draftMessage, type Lang } from './outreach-templates';

config({ override: true });

const APPLY = process.argv.includes('--apply');
const OUTBOX_PATH = join(process.cwd(), 'scripts/crm/.data/outreach-cadence-outbox.json');

export interface CadenceHost {
  id: string;
  name: string;
  phone: string | null;
  whatsapp: string | null;
  city: string;
  homeCount: number;
  outreachStage: 'TOUCH_1_DUE' | 'TOUCH_2_DUE' | 'TOUCH_3_CALL_DUE' | 'CLAIMED' | 'UNREACHABLE';
  lastOutreachAt: string | null;
  daysSinceLastOutreach: number;
  claimUrl: string;
}

export interface CadenceMessage {
  hostId: string;
  hostName: string;
  recipientPhone: string;
  touchStage: number;
  messageType: 'first-touch' | 'follow-up' | 'handover';
  messageText: string;
  scheduledFor: string;
}

/**
 * Milliseconds in a day.
 *
 * This constant exists because the expression it replaces was
 * `1000 * 86400 * 1000` — 86.4 BILLION ms, about 2.7 years. `Math.floor` then
 * drove every real gap to 0, so `daysSince >= 3` and `>= 7` were never true and
 * Touch 2 and Touch 3 could not fire for any host, ever. The queue reported
 * "0 due" indefinitely and looked perfectly healthy doing it.
 */
export const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Whole days between an ISO timestamp and `now`. Never-contacted reads as Infinity. */
export function daysSinceOutreach(lastOutreachAt: string | null | undefined, now: Date): number {
  if (!lastOutreachAt) return Infinity;
  const then = new Date(lastOutreachAt).getTime();
  if (!Number.isFinite(then)) return Infinity;
  return Math.floor((now.getTime() - then) / MS_PER_DAY);
}

export interface CadenceDecision {
  stage: CadenceHost['outreachStage'];
  touchNum: number;
  msgType: 'first-touch' | 'follow-up' | 'handover';
}

/**
 * The 3-touch ladder: Day 0 intro, Day 3 follow-up, Day 7 escalate to a human.
 * Returns null when the host is not due, so the caller skips them.
 */
export function decideCadenceStage(
  lastOutreachAt: string | null | undefined,
  now: Date,
): CadenceDecision | null {
  if (!lastOutreachAt) return { stage: 'TOUCH_1_DUE', touchNum: 1, msgType: 'first-touch' };
  const days = daysSinceOutreach(lastOutreachAt, now);
  if (days >= 7) return { stage: 'TOUCH_3_CALL_DUE', touchNum: 3, msgType: 'handover' };
  if (days >= 3) return { stage: 'TOUCH_2_DUE', touchNum: 2, msgType: 'follow-up' };
  return null;
}

export function evaluateCadenceQueue(): { queue: CadenceHost[]; messages: CadenceMessage[] } {
  const scrapedPath = join(process.cwd(), 'scripts/crm/.data/airbnb-scored.json');
  const scoredData = existsSync(scrapedPath)
    ? JSON.parse(readFileSync(scrapedPath, 'utf8'))
    : { hosts: [] };

  const queue: CadenceHost[] = [];
  const messages: CadenceMessage[] = [];
  const now = new Date();

  // Mock / read hosts from dataset or seed data
  let rawHosts = scoredData.hosts;
  if (!rawHosts?.length && scoredData.homes?.length) {
    const hostMap = new Map<string, any>();
    for (const h of scoredData.homes) {
      const hId = h.hostId || h.airbnbHostId || `host-${h.airbnbListingId}`;
      if (!hostMap.has(hId)) {
        hostMap.set(hId, {
          airbnbHostId: hId,
          name: h.hostName || h.title || 'Host',
          phone: h.phone || h.whatsapp || null,
          city: h.city || 'PORT_SUDAN',
          homesCount: 1,
          lastOutreachAt: h.lastOutreachAt || null,
        });
      } else {
        hostMap.get(hId).homesCount++;
      }
    }
    rawHosts = Array.from(hostMap.values()).filter((h) => h.phone);
  }

  const sampleHosts = rawHosts?.length
    ? rawHosts
    : [
        { airbnbHostId: 'host-1001', name: 'Al-Basha', phone: '+249912345678', city: 'PORT_SUDAN', homesCount: 2, lastOutreachAt: null },
        { airbnbHostId: 'host-1002', name: 'Othman', phone: '+249923456789', city: 'PORT_SUDAN', homesCount: 1, lastOutreachAt: new Date(Date.now() - 4 * 86400000).toISOString() },
        { airbnbHostId: 'host-1003', name: 'Tariq', phone: '+249934567890', city: 'PORT_SUDAN', homesCount: 3, lastOutreachAt: new Date(Date.now() - 8 * 86400000).toISOString() },
      ];

  for (const h of sampleHosts) {
    const phone = h.phone || h.whatsapp || null;
    if (!phone) continue;

    const decision = decideCadenceStage(h.lastOutreachAt, now);
    if (!decision) continue; // not due yet
    const { stage, touchNum, msgType } = decision;
    const daysSince = daysSinceOutreach(h.lastOutreachAt, now);

    // PLACEHOLDER, and it must stay obviously one. A real claim link is minted
    // by `claim-tokens.ts` against a HostClaimToken row; this string is backed
    // by nothing and would 404 for any host who tapped it. `draftMessage` throws
    // when a handover has no claimUrl precisely to stop that — handing it a fake
    // one walks straight around that guard, so the write path refuses instead of
    // quietly producing sendable-looking garbage.
    if (APPLY) {
      throw new Error(
        'outreach-cadence write mode is disabled: this script still reads fixture hosts and mints ' +
          'placeholder claim URLs that no HostClaimToken backs. Sending one would hand a real host ' +
          'a dead link. Mint real tokens with `pnpm crm:claim-token --host=<id>` and read hosts ' +
          'from the database before enabling this path.',
      );
    }
    const claimUrl = `https://mkan.sd/claim?token=PLACEHOLDER_${h.airbnbHostId || h.id}`;

    const hostItem: CadenceHost = {
      id: h.airbnbHostId || h.id || 'unknown',
      name: h.name || 'Host',
      phone,
      whatsapp: phone,
      city: h.city || 'PORT_SUDAN',
      homeCount: h.homesCount || 1,
      outreachStage: stage,
      lastOutreachAt: h.lastOutreachAt,
      daysSinceLastOutreach: daysSince,
      claimUrl,
    };

    queue.push(hostItem);

    const messageText = draftMessage({
      type: msgType,
      lang: 'AR',
      name: hostItem.name,
      city: hostItem.city,
      homeCount: hostItem.homeCount,
      account: { number: '1001', claimUrl },
    });

    messages.push({
      hostId: hostItem.id,
      hostName: hostItem.name,
      recipientPhone: phone,
      touchStage: touchNum,
      messageType: msgType,
      messageText,
      scheduledFor: now.toISOString(),
    });
  }

  return { queue, messages };
}

async function main() {
  console.log('📣 Running Mkan Outreach Cadence Engine...\n');
  const { queue, messages } = evaluateCadenceQueue();

  console.log(`📊 Cadence Status: ${queue.length} hosts currently due for outreach touches.`);

  const t1 = queue.filter((q) => q.outreachStage === 'TOUCH_1_DUE').length;
  const t2 = queue.filter((q) => q.outreachStage === 'TOUCH_2_DUE').length;
  const t3 = queue.filter((q) => q.outreachStage === 'TOUCH_3_CALL_DUE').length;

  console.log(`  • Touch 1 (Intro & Claim Link): ${t1} hosts`);
  console.log(`  • Touch 2 (Day-3 Follow-up Nudge): ${t2} hosts`);
  console.log(`  • Touch 3 (Day-7 Sales Rep Call Escalation): ${t3} hosts\n`);

  if (messages.length > 0) {
    console.log('📝 Sample Outreach Message (Touch 1):');
    console.log('--------------------------------------------------');
    console.log(messages[0].messageText);
    console.log('--------------------------------------------------\n');
  }

  if (APPLY) {
    writeFileSync(OUTBOX_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), messages }, null, 2));
    console.log(`💾 Successfully exported ${messages.length} outreach messages to ${OUTBOX_PATH}\n`);
  } else {
    console.log('💡 Dry-run complete. Run with `--apply` to write messages to the outbox and update CRM task schedules.\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
