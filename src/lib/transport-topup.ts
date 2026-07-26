import { SeatStatus } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Non-destructive transport-trip top-up, shared by the daily
 * /api/cron/topup-trips route and scripts/topup-transport-trips.ts.
 *
 * Only ADDS trips (+ seats) for the next `days` days on every active route,
 * skipping any (route, date, departure) that already has a trip. Idempotent:
 * re-running is a no-op until days roll over. Never deletes or updates —
 * the full seed-transport.ts wipes bookings and must never touch a live DB.
 */

const DEPARTURES = ["06:00", "14:00", "22:00"]; // morning, afternoon, overnight

export type TopUpResult = {
  routes: number;
  existingFutureTrips: number;
  tripsCreated: number;
  seatsCreated: number;
};

function addDays(date: Date, days: number): Date {
  const r = new Date(date);
  r.setDate(r.getDate() + days);
  return r;
}

function calculateArrivalTime(departure: string, durationMinutes: number): string {
  const [h, m] = departure.split(":").map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + durationMinutes;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
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
        seatType: c === 0 || c === columns - 1 ? "window" : "aisle",
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

export async function topUpTrips(days = 14): Promise<TopUpResult> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const routes = await db.route.findMany({
    where: { isActive: true, office: { isActive: true } },
    select: {
      id: true,
      basePrice: true,
      duration: true,
      officeId: true,
      office: {
        select: {
          buses: { select: { id: true, capacity: true }, where: { isActive: true } },
        },
      },
    },
  });

  const existing = await db.trip.findMany({
    where: { departureDate: { gte: today } },
    select: { routeId: true, departureDate: true, departureTime: true },
  });
  const seen = new Set(
    existing.map(
      (t) => `${t.routeId}|${t.departureDate.toISOString().slice(0, 10)}|${t.departureTime}`,
    ),
  );

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

    for (let d = 1; d <= days; d++) {
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

  let tripsCreated = 0;
  let seatsCreated = 0;

  for (const batch of chunk(specs, 200)) {
    const created = await db.trip.createManyAndReturn({
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
      const seatRes = await db.seat.createMany({ data: seatsData, skipDuplicates: true });
      seatsCreated += seatRes.count;
    }
  }

  return {
    routes: routes.length,
    existingFutureTrips: existing.length,
    tripsCreated,
    seatsCreated,
  };
}
