/**
 * Seed the real "heirs" estate homes onto demo host 0001@mkan.org.
 *
 * Source: the private family estate-division app at ~/heirs. We take the six
 * lottery-eligible units (the البيت الكبير apartments + الفرن's two floors) and
 * add one user-specified ground-floor unit — 7 homes total — and recreate them
 * here as mkan listings, all owned by host 0001 in Port Sudan, priced in SDG.
 *
 * Scope is deliberately narrow: this ONLY touches host 0001 — it deletes
 * whatever listings 0001 currently owns (the fake Unsplash seed) and replaces
 * them with these 7. Hosts 0002…0020 and their listings are never queried or
 * modified, and the 0001 User account itself (password/identity) is left as-is.
 *
 * Photos: left intentionally EMPTY for now — real photos come later. The heirs
 * still images in ~/heirs/public are NOT photos of the homes (WhatsApp chat
 * screenshots with a real phone number/names + scanned inheritance/appraisal
 * legal documents), and the only real property visuals are per-property .mp4
 * walkthroughs that mkan's photoUrls can't render. With photoUrls empty, the
 * app's own fallback shows: cards use /placeholder.jpg (Card.tsx) and the
 * detail gallery uses /placeholder.svg (property-gallery.tsx empty-state).
 *
 *   pnpm seed:heirs
 *
 * Idempotent: re-running wipes 0001's current listings and rebuilds the 7.
 */
import { config } from 'dotenv';
// Load .env BEFORE anything reads process.env. `override:true` makes .env win
// over any stale DATABASE_URL already in the shell. Crucially, `@/lib/db` is
// imported dynamically inside main() (not at top level) — a static import is
// ESM-hoisted and would build the Prisma client before this runs, falling back
// to libpq's default database (the OS username) and erroring out.
config({ override: true });

import {
  Amenity,
  Highlight,
  PropertyType,
  CancellationPolicy,
} from '@prisma/client';

const HOST_EMAIL = '0001@mkan.org';

// Assigned inside main() after .env loads (see the deferred import there).
let prisma: (typeof import('@/lib/db'))['db'];

// ─────────────────────────────────────────────────────────────────────────────
// Two real Port Sudan locations (resolved from the Google Maps links the owner
// gave). The الفرن pair sits at A (near Abdot Mall); the البيت الكبير units sit
// at B (near Noni ice-cream shop) ~150 m away. Each listing gets its own
// Location row using its building's coords.
// ─────────────────────────────────────────────────────────────────────────────
const LOCATIONS = {
  A: { address: 'بورتسودان، بالقرب من أبدوت مول', latitude: 19.622237, longitude: 37.2045283 },
  B: { address: 'بورتسودان، وسط المدينة', latitude: 19.6211875, longitude: 37.2031719 },
} as const;

// ─────────────────────────────────────────────────────────────────────────────
// The 7 homes. bed/bath are the real layouts (heirs property-facts.ts); pricing
// derives from heirs rents (monthlyRentSdg/30), vacant units use a fallback.
// Titles/descriptions are fresh Airbnb-style copy (the old estate-division
// labels were meant for a different app). `heirsLabel` keeps the source
// mapping; `loc` points at LOCATIONS above.
// ─────────────────────────────────────────────────────────────────────────────
type HeirsHome = {
  title: string;
  description: string;
  loc: keyof typeof LOCATIONS;
  heirsLabel: string;
  bedrooms: number;
  bathrooms: number;
  monthlyRentSdg?: number; // present when the unit is rented
  fallbackNightlySdg?: number; // for vacant units (no rent on record)
  amenities: Amenity[];
};

const HOMES: HeirsHome[] = [
  {
    title: 'شقة عائلية مشرقة بثلاث غرف وثلاثة حمّامات',
    description:
      'إقامة مريحة في شقة عائلية مضيئة على بُعد دقائق من وسط بورتسودان ونسمات البحر الأحمر. ثلاث غرف نوم وثلاثة حمّامات تمنح كل ضيف خصوصيته، مع قربها من مدخل المبنى لسهولة الوصول. مثالية للعائلات والإقامات الطويلة.',
    loc: 'A',
    heirsLabel: 'الفرن الدور الأول',
    bedrooms: 3,
    bathrooms: 3,
    monthlyRentSdg: 3_000_000,
    amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Refrigerator, Amenity.Parking, Amenity.Microwave],
  },
  {
    title: 'الدور الأخير الهادئ بصالون وإطلالة مفتوحة',
    description:
      'شقة الدور الأخير، الأكثر هدوءًا وتهوية، تتميّز بصالون استقبال فسيح وإطلالة مفتوحة على المدينة. مساحات أنيقة لغرفتَي ضيافة وعائلة، على خطوات من المطاعم والخدمات في بورتسودان. خيار رائع لمن يبحث عن السكينة والرحابة.',
    loc: 'A',
    heirsLabel: 'الفرن الدور الثاني',
    bedrooms: 3,
    bathrooms: 2,
    monthlyRentSdg: 4_000_000,
    amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Refrigerator, Amenity.Parking, Amenity.Microwave],
  },
  {
    title: 'استوديو أنيق بهول واسع في قلب بورتسودان',
    description:
      'استوديو عصري بهول واسع يجمع البساطة والأناقة، في موقع حيوي بقلب بورتسودان قريب من المقاهي والأسواق. مثالي للأفراد أو الثنائيات الباحثين عن إقامة عملية وأنيقة على مقربة من البحر الأحمر.',
    loc: 'B',
    heirsLabel: 'البيت الكبير الدور الأول شقة أ',
    bedrooms: 1,
    bathrooms: 1,
    monthlyRentSdg: 1_500_000,
    amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Refrigerator],
  },
  {
    title: 'شقة هادئة بغرفتين لإقامة عائلية مريحة',
    description:
      'شقة دافئة بغرفتَي نوم وهول مريح، مثالية لعائلة صغيرة تبحث عن الهدوء وسهولة الوصول. على مقربة من أبرز معالم بورتسودان وخدماتها اليومية، بأجواء منزلية تجعلك تشعر وكأنك في بيتك.',
    loc: 'B',
    heirsLabel: 'البيت الكبير الدور الأول شقة ب',
    bedrooms: 2,
    bathrooms: 1,
    // Vacant (AVAILABLE) — nightly = mean of the comparable 2-bed rented units
    // (شقة أ الثاني 1.0M + شقة ب الثاني 2.0M = 1.5M/mo → /30).
    fallbackNightlySdg: 50_000,
    amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Refrigerator, Amenity.Parking],
  },
  {
    title: 'شقة مشمسة بدور علوي وتهوية رائعة',
    description:
      'شقة مشمسة في دور علوي تنعم بتهوية ممتازة وإطلالة مريحة بعيدًا عن ضجيج الشارع. غرفتا نوم وهول رحب على خطوات من وسط بورتسودان وكورنيش البحر الأحمر. مثالية للعائلات والإقامات الهادئة.',
    loc: 'B',
    heirsLabel: 'البيت الكبير الدور الثاني شقة أ',
    bedrooms: 2,
    bathrooms: 1,
    monthlyRentSdg: 1_000_000,
    amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Refrigerator, Amenity.Parking],
  },
  {
    title: 'جناح فسيح بغرفتين وصالتين وحمّامين',
    description:
      'أرحب الشقق وأكثرها فخامة: غرفتا نوم، صالتان، وحمّامان، بتخطيط مرن يناسب العائلات الكبيرة أو استضافة الضيوف. موقع مركزي في بورتسودان قريب من كل ما تحتاجه، لإقامة لا تُنسى على مقربة من البحر الأحمر.',
    loc: 'B',
    heirsLabel: 'البيت الكبير الدور الثاني شقة ب',
    bedrooms: 2,
    bathrooms: 2,
    monthlyRentSdg: 2_000_000,
    amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Refrigerator, Amenity.Parking, Amenity.Microwave],
  },
  {
    title: 'شقة أرضية بمدخل خاص وسهولة وصول',
    description:
      'شقة أرضية أنيقة بمدخل مستقل يمنحك الخصوصية وسهولة الوصول دون درج — مثالية لكبار السن والعائلات. غرفة نوم، هول، وصالة مفتوحة بإطلالة مريحة، في موقع حيوي بقلب بورتسودان قرب المتاجر والمطاعم.',
    loc: 'B',
    heirsLabel: 'البيت الكبير الدور الأرضي',
    bedrooms: 1,
    bathrooms: 1,
    // Vacant — nightly comparable to the 1-bed شقة أ الأول (1.5M/mo → /30).
    fallbackNightlySdg: 50_000,
    amenities: [Amenity.AirConditioning, Amenity.WiFi, Amenity.Refrigerator, Amenity.Parking],
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) {
    throw new Error('Refusing to seed production without FORCE_SEED=1');
  }

  prisma = (await import('@/lib/db')).db;

  console.log(`🏚️  Heirs homes seed → host ${HOST_EMAIL} (7 homes, Port Sudan, SDG)\n`);

  // 1. Resolve host 0001 (read-only — do not touch the account).
  const host = await prisma.user.findUnique({
    where: { email: HOST_EMAIL },
    select: { id: true },
  });
  if (!host) {
    throw new Error(
      `Host ${HOST_EMAIL} not found. It is a real owner's account — create it ` +
        `deliberately rather than regenerating it; there is no longer a script that ` +
        `mints the numbered slots in bulk.`,
    );
  }

  // 3. Delete ONLY host 0001's existing listings, FK-safe. Scoped strictly to
  //    hostId — nothing owned by any other host is queried or removed.
  const owned = await prisma.listing.findMany({
    where: { hostId: host.id },
    select: { id: true, locationId: true },
  });
  const listingIds = owned.map((l) => l.id);
  const locationIds = owned.map((l) => l.locationId).filter((id): id is number => id != null);

  if (listingIds.length > 0) {
    await prisma.review.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.booking.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.seasonalPricing.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.blockedDate.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.application.deleteMany({ where: { propertyId: { in: listingIds } } });
    await prisma.lease.deleteMany({ where: { propertyId: { in: listingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    if (locationIds.length > 0) {
      await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
    }
  }
  console.log(`🧹 Removed ${listingIds.length} existing listing(s) from ${HOST_EMAIL}\n`);

  // 4. Create the 7 homes.
  let created = 0;
  for (let i = 0; i < HOMES.length; i++) {
    const h = HOMES[i]!;
    const nightly = h.monthlyRentSdg
      ? Math.round(h.monthlyRentSdg / 30)
      : (h.fallbackNightlySdg ?? 50_000);

    const geo = LOCATIONS[h.loc];
    const location = await prisma.location.create({
      data: {
        address: geo.address,
        city: 'Port Sudan',
        state: 'Red Sea',
        country: 'Sudan',
        postalCode: String(11111 + i),
        latitude: geo.latitude,
        longitude: geo.longitude,
      },
    });

    await prisma.listing.create({
      data: {
        title: h.title,
        description: h.description,
        pricePerNight: nightly,
        securityDeposit: nightly * 5,
        photoUrls: [], // real photos added later → app fallback (placeholder.jpg / .svg) shows
        amenities: h.amenities,
        highlights: [Highlight.QuietNeighborhood, Highlight.CloseToTransit, Highlight.GreatView],
        isParkingIncluded: h.amenities.includes(Amenity.Parking),
        bedrooms: h.bedrooms,
        bathrooms: h.bathrooms,
        guestCount: Math.max(2, h.bedrooms * 2),
        propertyType: PropertyType.Apartment,
        postedDate: new Date(),
        draft: false,
        isPublished: true,
        locationId: location.id,
        hostId: host.id,
        cancellationPolicy: CancellationPolicy.Flexible,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        minStay: 1,
        maxStay: 365,
      },
    });
    created += 1;
    console.log(`  ✅ ${h.title} — ${nightly.toLocaleString()} SDG/night, ${h.bedrooms}🛏 ${h.bathrooms}🛁`);
  }

  console.log(`\n🎉 Done. Host ${HOST_EMAIL} (${host.id}) now owns ${created} homes.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
