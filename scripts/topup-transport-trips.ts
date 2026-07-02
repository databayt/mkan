/**
 * Non-destructive transport-trip top-up.
 *
 * The full `seed-transport.ts` WIPES bookings/payments before reseeding — never
 * run it against a live DB. This script only ADDS trips (+ seats) for the next
 * `TRIP_DAYS` days on every active route, skipping any (route, date, departure)
 * that already has a trip. Idempotent: re-running is a no-op until days roll over.
 * Mirrors the homes `topup-listings-to-110.ts` pattern.
 *
 * Run: set -a && source .env && set +a && npx tsx scripts/topup-transport-trips.ts
 */
import { config } from 'dotenv';
config({ override: true });

import { SeatStatus } from '@prisma/client';

// Deferred import (assigned in main) — a static `@/lib/db` import would build
// the client before dotenv loads. See [[feedback_tsx_script_dotenv_esm_order]].
let prisma: (typeof import('@/lib/db'))['db'];

const TRIP_DAYS = 14;
const DEPARTURES = ['06:00', '14:00', '22:00']; // morning, afternoon, overnight

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function calculateArrivalTime(departure: string, durationMinutes: number): string {
  const [h, m] = departure.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + durationMinutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function buildSeats(tripId: number, capacity: number) {
  const columns = 4;
  const rows = Math.ceil(capacity / columns);
  const seats: Array<{
    tripId: number;
    seatNumber: string;
    row: number;
    column: number;
    seatType: string;
    status: SeatStatus;
  }> = [];
  let seatNum = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      if (seatNum >= capacity) break;
      seats.push({
        tripId,
        seatNumber: `${String.fromCharCode(65 + r)}${c + 1}`,
        row: r + 1,
        column: c + 1,
        seatType: c === 0 || c === columns - 1 ? 'window' : 'aisle',
        status: SeatStatus.Available,
      });
      seatNum++;
    }
  }
  return seats;
}

function* chunk<T>(arr: T[], size: number) {
  for (let i = 0; i < arr.length; i += size) yield arr.slice(i, i + size);
}

async function main() {
  prisma = (await import('@/lib/db')).db;
  const started = Date.now();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const routes = await prisma.route.findMany({
    where: { isActive: true, office: { isActive: true } },
    select: {
      id: true,
      basePrice: true,
      duration: true,
      officeId: true,
      office: { select: { buses: { select: { id: true, capacity: true }, where: { isActive: true } } } },
    },
  });
  console.log(`🚌 Top-up: ${routes.length} active routes, horizon ${TRIP_DAYS} days`);

  // Existing future trips → skip set keyed by route|date|time
  const existing = await prisma.trip.findMany({
    where: { departureDate: { gte: today } },
    select: { routeId: true, departureDate: true, departureTime: true },
  });
  const seen = new Set(
    existing.map(
      (t) => `${t.routeId}|${t.departureDate.toISOString().slice(0, 10)}|${t.departureTime}`,
    ),
  );
  console.log(`   ${existing.length} future trips already present`);

  type TripSpec = {
    routeId: number;
    busId: number;
    busCapacity: number;
    departureDate: Date;
    departureTime: string;
    arrivalTime: string;
    price: number;
  };
  const specs: TripSpec[] = [];

  for (let routeIdx = 0; routeIdx < routes.length; routeIdx++) {
    const route = routes[routeIdx]!;
    const buses = route.office.buses;
    if (buses.length === 0) continue;

    for (let d = 1; d <= TRIP_DAYS; d++) {
      const departureDate = addDays(today, d);
      const dateKey = departureDate.toISOString().slice(0, 10);
      const bus = buses[(routeIdx + d) % buses.length]!;

      for (const dep of DEPARTURES) {
        if (seen.has(`${route.id}|${dateKey}|${dep}`)) continue;
        const jitter = 1 + (Math.random() * 0.2 - 0.1); // ±10%
        specs.push({
          routeId: route.id,
          busId: bus.id,
          busCapacity: bus.capacity,
          departureDate,
          departureTime: dep,
          arrivalTime: calculateArrivalTime(dep, route.duration),
          price: Math.round(route.basePrice * jitter),
        });
      }
    }
  }

  console.log(`   creating ${specs.length} trips…`);
  let tripsCreated = 0;
  let seatsCreated = 0;

  for (const batch of chunk(specs, 200)) {
    const created = await prisma.trip.createManyAndReturn({
      data: batch.map((s) => ({
        routeId: s.routeId,
        busId: s.busId,
        departureDate: s.departureDate,
        departureTime: s.departureTime,
        arrivalTime: s.arrivalTime,
        price: s.price,
        availableSeats: s.busCapacity,
        isActive: true,
        isCancelled: false,
      })),
      select: { id: true },
    });
    tripsCreated += created.length;

    const seatsData = created.flatMap((t, i) => buildSeats(t.id, batch[i]!.busCapacity));
    if (seatsData.length > 0) {
      const seatRes = await prisma.seat.createMany({ data: seatsData, skipDuplicates: true });
      seatsCreated += seatRes.count;
    }
  }

  console.log(
    `✅ Created ${tripsCreated} trips + ${seatsCreated} seats in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma?.$disconnect();
  process.exit(1);
});
