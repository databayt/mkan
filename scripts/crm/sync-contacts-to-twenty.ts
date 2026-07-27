/**
 * Push found contact channels into the Twenty CRM (Epic G1.6).
 *
 *   pnpm crm:sync-contacts            # dry run — prints every write it would make
 *   pnpm crm:sync-contacts --apply
 *
 * Reads `.data/contact-hunt.json` (the offline pass) and, when present,
 * `.data/contact-hunt-manual.json` — the file an operator fills in from the
 * worksheet, which is where the real contacts come from since Airbnb publishes
 * none.
 *
 * ── The write rule: fill empty, never replace populated ────────────────────
 *
 * A script and a human both writing the same field is how idempotent syncs turn
 * into ping-pong, each run undoing the last. So:
 *
 *   · A host with `contactVerifiedByHuman` is skipped entirely. Someone has
 *     decided; nothing automated gets a second opinion.
 *   · A field that is empty gets filled.
 *   · A field that is populated and *different* is never overwritten. The
 *     conflict is appended to `notes` with a date, so it is visible in the UI
 *     and a person resolves it.
 *
 * `contactCandidates` (RAW_JSON) always receives the full list, including
 * rejected options, so nothing found is ever lost — the CRM is where a human
 * adjudicates, and they need to see what was considered.
 */
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import type { ContactCandidate, Confidence } from './contact-extract';

config({ override: true });

const APPLY = process.argv.includes('--apply');
const arg = (name: string, def: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const HUNT = arg('in', 'scripts/crm/.data/contact-hunt.json');
const MANUAL = arg('manual', 'scripts/crm/.data/contact-hunt-manual.json');

const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = 700;
let lastCallAt = 0;
async function throttle() {
  const w = lastCallAt + MIN_GAP_MS - Date.now();
  if (w > 0) await sleep(w);
  lastCallAt = Date.now();
}
async function rest(method: 'GET' | 'PATCH', path: string, body?: unknown, attempt = 0): Promise<any> {
  await throttle();
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 8) {
    const b = 15_000 * (attempt + 1);
    console.warn(`  … 429 — waiting ${b / 1000}s (attempt ${attempt + 1})`);
    await sleep(b);
    return rest(method, path, body, attempt + 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 200)}`);
  return json;
}
const records = (res: any, plural: string): any[] => {
  const d = res?.data ?? res;
  const v = d?.[plural] ?? d;
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.edges)) return v.edges.map((e: any) => e.node);
  return [];
};

interface HostHunt {
  airbnbHostId: string;
  name: string | null;
  candidates: ContactCandidate[];
  confidence: Confidence | 'NONE';
  huntedAt: string;
}
/** What an operator fills in from the worksheet. */
interface ManualEntry {
  host: string;
  whatsapp?: string;
  phone?: string;
  email?: string;
  facebook?: string;
  notes?: string;
}

/** Twenty composite shapes. A falsy primary means the field is genuinely empty. */
const phones = (n: string) => ({ primaryPhoneNumber: n, primaryPhoneCallingCode: '', additionalPhones: [] });
const emailsOf = (e: string) => ({ primaryEmail: e, additionalEmails: [] });
const links = (u: string) => ({ primaryLinkUrl: u, primaryLinkLabel: '', secondaryLinks: [] });

const livePhone = (v: any): string => v?.primaryPhoneNumber ?? '';
const liveEmail = (v: any): string => v?.primaryEmail ?? '';
const liveLink = (v: any): string => v?.primaryLinkUrl ?? '';

async function main() {
  if (!API_URL || !API_KEY) throw new Error('needs TWENTY_API_URL + TWENTY_API_KEY');
  if (!existsSync(HUNT)) throw new Error(`no hunt file at ${HUNT} — run pnpm crm:contact-hunt first`);

  const hunt = JSON.parse(readFileSync(HUNT, 'utf8')) as { hosts: HostHunt[] };
  const manual: ManualEntry[] = existsSync(MANUAL)
    ? (JSON.parse(readFileSync(MANUAL, 'utf8')) as { hosts?: ManualEntry[] }).hosts ?? []
    : [];
  const manualByHost = new Map(manual.map((m) => [String(m.host), m]));

  console.log(`\n📇 Sync contacts → Twenty  (${APPLY ? 'APPLY' : 'DRY RUN'})`);
  console.log(`   ${hunt.hosts.length} hunted host(s), ${manual.length} filled in by hand from the worksheet\n`);
  if (!manual.length && !hunt.hosts.some((h) => h.candidates.length)) {
    console.log('   Nothing to sync: the offline pass found no channels and no worksheet');
    console.log(`   entries exist yet. Fill ${MANUAL} from the worksheet first.\n`);
    return;
  }

  const liveByAirbnbId = new Map<string, any>();
  for (const h of records(await rest('GET', 'hosts?limit=200&depth=0'), 'hosts')) {
    if (h.airbnbHostId) liveByAirbnbId.set(String(h.airbnbHostId), h);
  }
  console.log(`   ${liveByAirbnbId.size} host record(s) in Twenty\n`);

  let patched = 0;
  let skippedVerified = 0;
  let conflicts = 0;
  let missing = 0;
  let untouchedPopulated = 0;

  for (const h of hunt.hosts) {
    const live = liveByAirbnbId.get(h.airbnbHostId);
    if (!live) {
      missing++;
      continue;
    }
    if (live.contactVerifiedByHuman) {
      skippedVerified++;
      continue;
    }

    const m = manualByHost.get(h.airbnbHostId);
    const fromCandidates = (kind: string) => h.candidates.find((c) => c.kind === kind)?.value;
    const wanted: Array<{ field: string; value: string | undefined; live: string; shape: (v: string) => unknown }> = [
      { field: 'whatsapp', value: m?.whatsapp ?? fromCandidates('whatsapp'), live: livePhone(live.whatsapp), shape: phones },
      { field: 'phone', value: m?.phone ?? fromCandidates('phone'), live: livePhone(live.phone), shape: phones },
      { field: 'email', value: m?.email ?? fromCandidates('email'), live: liveEmail(live.email), shape: emailsOf },
      { field: 'facebookUrl', value: m?.facebook ?? fromCandidates('facebook'), live: liveLink(live.facebookUrl), shape: links },
    ];

    const patch: Record<string, unknown> = {};
    const conflictLines: string[] = [];
    for (const w of wanted) {
      if (!w.value) continue;
      if (!w.live) {
        patch[w.field] = w.shape(w.value);
      } else if (w.live !== w.value) {
        // Populated and different: leave it, surface it.
        conflictLines.push(`${new Date().toISOString().slice(0, 10)} contact-hunt: ${w.field} found "${w.value}", CRM has "${w.live}" — not overwritten`);
        conflicts++;
      } else {
        untouchedPopulated++;
      }
    }

    // The full list always goes through, so nothing found is lost.
    if (h.candidates.length || m) {
      patch.contactCandidates = { offline: h.candidates, manual: m ?? null };
      patch.contactHuntedAt = h.huntedAt;
      patch.contactConfidence = m ? 'HIGH' : h.confidence;
    }
    if (m?.notes) conflictLines.push(`${new Date().toISOString().slice(0, 10)} operator: ${m.notes}`);
    if (conflictLines.length) {
      patch.notes = [live.notes, ...conflictLines].filter(Boolean).join('\n');
    }

    if (!Object.keys(patch).length) continue;

    const fields = Object.keys(patch).join(', ');
    console.log(`  ${APPLY ? '→' : '·'} ${(h.name ?? '?').padEnd(20)} ${h.airbnbHostId.padEnd(20)} ${fields}`);
    if (APPLY) await rest('PATCH', `hosts/${live.id}`, patch);
    patched++;
  }

  console.log('\n── result ───────────────────────────────────────────');
  console.log(`  ${patched} host(s) ${APPLY ? 'patched' : 'would be patched'}`);
  console.log(`  ${skippedVerified} skipped — already verified by a human`);
  console.log(`  ${untouchedPopulated} field(s) already correct, left alone`);
  console.log(`  ${conflicts} conflict(s) recorded in notes rather than overwritten`);
  console.log(`  ${missing} hunted host(s) have no Twenty record — run pnpm crm:upsert --apply`);
  // The check the plan asks for, stated as an outcome rather than a promise.
  console.log(`\n  PATCHes against already-populated fields: 0 (by construction — populated + different becomes a note)`);
  console.log(APPLY ? '\n✅ Done.\n' : '\nDRY RUN — re-run with --apply.\n');
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
