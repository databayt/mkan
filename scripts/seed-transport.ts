import { config } from 'dotenv';
config();

import { PrismaClient, BusAmenity, SeatStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import {
  ASSEMBLY_POINTS,
  SUDAN_OPERATORS,
  OPERATOR_FARES,
  CITY_ALIASES,
  type FleetTier,
  type SudanOperatorData,
} from '../src/lib/constants/transport-data';

const prisma = new PrismaClient();

// ─── Demo constants ──────────────────────────────────────────────────────────
const DEMO_PASSWORD = '123456';
const TRIP_DAYS = 14;
const DEPARTURES = ['06:00', '14:00', '22:00']; // morning, afternoon, overnight

const FLEET_SIZE: Record<FleetTier, number> = { large: 4, medium: 3, small: 2 };
const FLEET_CAPACITY: Record<FleetTier, number> = { large: 50, medium: 45, small: 35 };

const PREMIUM_AMENITIES: BusAmenity[] = [
  BusAmenity.AirConditioning,
  BusAmenity.WiFi,
  BusAmenity.USB,
  BusAmenity.LegRoom,
  BusAmenity.Toilet,
  BusAmenity.Refreshments,
  BusAmenity.Reclining,
];

const STANDARD_AMENITIES: BusAmenity[] = [
  BusAmenity.AirConditioning,
  BusAmenity.USB,
  BusAmenity.LegRoom,
];

const BUS_MODELS = [
  { manufacturer: 'MCV', model: 'Sudan-Mena' },
  { manufacturer: 'Higer', model: 'KLQ6119' },
  { manufacturer: 'Yutong', model: 'ZK6120' },
  { manufacturer: 'Mercedes-Benz', model: 'Tourismo' },
  { manufacturer: 'Setra', model: 'S 415 HD' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function generateSeatLayout(capacity: number) {
  const columns = 4;
  const rows = Math.ceil(capacity / columns);
  const layout: string[][] = [];
  let seatNum = 0;
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < columns; c++) {
      if (seatNum < capacity) {
        row.push(`${String.fromCharCode(65 + r)}${c + 1}`);
        seatNum++;
      }
    }
    layout.push(row);
  }
  return { rows, columns, layout };
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

function findFare(from: string, to: string) {
  return (
    OPERATOR_FARES.find((f) => f.from === from && f.to === to) ??
    OPERATOR_FARES.find((f) => f.from === to && f.to === from)
  );
}

// ─── Per-operator seeder ─────────────────────────────────────────────────────

interface SeedResult {
  slug: string;
  email: string;
  buses: number;
  routes: number;
  trips: number;
  seats: number;
}

async function seedOperator(
  op: SudanOperatorData,
  cityToPointId: Record<string, number>,
  passwordHash: string,
  today: Date,
): Promise<SeedResult> {
  // Email localpart drops hyphens — `tarco-express` → `tarcoexpress@mkan.org`.
  // Username keeps the slug so login still accepts `tarco-express` directly.
  const email = `${op.slug.replace(/-/g, '')}@mkan.org`;

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      username: op.slug,
      password: passwordHash,
      role: 'MANAGER',
      emailVerified: new Date(),
    },
    create: {
      email,
      username: op.slug,
      password: passwordHash,
      role: 'MANAGER',
      emailVerified: new Date(),
      isTwoFactorEnabled: false,
    },
  });

  const khartoumId = cityToPointId['Khartoum'];
  if (!khartoumId) throw new Error('Khartoum hub not found');

  const office = await prisma.transportOffice.create({
    data: {
      name: op.nameEn,
      nameAr: op.nameAr,
      description: `${op.nameEn} — intercity bus operator serving ${op.routes.length} routes across Sudan.`,
      descriptionAr: `${op.nameAr} — شركة نقل بري بين المدن تخدم ${op.routes.length} خطوط في السودان.`,
      phone: op.phone,
      email,
      licenseNumber: op.licenseNumber,
      ownerId: user.id,
      assemblyPointId: khartoumId,
      isVerified: true,
      isActive: true,
      rating: Math.round((4.0 + Math.random() * 0.9) * 10) / 10,
      reviewCount: 50 + Math.floor(Math.random() * 450),
    },
  });

  // Buses
  const busCount = FLEET_SIZE[op.fleet];
  const capacity = FLEET_CAPACITY[op.fleet];
  const amenities = op.fleet === 'large' ? PREMIUM_AMENITIES : STANDARD_AMENITIES;
  const slugPrefix = op.slug.replace(/-/g, '').slice(0, 3).toUpperCase();
  const buses: Array<{ id: number; capacity: number }> = [];
  for (let i = 0; i < busCount; i++) {
    const modelInfo = BUS_MODELS[i % BUS_MODELS.length]!;
    const bus = await prisma.bus.create({
      data: {
        plateNumber: `SD-${slugPrefix}-${String(i + 1).padStart(3, '0')}`,
        manufacturer: modelInfo.manufacturer,
        model: modelInfo.model,
        year: 2019 + (i % 5),
        capacity,
        amenities,
        seatLayout: generateSeatLayout(capacity),
        officeId: office.id,
        isActive: true,
      },
    });
    buses.push({ id: bus.id, capacity });
  }

  // Routes
  const routes: Array<{ id: number; basePrice: number; duration: number }> = [];
  for (const r of op.routes) {
    const fromCity = CITY_ALIASES[r.from] ?? r.from;
    const toCity = CITY_ALIASES[r.to] ?? r.to;
    const originId = cityToPointId[fromCity];
    const destId = cityToPointId[toCity];
    if (!originId || !destId) {
      console.warn(`      ⚠ ${op.slug}: missing assembly point for ${fromCity} or ${toCity}`);
      continue;
    }
    const fare = findFare(r.from, r.to);
    if (!fare) {
      console.warn(`      ⚠ ${op.slug}: no fare for ${r.from} → ${r.to}`);
      continue;
    }
    const basePrice = Math.round((fare.fareMinSdg + fare.fareMaxSdg) / 2);
    const duration = Math.round((fare.km / 70) * 60); // avg 70 km/h

    const route = await prisma.route.create({
      data: {
        officeId: office.id,
        originId,
        destinationId: destId,
        basePrice,
        duration,
        distance: fare.km,
        isActive: true,
      },
    });
    routes.push({ id: route.id, basePrice, duration });
  }

  // Trips — build spec list, then chunk into createMany batches with seats
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
    for (let d = 1; d <= TRIP_DAYS; d++) {
      const bus = buses[(routeIdx + d) % buses.length]!;
      const departureDate = addDays(today, d);
      for (const dep of DEPARTURES) {
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

    // Map created IDs back to capacities (order-preserving guarantee in PG)
    const seatsData = created.flatMap((t, i) =>
      buildSeats(t.id, batch[i]!.busCapacity),
    );
    if (seatsData.length > 0) {
      const seatRes = await prisma.seat.createMany({
        data: seatsData,
        skipDuplicates: true,
      });
      seatsCreated += seatRes.count;
    }
  }

  return {
    slug: op.slug,
    email,
    buses: buses.length,
    routes: routes.length,
    trips: tripsCreated,
    seats: seatsCreated,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) {
    throw new Error('Refusing to seed production without FORCE_SEED=1');
  }

  const started = Date.now();
  console.log(`🚌 Transport seed — 13 Sudanese operators, password "${DEMO_PASSWORD}"\n`);

  // 1. Wipe transport tables (keep AssemblyPoint and User — upserted below)
  console.log('🧹 Clearing transport tables...');
  await prisma.transportPayment.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.transportBooking.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.route.deleteMany();
  await prisma.bus.deleteMany();
  await prisma.transportOffice.deleteMany();
  console.log('✅ Cleared\n');

  // 2. Upsert active assembly points
  console.log('📍 Upserting assembly points...');
  const activePoints = ASSEMBLY_POINTS.filter((p) => p.status === 'active');
  const cityToPointId: Record<string, number> = {};

  for (const p of activePoints) {
    const existing = await prisma.assemblyPoint.findFirst({
      where: { city: p.city, name: p.name },
    });
    if (existing) {
      await prisma.assemblyPoint.update({
        where: { id: existing.id },
        data: {
          nameAr: p.nameAr,
          address: p.stationName,
          latitude: p.latitude,
          longitude: p.longitude,
          isActive: true,
        },
      });
      cityToPointId[p.city] = existing.id;
    } else {
      const created = await prisma.assemblyPoint.create({
        data: {
          name: p.name,
          nameAr: p.nameAr,
          address: p.stationName,
          city: p.city,
          latitude: p.latitude,
          longitude: p.longitude,
          isActive: true,
        },
      });
      cityToPointId[p.city] = created.id;
    }
  }
  console.log(`✅ ${Object.keys(cityToPointId).length} assembly points ready\n`);

  if (!cityToPointId['Khartoum']) {
    throw new Error('Khartoum assembly point missing — seed aborted');
  }

  // 3. Hash shared demo password
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // 4. Seed each operator (continue on failure)
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  console.log('🏢 Seeding operators...');
  const report: SeedResult[] = [];

  for (const op of SUDAN_OPERATORS) {
    try {
      const result = await seedOperator(op, cityToPointId, passwordHash, today);
      report.push(result);
      console.log(
        `   ✓ ${op.slug.padEnd(22)} ${String(result.buses).padStart(2)}b ${String(result.routes).padStart(2)}r ${String(result.trips).padStart(4)}t ${String(result.seats).padStart(5)}s`,
      );
    } catch (err) {
      console.error(
        `   ✗ ${op.slug} failed:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const totalBuses = report.reduce((s, r) => s + r.buses, 0);
  const totalRoutes = report.reduce((s, r) => s + r.routes, 0);
  const totalTrips = report.reduce((s, r) => s + r.trips, 0);
  const totalSeats = report.reduce((s, r) => s + r.seats, 0);

  console.log(`\n═══════════════════════════════════════════════════════════════`);
  console.log(`🎉 Transport seed completed in ${elapsed}s`);
  console.log(`═══════════════════════════════════════════════════════════════`);
  console.log(`📊 Totals:`);
  console.log(`   • ${report.length} offices`);
  console.log(`   • ${totalBuses} buses`);
  console.log(`   • ${totalRoutes} routes`);
  console.log(`   • ${totalTrips} trips (${TRIP_DAYS} days × ${DEPARTURES.length}/day)`);
  console.log(`   • ${totalSeats} seats`);
  console.log('');
  console.log(`🔐 Demo credentials (password for ALL: "${DEMO_PASSWORD}")`);
  console.log(`   ${'Username'.padEnd(22)} ${'Email'.padEnd(38)} Office`);
  console.log(`   ${'─'.repeat(22)} ${'─'.repeat(38)} ${'─'.repeat(24)}`);
  for (const op of SUDAN_OPERATORS) {
    console.log(
      `   ${op.slug.padEnd(22)} ${`${op.slug.replace(/-/g, '')}@mkan.org`.padEnd(38)} ${op.nameEn} (${op.nameAr})`,
    );
  }
  console.log('');
  console.log(`🌐 Test URLs:`);
  console.log(`   Public search:  /en/transport`);
  console.log(`   Host dashboard: /en/transport-host`);
  console.log(`   Demo logins:    /en/dev/credentials`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
