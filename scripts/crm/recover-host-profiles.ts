/**
 * Recover the host-profile fields that the PDP pass wiped.
 *
 *   pnpm crm:recover-profiles            # dry run — prints what it would restore
 *   pnpm crm:recover-profiles --apply
 *
 * ── What happened ──────────────────────────────────────────────────────────
 *
 * `airbnb-pdp.ts` rebuilt each host record from a fresh literal that listed
 * ten fields by hand. Everything else the host object carried — `livesIn`,
 * `work`, `about`, `languages`, `verifications`, `agencySuspected`,
 * `profileFetchedAt` — was dropped on every run. Those fields come from
 * `airbnb-host-profile.ts`, which ran at 08:00 on 2026-07-27; the PDP pass ran
 * again at 13:05 the same day and took `livesIn` from 55 hosts down to 2.
 *
 * The spread is fixed at the source now, but the data was already gone from
 * `.data/airbnb-scrape.json`, and the profile pass needs the vault-Chrome CDP
 * session to re-run.
 *
 * ── Why the worksheet is a usable backup ───────────────────────────────────
 *
 * `contact-hunt --worksheet` renders those fields as prose, and it ran at 08:00
 * — before the wipe. So `.data/contact-hunt-worksheet.md` is the only surviving
 * copy of who lives where. It is a lossy backup (prose, not JSON) but the three
 * fields that matter for outreach survive verbatim:
 *
 *   - Lives in **Riyadh, Saudi Arabia**   → livesIn
 *   - Work: Roiya Computer Co. CEO        → work
 *   - ⚑ **Agency suspected**              → agencySuspected
 *
 * `livesIn` is the one that changes what we do: 37 of these hosts are abroad,
 * so their number is not +249 and searching them against a Sudanese city misses
 * them entirely.
 *
 * Restores are additive — a field already present on the host is never
 * overwritten, so re-running the real profile pass later wins.
 */
import { config } from 'dotenv';
config({ override: true });

import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const argv = (n: string, d = ''): string => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const SCRAPE = argv('in', 'scripts/crm/.data/airbnb-scrape.json');
const WORKSHEET = argv('worksheet', 'scripts/crm/.data/contact-hunt-worksheet.md');

interface Host {
  airbnbHostId: string;
  name?: string | null;
  livesIn?: string | null;
  work?: string | null;
  agencySuspected?: boolean | null;
  [k: string]: unknown;
}

interface Recovered {
  livesIn?: string;
  work?: string;
  agencySuspected?: boolean;
}

/** Parse the worksheet back into per-host fields. Mirrors `worksheetFor()`. */
function parseWorksheet(md: string): Map<string, Recovered> {
  const out = new Map<string, Recovered>();
  // Sections start at "### <name> — host `<id>`" and run to the next "### ".
  const sections = md.split(/^### /m).slice(1);
  for (const section of sections) {
    const id = section.match(/host `([^`]+)`/)?.[1];
    if (!id) continue;
    const rec: Recovered = {};
    // "- Lives in **Riyadh, Saudi Arabia** — diaspora; …" (suffix optional)
    const livesIn = section.match(/^- Lives in \*\*(.+?)\*\*/m)?.[1];
    if (livesIn) rec.livesIn = livesIn.trim();
    const work = section.match(/^- Work: (.+)$/m)?.[1];
    if (work) rec.work = work.trim();
    if (/^- ⚑ \*\*Agency suspected\*\*/m.test(section)) rec.agencySuspected = true;
    if (Object.keys(rec).length) out.set(id, rec);
  }
  return out;
}

function main(): void {
  console.log('\n♻️  Recover host profiles from the contact-hunt worksheet\n');
  if (!existsSync(SCRAPE)) throw new Error(`no scrape file at ${SCRAPE}`);
  if (!existsSync(WORKSHEET)) throw new Error(`no worksheet at ${WORKSHEET}`);

  const payload = JSON.parse(readFileSync(SCRAPE, 'utf8')) as { hosts: Host[] };
  const hosts = payload.hosts ?? [];
  const recovered = parseWorksheet(readFileSync(WORKSHEET, 'utf8'));

  console.log(`   ${hosts.length} hosts in the scrape · ${recovered.size} with fields in the worksheet`);

  const before = {
    livesIn: hosts.filter((h) => h.livesIn).length,
    work: hosts.filter((h) => h.work).length,
    agency: hosts.filter((h) => h.agencySuspected).length,
  };

  let restored = 0;
  const counts = { livesIn: 0, work: 0, agencySuspected: 0 };
  const notFound: string[] = [];

  for (const host of hosts) {
    const rec = recovered.get(host.airbnbHostId);
    if (!rec) { notFound.push(host.airbnbHostId); continue; }
    let touched = false;
    // Additive only — a live value always beats a prose reconstruction.
    if (rec.livesIn && !host.livesIn) { host.livesIn = rec.livesIn; counts.livesIn++; touched = true; }
    if (rec.work && !host.work) { host.work = rec.work; counts.work++; touched = true; }
    if (rec.agencySuspected && !host.agencySuspected) {
      host.agencySuspected = true; counts.agencySuspected++; touched = true;
    }
    if (touched) restored++;
  }

  console.log(`\n   livesIn         ${before.livesIn} → ${before.livesIn + counts.livesIn}  (+${counts.livesIn})`);
  console.log(`   work            ${before.work} → ${before.work + counts.work}  (+${counts.work})`);
  console.log(`   agencySuspected ${before.agency} → ${before.agency + counts.agencySuspected}  (+${counts.agencySuspected})`);
  console.log(`   ${restored} host(s) updated · ${notFound.length} not in the worksheet`);

  const abroad = hosts.filter((h) => h.livesIn && !/sudan/i.test(String(h.livesIn)));
  console.log(`\n   ${abroad.length} of ${hosts.filter((h) => h.livesIn).length} located hosts live outside Sudan`);
  const where = abroad.reduce<Record<string, number>>((acc, h) => {
    const country = String(h.livesIn).split(',').pop()!.trim();
    acc[country] = (acc[country] ?? 0) + 1;
    return acc;
  }, {});
  for (const [c, n] of Object.entries(where).sort((a, b) => b[1] - a[1])) {
    console.log(`     ${String(n).padStart(3)}  ${c}`);
  }

  if (!restored) { console.log('\nNothing to restore.\n'); return; }
  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply.\n'); return; }

  const tmp = `${SCRAPE}.tmp`;
  writeFileSync(tmp, JSON.stringify(payload, null, 2));
  renameSync(tmp, SCRAPE);
  console.log(`\n✅ restored ${restored} host profile(s) → ${SCRAPE}`);
  console.log('   Re-run `pnpm crm:contact-hunt` to search the recovered bios.\n');
}

try {
  main();
} catch (e) {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
}
