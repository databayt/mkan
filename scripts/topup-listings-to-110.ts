/**
 * Non-destructive top-up: ensure exactly 110 published Port Sudan listings.
 *
 * The full `seed-listings.ts` WIPES homes tables (listings/bookings/reviews) and
 * rebuilds them — heavy and risky against a cold Neon branch. This script only
 * adds the shortfall (e.g. 100 → 110) so the search page reads "110 homes",
 * matching airbnb.com/s/homes?location_search=NEARBY. The added listings carry
 * no bookings/reviews, so they render as "New" cards (exactly like several of
 * the reference's cards). Idempotent: re-running creates nothing once at ≥110.
 *
 *   pnpm tsx scripts/topup-listings-to-110.ts
 */
import { config } from 'dotenv';
// Load .env BEFORE anything reads process.env. `override:true` makes .env win
// over any stale DATABASE_URL already in the shell. Crucially, `@/lib/db` is
// imported dynamically inside main() (not at top level) — a static import is
// ESM-hoisted and would build the Prisma client before this runs, falling back
// to libpq's default database (the OS username) and erroring out.
config({ override: true });

import {
  PropertyType,
  Amenity,
  Highlight,
  CancellationPolicy,
} from '@prisma/client';

const TARGET = 110;

// Assigned inside main() after .env loads (see the deferred import there).
let prisma: (typeof import("@/lib/db"))["db"];

const DISTRICTS = [
  'Deim Arab', 'Deim Sawakin', 'Al-Transit', 'Salah El-Din', 'Deim Madrasa',
  'Al-Shaabi', 'Port Sudan Central', 'Coral Coast', 'Suakin Island', 'Marina District',
  'Al-Thawra', 'New Halfa Sq', 'Airport District', 'Red Sea University Area', 'Flamingo Bay',
  'Free Zone', 'Old Town', 'Corniche', 'Industrial Port', 'Diving Harbor',
];

const ADJECTIVES = [
  'Beachfront', 'Cozy', 'Modern', 'Sea View', 'Luxury',
  'Stylish', 'Charming', 'Traditional', 'Contemporary', 'Spacious',
];

// 10-slot cycle: 40% Apartment, 20% Villa, 10% each of the rest (same as the seed).
const PROPERTY_CYCLE: PropertyType[] = [
  PropertyType.Apartment, PropertyType.Apartment, PropertyType.Apartment, PropertyType.Apartment,
  PropertyType.Villa, PropertyType.Villa,
  PropertyType.Townhouse,
  PropertyType.Cottage,
  PropertyType.Rooms,
  PropertyType.Tinyhouse,
];

const PHOTO_POOL = [
  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
  'https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800',
  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
  'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
  'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
  'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
];

function specFor(type: PropertyType, idx: number) {
  switch (type) {
    case PropertyType.Rooms:
      return { price: 30 + (idx % 40), bedrooms: 1, bathrooms: 1.0, sqft: 200 + (idx % 100), guests: 2, cleaningFee: 10 };
    case PropertyType.Tinyhouse:
      return { price: 45 + (idx % 45), bedrooms: 1, bathrooms: 1.0, sqft: 250 + (idx % 200), guests: 2, cleaningFee: 15 };
    case PropertyType.Apartment:
      return { price: 60 + (idx % 120), bedrooms: 1 + (idx % 3), bathrooms: 1.0 + ((idx % 3) * 0.5), sqft: 500 + (idx % 1000), guests: 2 + (idx % 4), cleaningFee: 20 };
    case PropertyType.Townhouse:
      return { price: 120 + (idx % 130), bedrooms: 2 + (idx % 3), bathrooms: 2.0 + ((idx % 2) * 0.5), sqft: 1000 + (idx % 1500), guests: 4 + (idx % 4), cleaningFee: 35 };
    case PropertyType.Cottage:
      return { price: 80 + (idx % 80), bedrooms: 2 + (idx % 2), bathrooms: 1.5, sqft: 700 + (idx % 800), guests: 3 + (idx % 3), cleaningFee: 25 };
    case PropertyType.Villa:
      return { price: 180 + (idx % 220), bedrooms: 3 + (idx % 3), bathrooms: 2.5 + ((idx % 2) * 1.0), sqft: 1800 + (idx % 2500), guests: 6 + (idx % 6), cleaningFee: 50 };
  }
}

function amenitiesFor(type: PropertyType): Amenity[] {
  if (type === PropertyType.Villa || type === PropertyType.Townhouse) {
    return [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.Dishwasher, Amenity.Pool];
  }
  if (type === PropertyType.Apartment) {
    return [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.Refrigerator];
  }
  if (type === PropertyType.Cottage) {
    return [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.PetsAllowed];
  }
  return [Amenity.AirConditioning, Amenity.WiFi];
}

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) {
    throw new Error('Refusing to seed production without FORCE_SEED=1');
  }

  // Deferred import: env is loaded by now, so the client binds to DATABASE_URL.
  prisma = (await import('@/lib/db')).db;

  const current = await prisma.listing.count({ where: { isPublished: true, draft: false } });
  console.log(`📊 Published listings now: ${current} (target ${TARGET})`);

  if (current >= TARGET) {
    console.log('✅ Already at/above target — nothing to add.');
    return;
  }

  // Reuse the existing numbered host slots (0001@mkan.org … ). Fall back to any
  // MANAGER if the demo hosts aren't present.
  let hosts = await prisma.user.findMany({
    where: { email: { endsWith: '@mkan.org' }, role: 'MANAGER' },
    select: { id: true },
    orderBy: { email: 'asc' },
  });
  if (hosts.length === 0) {
    hosts = await prisma.user.findMany({ where: { role: 'MANAGER' }, select: { id: true }, take: 20 });
  }
  if (hosts.length === 0) throw new Error('No MANAGER hosts found — run `pnpm seed:listings` first.');

  const toCreate = TARGET - current;
  console.log(`🏠 Adding ${toCreate} "New" listings (no bookings/reviews) across ${hosts.length} hosts...`);

  const now = new Date();
  for (let k = 0; k < toCreate; k++) {
    // Continue the seed's idx sequence past the existing rows so titles,
    // postal codes and coordinates stay in the same Port Sudan pattern.
    const idx = current + k + 1;
    const district = DISTRICTS[(idx - 1) % DISTRICTS.length]!;
    const adj = ADJECTIVES[(idx - 1) % ADJECTIVES.length]!;
    const type = PROPERTY_CYCLE[(idx - 1) % PROPERTY_CYCLE.length]!;
    const spec = specFor(type, idx)!;
    const host = hosts[k % hosts.length]!;

    const photoSlice = [
      PHOTO_POOL[(idx - 1) % PHOTO_POOL.length]!,
      PHOTO_POOL[idx % PHOTO_POOL.length]!,
      PHOTO_POOL[(idx + 1) % PHOTO_POOL.length]!,
      PHOTO_POOL[(idx + 2) % PHOTO_POOL.length]!,
    ];

    const location = await prisma.location.create({
      data: {
        address: `${district} Street, Building ${idx}`,
        city: 'Port Sudan',
        state: 'Red Sea',
        country: 'Sudan',
        postalCode: String(idx).padStart(5, '0'),
        latitude: 19.58 + ((idx * 7) % 80) / 1000,
        longitude: 37.19 + ((idx * 13) % 70) / 1000,
      },
    });

    await prisma.listing.create({
      data: {
        title: `${adj} ${type} in ${district} Street, Building ${idx}`,
        description: `Comfortable ${type.toLowerCase()} in Port Sudan, within easy reach of the Red Sea coast and the city center. Ideal for short and long stays.`,
        pricePerNight: spec.price,
        securityDeposit: spec.price * 5,
        applicationFee: spec.cleaningFee + 5,
        photoUrls: photoSlice,
        amenities: amenitiesFor(type),
        highlights: [Highlight.GreatView, Highlight.RecentlyRenovated, Highlight.CloseToTransit],
        isPetsAllowed: idx % 3 === 0,
        isParkingIncluded: [PropertyType.Villa, PropertyType.Townhouse, PropertyType.Apartment, PropertyType.Cottage].includes(type),
        bedrooms: spec.bedrooms,
        bathrooms: spec.bathrooms,
        squareFeet: spec.sqft,
        guestCount: spec.guests,
        propertyType: type,
        // Recent so they surface near the top as fresh "New" listings.
        postedDate: addDays(now, -(k % 7)),
        draft: false,
        isPublished: true,
        instantBook: idx % 2 === 0,
        locationId: location.id,
        hostId: host.id,
        cleaningFee: spec.cleaningFee,
        cancellationPolicy: CancellationPolicy.Flexible,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        minStay: 1 + (idx % 3),
        maxStay: 28 + (idx % 90),
      },
    });
  }

  const total = await prisma.listing.count({ where: { isPublished: true, draft: false } });
  console.log(`✅ Done. Published listings now: ${total}`);
}

main()
  .catch((e) => {
    console.error('❌ Top-up failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
