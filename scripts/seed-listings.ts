import { config } from 'dotenv';
config();

import {
  PrismaClient,
  PropertyType,
  Amenity,
  Highlight,
  CancellationPolicy,
  BookingStatus,
} from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DEMO_PASSWORD = '123456';

// ─── Hosts ──────────────────────────────────────────────────────────────────
// 20 real-sounding Sudanese hosts. Username = slug. All anchored at Port Sudan.
interface HostRow {
  slug: string;
  displayName: string;
}

const HOSTS: HostRow[] = [
  { slug: 'ahmed-altayeb',       displayName: 'Ahmed Al-Tayeb' },
  { slug: 'fatima-abdallah',     displayName: 'Fatima Abdallah' },
  { slug: 'mohammed-osman',      displayName: 'Mohammed Osman' },
  { slug: 'aisha-elmahdi',       displayName: 'Aisha El-Mahdi' },
  { slug: 'omar-bashir',         displayName: 'Omar Bashir' },
  { slug: 'zainab-hassan',       displayName: 'Zainab Hassan' },
  { slug: 'ibrahim-awad',        displayName: 'Ibrahim Awad' },
  { slug: 'khadija-nur',         displayName: 'Khadija Nur' },
  { slug: 'abdelrahman-sheikh',  displayName: 'Abdelrahman Sheikh' },
  { slug: 'maryam-salim',        displayName: 'Maryam Salim' },
  { slug: 'yasir-alamin',        displayName: 'Yasir Al-Amin' },
  { slug: 'noor-ali',            displayName: 'Noor Ali' },
  { slug: 'tariq-saeed',         displayName: 'Tariq Saeed' },
  { slug: 'huda-musa',           displayName: 'Huda Musa' },
  { slug: 'hisham-eltom',        displayName: 'Hisham El-Tom' },
  { slug: 'safia-omer',          displayName: 'Safia Omer' },
  { slug: 'walid-khalifa',       displayName: 'Walid Khalifa' },
  { slug: 'amira-abdelrahim',    displayName: 'Amira Abdelrahim' },
  { slug: 'salah-mahmoud',       displayName: 'Salah Mahmoud' },
  { slug: 'leila-hassan',        displayName: 'Leila Hassan' },
];

const GUEST_COUNT = 5;

// ─── Port Sudan districts (for address variety) ─────────────────────────────
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

// 10-slot cycle that gives 40% Apartment, 20% Villa, 10% each of the rest
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
  'https://images.unsplash.com/photo-1555854877-bab0e5b6856c?w=800',
  'https://images.unsplash.com/photo-1613490493576-7fde63acd811?w=800',
  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
  'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
  'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
  'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?w=800',
  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
  'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800',
];

const REVIEW_COMMENTS = [
  'Great host and clean place. Highly recommend for Port Sudan stays!',
  'Location was perfect, close to the Red Sea. Would stay again.',
  'Very comfortable and the host was responsive. Enjoyed the trip.',
  'Decent stay overall. Minor issues but host handled them well.',
  'Excellent value for the price. Beautiful sea breeze at night.',
  'Spotless and welcoming. A pleasant surprise.',
  'Good amenities, though a bit far from downtown.',
  'Perfect for a family visit. Kids loved the space.',
];

// ─── Pricing + attributes per property type ─────────────────────────────────
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

const CANCELLATION_CYCLE: CancellationPolicy[] = [
  CancellationPolicy.Flexible, CancellationPolicy.Flexible,
  CancellationPolicy.Moderate, CancellationPolicy.Moderate,
  CancellationPolicy.Firm, CancellationPolicy.Strict,
];

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) {
    throw new Error('Refusing to seed production without FORCE_SEED=1');
  }

  const started = Date.now();
  console.log(`🏠 Homes seed — 20 Port Sudan hosts × 5 listings, password "${DEMO_PASSWORD}"\n`);

  // 1. Wipe homes-vertical tables in FK-safe order (keep User to preserve real accounts — upsert hosts)
  console.log('🧹 Clearing homes tables...');
  await prisma.review.deleteMany();
  await prisma.blockedDate.deleteMany();
  await prisma.seasonalPricing.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.application.deleteMany();
  await prisma.lease.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.listing.deleteMany();
  await prisma.location.deleteMany();
  console.log('✅ Cleared\n');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 2. Upsert 20 host users
  //    Email localpart drops hyphens — `ahmed-altayeb` → `ahmedaltayeb@mkan.org`.
  //    Username keeps the slug with hyphens so login still works with either form.
  console.log('👥 Upserting hosts...');
  const hostUsers = await Promise.all(
    HOSTS.map((h) => {
      const email = `${h.slug.replace(/-/g, '')}@mkan.org`;
      return prisma.user.upsert({
        where: { email },
        update: { username: h.slug, password: passwordHash, role: 'MANAGER', emailVerified: new Date() },
        create: {
          email,
          username: h.slug,
          password: passwordHash,
          role: 'MANAGER',
          emailVerified: new Date(),
        },
      });
    }),
  );
  console.log(`✅ ${hostUsers.length} hosts ready\n`);

  // 3. Upsert 5 guest users for bookings
  console.log('🧳 Upserting guests...');
  const guestUsers = await Promise.all(
    Array.from({ length: GUEST_COUNT }, (_, i) => i + 1).map((n) =>
      prisma.user.upsert({
        where: { email: `traveler${n}@mkan.org` },
        update: { username: `traveler${n}`, password: passwordHash, emailVerified: new Date() },
        create: {
          email: `traveler${n}@mkan.org`,
          username: `traveler${n}`,
          password: passwordHash,
          role: 'USER',
          emailVerified: new Date(),
        },
      }),
    ),
  );
  console.log(`✅ ${guestUsers.length} guests ready\n`);

  // 4. Create 100 Locations + Listings (5 per host)
  console.log('🏠 Creating locations + listings...');
  const listings: { id: number; type: PropertyType; price: number; cleaningFee: number }[] = [];

  for (let idx = 1; idx <= 100; idx++) {
    const district = DISTRICTS[(idx - 1) % DISTRICTS.length]!;
    const adj = ADJECTIVES[(idx - 1) % ADJECTIVES.length]!;
    const type = PROPERTY_CYCLE[(idx - 1) % PROPERTY_CYCLE.length]!;
    const spec = specFor(type, idx);
    const host = hostUsers[Math.floor((idx - 1) / 5)]!;

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

    const listing = await prisma.listing.create({
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
        postedDate: addDays(new Date(), -(idx % 60)),
        draft: false,
        isPublished: true,
        instantBook: idx % 2 === 0,
        locationId: location.id,
        hostId: host.id,
        cleaningFee: spec.cleaningFee,
        cancellationPolicy: CANCELLATION_CYCLE[(idx - 1) % CANCELLATION_CYCLE.length]!,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        minStay: 1 + (idx % 3),
        maxStay: 28 + (idx % 90),
      },
    });

    listings.push({ id: listing.id, type, price: spec.price, cleaningFee: spec.cleaningFee });
  }
  console.log(`✅ ${listings.length} listings created\n`);

  // 5. Bookings: 3 per listing (2 completed + 1 future confirmed)
  console.log('📆 Creating bookings...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const BOOKING_SLOTS = [
    { dayOffset: -90, nights: 3, status: BookingStatus.Completed },
    { dayOffset: -45, nights: 2, status: BookingStatus.Completed },
    { dayOffset:  40, nights: 4, status: BookingStatus.Confirmed },
  ];

  const bookings: { id: number; listingId: number; guestId: string; checkedOutAt: Date | null; status: BookingStatus }[] = [];

  for (const l of listings) {
    for (const slot of BOOKING_SLOTS) {
      const checkIn = addDays(today, slot.dayOffset);
      const checkOut = addDays(checkIn, slot.nights);
      const guest = guestUsers[(l.id * 3 + slot.dayOffset + 99) % guestUsers.length]!;
      const subtotal = l.price * slot.nights;
      const serviceFee = subtotal * 0.1;
      const total = subtotal + l.cleaningFee + serviceFee;

      const booking = await prisma.booking.create({
        data: {
          listingId: l.id,
          guestId: guest.id,
          checkIn,
          checkOut,
          guestCount: 1 + (l.id % 3),
          nightlyRate: l.price,
          nightsCount: slot.nights,
          subtotal,
          cleaningFee: l.cleaningFee,
          serviceFee,
          totalPrice: total,
          status: slot.status,
          confirmedAt: addDays(checkIn, -10),
          checkedInAt: slot.status === BookingStatus.Completed ? checkIn : null,
          checkedOutAt: slot.status === BookingStatus.Completed ? checkOut : null,
        },
      });
      bookings.push({ id: booking.id, listingId: l.id, guestId: guest.id, checkedOutAt: booking.checkedOutAt, status: slot.status });
    }
  }
  console.log(`✅ ${bookings.length} bookings created\n`);

  // 6. Reviews — one per completed booking
  console.log('⭐ Creating reviews...');
  let reviewCount = 0;
  for (const b of bookings) {
    if (b.status !== BookingStatus.Completed || !b.checkedOutAt) continue;
    await prisma.review.create({
      data: {
        listingId: b.listingId,
        bookingId: b.id,
        reviewerId: b.guestId,
        rating: 3 + ((b.id * 7) % 3),
        comment: REVIEW_COMMENTS[b.id % REVIEW_COMMENTS.length]!,
        cleanliness: 4 + ((b.id * 3 % 10) / 10),
        accuracy: 4 + ((b.id * 5 % 10) / 10),
        checkIn: 4 + ((b.id * 7 % 10) / 10),
        communication: 4 + ((b.id * 11 % 10) / 10),
        location: 4 + ((b.id * 13 % 10) / 10),
        value: 4 + ((b.id * 17 % 10) / 10),
        createdAt: addDays(b.checkedOutAt, 1),
      },
    });
    reviewCount++;
  }
  console.log(`✅ ${reviewCount} reviews created\n`);

  // 7. Seasonal pricing + blocked dates
  console.log('🎉 Creating seasonal pricing + blocked dates...');
  for (const l of listings) {
    await prisma.seasonalPricing.createMany({
      data: [
        {
          listingId: l.id,
          name: 'Ramadan Premium',
          startDate: addDays(today, 120),
          endDate: addDays(today, 150),
          pricePerNight: Math.round(l.price * 1.4),
          minStay: 3,
        },
        {
          listingId: l.id,
          name: 'Red Sea Summer Season',
          startDate: addDays(today, 60),
          endDate: addDays(today, 105),
          pricePerNight: Math.round(l.price * 1.25),
          minStay: 2,
        },
      ],
    });
    await prisma.blockedDate.create({
      data: {
        listingId: l.id,
        startDate: addDays(today, 10 + (l.id % 20)),
        endDate: addDays(today, 14 + (l.id % 20)),
        reason: ['Host unavailable', 'Maintenance', 'Personal use', 'Cleaning deep-clean'][l.id % 4],
      },
    });
  }
  console.log(`✅ seasonal + blocked ready\n`);

  // 8. Update per-listing averageRating + numberOfReviews
  console.log('📊 Computing per-listing rating aggregates...');
  const aggregates = await prisma.review.groupBy({
    by: ['listingId'],
    _avg: { rating: true },
    _count: { _all: true },
  });
  await Promise.all(
    aggregates.map((a) =>
      prisma.listing.update({
        where: { id: a.listingId },
        data: {
          averageRating: a._avg.rating ?? 0,
          numberOfReviews: a._count._all,
        },
      }),
    ),
  );
  console.log(`✅ Aggregates updated for ${aggregates.length} listings\n`);

  // 9. Summary
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`🎉 Homes seed completed in ${elapsed}s`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`📊 Totals:`);
  console.log(`   • ${hostUsers.length} hosts`);
  console.log(`   • ${guestUsers.length} guests`);
  console.log(`   • ${listings.length} listings (all Port Sudan)`);
  console.log(`   • ${bookings.length} bookings (${reviewCount} completed with reviews)`);
  console.log(`   • ${listings.length * 2} seasonal pricing entries`);
  console.log(`   • ${listings.length} blocked-date windows`);
  console.log('');
  console.log(`🔐 Demo credentials (password for ALL: "${DEMO_PASSWORD}")`);
  console.log(`   ${'Username'.padEnd(22)} ${'Email'.padEnd(40)} Display name`);
  console.log(`   ${'─'.repeat(22)} ${'─'.repeat(40)} ${'─'.repeat(22)}`);
  for (const h of HOSTS) {
    console.log(`   ${h.slug.padEnd(22)} ${`${h.slug.replace(/-/g, '')}@mkan.org`.padEnd(40)} ${h.displayName}`);
  }
  console.log('');
  console.log(`🌐 Test URLs:`);
  console.log(`   Public browse:   /en/listings`);
  console.log(`   Host dashboard:  /en/hosting`);
  console.log(`   Demo logins:     /en/dev/credentials`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
