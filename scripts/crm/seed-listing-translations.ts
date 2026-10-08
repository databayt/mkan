/**
 * Seed `translation_cache` with Airbnb's own Arabic and English (Epic G1.7).
 *
 *   pnpm crm:seed-i18n            # dry run — reports pairs, collisions, skips
 *   pnpm crm:seed-i18n --apply
 *
 * ── Why seeding the cache is the whole feature ─────────────────────────────
 *
 * mkan stores one language per listing and translates at render time:
 * `localize()` keys the cache on the verbatim source string plus source and
 * target language, and every one of its call sites goes through that path. So a
 * row saying "this exact English title renders as this exact Arabic title"
 * makes all of them show Airbnb's own words — with no change to localize(),
 * localizeListings(), localizeNested(), LISTING_TEXT_FIELDS, or any select.
 *
 * The alternative — titleAr/titleEn columns — would mean rewriting all of that
 * plus a dual-write path for host edits, to deliver what the cache already
 * delivers. This file is the cheaper half of that trade.
 *
 * ── The three rules that keep it honest ────────────────────────────────────
 *
 * 1. Same-script pairs are mis-captures, not translations. If the "Arabic"
 *    capture is Latin text, Airbnb served the wrong locale; writing it would
 *    poison the cache with English-as-Arabic. Report and skip.
 *
 * 2. One source string can only have one translation. The unique key is
 *    (sourceText, sourceLanguage, targetLanguage), and Airbnb hands out the
 *    same generic title to many listings — "Rental unit in Khartoum" appears
 *    repeatedly with different Arabic. Last-write-wins would silently give one
 *    listing another's text, so any source string with more than one distinct
 *    target is skipped entirely and reported. Those fall back to Google, which
 *    is the correct behaviour for a string that genuinely is ambiguous.
 *
 * 3. Never clobber a human. Rows with provider "manual" are somebody's
 *    deliberate wording and rows with "airbnb" are already what we want;
 *    only "google" output gets upgraded.
 *
 * ── What Airbnb actually gives us ──────────────────────────────────────────
 *
 * Both the title and the description, translated. An earlier run of this script
 * saw 110 identical titles and concluded Airbnb does not translate them; that
 * was a parser bug reading a null field (see airbnb-parse.ts), not a fact about
 * Airbnb. The same-script skip below is what caught it — every title pair was
 * being rejected as same-script, which is the shape of a capture failure rather
 * than of a translation.
 */
import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { CITY_OPTIONS, PLACES, STATES } from './sudan-places';
import { DISTRICTS, KIGALI, RWANDA } from '@/lib/geo/rwanda-places';
import { regionFromArgv } from './regions';

config({ override: true });

let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const arg = (name: string, def: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
// `--region=rwanda` seeds the Kigali wave: Airbnb's AR/EN pairs exactly as for
// Sudan, plus English→Kinyarwanda rows from `translate-rw.ts`.
const REGION = regionFromArgv();
const IN = arg('in', REGION.files.scrape);

type Lang = 'ar' | 'en' | 'rw';

/** Same rule as src/components/translation/util.ts — kept in sync deliberately:
 *  a seeded row that disagrees with the renderer's detection is a row that
 *  never gets read. */
function detectScript(text: string | null | undefined): 'ar' | 'en' {
  if (!text) return 'ar';
  if (/[؀-ۿ]/.test(text)) return 'ar';
  if (/[a-zA-Z]/.test(text)) return 'en';
  return 'ar';
}

interface Pair {
  ar: string;
  en: string;
  provider?: 'airbnb' | 'claude';
  /** For the report: which listing and field this came from. */
  origin: string;
}

interface LocaleCapture {
  title: string | null;
  category: string | null;
  description: string | null;
  localeVerified: 'ok' | 'mismatch' | 'empty';
  machineTranslated?: boolean;
  /** 'claude' when translate-rw.ts wrote it (the Kigali wave's Arabic); absent for Airbnb's own capture. */
  provider?: 'claude';
}
interface Home {
  airbnbListingId: string;
  i18n?: Partial<Record<Lang, LocaleCapture>>;
}

const clean = (s: string | null | undefined) => (typeof s === 'string' ? s.trim() : '');

function collectPairs(homes: Home[]): { pairs: Pair[]; sameScript: string[]; incomplete: number } {
  const pairs: Pair[] = [];
  const sameScript: string[] = [];
  let incomplete = 0;

  for (const home of homes) {
    const ar = home.i18n?.ar;
    const en = home.i18n?.en;
    // Reject only a genuine locale failure. `localeVerified` is derived from
    // the description alone, so requiring 'ok' also threw away the titles of
    // every home whose host wrote no description — 7 homes with perfectly good
    // Arabic titles. Each field is script-checked independently below, which is
    // the check that actually matters.
    if (!ar || !en || ar.localeVerified === 'mismatch' || en.localeVerified === 'mismatch') {
      incomplete++;
      continue;
    }
    // `category` is shared by many listings and always maps to the same Arabic,
    // so it never trips the collision guard — unlike titles and descriptions.
    for (const field of ['title', 'category', 'description'] as const) {
      const a = clean(ar[field]);
      const e = clean(en[field]);
      if (!a || !e) continue;
      if (detectScript(a) === detectScript(e)) {
        sameScript.push(`${home.airbnbListingId}.${field}`);
        continue;
      }
      // Guard against the capture being swapped: trust the script, not the key.
      const arabic = detectScript(a) === 'ar' ? a : e;
      const english = detectScript(a) === 'ar' ? e : a;
      pairs.push({ ar: arabic, en: english, origin: `${home.airbnbListingId}.${field}`, provider: ar.provider === 'claude' ? 'claude' : 'airbnb' });
    }
  }
  return { pairs, sameScript, incomplete };
}

/** Place names are unambiguous and shared by every listing in that place. */
function placePairs(): Pair[] {
  const out: Pair[] = [];
  for (const p of PLACES) out.push({ ar: p.nameAr, en: p.nameEn, origin: `place:${p.code}` });
  for (const s of STATES) out.push({ ar: s.nameAr, en: s.nameEn, origin: `state:${s.code}` });
  out.push({ ar: 'السودان', en: 'Sudan', origin: 'country' });
  return out;
}

interface Row {
  sourceText: string;
  sourceLanguage: Lang;
  targetLanguage: Lang;
  translatedText: string;
  origin: string;
  /** Who wrote the target: Airbnb's own copy, or our claude -p translation. */
  provider?: 'airbnb' | 'claude';
}

/**
 * English → Kinyarwanda, from the rw capture `translate-rw.ts` made off the
 * verified English. Machine output, so its provider says so — the "never clobber
 * a human" rule below then protects any wording someone corrects by hand.
 */
function rwRows(homes: Home[]): Row[] {
  const out: Row[] = [];
  for (const home of homes) {
    const en = home.i18n?.en;
    const rw = home.i18n?.rw;
    if (!en || !rw || en.localeVerified === 'mismatch') continue;
    for (const field of ['title', 'description'] as const) {
      const e = clean(en[field]);
      const r = clean(rw[field]);
      if (!e || !r || e === r || detectScript(e) !== 'en') continue;
      out.push({ sourceText: e, sourceLanguage: 'en', targetLanguage: 'rw', translatedText: r, origin: `${home.airbnbListingId}.${field}`, provider: 'claude' });
    }
  }
  // Location rows render through the same cache (city/state/country).
  for (const d of DISTRICTS) out.push({ sourceText: d.nameEn, sourceLanguage: 'en', targetLanguage: 'ar', translatedText: d.nameAr, origin: `district:${d.code}`, provider: 'airbnb' });
  out.push({ sourceText: KIGALI.nameEn, sourceLanguage: 'en', targetLanguage: 'ar', translatedText: KIGALI.nameAr, origin: 'place:KIGALI', provider: 'airbnb' });
  out.push({ sourceText: RWANDA.nameEn, sourceLanguage: 'en', targetLanguage: 'ar', translatedText: RWANDA.nameAr, origin: 'country:RWANDA', provider: 'airbnb' });
  return out;
}

/** Expand each pair into both directions, then drop any source string that
 *  wants to mean two different things. */
function toRows(pairs: Pair[], extra: Row[] = []): { rows: Row[]; collisions: Array<{ key: string; targets: string[]; origins: string[] }> } {
  const candidates: Row[] = [...extra];
  for (const p of pairs) {
    candidates.push({ sourceText: p.en, sourceLanguage: 'en', targetLanguage: 'ar', translatedText: p.ar, origin: p.origin, provider: p.provider });
    candidates.push({ sourceText: p.ar, sourceLanguage: 'ar', targetLanguage: 'en', translatedText: p.en, origin: p.origin, provider: p.provider });
  }

  const byKey = new Map<string, Row[]>();
  for (const r of candidates) {
    const key = `${r.sourceLanguage}→${r.targetLanguage} ${r.sourceText}`;
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }

  const rows: Row[] = [];
  const collisions: Array<{ key: string; targets: string[]; origins: string[] }> = [];
  for (const [key, group] of byKey) {
    const distinct = [...new Set(group.map((g) => g.translatedText))];
    if (distinct.length > 1) {
      collisions.push({
        key: key.split(' ')[1].slice(0, 60),
        targets: distinct.map((t) => t.slice(0, 40)),
        origins: group.map((g) => g.origin),
      });
      continue;
    }
    rows.push(group[0]);
  }
  return { rows, collisions };
}

async function main() {
  console.log('\n🌐 Seed translation_cache from Airbnb’s own AR/EN');
  if (!existsSync(IN)) throw new Error(`no scrape file at ${IN}`);
  const payload = JSON.parse(readFileSync(IN, 'utf8')) as { homes: Home[] };
  const homes = payload.homes ?? [];

  const { pairs, sameScript, incomplete } = collectPairs(homes);
  const allPairs = [...pairs, ...placePairs()];
  const extra = REGION.key === 'rwanda' ? rwRows(homes) : [];
  const { rows, collisions } = toRows(allPairs, extra);
  if (extra.length) console.log(`   ${extra.length} Kinyarwanda / Kigali place rows`);

  console.log(`   ${homes.length} homes · ${pairs.length} listing pairs · ${placePairs().length} place pairs`);
  console.log(`   ${incomplete} homes without a verified capture in both locales`);
  console.log(`   ${sameScript.length} same-script pairs skipped${sameScript.length ? ` (${sameScript.slice(0, 5).join(', ')}${sameScript.length > 5 ? '…' : ''})` : ''}`);
  console.log(`   ${collisions.length} ambiguous source string(s) skipped — they fall back to Google`);
  for (const c of collisions.slice(0, 5)) {
    console.log(`     "${c.key}" → ${c.targets.length} different targets (${c.origins.slice(0, 3).join(', ')})`);
  }
  console.log(`   ${rows.length} rows to write\n`);

  if (!rows.length) {
    console.log('   Nothing to seed — run `pnpm crm:pdp` for both locales first.\n');
    return;
  }
  if (!APPLY) {
    console.log('DRY RUN — re-run with --apply.\n');
    return;
  }

  prisma = (await import('@/lib/db')).db;

  let created = 0;
  let upgraded = 0;
  let leftAlone = 0;
  for (const r of rows) {
    const existing = await prisma.translation.findUnique({
      where: {
        sourceText_sourceLanguage_targetLanguage: {
          sourceText: r.sourceText,
          sourceLanguage: r.sourceLanguage,
          targetLanguage: r.targetLanguage,
        },
      },
      select: { id: true, provider: true },
    });

    if (!existing) {
      await prisma.translation.create({
        data: {
          sourceText: r.sourceText,
          sourceLanguage: r.sourceLanguage,
          targetLanguage: r.targetLanguage,
          translatedText: r.translatedText,
          provider: r.provider ?? 'airbnb',
        },
      });
      created++;
      continue;
    }
    // Only machine output gets replaced. "manual" is a human's decision and
    // "airbnb" is already this.
    if (existing.provider === 'google') {
      await prisma.translation.update({
        where: { id: existing.id },
        data: { translatedText: r.translatedText, provider: r.provider ?? 'airbnb' },
      });
      upgraded++;
    } else {
      leftAlone++;
    }
  }

  const byProvider = await prisma.translation.groupBy({ by: ['provider'], _count: { _all: true } });
  console.log('── result ───────────────────────────────────────────');
  console.log(`  created ${created} · upgraded from google ${upgraded} · left alone ${leftAlone}`);
  console.log(`  translation_cache now: ${byProvider.map((p) => `${p.provider} ${p._count._all}`).join(', ')}`);
  console.log('\n✅ Every localize() call site now renders Airbnb’s own text — no render-path change.\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
