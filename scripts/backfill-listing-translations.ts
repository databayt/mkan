/**
 * Backfill translation_cache so EVERY published listing renders fully in both
 * languages — closing the gap that new seed batches regenerate. The seed
 * scripts create single-language listings but do NOT seed the opposite-language
 * cache row, so each batch leaves fresh holes (English titles on /ar, Arabic on
 * /en). Run this after ANY seed, or once after enabling a billed Google key:
 *
 *   pnpm i18n:backfill
 *
 * Per missing (sourceText → opposite lang), it fills in this order:
 *   1. OVERRIDES below — hand-authored English for the formulaic Arabic seeds
 *      that the currently quota-blocked Google key cannot translate.
 *   2. Live Google — ONLY when ENABLE_CONTENT_TRANSLATION=true and a working
 *      key is set. Batch-translates every remaining gap and persists it
 *      (provider="google"), warming the cache so no first view pays the API.
 *   3. Otherwise → printed as an UNRESOLVED gap (never silently skipped).
 *
 * Idempotent: upserts on (sourceText, sourceLanguage, targetLanguage). Manual
 * rows are curated copy and are never overwritten by the auto-translator.
 */
import { config } from "dotenv";
config({ override: true });

type Lang = "ar" | "en";
const opposite = (l: Lang): Lang => (l === "ar" ? "en" : "ar");
const detectScript = (t: string): Lang =>
  /[؀-ۿ]/.test(t) ? "ar" : /[a-zA-Z]/.test(t) ? "en" : "ar";

// Hand-authored ar→en for the formulaic daqna/hussein floor apartments the
// quota-blocked key can't reach. Once a billed key + ENABLE_CONTENT_TRANSLATION
// are in place these are redundant (the Google path fills them) but harmless.
const OVERRIDES: Array<[string, string]> = [
  ["شقة بغرفتين وصالة ومطبخ — الطابق الثاني (الأولى)، بورتسودان", "Two-bedroom apartment with living room and kitchen — 2nd floor (first), Port Sudan"],
  ["شقة بغرفة وصالة ومطبخ — الطابق الثاني (الثانية)، بورتسودان", "One-bedroom apartment with living room and kitchen — 2nd floor (second), Port Sudan"],
  ["شقة بغرفة وصالة ومطبخ — الطابق الثاني (الثالثة)، بورتسودان", "One-bedroom apartment with living room and kitchen — 2nd floor (third), Port Sudan"],
  ["شقة بغرفتين وصالة ومطبخ — الطابق الثالث (الأولى)، بورتسودان", "Two-bedroom apartment with living room and kitchen — 3rd floor (first), Port Sudan"],
  ["شقة بغرفة وصالة ومطبخ — الطابق الثالث (الثانية)، بورتسودان", "One-bedroom apartment with living room and kitchen — 3rd floor (second), Port Sudan"],
  ["شقة بغرفة وصالة ومطبخ — الطابق الثالث (الثالثة)، بورتسودان", "One-bedroom apartment with living room and kitchen — 3rd floor (third), Port Sudan"],
  ["شقة عائلية في الطابق الثاني ببورتسودان: غرفتان وصالة ومطبخ وحمّام. مساحة مريحة مناسبة للعائلات الصغيرة. للحجز والاستفسار اتصل بالمضيف مباشرة.", "Family apartment on the second floor in Port Sudan: two bedrooms, a living room, a kitchen and a bathroom. A comfortable space suited to small families. To book or enquire, contact the host directly."],
  ["شقة عملية في الطابق الثاني ببورتسودان: غرفة وصالة ومطبخ وحمّام — مثالية للأفراد أو الثنائيات. للحجز اتصل بالمضيف.", "Practical apartment on the second floor in Port Sudan: a bedroom, a living room, a kitchen and a bathroom — ideal for individuals or couples. To book, contact the host."],
  ["شقة في الطابق الثاني ببورتسودان: غرفة وصالة ومطبخ وحمّام، بموقع حيوي قريب من الخدمات. للحجز اتصل بالمضيف.", "Apartment on the second floor in Port Sudan: a bedroom, a living room, a kitchen and a bathroom, in a lively location close to amenities. To book, contact the host."],
  ["شقة عائلية في الطابق الثالث ببورتسودان: غرفتان وصالة ومطبخ وحمّام، بتهوية جيّدة وإطلالة مريحة. مناسبة للعائلات الصغيرة. للحجز اتصل بالمضيف.", "Family apartment on the third floor in Port Sudan: two bedrooms, a living room, a kitchen and a bathroom, with good ventilation and a pleasant view. Suited to small families. To book, contact the host."],
  ["شقة في الطابق الثالث ببورتسودان: غرفة وصالة ومطبخ وحمّام، بتهوية ممتازة وهدوء بعيدًا عن ضجيج الشارع. للحجز اتصل بالمضيف.", "Apartment on the third floor in Port Sudan: a bedroom, a living room, a kitchen and a bathroom, with excellent ventilation and quiet away from street noise. To book, contact the host."],
  ["شقة في الطابق الثالث ببورتسودان: غرفة وصالة ومطبخ وحمّام. مساحة عملية لإقامة هادئة. للحجز اتصل بالمضيف.", "Apartment on the third floor in Port Sudan: a bedroom, a living room, a kitchen and a bathroom. A practical space for a quiet stay. To book, contact the host."],
  // Location proper nouns stored in Arabic on newer listings.
  ["بورتسودان", "Port Sudan"],
  ["البحر الأحمر", "Red Sea"],
  ["السودان", "Sudan"],
];

let db: (typeof import("@/lib/db"))["db"];

type Gap = { src: string; from: Lang; to: Lang };

// Self-contained Google helpers (the engine's google.ts is `server-only` and
// won't load under tsx). Mirrors its gating + chunking so this script can warm
// the cache in one shot once a billed key is in place.
const isTranslationEnabled = (): boolean =>
  process.env.ENABLE_CONTENT_TRANSLATION === "true" && Boolean(process.env.GOOGLE_TRANSLATE_API_KEY);

async function googleTranslateBatch(texts: string[], from: Lang, to: Lang): Promise<string[]> {
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) throw new Error("GOOGLE_TRANSLATE_API_KEY not set");
  const out: string[] = [];
  // Google v2 caps a request at 128 q-segments; stay well under on items + chars.
  const MAX_ITEMS = 100;
  const MAX_CHARS = 4000;
  let chunk: string[] = [];
  let chars = 0;
  const flush = async (): Promise<void> => {
    if (chunk.length === 0) return;
    const params = new URLSearchParams({ source: from, target: to, key, format: "text" });
    for (const t of chunk) params.append("q", t);
    const res = await fetch(`https://translation.googleapis.com/language/translate/v2?${params}`, { method: "POST" });
    if (!res.ok) throw new Error(`Google ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const data = (await res.json()) as { data: { translations: { translatedText: string }[] } };
    for (const tr of data.data.translations) out.push(tr.translatedText);
    chunk = [];
    chars = 0;
  };
  for (const t of texts) {
    if (chunk.length >= MAX_ITEMS || chars + t.length > MAX_CHARS) await flush();
    chunk.push(t);
    chars += t.length;
  }
  await flush();
  return out;
}

async function upsert(
  sourceText: string,
  sourceLanguage: Lang,
  targetLanguage: Lang,
  translatedText: string,
  provider: "manual" | "google",
): Promise<void> {
  await db.translation.upsert({
    where: {
      sourceText_sourceLanguage_targetLanguage: { sourceText, sourceLanguage, targetLanguage },
    },
    // Never clobber a curated manual row with an auto value.
    update: provider === "manual" ? { translatedText, provider } : {},
    create: { sourceText, sourceLanguage, targetLanguage, translatedText, provider },
  });
}

async function main(): Promise<void> {
  db = (await import("@/lib/db")).db;

  // 1. Every free-text string across published listings + their locations.
  const listings = await db.listing.findMany({
    where: { isPublished: true },
    select: {
      title: true,
      description: true,
      location: { select: { city: true, state: true, country: true, address: true } },
    },
  });
  const strings = new Set<string>();
  for (const l of listings) {
    for (const v of [l.title, l.description, l.location?.city, l.location?.state, l.location?.country, l.location?.address]) {
      if (typeof v === "string" && v.trim()) strings.add(v);
    }
  }

  // 2. Which lack the opposite-language cache row? One bulk read + in-memory
  //    check (a per-string findUnique loop is ~N sequential round-trips).
  const existing = await db.translation.findMany({
    select: { sourceText: true, sourceLanguage: true, targetLanguage: true },
  });
  const key = (from: string, to: string, s: string): string => `${from} ${to} ${s}`;
  const have = new Set(existing.map((r) => key(r.sourceLanguage, r.targetLanguage, r.sourceText)));
  const gaps: Gap[] = [];
  for (const s of strings) {
    const from = detectScript(s);
    const to = opposite(from);
    if (!have.has(key(from, to, s))) gaps.push({ src: s, from, to });
  }
  console.log(`${strings.size} unique strings · ${gaps.length} missing opposite-language rows`);

  // 3. OVERRIDES (ar→en curated copy).
  const overrideMap = new Map(OVERRIDES);
  let inserted = 0;
  let remaining: Gap[] = [];
  for (const g of gaps) {
    const en = g.from === "ar" ? overrideMap.get(g.src) : undefined;
    if (en) {
      await upsert(g.src, g.from, g.to, en, "manual");
      inserted++;
    } else {
      remaining.push(g);
    }
  }

  // 4. Google auto-path — only with a working key + the flag on.
  if (remaining.length > 0 && isTranslationEnabled()) {
    const byPair = new Map<string, Gap[]>();
    for (const g of remaining) {
      const k = `${g.from}->${g.to}`;
      const arr = byPair.get(k) ?? [];
      arr.push(g);
      byPair.set(k, arr);
    }
    const stillMissing: Gap[] = [];
    for (const [k, group] of byPair) {
      const [from, to] = k.split("->") as [Lang, Lang];
      const texts = group.map((g) => g.src);
      let translated: string[] = [];
      try {
        translated = await googleTranslateBatch(texts, from, to);
      } catch (e) {
        console.warn(`  Google batch ${k} failed:`, e instanceof Error ? e.message : e);
      }
      for (let i = 0; i < group.length; i++) {
        const t = translated[i];
        if (t && t !== texts[i]) {
          await upsert(texts[i], from, to, t, "google");
          inserted++;
        } else {
          stillMissing.push(group[i]);
        }
      }
    }
    remaining = stillMissing;
  }

  // 5. Report — unresolved gaps are printed, never silently swallowed.
  console.log(`✅ Inserted/updated ${inserted} rows.`);
  if (remaining.length > 0) {
    console.log(
      `⚠️  ${remaining.length} UNRESOLVED — add an OVERRIDES entry or set a billed ` +
        `GOOGLE_TRANSLATE_API_KEY + ENABLE_CONTENT_TRANSLATION=true and re-run:`,
    );
    for (const g of remaining) console.log(`   [${g.from}→${g.to}] ${g.src.slice(0, 70)}`);
    process.exitCode = 1; // signal an incomplete backfill to CI
  } else {
    console.log("🎉 Every published listing is fully bilingual.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (db) await db.$disconnect();
  });
