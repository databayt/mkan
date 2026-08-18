/**
 * Seed the real السكة حديد (Railway District) building onto host 0002@mkan.org.
 *
 * Source: owner-supplied layout for a multi-floor building in حي السكة حديد,
 * Port Sudan — 8 apartment units across the first floor, ground floor, second
 * floor, and rooftop.
 *
 * The building was originally seeded as حي دقنة — wrong neighbourhood, corrected
 * 2026-08-18 on the owner's word. The two are different parts of town (دقنة is
 * the eastern seafront/port corridor, السكة حديد the central railway quarter),
 * so the address, the coordinates, the zone key and the unit names all moved
 * together. Fix them together or the zone key gets re-derived from stale
 * coordinates by `pnpm backfill:zones` and the error comes back. Owner contact 091 284 6648 is set as host 0002's phone so the
 * app's click-to-call reaches the real owner.
 *
 * Scope is deliberately narrow: this ONLY touches host 0002 — it deletes
 * whatever listings 0002 currently owns and replaces them with these 8. No other
 * host is queried or modified.
 *
 * Honesty notes:
 *  - Photos: EMPTY (no real photos supplied) → app fallback shows placeholder.
 *  - Amenities/highlights: EMPTY (owner gave only room layouts; nothing maps to
 *    the Amenity/Highlight enums) → those detail sections self-hide.
 *  - PRICES ARE ESTIMATES, proportional to size — the owner did not give rates.
 *    Replace `estNightlySdg` with the real nightly prices and re-run.
 *
 *   set -a && source .env && set +a && npx tsx scripts/seed-railway-homes.ts
 *
 * Idempotent: re-running wipes 0002's current listings and rebuilds the 8.
 */
import { config } from 'dotenv';
// Load .env BEFORE anything reads process.env; `@/lib/db` is imported dynamically
// inside main() so the Prisma client isn't built against libpq's default DB.
config({ override: true });

import { PropertyType, CancellationPolicy } from '@prisma/client';

const HOST_EMAIL = '0002@mkan.org';
// 091 284 6648 → international E.164 for tel: dialing.
const HOST_PHONE = '+249912846648';

// One real building in حي السكة حديد, Port Sudan. Coordinates are the zone
// centroid from the gazetteer, not a street pin — good enough to place the home
// in the right neighbourhood on the map, and to keep `backfill:zones` resolving
// it to `railway-district`. Every unit shares the building location.
const BUILDING = {
  address: 'السكة حديد، بورتسودان',
  latitude: 19.6210458,
  longitude: 37.2069813,
} as const;

let prisma: (typeof import('@/lib/db'))['db'];

type BuildingUnit = {
  title: string;
  description: string;
  bedrooms: number;
  bathrooms: number;
  estNightlySdg: number; // ESTIMATE — owner to confirm the real rate
};

const UNITS: BuildingUnit[] = [
  {
    title: 'شقة واسعة بأربع غرف وصالتين وبلكونة — الطابق الأول، السكة حديد',
    description:
      'شقة عائلية رحبة في الطابق الأول بحي السكة حديد، بورتسودان. أربع غرف وحمّامان وصالتان وبلكونة ومطبخ — مساحة مثالية للعائلات الكبيرة. للحجز والاستفسار يرجى الاتصال بالمضيف مباشرة.',
    bedrooms: 4,
    bathrooms: 2,
    estNightlySdg: 120_000,
  },
  {
    title: 'شقة أرضية بغرفتين وهول — السكة حديد',
    description:
      'شقة في الطابق الأرضي بحي السكة حديد، بورتسودان. غرفتان وحمّام وهول مريح، بمدخل سهل الوصول دون درج. مناسبة للعائلات الصغيرة وكبار السن. للحجز اتصل بالمضيف.',
    bedrooms: 2,
    bathrooms: 1,
    estNightlySdg: 55_000,
  },
  {
    title: 'شقة أرضية بغرفتين وهول ومطبخ — السكة حديد',
    description:
      'شقة في الطابق الأرضي بحي السكة حديد، بورتسودان. غرفتان وحمّام وهول ومطبخ مستقل، لإقامة عائلية مريحة وعملية. للحجز اتصل بالمضيف.',
    bedrooms: 2,
    bathrooms: 1,
    estNightlySdg: 60_000,
  },
  {
    title: 'شقة بغرفة ومطبخ وهول — الطابق الثاني (الأولى)، السكة حديد',
    description:
      'شقة عملية في الطابق الثاني بحي السكة حديد، بورتسودان: غرفة وحمّام ومطبخ وهول — مثالية للأفراد أو الثنائيات. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 30_000,
  },
  {
    title: 'شقة بغرفة ومطبخ وهول — الطابق الثاني (الثانية)، السكة حديد',
    description:
      'شقة في الطابق الثاني بحي السكة حديد، بورتسودان: غرفة وحمّام ومطبخ وهول، بتهوية جيّدة وموقع حيوي قريب من الخدمات. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 30_000,
  },
  {
    title: 'شقة بغرفة ومطبخ وهول — الطابق الثاني (الثالثة)، السكة حديد',
    description:
      'شقة في الطابق الثاني بحي السكة حديد، بورتسودان: غرفة وحمّام ومطبخ وهول. مساحة عملية لإقامة هادئة في قلب المدينة. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 30_000,
  },
  {
    title: 'شقة سطوح بغرفة ومطبخ وهول — السكة حديد (الأولى)',
    description:
      'شقة في السطوح بحي السكة حديد، بورتسودان، تنعم بتهوية ممتازة وهدوء بعيدًا عن ضجيج الشارع. غرفة وحمّام ومطبخ وهول. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 28_000,
  },
  {
    title: 'شقة سطوح بغرفة ومطبخ وهول — السكة حديد (الثانية)',
    description:
      'شقة في السطوح بحي السكة حديد، بورتسودان: غرفة وحمّام ومطبخ وهول، بإطلالة مفتوحة وتهوية رائعة. مثالية للإقامات الهادئة. للحجز اتصل بالمضيف.',
    bedrooms: 1,
    bathrooms: 1,
    estNightlySdg: 28_000,
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) {
    throw new Error('Refusing to seed production without FORCE_SEED=1');
  }

  prisma = (await import('@/lib/db')).db;

  console.log(`🏢 Railway District building seed → host ${HOST_EMAIL} (${UNITS.length} units, Port Sudan, SDG)\n`);

  // 1. Resolve host 0002 and set the owner's real phone (for click-to-call).
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

  // 2. Delete ONLY host 0002's existing listings, FK-safe.
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

  // 3. Create the 8 units.
  let created = 0;
  for (let i = 0; i < UNITS.length; i++) {
    const u = UNITS[i]!;
    const location = await prisma.location.create({
      data: {
        address: BUILDING.address,
        city: 'Port Sudan',
        state: 'Red Sea',
        country: 'Sudan',
        postalCode: String(22201 + i),
        latitude: BUILDING.latitude,
        longitude: BUILDING.longitude,
        zoneKey: 'railway-district',
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

  console.log(`\n🎉 Done. Host ${HOST_EMAIL} (${host.id}) now owns ${created} homes. Prices are ESTIMATES — confirm with the owner.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
