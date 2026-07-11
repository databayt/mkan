/**
 * Backfill real Review rows (with their prerequisite Completed bookings) for
 * the Kobar demo listings whose Listing counters already claim reviews
 * (averageRating / numberOfReviews were seeded counter-only, so the reviews
 * sections rendered their empty states while the overview banner said "19
 * reviews"). Integer ratings are chosen to reproduce the claimed averages
 * exactly (19×5 → 5.0 · 5,5,5,4 → 4.75 · 8×5,4×4 → 4.67), then the counters
 * are recomputed from the aggregate the same way review-actions does.
 *
 * Idempotent: a listing that already has Review rows is skipped. Bookings are
 * all in the past with status Completed, so availability is untouched.
 *
 * Run: npx tsx scripts/seed-demo-reviews.ts
 */
import { config } from 'dotenv';
config({ override: true });

// Deferred import (assigned in main) — a static `@/lib/db` import would build
// the client before dotenv loads. See [[feedback_tsx_script_dotenv_esm_order]].
let db: (typeof import('@/lib/db'))['db'];

interface Plan {
  listingId: number;
  ratings: number[];
  comments: (string | null)[];
}

const PLANS: Plan[] = [
  {
    listingId: 1052, // claimed 5.0 / 19
    ratings: Array(19).fill(5),
    comments: [
      'Where do I even start? As a family of 9 it is hard to find home-like apartments without paying a hefty bill — we enjoyed the spacious flat.',
      'Such an amazing place and my kids were so happy.',
      'Very good location. Nice apartment for a large group.',
      'The place is very clean and the host was always available on the phone.',
      'شقة ممتازة وقريبة من كل الخدمات، وصاحب البيت متعاون جداً.',
      'Great stay, exactly as pictured.',
      'Thank you',
      'The hospitality was top notch. For the very first time we felt at home being out of home.',
      'Quiet street, comfortable beds, strong AC. Will book again.',
      'المكان نظيف ومرتب والاستقبال كان رائع.',
      'Perfect for our family visit to Khartoum.',
      'Host answered every question within minutes.',
      'Spacious living room and a well-equipped kitchen.',
      null,
      'Everything was as described.',
      'Smooth check-in, great value.',
      'وصف دقيق للشقة وسعر مناسب.',
      null,
      'Highly recommended for families.',
    ],
  },
  {
    listingId: 1053, // claimed 4.75 / 4
    ratings: [5, 5, 5, 4],
    comments: [
      'Its a great apartment in a great location.',
      'Clean, comfortable and the host is very responsive.',
      'مكان هادئ ومناسب للعائلة.',
      'Good stay overall — water pressure could be better.',
    ],
  },
  {
    listingId: 1054, // claimed 4.67 / 12
    ratings: [5, 5, 5, 5, 5, 5, 5, 5, 4, 4, 4, 4],
    comments: [
      'Lovely home, felt safe and welcome.',
      'The photos are accurate and the neighborhood is quiet.',
      'شقة جميلة وقريبة من المطار.',
      'Great host, flexible check-in.',
      null,
      'Comfortable for a week-long work trip.',
      'Kids loved the space.',
      'Everything worked — wifi, AC, hot water.',
      'Nice place, parking was a bit tight.',
      'Good value for the price.',
      null,
      'Solid stay, would return.',
    ],
  },
];

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

async function main() {
  ({ db } = await import('@/lib/db'));

  // Reviewer pool — existing demo users (never hosts of these listings).
  const listings = await db.listing.findMany({
    where: { id: { in: PLANS.map((p) => p.listingId) } },
    select: { id: true, hostId: true, pricePerNight: true, averageRating: true, numberOfReviews: true },
  });
  const hostIds = listings.map((l) => l.hostId).filter(Boolean) as string[];
  const guests = await db.user.findMany({
    where: {
      role: { in: ['USER', 'TENANT'] },
      id: { notIn: hostIds },
      email: { not: { contains: 'playwright' } },
    },
    select: { id: true },
    take: 30,
  });
  if (guests.length === 0) throw new Error('No guest users available for reviews');

  for (const plan of PLANS) {
    const listing = listings.find((l) => l.id === plan.listingId);
    if (!listing) {
      console.log(`- listing ${plan.listingId} not found, skipping`);
      continue;
    }
    const existing = await db.review.count({ where: { listingId: plan.listingId } });
    if (existing > 0) {
      console.log(`- listing ${plan.listingId} already has ${existing} reviews, skipping`);
      continue;
    }

    // Spread stays over the last ~14 months, oldest first, no overlaps needed
    // (they're all in the past and Completed).
    const n = plan.ratings.length;
    for (let i = 0; i < n; i++) {
      const rating = plan.ratings[i]!;
      const guest = guests[(plan.listingId + i) % guests.length]!;
      const checkOut = addDays(new Date(), -(20 + (n - 1 - i) * 21));
      const nights = 2 + (i % 4);
      const checkIn = addDays(checkOut, -nights);
      const nightlyRate = listing.pricePerNight ?? 700;
      const subtotal = nightlyRate * nights;

      await db.$transaction(async (tx) => {
        const booking = await tx.booking.create({
          data: {
            listingId: plan.listingId,
            guestId: guest.id,
            checkIn,
            checkOut,
            guestCount: 1 + (i % 5),
            nightlyRate,
            nightsCount: nights,
            subtotal,
            totalPrice: subtotal,
            status: 'Completed',
            confirmedAt: addDays(checkIn, -7),
            checkedInAt: checkIn,
            checkedOutAt: checkOut,
          },
        });
        await tx.review.create({
          data: {
            listingId: plan.listingId,
            bookingId: booking.id,
            reviewerId: guest.id,
            rating,
            comment: plan.comments[i] ?? null,
            cleanliness: rating,
            accuracy: rating,
            checkIn: rating,
            communication: rating,
            location: rating,
            value: rating,
            createdAt: addDays(checkOut, 2),
          },
        });
      });
    }

    // Recompute counters from the aggregate — same shape review-actions uses —
    // so the Listing row and the Review table can never disagree again.
    const aggregate = await db.review.aggregate({
      where: { listingId: plan.listingId },
      _avg: { rating: true },
      _count: { rating: true },
    });
    await db.listing.update({
      where: { id: plan.listingId },
      data: {
        averageRating: aggregate._avg.rating ?? 0,
        numberOfReviews: aggregate._count.rating,
      },
    });
    console.log(
      `+ listing ${plan.listingId}: ${aggregate._count.rating} reviews, avg ${aggregate._avg.rating?.toFixed(4)}`
    );
  }

  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
