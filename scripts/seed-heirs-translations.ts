/**
 * Seed manual (provider="manual") ar→en translations for the 7 heirs homes
 * into translation_cache, so /en renders polished English immediately and the
 * cache→render path is exercised end-to-end — independent of the live Google
 * key. These rows are first-class cache hits the engine reads before Google;
 * manual rows are never overwritten by the auto-translator (see
 * src/components/translation/). When a billed GOOGLE_TRANSLATE_API_KEY is in
 * place, any OTHER content auto-translates while these stay as curated copy.
 *
 *   pnpm tsx scripts/seed-heirs-translations.ts
 *
 * Idempotent: upserts on (sourceText, sourceLanguage, targetLanguage).
 */
import { config } from "dotenv";
config({ override: true });

let db: (typeof import("@/lib/db"))["db"];

// [arabic source, english] pairs — must match the stored listing strings
// exactly (seed-heirs-homes.ts), since the cache key is the verbatim source.
const PAIRS: Array<[string, string]> = [
  // Titles
  ["شقة عائلية مشرقة بثلاث غرف وثلاثة حمّامات", "Bright family apartment with three bedrooms and three bathrooms"],
  ["الدور الأخير الهادئ بصالون وإطلالة مفتوحة", "Quiet top-floor apartment with a salon and open views"],
  ["استوديو أنيق بهول واسع في قلب بورتسودان", "Elegant studio with a spacious hall in the heart of Port Sudan"],
  ["شقة هادئة بغرفتين لإقامة عائلية مريحة", "Quiet two-bedroom apartment for a comfortable family stay"],
  ["شقة مشمسة بدور علوي وتهوية رائعة", "Sunny upper-floor apartment with great ventilation"],
  ["جناح فسيح بغرفتين وصالتين وحمّامين", "Spacious suite with two bedrooms, two living rooms, and two bathrooms"],
  ["شقة أرضية بمدخل خاص وسهولة وصول", "Ground-floor apartment with a private entrance and easy access"],
  // Descriptions
  [
    "إقامة مريحة في شقة عائلية مضيئة على بُعد دقائق من وسط بورتسودان ونسمات البحر الأحمر. ثلاث غرف نوم وثلاثة حمّامات تمنح كل ضيف خصوصيته، مع قربها من مدخل المبنى لسهولة الوصول. مثالية للعائلات والإقامات الطويلة.",
    "A comfortable stay in a bright family apartment, minutes from downtown Port Sudan and the Red Sea breeze. Three bedrooms and three bathrooms give every guest their privacy, and its spot near the building entrance makes access easy. Ideal for families and long stays.",
  ],
  [
    "شقة الدور الأخير، الأكثر هدوءًا وتهوية، تتميّز بصالون استقبال فسيح وإطلالة مفتوحة على المدينة. مساحات أنيقة لغرفتَي ضيافة وعائلة، على خطوات من المطاعم والخدمات في بورتسودان. خيار رائع لمن يبحث عن السكينة والرحابة.",
    "A top-floor apartment — the quietest and best-ventilated — with a spacious reception salon and open views over the city. Elegant spaces for hosting and family, steps from the restaurants and services of Port Sudan. A great choice for anyone seeking calm and room to breathe.",
  ],
  [
    "استوديو عصري بهول واسع يجمع البساطة والأناقة، في موقع حيوي بقلب بورتسودان قريب من المقاهي والأسواق. مثالي للأفراد أو الثنائيات الباحثين عن إقامة عملية وأنيقة على مقربة من البحر الأحمر.",
    "A modern studio with a spacious hall that blends simplicity and elegance, in a lively spot in the heart of Port Sudan, close to cafés and markets. Perfect for solo travelers or couples after a practical, stylish stay near the Red Sea.",
  ],
  [
    "شقة دافئة بغرفتَي نوم وهول مريح، مثالية لعائلة صغيرة تبحث عن الهدوء وسهولة الوصول. على مقربة من أبرز معالم بورتسودان وخدماتها اليومية، بأجواء منزلية تجعلك تشعر وكأنك في بيتك.",
    "A warm two-bedroom apartment with a cozy hall, ideal for a small family seeking quiet and easy access. Close to Port Sudan's landmarks and everyday services, with a homely feel that makes you feel right at home.",
  ],
  [
    "شقة مشمسة في دور علوي تنعم بتهوية ممتازة وإطلالة مريحة بعيدًا عن ضجيج الشارع. غرفتا نوم وهول رحب على خطوات من وسط بورتسودان وكورنيش البحر الأحمر. مثالية للعائلات والإقامات الهادئة.",
    "A sunny upper-floor apartment with excellent ventilation and a pleasant view, away from street noise. Two bedrooms and a roomy hall, steps from downtown Port Sudan and the Red Sea corniche. Ideal for families and quiet stays.",
  ],
  [
    "أرحب الشقق وأكثرها فخامة: غرفتا نوم، صالتان، وحمّامان، بتخطيط مرن يناسب العائلات الكبيرة أو استضافة الضيوف. موقع مركزي في بورتسودان قريب من كل ما تحتاجه، لإقامة لا تُنسى على مقربة من البحر الأحمر.",
    "The most spacious and upscale apartment: two bedrooms, two living rooms, and two bathrooms, with a flexible layout suited to large families or hosting guests. A central Port Sudan location close to everything you need, for an unforgettable stay near the Red Sea.",
  ],
  [
    "شقة أرضية أنيقة بمدخل مستقل يمنحك الخصوصية وسهولة الوصول دون درج — مثالية لكبار السن والعائلات. غرفة نوم، هول، وصالة مفتوحة بإطلالة مريحة، في موقع حيوي بقلب بورتسودان قرب المتاجر والمطاعم.",
    "An elegant ground-floor apartment with a private entrance for privacy and step-free access — ideal for seniors and families. A bedroom, a hall, and an open lounge with a pleasant view, in a lively spot in the heart of Port Sudan near shops and restaurants.",
  ],
  // Addresses
  ["بورتسودان، بالقرب من أبدوت مول", "Port Sudan, near Abdot Mall"],
  ["بورتسودان، وسط المدينة", "Port Sudan, City Center"],
];

async function main(): Promise<void> {
  db = (await import("@/lib/db")).db;
  let n = 0;
  for (const [ar, en] of PAIRS) {
    await db.translation.upsert({
      where: {
        sourceText_sourceLanguage_targetLanguage: {
          sourceText: ar,
          sourceLanguage: "ar",
          targetLanguage: "en",
        },
      },
      update: { translatedText: en, provider: "manual" },
      create: {
        sourceText: ar,
        sourceLanguage: "ar",
        targetLanguage: "en",
        translatedText: en,
        provider: "manual",
      },
    });
    n += 1;
  }
  console.log(`✅ Seeded ${n} manual ar→en translations for the heirs homes.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (db) await db.$disconnect();
  });
