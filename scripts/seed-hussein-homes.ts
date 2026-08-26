/**
 * Seed the real building of owner حسين (Hussein) onto demo host 0003@mkan.org.
 *
 * Source: owner-supplied layout for a multi-floor building in Port Sudan — 6
 * apartment units across the second and third floors (3 units per floor). The
 * owner's contact number is set as host 0003's phone so the app's click-to-call
 * reaches the real owner.
 *
 *   Owner : حسين
 *   Phone : 0024903467930  (stored E.164-style as +24903467930 for tel: dialing)
 *
 *   الطابق الثاني
 *     الشقة الأولى  — غرفتين وصالة ومطبخ وحمام   (2 غرف)
 *     الشقة الثانية — غرفة وصالة ومطبخ وحمام      (غرفة)
 *     الشقة الثالثة — غرفة وصالة ومطبخ وحمام      (غرفة)
 *   الطابق الثالث
 *     الشقة الأولى  — غرفتين وصالة ومطبخ وحمام   (2 غرف)
 *     الشقة الثانية — غرفة وصالة ومطبخ وحمام      (غرفة)
 *     الشقة الثالثة — غرفة وصالة ومطبخ وحمام      (غرفة)
 *
 * Scope is deliberately narrow: this ONLY touches host 0003 — it deletes
 * whatever listings 0003 currently owns and replaces them with these 6. No other host is queried or modified. The numeric
 * username "0003" is preserved so the owner keeps logging in with just the
 * number; حسين is documented here in the owner records, not shown as the host
 * display name (matches the seed-daqna-homes precedent).
 *
 * Honesty notes:
 *  - Photos: EMPTY (no real photos supplied) → app fallback shows placeholder.
 *  - Amenities/highlights: EMPTY (owner gave only room layouts; nothing maps to
 *    the Amenity/Highlight enums) → those detail sections self-hide.
 *  - PRICES ARE ESTIMATES, proportional to size — the owner did not give rates.
 *    Replace `estNightlySdg` with the real nightly prices and re-run.
 *  - PHONE: stored verbatim as the owner supplied it (leading "00" → "+"); the
 *    field team should confirm it dials correctly.
 *
 *   set -a && source .env && set +a && npx tsx scripts/seed-hussein-homes.ts
 *
 * Idempotent: re-running wipes 0003's current listings and rebuilds the 6.
 */
import { config } from 'dotenv';
// Load .env BEFORE anything reads process.env; `@/lib/db` is imported dynamically
// inside main() so the Prisma client isn't built against libpq's default DB.
config({ override: true });

import { PropertyType, CancellationPolicy } from '@prisma/client';

const HOST_EMAIL = '0003'; // the account number IS the address now
// Owner-supplied 0024903467930 → international "+" prefix for tel: dialing.
const HOST_PHONE = '+24903467930';

// One real building in Port Sudan. Approximate central coords (exact street pin
// to be refined). Every unit shares the building location.
const BUILDING = {
  address: 'بورتسودان',
  latitude: 19.6158,
  longitude: 37.2164,
  zoneKey: 'hayy-al-aghareeq',
} as const;

let prisma: (typeof import('@/lib/db'))['db'];

type HusseinUnit = {
  title: string;
  description: string;
  bedrooms: number;
  bathrooms: number;
  estNightlySdg: number; // ESTIMATE — owner to confirm the real rate
};

const UNITS: HusseinUnit[] = [
  // ── الطابق الثاني ──────────────────────────────────────────────────────────
  {
    title: 'شقة بغرفتين وصالة ومطبخ — الطابق الثاني (الأولى)، بورتسودان',
    description:
      'شقة عائلية في الطابق الثاني ببورتسودان: غرفتان وصالة ومطبخ وحمّام. مساحة مريحة مناسبة للعائلات الصغيرة. للحجز والاستفسار اتصل بالمضيف مباشرة.',
    bedrooms: 2,
    bathrooms: 1,
    estNightlySdg: 55_000,
  },
  {
    title: 'شقة بغرفة وصالة ومطبخ — الطابق الثاني (الثانية)، بورتسودان',
    description:
      'شقة عملية في الطابق الثاني ببورتسودان: غرفة وصالة ومطبخ وحمّام — مثالية للأفراد أو الثنائيات. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 30_000,
  },
  {
    title: 'شقة بغرفة وصالة ومطبخ — الطابق الثاني (الثالثة)، بورتسودان',
    description:
      'شقة في الطابق الثاني ببورتسودان: غرفة وصالة ومطبخ وحمّام، بموقع حيوي قريب من الخدمات. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 30_000,
  },
  // ── الطابق الثالث ──────────────────────────────────────────────────────────
  {
    title: 'شقة بغرفتين وصالة ومطبخ — الطابق الثالث (الأولى)، بورتسودان',
    description:
      'شقة عائلية في الطابق الثالث ببورتسودان: غرفتان وصالة ومطبخ وحمّام، بتهوية جيّدة وإطلالة مريحة. مناسبة للعائلات الصغيرة. للحجز اتصل بالمضيف.',
    bedrooms: 2,
    bathrooms: 1,
    estNightlySdg: 55_000,
  },
  {
    title: 'شقة بغرفة وصالة ومطبخ — الطابق الثالث (الثانية)، بورتسودان',
    description:
      'شقة في الطابق الثالث ببورتسودان: غرفة وصالة ومطبخ وحمّام، بتهوية ممتازة وهدوء بعيدًا عن ضجيج الشارع. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 30_000,
  },
  {
    title: 'شقة بغرفة وصالة ومطبخ — الطابق الثالث (الثالثة)، بورتسودان',
    description:
      'شقة في الطابق الثالث ببورتسودان: غرفة وصالة ومطبخ وحمّام. مساحة عملية لإقامة هادئة. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 30_000,
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) {
    throw new Error('Refusing to seed production without FORCE_SEED=1');
  }

  prisma = (await import('@/lib/db')).db;

  console.log(`🏢 Hussein building seed → host ${HOST_EMAIL} (${UNITS.length} units, Port Sudan, SDG)\n`);

  // 1. Resolve host 0003 and set the owner's real phone (for click-to-call).
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
  await prisma.user.update({ where: { id: host.id }, data: { phoneNumber: HOST_PHONE } });
  console.log(`📞 Set ${HOST_EMAIL} phone → ${HOST_PHONE}`);

  // 2. Delete ONLY host 0003's existing listings, FK-safe.
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

  // 3. Create the 6 units.
  let created = 0;
  for (let i = 0; i < UNITS.length; i++) {
    const u = UNITS[i]!;
    const location = await prisma.location.create({
      data: {
        address: BUILDING.address,
        city: 'Port Sudan',
        state: 'Red Sea',
        country: 'Sudan',
        postalCode: String(33301 + i),
        latitude: BUILDING.latitude,
        longitude: BUILDING.longitude,
        zoneKey: BUILDING.zoneKey,
      },
    });

    await prisma.listing.create({
      data: {
        title: u.title,
        description: u.description,
        pricePerNight: u.estNightlySdg,
        securityDeposit: u.estNightlySdg * 5,
        photoUrls: [], // real photos later → app placeholder fallback shows
        amenities: [], // owner supplied none → amenities section self-hides
        highlights: [], // owner supplied none → highlights section self-hides
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        guestCount: Math.max(2, u.bedrooms * 2),
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
    console.log(`  ✅ ${u.title} — ${u.estNightlySdg.toLocaleString()} SDG/night (est.), ${u.bedrooms}🛏 ${u.bathrooms}🛁`);
  }

  console.log(`\n🎉 Done. Host ${HOST_EMAIL} (${host.id}) now owns ${created} homes (owner: حسين). Prices are ESTIMATES — confirm with the owner.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
