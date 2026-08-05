/**
 * Host outreach worker (Epic G1.6).
 *
 * Reads hosts + their homes → drafts the personalized WhatsApp message (AR
 * primary / EN) → writes an **outbox** (`.data/outreach-outbox.json`) and prints
 * it. Default is the design's safe mode: **human-send** — a person reviews the
 * drafts and sends them. `--apply` additionally sends via **OpenClaw** (to hosts
 * whose WhatsApp number is known) — the automation lane for already-contacted hosts.
 *
 *   npx tsx scripts/crm/outreach.ts                        # draft first-touch for all hosts
 *   npx tsx scripts/crm/outreach.ts --type=handover --ledger=.data/mkan-import-ledger.json
 *   OPENCLAW_URL=… OPENCLAW_TOKEN=… \
 *     npx tsx scripts/crm/outreach.ts --apply              # send via OpenClaw
 *
 * Flags: --in=<scored/rehosted> --type=<first-touch|handover|follow-up>
 *        --lang=<AR|EN> --ledger=<import ledger> --limit=<N> --out=<outbox> --apply
 *
 * Scraped hosts have NO phone (Airbnb hides it) → they need the CONTACT_HUNT step
 * first; their drafts are written to the outbox as `needs-contact-hunt`. Once a
 * WhatsApp number is on the host, --apply can send.
 *
 * ── Where the number comes from ────────────────────────────────────────────
 *
 * Twenty, not the scored file. Contacts are found by `crm:contact-hunt` or by a
 * human working the worksheet, and both land in the CRM via
 * `crm:sync-contacts`. Nothing writes a contact back into
 * `.data/airbnb-scored.json` — so reading `host.whatsapp` from that file, as
 * this script used to, meant every draft stayed `needs-contact-hunt` forever no
 * matter how many numbers had been found. The CRM is the source of truth for
 * contact, the same way it is for publish state.
 *
 * `--offline` keeps the old file-only behaviour for drafting without a CRM.
 *
 * Full CRM Activity logging needs the Note/Task fields (docs §2.6, not yet added);
 * until then --apply sends + records to the outbox, and logging is a no-op TODO.
 */
import { config } from 'dotenv';
config({ override: true });

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { draftMessage, type MsgType, type Lang } from './outreach-templates';
import { twentyClient, phoneOf, type Phones } from './twenty-rest';

const APPLY = process.argv.includes('--apply');
// Draft without consulting the CRM (no TWENTY_API_* needed).
const OFFLINE = process.argv.includes('--offline');
const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const IN = argv('in', 'scripts/crm/.data/airbnb-scored.json');
const OUT = argv('out', 'scripts/crm/.data/outreach-outbox.json');
const TYPE = (argv('type', 'first-touch') as MsgType);
const LANG_OVERRIDE = argv('lang') as Lang | '';
const LEDGER = argv('ledger', 'scripts/crm/.data/mkan-import-ledger.json');
const LIMIT = parseInt(argv('limit', '0'), 10) || 0;

const BASE_URL = (argv('base-url', process.env.NEXT_PUBLIC_APP_URL ?? 'https://mkan.databayt.org')).replace(/\/+$/, '');
const OPENCLAW_URL = (process.env.OPENCLAW_URL ?? '').replace(/\/+$/, '');
const OPENCLAW_TOKEN = process.env.OPENCLAW_TOKEN ?? '';

interface Host { airbnbHostId: string; name: string | null; whatsapp?: string | null; preferredLanguage?: Lang | null }
interface Home { hostAirbnbId: string | null; city: string }
interface OutboxEntry {
  airbnbHostId: string; name: string; whatsapp: string | null; lang: Lang; type: MsgType;
  message: string; status: 'ready' | 'needs-contact-hunt' | 'sent';
}

async function sendViaOpenClaw(to: string, message: string): Promise<boolean> {
  // OpenClaw's outbound API varies by deployment — adjust the path/payload to match yours.
  const res = await fetch(`${OPENCLAW_URL}/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENCLAW_TOKEN}` },
    body: JSON.stringify({ channel: 'whatsapp', to, message }),
  });
  if (!res.ok) throw new Error(`OpenClaw ${res.status}`);
  return true;
}

async function main(): Promise<void> {
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[]; hosts: Host[] };
  const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { hosts: {} };

  // homes per host → count + primary city
  const homesByHost = new Map<string, Home[]>();
  for (const h of payload.homes) {
    if (!h.hostAirbnbId) continue;
    if (!homesByHost.has(h.hostAirbnbId)) homesByHost.set(h.hostAirbnbId, []);
    homesByHost.get(h.hostAirbnbId)!.push(h);
  }
  let hosts = payload.hosts.filter((h) => homesByHost.has(h.airbnbHostId));
  if (LIMIT) hosts = hosts.slice(0, LIMIT);

  // A handover message is nothing but a claim link, so the live, unused tokens
  // are read from the DB rather than invented. Hosts without one are reported
  // instead of being given a message that cannot work.
  const claimUrlByHost = new Map<string, string>();
  if (TYPE === 'handover') {
    const prisma = (await import('@/lib/db')).db;
    const users = await prisma.user.findMany({
      where: { sourceHostId: { in: hosts.map((h) => h.airbnbHostId) } },
      select: {
        sourceHostId: true,
        claimTokens: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { token: true },
        },
      },
    });
    for (const u of users) {
      const token = u.claimTokens[0]?.token;
      if (u.sourceHostId && token) claimUrlByHost.set(u.sourceHostId, `${BASE_URL}/ar/claim/${token}`);
    }
  }

  // Contacts live in the CRM. Pull them once, keyed on airbnbHostId, and let
  // them win over whatever the local file happens to carry.
  const crmContact = new Map<string, string>();
  if (!OFFLINE) {
    try {
      const twenty = twentyClient();
      const crmHosts = (await twenty.all('hosts')) as unknown as Array<{
        airbnbHostId?: string | null; whatsapp?: Phones | null; phone?: Phones | null;
      }>;
      for (const h of crmHosts) {
        const id = h.airbnbHostId?.trim();
        if (!id) continue;
        const number = phoneOf(h.whatsapp) ?? phoneOf(h.phone);
        if (number) crmContact.set(id, number);
      }
      console.log(`   ${crmContact.size} of ${crmHosts.length} CRM hosts have a reachable number`);
    } catch (e) {
      // A CRM that is down must not block drafting — say so and carry on.
      console.warn(`   ⚠ could not read contacts from the CRM (${(e as Error).message.slice(0, 80)})`);
      console.warn('     drafting from the local file only — numbers may be missing.');
    }
  }

  const outbox: OutboxEntry[] = [];
  const noClaimLink: string[] = [];
  for (const host of hosts) {
    const homes = homesByHost.get(host.airbnbHostId) ?? [];
    const lang: Lang = LANG_OVERRIDE || host.preferredLanguage || 'AR';
    const acct = ledger.hosts?.[host.airbnbHostId];
    const claimUrl = claimUrlByHost.get(host.airbnbHostId);
    if (TYPE === 'handover' && !claimUrl) {
      noClaimLink.push(`${host.name ?? '?'} (${host.airbnbHostId})`);
      continue;
    }
    const message = draftMessage({
      type: TYPE, lang, name: host.name ?? '', city: homes[0]?.city, homeCount: homes.length,
      account: TYPE === 'handover' ? { number: acct?.mkanUsername ?? '', claimUrl: claimUrl! } : undefined,
    });
    const whatsapp = crmContact.get(host.airbnbHostId) ?? host.whatsapp ?? null;
    outbox.push({
      airbnbHostId: host.airbnbHostId, name: host.name ?? '', whatsapp,
      lang, type: TYPE, message, status: whatsapp ? 'ready' : 'needs-contact-hunt',
    });
  }
  if (noClaimLink.length) {
    console.log(`\n  ⚠ ${noClaimLink.length} host(s) skipped — no live claim link:`);
    console.log(`     ${noClaimLink.slice(0, 8).join(', ')}${noClaimLink.length > 8 ? '…' : ''}`);
    console.log('     Mint them with:  pnpm crm:claim-token --all --apply');
  }

  console.log(`\n📨 Outreach — ${outbox.length} hosts · ${TYPE} · ${APPLY ? 'SEND (OpenClaw)' : 'draft (human-send)'}`);

  if (!APPLY) {
    for (const e of outbox) {
      console.log(`\n▸ ${e.name} (${e.airbnbHostId}) · ${e.lang} · ${e.status}`);
      console.log(e.message.split('\n').map((l) => '   ' + l).join('\n'));
    }
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), type: TYPE, outbox }, null, 2));
    const ready = outbox.filter((e) => e.status === 'ready').length;
    console.log(`\n→ ${OUT}  ·  ${ready} ready to send, ${outbox.length - ready} need contact-hunt (no WhatsApp number yet)`);
    console.log('   Human-send is the default first touch. To automate: --apply with OPENCLAW_URL + OPENCLAW_TOKEN.\n');
    return;
  }

  if (!OPENCLAW_URL || !OPENCLAW_TOKEN) throw new Error('--apply needs OPENCLAW_URL + OPENCLAW_TOKEN.');
  let sent = 0, skipped = 0;
  for (const e of outbox) {
    if (!e.whatsapp) { skipped++; console.log(`= ${e.name} — no WhatsApp (contact-hunt first)`); continue; }
    try {
      await sendViaOpenClaw(e.whatsapp, e.message);
      e.status = 'sent';
      sent++;
      console.log(`+ sent ${e.type} → ${e.name} (${e.whatsapp})`);
      // TODO: log a CRM Activity (Note, channel=OPENCLAW_AUTO) once the §2.6 fields exist.
    } catch (err) {
      console.warn(`! ${e.name}: ${(err as Error).message}`);
    }
  }
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify({ sentAt: new Date().toISOString(), type: TYPE, outbox }, null, 2));
  console.log(`\n✅ sent ${sent}, skipped ${skipped} (need contact-hunt) → ${OUT}\n`);
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
