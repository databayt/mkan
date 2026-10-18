/**
 * The mkan CRM's daily check-up — report what drifted, fix only what is safe.
 *
 *   pnpm crm:hygiene                    dry run: the report + the fixes it would make
 *   pnpm crm:hygiene --apply            make the safe fixes
 *   pnpm crm:hygiene --apply --notify   … and post the report to #mkan (the 07:00 job)
 *   pnpm crm:hygiene --stale            also re-check every TikTok video (Mondays by default)
 *
 * Nothing watched the board between imports: duplicates, a dead link back to
 * the site, a code minted at publish that the board never heard of, a broker's
 * "it's rented" that stayed in Prisma. The checks are in `hygiene-pure.ts`;
 * this file reads Twenty + the site, applies the safe fixes, and reports.
 *
 * Safe fixes only (see hygiene-pure.ts): exact-key duplicates marked (never
 * deleted), listing codes copied from the site, phones given their calling
 * code, broker answers noted on the home, gone TikTok videos flagged and their
 * leads hidden from /find. Never a delete, never a stage change, never a host
 * with `contactVerifiedByHuman`.
 */
import { config } from 'dotenv';
config({ override: true });

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { twentyClient } from './twenty-rest';
import { checkHomes, checkHosts, videoGone, type Finding, type Fix } from './hygiene-pure';
import { postToMkan, recordRun } from './notify';
import { agentFunnel, funnelLine } from './agent-funnel';

type Row = Record<string, unknown>;

const APPLY = process.argv.includes('--apply');
const NOTIFY = process.argv.includes('--notify');
const STALE = process.argv.includes('--stale') || new Date().getDay() === 1;
const DATA = join(__dirname, '.data', 'hygiene');
const SYNCED = join(DATA, 'broker-answers-synced.json');
const LEDGER = join(DATA, 'fixes.jsonl');
const BOARD = 'https://mkan.databayt.org/objects/homes';

const readJson = <T>(f: string, empty: T): T => (existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as T) : empty);

async function main(): Promise<void> {
  console.log(`\n🩺 mkan CRM hygiene  (${APPLY ? 'APPLY' : 'dry run'}${STALE ? ' · with the TikTok stale check' : ''})\n`);
  const twenty = twentyClient();
  const { db } = await import('../../src/lib/db');
  const [homes, hosts] = await Promise.all([twenty.all('homes'), twenty.all('hosts')]);
  const listings = await db.listing.findMany({ select: { id: true, code: true, isPublished: true, source: true, sourceListingId: true } });
  console.log(`   ${homes.length} homes · ${hosts.length} hosts on the board · ${listings.length} listings on the site\n`);

  const h1 = checkHomes(homes, listings);
  const h2 = checkHosts(hosts);
  const findings: Finding[] = [...h1.findings, ...h2.findings];
  const fixes: Fix[] = [...h1.fixes, ...h2.fixes];

  // ── broker answers → the home they are about ─────────────────────────────
  const synced = new Set(readJson<string[]>(SYNCED, []));
  const homeByListing = new Map(homes.filter((h) => h.mkanListingId != null && h.homeStatus !== 'DUPLICATE').map((h) => [Number(h.mkanListingId), h]));
  const answers = await db.brokerRequest.findMany({
    where: { status: { in: ['AVAILABLE', 'RENTED', 'NO_REPLY'] }, id: { notIn: [...synced] } },
    select: { id: true, listingId: true, status: true, respondedAt: true, updatedAt: true, visitId: true, broker: { select: { sourceHostId: true, username: true } } },
    orderBy: { updatedAt: 'asc' },
  });
  const notes: { homeId: string; requestId: string; markdown: string; patch?: Row }[] = [];
  for (const a of answers) {
    const home = homeByListing.get(a.listingId);
    if (!home) {
      synced.add(a.id); // no board record to tell; nothing will appear later
      continue;
    }
    const when = (a.respondedAt ?? a.updatedAt).toISOString();
    const who = a.broker.username ?? a.broker.sourceHostId ?? 'the broker';
    const said = a.status === 'AVAILABLE' ? 'still available' : a.status === 'RENTED' ? 'already RENTED' : 'did not reply within 24 h';
    notes.push({
      homeId: String(home.id),
      requestId: a.id,
      markdown: `**/find broker check** — ${who} ${said} (${when.slice(0, 16).replace('T', ' ')} UTC)${a.visitId ? ` · viewing #${a.visitId} booked` : ''}`,
      // Only a broker's yes is a confirmation (imports stamp this field too, so it never was one).
      patch: a.status === 'AVAILABLE' ? { lastAvailabilityConfirmedAt: when } : undefined,
    });
  }
  if (notes.length) findings.push({ check: 'broker answers not yet on the board', items: notes.map((n) => `${n.homeId}: ${n.markdown.replace(/\*\*/g, '')}`) });

  // ── gone TikTok videos (weekly) ──────────────────────────────────────────
  const gone: Row[] = [];
  if (STALE) {
    const tiktok = homes.filter((h) => h.source === 'TIKTOK' && h.stillListed !== false && h.homeStatus !== 'DUPLICATE');
    const seen = new Set<string>();
    for (const h of tiktok) {
      const url = ((h.sourceUrl as { primaryLinkUrl?: string } | null)?.primaryLinkUrl ?? '').trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      try {
        execFileSync('yt-dlp', ['--no-warnings', '--skip-download', '--print', 'id', url], { encoding: 'utf8', timeout: 60_000, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch (e) {
        const msg = String((e as { stderr?: string }).stderr ?? (e as Error).message);
        if (videoGone(msg)) gone.push(...tiktok.filter((x) => ((x.sourceUrl as { primaryLinkUrl?: string } | null)?.primaryLinkUrl ?? '').trim() === url));
      }
    }
    console.log(`   stale check: ${seen.size} TikTok video(s) looked at, ${gone.length} home(s) gone`);
    if (gone.length) findings.push({ check: 'TikTok video taken down', items: gone.map((h) => `${h.id} ${String(h.sourceId)}`) });
  }

  // ── report ────────────────────────────────────────────────────────────────
  for (const f of findings) {
    console.log(`   ${String(f.items.length).padStart(5)}  ${f.check}`);
    for (const i of f.items.slice(0, 5)) console.log(`            ${i.slice(0, 140)}`);
    if (f.items.length > 5) console.log(`            … ${f.items.length - 5} more`);
  }
  const byWhy = fixes.reduce<Record<string, number>>((m, f) => ((m[f.why.replace(/ .*$/, '')] = (m[f.why.replace(/ .*$/, '')] ?? 0) + 1), m), {});
  console.log(`\n   ${fixes.length + notes.length + gone.length} safe fix(es): ${Object.entries(byWhy).map(([k, v]) => `${v} ${k}`).join(', ') || 'none'}${notes.length ? `, ${notes.length} broker notes` : ''}${gone.length ? `, ${gone.length} gone` : ''}`);

  let applied = 0;
  if (APPLY) {
    mkdirSync(DATA, { recursive: true });
    const log = (e: Row) => writeFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), ...e }) + '\n', { flag: 'a' });
    const before = new Map([...homes, ...hosts].map((r) => [String(r.id), r]));
    for (const f of fixes) {
      try {
        await twenty.rest('PATCH', `${f.object}/${f.id}`, f.body);
        log({ ...f, was: Object.fromEntries(Object.keys(f.body).map((k) => [k, before.get(f.id)?.[k] ?? null])) });
        applied++;
      } catch (e) {
        console.warn(`   ! ${f.object}/${f.id}: ${(e as Error).message.slice(0, 140)}`);
      }
    }
    for (const n of notes) {
      try {
        const res = (await twenty.rest('POST', 'notes', { title: 'Broker check from /find', bodyV2: { markdown: n.markdown } })) as { data?: { createNote?: { id?: string } } };
        const noteId = res?.data?.createNote?.id;
        if (noteId) await twenty.rest('POST', 'noteTargets', { noteId, targetHomeId: n.homeId });
        if (n.patch) await twenty.rest('PATCH', `homes/${n.homeId}`, n.patch);
        synced.add(n.requestId);
        applied++;
      } catch (e) {
        console.warn(`   ! broker note ${n.requestId}: ${(e as Error).message.slice(0, 140)}`);
      }
    }
    writeFileSync(SYNCED, JSON.stringify([...synced]));
    for (const h of gone) {
      try {
        await twenty.rest('PATCH', `homes/${h.id}`, { stillListed: false });
        // The lead's card links to the video; with no video there is no lead.
        // The mirror skips stillListed=false homes, so this is not undone.
        if (h.mkanListingId != null) await db.listing.updateMany({ where: { id: Number(h.mkanListingId), source: 'TIKTOK', isPublished: false }, data: { sourceUrl: null } });
        log({ object: 'homes', id: h.id, why: 'TikTok video gone', body: { stillListed: false }, was: { stillListed: h.stillListed ?? null } });
        applied++;
      } catch (e) {
        console.warn(`   ! gone ${h.id}: ${(e as Error).message.slice(0, 140)}`);
      }
    }
    console.log(`\n✅ ${applied} fix(es) applied · ledger ${LEDGER}`);
  } else {
    for (const f of fixes.slice(0, 10)) console.log(`     ${f.object}/${f.id}: ${f.why}`);
    console.log('\nDRY RUN — re-run with --apply.');
  }

  const funnel = funnelLine(await agentFunnel(db, 7));
  console.log(`\n   ${funnel}`);
  if (NOTIFY) {
    const streaks = readJson<Record<string, { fails: number }>>(join(__dirname, '.data', 'failure-streaks.json'), {});
    const failing = Object.entries(streaks).filter(([, s]) => s.fails > 0);
    const proposed = Object.values(readJson<Record<string, { status: string }>>(join(__dirname, '.data', 'tiktok', 'seeds.json'), {})).filter((s) => s.status === 'proposed').length;
    const lines = [
      `*CRM hygiene* — ${homes.length} homes · ${hosts.length} hosts · ${APPLY ? `${applied} safe fix(es) applied` : 'dry run'} · <${BOARD}|board>`,
      ...findings.map((f) => `• ${f.items.length} ${f.check}`),
      `• ${funnel}`,
      failing.length ? `⚠️ failing jobs: ${failing.map(([j, s]) => `${j} (${s.fails}×)`).join(', ')}` : '',
      proposed ? `• ${proposed} proposed TikTok seed(s) to review — \`pnpm crm:tiktok-seeds\`` : '',
    ].filter(Boolean);
    await postToMkan(lines.join('\n'));
  }
  await db.$disconnect();
}

main()
  .then(() => recordRun('crm:hygiene', true))
  .catch(async (e) => {
    console.error(`\n❌ ${(e as Error).message}\n`);
    await recordRun('crm:hygiene', false, (e as Error).message);
    process.exit(1);
  });
