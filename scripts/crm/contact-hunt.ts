/**
 * Find a way to reach each host (Epic G1.6).
 *
 *   pnpm crm:contact-hunt              # pass 1 — offline, zero requests
 *   pnpm crm:contact-hunt --worksheet  # + pass 2 — operator worksheet
 *
 * ── What the measurement says ──────────────────────────────────────────────
 *
 * Pass 1 runs `contact-extract.ts` over every field Airbnb publishes, in both
 * locales. Run over all 109 English descriptions on 2026-07-26 it found
 * **nothing** — not one contact across 67 hosts, and not a single run of six
 * consecutive digits anywhere in that text. Airbnb scrubs contact details from
 * listing copy to stop off-platform booking, and it does it thoroughly.
 *
 * House rules, the host "about" blurb, and the Arabic-locale text are new
 * surfaces the PDP passes only just captured, and they cost nothing to check —
 * so pass 1 is still worth running, and it re-runs free whenever the dataset
 * grows. But it is not a contact strategy. If it comes back near-zero again,
 * that is the answer, not a prompt to write more regexes: the ceiling is set by
 * what Airbnb publishes.
 *
 * ── Why pass 2 is a worksheet and not a scraper ────────────────────────────
 *
 * The searches that actually work for Sudanese hosts are reverse-image lookups
 * on the listing photos, because hosts overwhelmingly cross-post the same photo
 * set to Facebook groups and Marketplace where the phone number is in the
 * clear. Those searches need Google, and driving Google through the vault
 * Chrome risks a captcha on the one logged-in Airbnb session the entire
 * pipeline depends on — a session that is slow and annoying to replace.
 *
 * So pass 2 emits queries a human opens themselves: per host, a name search, a
 * Facebook-scoped search, a distinctive-title search, and a reverse-image
 * search on the cover photo. ~67 hosts is an afternoon, and the per-host yield
 * beats anything a scraper would manage before being blocked.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { extractContactsFrom, overallConfidence, type ContactCandidate, type Confidence } from './contact-extract';
import { cityNameAr, cityNameEn, type CityCode } from './sudan-places';

const WORKSHEET = process.argv.includes('--worksheet');
const arg = (name: string, def: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const IN = arg('in', 'scripts/crm/.data/airbnb-scrape.json');
const OUT = arg('out', 'scripts/crm/.data/contact-hunt.json');
const SHEET = arg('worksheet-out', 'scripts/crm/.data/contact-hunt-worksheet.md');

interface LocaleCapture {
  title: string | null;
  description: string | null;
  houseRules: string[];
  hostAbout: string | null;
}
interface Home {
  airbnbListingId: string;
  airbnbUrl?: string;
  title: string | null;
  description: string | null;
  city: string;
  coverPhotoUrl?: string | null;
  hostAirbnbId?: string | null;
  houseRules?: string[];
  i18n?: Partial<Record<'ar' | 'en', LocaleCapture>>;
}
interface Host {
  airbnbHostId: string;
  name: string | null;
  airbnbProfileUrl?: string;
  about?: string | null;
  /** From the profile pass — "Riyadh, Saudi Arabia". */
  livesIn?: string | null;
  work?: string | null;
  agencySuspected?: boolean;
}

interface HostHunt {
  airbnbHostId: string;
  name: string | null;
  homeCount: number;
  cities: string[];
  candidates: ContactCandidate[];
  confidence: Confidence | 'NONE';
  huntedAt: string;
}

function writeAtomic(path: string, data: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, data);
  renameSync(tmp, path);
}

/** Every field Airbnb publishes that a host could have leaked a number into. */
function fieldsFor(host: Host, homes: Home[]): Array<[string, string | null | undefined]> {
  // The profile pass filled `about` and `work`; both are free text a host can
  // and does put a number into.
  const fields: Array<[string, string | null | undefined]> = [
    ['host.about', host.about],
    ['host.work', host.work],
  ];
  for (const home of homes) {
    const id = home.airbnbListingId;
    fields.push([`${id}.title`, home.title], [`${id}.description`, home.description]);
    for (const [locale, cap] of Object.entries(home.i18n ?? {})) {
      if (!cap) continue;
      fields.push(
        [`${id}.title:${locale}`, cap.title],
        [`${id}.description:${locale}`, cap.description],
        [`${id}.hostAbout:${locale}`, cap.hostAbout],
        [`${id}.houseRules:${locale}`, (cap.houseRules ?? []).join('\n')],
      );
    }
    if (home.houseRules?.length) fields.push([`${id}.houseRules`, home.houseRules.join('\n')]);
  }
  return fields;
}

const q = (s: string) => `https://www.google.com/search?q=${encodeURIComponent(s)}`;
const reverseImage = (url: string) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(url)}`;

function worksheetFor(hunt: HostHunt, host: Host, homes: Home[]): string {
  const name = host.name ?? '';
  const cityCode = (homes[0]?.city ?? 'OTHER') as CityCode;
  const cityAr = cityNameAr(cityCode);
  const cityEn = cityNameEn(cityCode);
  const cover = homes.find((h) => h.coverPhotoUrl)?.coverPhotoUrl;
  // A generic title ("Rental unit in Khartoum") matches thousands of pages; a
  // distinctive one is the single best search we have.
  const distinctive = homes
    .map((h) => h.title ?? '')
    .filter((t) => t.length > 18 && !/^(rental unit|home|apartment|condo|place to stay) in /i.test(t))
    .sort((a, b) => b.length - a.length)[0];

  const abroad = host.livesIn && !/sudan/i.test(host.livesIn);

  const lines: string[] = [];
  lines.push(`### ${name || '(no name)'} — host \`${host.airbnbHostId}\``);
  lines.push('');
  lines.push(`- ${hunt.homeCount} listing(s) in ${cityEn} · confidence from listing text: **${hunt.confidence}**`);
  if (host.livesIn) lines.push(`- Lives in **${host.livesIn}**${abroad ? ' — diaspora; expect a foreign number, not +249' : ''}`);
  if (host.work) lines.push(`- Work: ${host.work}`);
  if (host.agencySuspected) lines.push('- ⚑ **Agency suspected** — confirm this is a person before offering them an account');
  if (host.airbnbProfileUrl) lines.push(`- Airbnb profile: ${host.airbnbProfileUrl}`);
  if (hunt.candidates.length) {
    lines.push(`- Already found: ${hunt.candidates.map((c) => `${c.kind} ${c.value} (${c.confidence})`).join(', ')}`);
  }
  lines.push('');
  lines.push('Searches to try, best first:');
  if (cover) lines.push(`1. **Reverse-image the cover photo** (highest yield — hosts cross-post the same photos to Facebook groups): ${reverseImage(cover)}`);
  if (name) {
    lines.push(`2. Name + rentals, Arabic: ${q(`"${name}" ${cityAr} شقق OR إيجار OR للإيجار واتساب`)}`);
    lines.push(`3. Name on Facebook: ${q(`site:facebook.com "${name}" ${cityAr}`)}`);
    // Searching a London-based owner against "Khartoum" buries them. Their own
    // city, and the Sudanese-community groups there, is the better query.
    if (abroad) {
      const where = host.livesIn!.split(',')[0].trim();
      lines.push(`3b. Where they actually live: ${q(`"${name}" ${where} sudanese OR سوداني`)}`);
    }
  }
  if (distinctive) lines.push(`4. Distinctive listing title: ${q(`"${distinctive}"`)}`);
  lines.push('');
  lines.push('Found something? Fill in and mark verified:');
  lines.push('');
  lines.push('```');
  lines.push(`host: ${host.airbnbHostId}`);
  lines.push('whatsapp:');
  lines.push('phone:');
  lines.push('facebook:');
  lines.push('notes:');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function main() {
  if (!existsSync(IN)) throw new Error(`no scrape file at ${IN}`);
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[]; hosts: Host[] };
  const homes = payload.homes ?? [];
  const hosts = payload.hosts ?? [];

  const homesByHost = new Map<string, Home[]>();
  for (const h of homes) {
    if (!h.hostAirbnbId) continue;
    if (!homesByHost.has(h.hostAirbnbId)) homesByHost.set(h.hostAirbnbId, []);
    homesByHost.get(h.hostAirbnbId)!.push(h);
  }

  const now = new Date().toISOString();
  const hunts: HostHunt[] = [];
  for (const host of hosts) {
    const mine = homesByHost.get(host.airbnbHostId) ?? [];
    const candidates = extractContactsFrom(fieldsFor(host, mine));
    hunts.push({
      airbnbHostId: host.airbnbHostId,
      name: host.name,
      homeCount: mine.length,
      cities: [...new Set(mine.map((h) => h.city))],
      candidates,
      confidence: overallConfidence(candidates),
      huntedAt: now,
    });
  }

  const withAny = hunts.filter((h) => h.candidates.length);
  const byKind = new Map<string, number>();
  for (const h of withAny) for (const c of h.candidates) byKind.set(c.kind, (byKind.get(c.kind) ?? 0) + 1);

  console.log('\n📇 Contact hunt — pass 1 (offline, zero requests)');
  console.log(`   ${hosts.length} hosts · ${homes.length} homes · every published field, both locales\n`);
  console.log(`   hosts with any channel: ${withAny.length}/${hosts.length}`);
  if (byKind.size) {
    console.log(`   channels: ${[...byKind].map(([k, n]) => `${k} ${n}`).join(', ')}`);
    for (const h of withAny.slice(0, 15)) {
      console.log(`     ${(h.name ?? '?').padEnd(20)} ${h.confidence.padEnd(7)} ${h.candidates.map((c) => `${c.kind}:${c.value}`).join(' ')}`);
    }
  } else {
    console.log('\n   Nothing found — which is the measured expectation, not a bug.');
    console.log('   Airbnb strips contact details from listing copy. No additional');
    console.log('   pattern will change that; the channel has to come from outside.');
  }

  writeAtomic(OUT, JSON.stringify({ generatedAt: now, hosts: hunts }, null, 2));
  console.log(`\n   → ${OUT}`);

  if (WORKSHEET) {
    const ordered = [...hunts].sort((a, b) => b.homeCount - a.homeCount);
    const doc: string[] = [];
    doc.push('# Contact hunt worksheet');
    doc.push('');
    doc.push(`Generated ${now.slice(0, 10)} · ${hunts.length} hosts, biggest portfolios first.`);
    doc.push('');
    doc.push('Open these searches in a **normal browser**, not the vault Chrome — a Google');
    doc.push('captcha there costs the logged-in Airbnb session the whole pipeline runs on.');
    doc.push('');
    const abroadCount = hunts.filter((x) => {
      const h = hosts.find((y) => y.airbnbHostId === x.airbnbHostId);
      return h?.livesIn && !/sudan/i.test(h.livesIn);
    }).length;
    doc.push(`Note: ${abroadCount} of these hosts state they live outside Sudan — mostly the UK,`);
    doc.push('the Gulf and Egypt. Their contact number will not be +249, and searching them');
    doc.push('against a Sudanese city alone will miss them.');
    doc.push('');
    for (const h of ordered) {
      const host = hosts.find((x) => x.airbnbHostId === h.airbnbHostId)!;
      doc.push(worksheetFor(h, host, homesByHost.get(h.airbnbHostId) ?? []));
    }
    writeAtomic(SHEET, doc.join('\n'));
    console.log(`   → ${SHEET}  (${hunts.length} hosts, open in a normal browser)`);
  } else {
    console.log('\n   Pass 2: re-run with --worksheet for the operator search sheet.');
  }
  console.log('');
}

main();
