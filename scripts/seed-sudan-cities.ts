/**
 * Sudan-wide listings seed.
 *
 * Production today only has Port Sudan in the Location table because
 * scripts/seed-listings.ts anchors all 100 demo listings there. The
 * search UI looks broken for any other city the user can name —
 * Khartoum, Omdurman, Wad Madani, etc. — because the data isn't there.
 *
 * This script is **additive**: it skips any city that already has at
 * least one published listing, so:
 *   - First run: seeds Khartoum, Omdurman, Bahri, Wad Madani, Atbara,
 *     Kassala, and Nyala with ~6 listings each (~42 new rows).
 *   - Second run: no-op (every city has data).
 *   - After a real host adds Khartoum listings via the UI: the script
 *     skips Khartoum but still seeds any other empty city.
 *
 * Run with `pnpm seed:sudan` (after pnpm seed:listings sets up hosts —
 * see fallback below).
 */

// CRITICAL ORDER: load .env via the side-effect entry point BEFORE any
// other module (especially @/lib/db) is imported. ES module imports are
// hoisted and execute in source order; if @/lib/db is imported first,
// its module-level `createPrismaClient()` runs against an empty
// process.env and the adapter can't find DATABASE_URL.
import "dotenv/config";

import {
  PropertyType,
  Amenity,
  Highlight,
  CancellationPolicy,
} from "@prisma/client";
import bcrypt from "bcryptjs";
// Reuse the app's PrismaClient so we get the same Neon/PG adapter
// selection and connection pool config the running app uses.
import { db as prisma } from "@/lib/db";

const DEMO_PASSWORD = "123456";

// ─── Hosts ──────────────────────────────────────────────────────────────────
// Reuse the same Sudanese hosts as scripts/seed-listings.ts. Upsert by email,
// so this script is safe to run before, after, or instead of seed-listings.
// We need a small pool — one host per ~6 listings keeps the data plausible.
const SEED_HOSTS = [
  { slug: "ahmed-altayeb",      displayName: "Ahmed Al-Tayeb" },
  { slug: "fatima-abdallah",    displayName: "Fatima Abdallah" },
  { slug: "mohammed-osman",     displayName: "Mohammed Osman" },
  { slug: "aisha-elmahdi",      displayName: "Aisha El-Mahdi" },
  { slug: "omar-bashir",        displayName: "Omar Bashir" },
  { slug: "zainab-hassan",      displayName: "Zainab Hassan" },
  { slug: "ibrahim-awad",       displayName: "Ibrahim Awad" },
] as const;

// ─── Cities ─────────────────────────────────────────────────────────────────
// Real Sudanese cities + states + plausible neighborhoods + lat/lng
// approximating each city's centroid. Coordinates are good-enough to put a
// pin in the right region of the map; a real listing would override these.
//
// Price tiers reflect the relative market: capital and twin-cities (Khartoum,
// Omdurman, Bahri) are the priciest; secondary cities sit lower.
type CitySpec = {
  city: string;
  state: string;
  country: "Sudan";
  lat: number;
  lng: number;
  /** Multiplier applied to the base price tier per property type. */
  priceMultiplier: number;
  neighborhoods: readonly string[];
};

const CITIES: readonly CitySpec[] = [
  {
    city: "Khartoum",
    state: "Khartoum",
    country: "Sudan",
    lat: 15.5007,
    lng: 32.5599,
    priceMultiplier: 1.4,
    neighborhoods: [
      "Riyadh",
      "Amarat",
      "Garden City",
      "Al-Manshia",
      "Khartoum 2",
      "Khartoum East",
    ],
  },
  {
    city: "Omdurman",
    state: "Khartoum",
    country: "Sudan",
    lat: 15.6445,
    lng: 32.4781,
    priceMultiplier: 1.2,
    neighborhoods: [
      "Wad Nubawi",
      "Al-Mulazmin",
      "Abu Saeed",
      "Beit Al-Mal",
      "Al-Thawra",
      "Old Souq",
    ],
  },
  {
    city: "Bahri",
    state: "Khartoum",
    country: "Sudan",
    lat: 15.6354,
    lng: 32.557,
    priceMultiplier: 1.1,
    neighborhoods: [
      "Shambat",
      "Kafouri",
      "Al-Halfaya",
      "Old Bahri",
      "Khartoum North Riverside",
      "Industrial Quarter",
    ],
  },
  {
    city: "Wad Madani",
    state: "Al Jazirah",
    country: "Sudan",
    lat: 14.4006,
    lng: 33.5198,
    priceMultiplier: 0.85,
    neighborhoods: [
      "Al-Hasahisa",
      "Al-Wahda",
      "City Center",
      "University Area",
      "Blue Nile Riverside",
      "South Madani",
    ],
  },
  {
    city: "Atbara",
    state: "River Nile",
    country: "Sudan",
    lat: 17.7029,
    lng: 33.9858,
    priceMultiplier: 0.75,
    neighborhoods: [
      "Damer Road",
      "Shendi Road",
      "Mile One",
      "Railway Quarter",
      "Atbara Riverside",
      "South Atbara",
    ],
  },
  {
    city: "Kassala",
    state: "Kassala",
    country: "Sudan",
    lat: 15.4509,
    lng: 36.4001,
    priceMultiplier: 0.8,
    neighborhoods: [
      "Al-Khatmiyya",
      "Al-Salam",
      "Taka Mountain Area",
      "City Center",
      "Gash Riverside",
      "North Kassala",
    ],
  },
  {
    city: "Nyala",
    state: "South Darfur",
    country: "Sudan",
    lat: 12.0489,
    lng: 24.8807,
    priceMultiplier: 0.7,
    neighborhoods: [
      "Al-Wahda",
      "Al-Salam",
      "City Center",
      "El Geneina Road",
      "South Nyala",
      "Airport District",
    ],
  },
] as const;

// ─── Property mix ───────────────────────────────────────────────────────────
// Same 6-slot cycle as seed-listings.ts: 50% apartments (most common in
// Sudanese cities), 17% villas, the rest a mix.
const PROPERTY_CYCLE: readonly PropertyType[] = [
  PropertyType.Apartment,
  PropertyType.Apartment,
  PropertyType.Apartment,
  PropertyType.Villa,
  PropertyType.Townhouse,
  PropertyType.Cottage,
] as const;

// Same Unsplash pool as seed-listings.ts so we don't duplicate the
// remotePatterns whitelist in next.config.
const PHOTO_POOL = [
  "https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800",
  "https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800",
  "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800",
  "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=800",
  "https://images.unsplash.com/photo-1555854877-bab0e5b6856c?w=800",
  "https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800",
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800",
  "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800",
  "https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800",
  "https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800",
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800",
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800",
];

const ADJECTIVES = [
  "Cozy",
  "Modern",
  "Spacious",
  "Stylish",
  "Charming",
  "Traditional",
  "Contemporary",
  "Family",
];

const CANCELLATION_CYCLE: readonly CancellationPolicy[] = [
  CancellationPolicy.Flexible,
  CancellationPolicy.Flexible,
  CancellationPolicy.Moderate,
  CancellationPolicy.Firm,
] as const;

/** Per-property-type baseline. City multiplier scales this. */
function specFor(type: PropertyType, idx: number, cityMul: number) {
  const base = (() => {
    switch (type) {
      case PropertyType.Rooms:
        return { price: 30, bedrooms: 1, bathrooms: 1.0, sqft: 220, guests: 2, cleaningFee: 10 };
      case PropertyType.Tinyhouse:
        return { price: 45, bedrooms: 1, bathrooms: 1.0, sqft: 280, guests: 2, cleaningFee: 15 };
      case PropertyType.Apartment:
        return { price: 65 + (idx % 40), bedrooms: 1 + (idx % 3), bathrooms: 1.0 + ((idx % 3) * 0.5), sqft: 600 + (idx % 600), guests: 2 + (idx % 4), cleaningFee: 20 };
      case PropertyType.Townhouse:
        return { price: 130 + (idx % 60), bedrooms: 2 + (idx % 3), bathrooms: 2.0, sqft: 1100, guests: 4 + (idx % 3), cleaningFee: 35 };
      case PropertyType.Cottage:
        return { price: 90 + (idx % 40), bedrooms: 2, bathrooms: 1.5, sqft: 750, guests: 3 + (idx % 2), cleaningFee: 25 };
      case PropertyType.Villa:
        return { price: 200 + (idx % 100), bedrooms: 3 + (idx % 3), bathrooms: 2.5, sqft: 2000 + (idx % 1500), guests: 6 + (idx % 4), cleaningFee: 50 };
    }
  })();
  return { ...base, price: Math.round(base.price * cityMul) };
}

function amenitiesFor(type: PropertyType): Amenity[] {
  if (type === PropertyType.Villa || type === PropertyType.Townhouse) {
    return [Amenity.AirConditioning, Amenity.WiFi, Amenity.Parking, Amenity.WasherDryer, Amenity.Pool];
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
  if (process.env.NODE_ENV === "production" && !process.env.FORCE_SEED) {
    throw new Error("Refusing to seed production without FORCE_SEED=1");
  }

  const started = Date.now();
  console.log(`🌍 Sudan-wide cities seed — additive, skips cities that already have listings\n`);

  // 1. Upsert hosts (reuses scripts/seed-listings.ts hosts via shared emails).
  console.log("👥 Upserting hosts...");
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const hosts = await Promise.all(
    SEED_HOSTS.map((h) => {
      const email = `${h.slug.replace(/-/g, "")}@mkan.org`;
      return prisma.user.upsert({
        where: { email },
        update: { username: h.slug, role: "MANAGER" },
        create: {
          email,
          username: h.slug,
          password: passwordHash,
          role: "MANAGER",
          emailVerified: new Date(),
        },
      });
    }),
  );
  console.log(`✅ ${hosts.length} hosts ready\n`);

  // 2. For each city, count existing published listings. Skip cities that
  //    already have data so re-runs are no-ops and real-host data wins.
  let totalCreated = 0;
  let totalSkipped = 0;

  for (const city of CITIES) {
    const existing = await prisma.listing.count({
      where: {
        isPublished: true,
        draft: false,
        location: { is: { city: city.city, state: city.state, country: city.country } },
      },
    });

    if (existing > 0) {
      console.log(`⏭️  ${city.city} — ${existing} listing(s) already, skipping`);
      totalSkipped += existing;
      continue;
    }

    console.log(`🏙️  ${city.city} — seeding ${city.neighborhoods.length} listings...`);

    for (let i = 0; i < city.neighborhoods.length; i++) {
      const district = city.neighborhoods[i]!;
      const idx = totalCreated + i + 1;
      const adj = ADJECTIVES[idx % ADJECTIVES.length]!;
      const type = PROPERTY_CYCLE[i % PROPERTY_CYCLE.length]!;
      const spec = specFor(type, idx, city.priceMultiplier);
      const host = hosts[idx % hosts.length]!;

      // Per-listing photo slice: 4 images cycling through the pool
      // starting at a city-stable offset so each listing has a distinct
      // first photo but the set is deterministic across re-runs.
      const photoOffset = (city.city.length + i) % PHOTO_POOL.length;
      const photoSlice = [
        PHOTO_POOL[photoOffset]!,
        PHOTO_POOL[(photoOffset + 1) % PHOTO_POOL.length]!,
        PHOTO_POOL[(photoOffset + 2) % PHOTO_POOL.length]!,
        PHOTO_POOL[(photoOffset + 3) % PHOTO_POOL.length]!,
      ];

      // Coordinates: small jitter around the city centroid keeps map
      // markers from stacking on top of each other.
      const latJitter = ((i * 17) % 50 - 25) / 1000; // ±0.025°
      const lngJitter = ((i * 23) % 50 - 25) / 1000;

      const location = await prisma.location.create({
        data: {
          address: `${district} District, Building ${idx}`,
          city: city.city,
          state: city.state,
          country: city.country,
          postalCode: String(idx).padStart(5, "0"),
          latitude: city.lat + latJitter,
          longitude: city.lng + lngJitter,
        },
      });

      await prisma.listing.create({
        data: {
          title: `${adj} ${type} in ${district}, ${city.city}`,
          description: `Comfortable ${type.toLowerCase()} in ${city.city}, in the ${district} district. Convenient access to local amenities and the city center. Suited for short stays and longer visits alike.`,
          pricePerNight: spec.price,
          securityDeposit: spec.price * 5,
          applicationFee: spec.cleaningFee + 5,
          photoUrls: photoSlice,
          amenities: amenitiesFor(type),
          highlights: [Highlight.GreatView, Highlight.RecentlyRenovated, Highlight.CloseToTransit],
          isPetsAllowed: idx % 3 === 0,
          isParkingIncluded: type !== PropertyType.Rooms && type !== PropertyType.Tinyhouse,
          bedrooms: spec.bedrooms,
          bathrooms: spec.bathrooms,
          squareFeet: spec.sqft,
          guestCount: spec.guests,
          propertyType: type,
          postedDate: addDays(new Date(), -(idx % 60)),
          draft: false,
          isPublished: true,
          instantBook: idx % 2 === 0,
          locationId: location.id,
          hostId: host.id,
          cleaningFee: spec.cleaningFee,
          cancellationPolicy: CANCELLATION_CYCLE[i % CANCELLATION_CYCLE.length]!,
          checkInTime: "15:00",
          checkOutTime: "11:00",
          minStay: 1 + (i % 3),
          maxStay: 28 + (i % 60),
        },
      });

      totalCreated++;
    }

    console.log(`   ✅ ${city.neighborhoods.length} listings in ${city.city}\n`);
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log("─".repeat(60));
  console.log(`🌍 Done in ${elapsed}s — created ${totalCreated} listings, skipped ${totalSkipped} pre-existing`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
