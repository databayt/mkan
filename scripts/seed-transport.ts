import { config } from 'dotenv';
config();

import crypto from 'crypto';
import { PrismaClient, BusAmenity, SeatStatus, TransportBookingStatus, TransportPaymentMethod, TransportPaymentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { ASSEMBLY_POINTS, ROUTES, BUS_COMPANIES } from '../src/lib/constants/transport-data';

const prisma = new PrismaClient();

// ─── Office Configuration ──────────────────────────────────────────────────

interface OfficeConfig {
  companyName: string;
  email: string;
  hub: string;
  phone: string;
  licenseNumber: string;
  tier: 'luxury' | 'standard' | 'regional';
  routes: { origin: string; destination: string }[];
  busFleet: ('premium' | 'standard' | 'minibus')[];
}

const OFFICE_CONFIGS: OfficeConfig[] = [
  // ── Luxury Coaches (Khartoum hub, 4 premium buses) ────────────────────
  {
    companyName: 'Jamal El-Din',
    email: 'jamaleldin@mkan.org',
    hub: 'Khartoum',
    phone: '+249911001001',
    licenseNumber: 'KRT-2025-001',
    tier: 'luxury',
    routes: [
      { origin: 'Khartoum', destination: 'Port Sudan' },
      { origin: 'Khartoum', destination: 'Kassala' },
      { origin: 'Khartoum', destination: 'Atbara' },
      { origin: 'Khartoum', destination: 'Dongola' },
      { origin: 'Khartoum', destination: 'El Obeid' },
    ],
    busFleet: ['premium', 'premium', 'premium', 'premium'],
  },
  {
    companyName: 'MCV',
    email: 'mcv@mkan.org',
    hub: 'Khartoum',
    phone: '+249911002002',
    licenseNumber: 'KRT-2025-002',
    tier: 'luxury',
    routes: [
      { origin: 'Khartoum', destination: 'Port Sudan' },
      { origin: 'Khartoum', destination: 'Kassala' },
      { origin: 'Khartoum', destination: 'Dongola' },
      { origin: 'Khartoum', destination: 'Atbara' },
      { origin: 'Khartoum', destination: 'Gedaref' },
    ],
    busFleet: ['premium', 'premium', 'premium', 'premium'],
  },
  {
    companyName: 'Igbalco',
    email: 'igbalco@mkan.org',
    hub: 'Khartoum',
    phone: '+249911003003',
    licenseNumber: 'KRT-2025-003',
    tier: 'luxury',
    routes: [
      { origin: 'Khartoum', destination: 'Port Sudan' },
      { origin: 'Khartoum', destination: 'Atbara' },
      { origin: 'Khartoum', destination: 'Dongola' },
      { origin: 'Khartoum', destination: 'El Obeid' },
      { origin: 'Khartoum', destination: 'Gedaref' },
    ],
    busFleet: ['premium', 'premium', 'premium', 'premium'],
  },
  {
    companyName: 'Marshal',
    email: 'marshal@mkan.org',
    hub: 'Khartoum',
    phone: '+249911004004',
    licenseNumber: 'KRT-2025-004',
    tier: 'luxury',
    routes: [
      { origin: 'Khartoum', destination: 'Port Sudan' },
      { origin: 'Khartoum', destination: 'Kassala' },
      { origin: 'Khartoum', destination: 'Atbara' },
      { origin: 'Khartoum', destination: 'El Obeid' },
      { origin: 'Khartoum', destination: 'Ed Damazin' },
    ],
    busFleet: ['premium', 'premium', 'premium', 'premium'],
  },

  // ── Standard Operators (Khartoum hub, 3-4 standard buses) ─────────────
  {
    companyName: 'Abu Amer',
    email: 'abuamer@mkan.org',
    hub: 'Khartoum',
    phone: '+249911005005',
    licenseNumber: 'KRT-2025-005',
    tier: 'standard',
    routes: [
      { origin: 'Khartoum', destination: 'Port Sudan' },
      { origin: 'Khartoum', destination: 'Dongola' },
      { origin: 'Omdurman', destination: 'Dongola' },
    ],
    busFleet: ['standard', 'standard', 'standard'],
  },
  {
    companyName: 'Rodeena',
    email: 'rodeena@mkan.org',
    hub: 'Khartoum',
    phone: '+249911006006',
    licenseNumber: 'KRT-2025-006',
    tier: 'standard',
    routes: [
      { origin: 'Khartoum', destination: 'Port Sudan' },
      { origin: 'Khartoum', destination: 'Dongola' },
      { origin: 'Khartoum', destination: 'Kassala' },
      { origin: 'Khartoum', destination: 'Wad Madani' },
    ],
    busFleet: ['standard', 'standard', 'standard', 'standard'],
  },
  {
    companyName: 'Al-Rifai',
    email: 'alrifai@mkan.org',
    hub: 'Khartoum',
    phone: '+249911007007',
    licenseNumber: 'KRT-2025-007',
    tier: 'standard',
    routes: [
      { origin: 'Khartoum', destination: 'Port Sudan' },
      { origin: 'Khartoum', destination: 'Atbara' },
      { origin: 'Khartoum', destination: 'Gedaref' },
    ],
    busFleet: ['standard', 'standard', 'standard'],
  },
  {
    companyName: 'Al Sharif',
    email: 'alsharif@mkan.org',
    hub: 'Khartoum',
    phone: '+249911008008',
    licenseNumber: 'KRT-2025-008',
    tier: 'standard',
    routes: [
      { origin: 'Khartoum', destination: 'Port Sudan' },
      { origin: 'Khartoum', destination: 'Kassala' },
      { origin: 'Khartoum', destination: 'Atbara' },
      { origin: 'Khartoum', destination: 'Wad Madani' },
    ],
    busFleet: ['standard', 'standard', 'standard', 'standard'],
  },

  // ── Regional Operators (local hubs, 2 standard + 1 minibus) ───────────
  {
    companyName: 'Northern Unit Buses',
    email: 'northernunit@mkan.org',
    hub: 'Dongola',
    phone: '+249911009009',
    licenseNumber: 'DNG-2025-009',
    tier: 'regional',
    routes: [
      { origin: 'Atbara', destination: 'Dongola' },
      { origin: 'Atbara', destination: 'Shendi' },
      { origin: 'Atbara', destination: 'Port Sudan' },
    ],
    busFleet: ['standard', 'standard', 'minibus'],
  },
  {
    companyName: 'Kassala Express',
    email: 'kassalaexpress@mkan.org',
    hub: 'Kassala',
    phone: '+249911010010',
    licenseNumber: 'KSL-2025-010',
    tier: 'regional',
    routes: [
      { origin: 'Kassala', destination: 'Port Sudan' },
      { origin: 'Kassala', destination: 'Atbara' },
      { origin: 'Kassala', destination: 'Sennar' },
    ],
    busFleet: ['standard', 'standard', 'minibus'],
  },
  {
    companyName: 'Gezira Transport',
    email: 'geziratransport@mkan.org',
    hub: 'Wad Madani',
    phone: '+249911011011',
    licenseNumber: 'WMD-2025-011',
    tier: 'regional',
    routes: [
      { origin: 'Gedaref', destination: 'Wad Madani' },
      { origin: 'Gedaref', destination: 'Sennar' },
      { origin: 'Gedaref', destination: 'Kosti' },
      { origin: 'Khartoum', destination: 'Wad Madani' },
    ],
    busFleet: ['standard', 'standard', 'minibus'],
  },
  {
    companyName: 'Nile Valley Transport',
    email: 'nilevalley@mkan.org',
    hub: 'Atbara',
    phone: '+249911012012',
    licenseNumber: 'ATB-2025-012',
    tier: 'regional',
    routes: [
      { origin: 'Atbara', destination: 'Shendi' },
      { origin: 'Atbara', destination: 'Port Sudan' },
      { origin: 'Atbara', destination: 'Dongola' },
    ],
    busFleet: ['standard', 'standard', 'minibus'],
  },
  {
    companyName: 'White Nile Transport',
    email: 'whitenile@mkan.org',
    hub: 'Kosti',
    phone: '+249911013013',
    licenseNumber: 'KST-2025-013',
    tier: 'regional',
    routes: [
      { origin: 'Khartoum', destination: 'Kosti' },
      { origin: 'Khartoum', destination: 'Sennar' },
      { origin: 'Gedaref', destination: 'Rabak' },
      { origin: 'Gedaref', destination: 'Kosti' },
    ],
    busFleet: ['standard', 'standard', 'minibus'],
  },
  {
    companyName: 'Red Sea Transport',
    email: 'redsea@mkan.org',
    hub: 'Port Sudan',
    phone: '+249911014014',
    licenseNumber: 'PSA-2025-014',
    tier: 'regional',
    routes: [
      { origin: 'Port Sudan', destination: 'Atbara' },
      { origin: 'Port Sudan', destination: 'Kassala' },
      { origin: 'Port Sudan', destination: 'Dongola' },
    ],
    busFleet: ['standard', 'standard', 'minibus'],
  },
];

// ─── Bus Tier Configuration ────────────────────────────────────────────────

const BUS_TIER_CONFIG = {
  premium: {
    capacities: [35, 40],
    amenities: [
      BusAmenity.AirConditioning, BusAmenity.WiFi, BusAmenity.USB,
      BusAmenity.LegRoom, BusAmenity.Toilet, BusAmenity.Refreshments,
      BusAmenity.Entertainment, BusAmenity.Luggage, BusAmenity.Reclining,
    ],
    models: [
      { manufacturer: 'Mercedes-Benz', model: 'Tourismo', years: [2020, 2021, 2022] },
      { manufacturer: 'Volvo', model: 'B11R', years: [2020, 2021, 2022] },
    ],
  },
  standard: {
    capacities: [45, 50],
    amenities: [
      BusAmenity.AirConditioning, BusAmenity.WiFi,
      BusAmenity.Toilet, BusAmenity.Luggage, BusAmenity.Refreshments,
    ],
    models: [
      { manufacturer: 'Higer', model: 'KLQ6128', years: [2018, 2019, 2020, 2021] },
      { manufacturer: 'King Long', model: 'XMQ6129', years: [2018, 2019, 2020, 2021] },
    ],
  },
  minibus: {
    capacities: [18],
    amenities: [BusAmenity.AirConditioning, BusAmenity.Luggage],
    models: [
      { manufacturer: 'Ashok Leyland', model: 'Falcon', years: [2018, 2019, 2020] },
    ],
  },
};

// ─── Helper Functions ──────────────────────────────────────────────────────

function generatePlateNumber(city: string, index: number): string {
  const prefixes: Record<string, string> = {
    'Khartoum': 'KRT', 'Omdurman': 'OMD', 'Port Sudan': 'PSA',
    'Wad Madani': 'WMD', 'Kassala': 'KSL', 'Gedaref': 'GDF',
    'Atbara': 'ATB', 'Kosti': 'KST', 'Dongola': 'DNG',
  };
  return `${prefixes[city] || 'SDN'}-${String(index + 1).padStart(5, '0')}`;
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

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function calculateArrivalTime(departureTime: string, durationMinutes: number): string {
  const [h, m] = departureTime.split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + durationMinutes;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function findRoute(origin: string, destination: string) {
  return ROUTES.find(r => r.origin === origin && r.destination === destination);
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('🚌 Starting transport seed (real Sudan companies)...\n');

  // 1. Clear existing data
  console.log('🧹 Clearing existing transport data...');
  await prisma.transportPayment.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.transportBooking.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.route.deleteMany();
  await prisma.bus.deleteMany();
  await prisma.transportOffice.deleteMany();
  await prisma.assemblyPoint.deleteMany();
  console.log('✅ Cleared\n');

  // 2. Create assembly points (active only)
  console.log('📍 Creating assembly points...');
  const activePoints = ASSEMBLY_POINTS.filter(p => p.status === 'active');
  const cityToPointId: Record<string, number> = {};

  for (const point of activePoints) {
    const created = await prisma.assemblyPoint.create({
      data: {
        name: point.name,
        nameAr: point.nameAr,
        address: point.stationName,
        city: point.city,
        latitude: point.latitude,
        longitude: point.longitude,
      },
    });
    cityToPointId[point.city] = created.id;
  }
  console.log(`✅ Created ${activePoints.length} active assembly points\n`);

  // 3. Create users & offices
  console.log('👤 Creating office accounts & transport offices...');
  const hashedPassword = await bcrypt.hash('1234', 10);

  const officeRecords: { officeId: number; config: OfficeConfig }[] = [];

  for (const cfg of OFFICE_CONFIGS) {
    const company = BUS_COMPANIES.find(c => c.name === cfg.companyName);
    if (!company) {
      console.error(`   ✗ Company not found in BUS_COMPANIES: ${cfg.companyName}`);
      continue;
    }

    // Create or update user
    const user = await prisma.user.upsert({
      where: { email: cfg.email },
      update: { password: hashedPassword, emailVerified: new Date() },
      create: {
        id: crypto.randomUUID(),
        email: cfg.email,
        username: company.name,
        password: hashedPassword,
        role: 'USER',
        emailVerified: new Date(),
        updatedAt: new Date(),
      },
    });

    // Create office
    const assemblyPointId = cityToPointId[cfg.hub] ?? null;
    const office = await prisma.transportOffice.create({
      data: {
        name: company.name,
        nameAr: company.nameAr,
        description: company.notes || `${company.type} operator`,
        phone: cfg.phone,
        email: cfg.email,
        licenseNumber: cfg.licenseNumber,
        ownerId: user.id,
        assemblyPointId,
        isVerified: true,
        isActive: true,
        rating: 4.0 + Math.random() * 0.9,
        reviewCount: Math.floor(50 + Math.random() * 200),
      },
    });

    officeRecords.push({ officeId: office.id, config: cfg });
    console.log(`   ✓ ${company.name} (${company.nameAr}) — ${cfg.email}`);
  }
  console.log(`✅ Created ${officeRecords.length} offices\n`);

  // 4. Create buses
  console.log('🚐 Creating buses...');
  let busGlobalIndex = 0;
  const officeBusMap: Record<number, { id: number; capacity: number }[]> = {};

  for (const { officeId, config: cfg } of officeRecords) {
    officeBusMap[officeId] = [];

    for (const busTier of cfg.busFleet) {
      const tierCfg = BUS_TIER_CONFIG[busTier];
      const capacity = tierCfg.capacities[busGlobalIndex % tierCfg.capacities.length]!;
      const modelInfo = tierCfg.models[busGlobalIndex % tierCfg.models.length]!;
      const year = modelInfo.years[busGlobalIndex % modelInfo.years.length]!;

      const bus = await prisma.bus.create({
        data: {
          plateNumber: generatePlateNumber(cfg.hub, busGlobalIndex),
          model: modelInfo.model,
          manufacturer: modelInfo.manufacturer,
          year,
          capacity,
          amenities: tierCfg.amenities,
          seatLayout: generateSeatLayout(capacity),
          officeId,
          isActive: true,
        },
      });

      officeBusMap[officeId]!.push({ id: bus.id, capacity });
      busGlobalIndex++;
    }
    console.log(`   ✓ ${cfg.companyName}: ${cfg.busFleet.length} buses`);
  }
  const totalBuses = Object.values(officeBusMap).reduce((sum, b) => sum + b.length, 0);
  console.log(`✅ Created ${totalBuses} buses\n`);

  // 5. Create routes
  console.log('🛤️  Creating routes...');
  interface RouteRecord {
    routeId: number;
    officeId: number;
    durationMinutes: number;
    price: number;
  }
  const routeRecords: RouteRecord[] = [];

  for (const { officeId, config: cfg } of officeRecords) {
    for (const routeDef of cfg.routes) {
      const routeData = findRoute(routeDef.origin, routeDef.destination);
      if (!routeData) {
        console.error(`   ✗ Route not in ROUTES: ${routeDef.origin} → ${routeDef.destination}`);
        continue;
      }

      const originId = cityToPointId[routeDef.origin];
      const destId = cityToPointId[routeDef.destination];
      if (!originId || !destId) {
        console.error(`   ✗ Assembly point missing: ${routeDef.origin} or ${routeDef.destination}`);
        continue;
      }

      try {
        const route = await prisma.route.create({
          data: {
            officeId,
            originId,
            destinationId: destId,
            basePrice: routeData.price,
            duration: routeData.duration * 60, // hours → minutes
            distance: routeData.distance,
            isActive: true,
          },
        });
        routeRecords.push({
          routeId: route.id,
          officeId,
          durationMinutes: routeData.duration * 60,
          price: routeData.price,
        });
      } catch {
        // Skip duplicate routes (@@unique constraint)
      }
    }
    console.log(`   ✓ ${cfg.companyName}: routes created`);
  }
  console.log(`✅ Created ${routeRecords.length} routes\n`);

  // 6. Create trips + seats (7 days, 04:00 departure)
  console.log('📅 Creating trips and seats...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const DEPARTURE_TIME = '04:00';
  const DAYS = 7;
  const BATCH_SIZE = 10;

  interface TripBatch {
    routeId: number;
    busId: number;
    departureDate: Date;
    departureTime: string;
    arrivalTime: string;
    price: number;
    availableSeats: number;
    busCapacity: number;
  }

  const tripBatches: TripBatch[] = [];

  for (const rec of routeRecords) {
    const buses = officeBusMap[rec.officeId];
    if (!buses || buses.length === 0) continue;

    // Rotate buses across routes within this office
    const officeRoutes = routeRecords.filter(r => r.officeId === rec.officeId);
    const routeIdx = officeRoutes.indexOf(rec);
    const bus = buses[routeIdx % buses.length]!;
    const arrivalTime = calculateArrivalTime(DEPARTURE_TIME, rec.durationMinutes);

    for (let day = 1; day <= DAYS; day++) {
      tripBatches.push({
        routeId: rec.routeId,
        busId: bus.id,
        departureDate: addDays(today, day),
        departureTime: DEPARTURE_TIME,
        arrivalTime,
        price: rec.price,
        availableSeats: bus.capacity,
        busCapacity: bus.capacity,
      });
    }
  }

  let tripCount = 0;
  let seatCount = 0;

  for (let i = 0; i < tripBatches.length; i += BATCH_SIZE) {
    const batch = tripBatches.slice(i, i + BATCH_SIZE);

    for (const tb of batch) {
      try {
        const trip = await prisma.trip.create({
          data: {
            routeId: tb.routeId,
            busId: tb.busId,
            departureDate: tb.departureDate,
            departureTime: tb.departureTime,
            arrivalTime: tb.arrivalTime,
            price: tb.price,
            availableSeats: tb.availableSeats,
            isActive: true,
            isCancelled: false,
          },
        });
        tripCount++;

        // Create seats
        const layout = generateSeatLayout(tb.busCapacity);
        const seatsData: { tripId: number; seatNumber: string; row: number; column: number; seatType: string; status: SeatStatus }[] = [];

        for (let r = 0; r < layout.rows; r++) {
          const row = layout.layout[r];
          if (!row) continue;
          for (let c = 0; c < row.length; c++) {
            const seatNumber = row[c];
            if (!seatNumber) continue;
            seatsData.push({
              tripId: trip.id,
              seatNumber,
              row: r + 1,
              column: c + 1,
              seatType: c === 0 || c === 3 ? 'window' : 'aisle',
              status: SeatStatus.Available,
            });
          }
        }

        await prisma.seat.createMany({ data: seatsData });
        seatCount += seatsData.length;
      } catch {
        // Skip on error (e.g., constraint violation)
      }
    }

    if (i % (BATCH_SIZE * 5) === 0 || i + BATCH_SIZE >= tripBatches.length) {
      console.log(`   Progress: ${Math.min(i + BATCH_SIZE, tripBatches.length)}/${tripBatches.length}`);
    }

    if (i + BATCH_SIZE < tripBatches.length) {
      await sleep(300);
    }
  }
  console.log(`✅ Created ${tripCount} trips with ${seatCount} seats\n`);

  // 7. Sample bookings
  console.log('🎫 Creating sample bookings...');
  const testUser = await prisma.user.findUnique({ where: { email: 'office@hotmail.com' } });

  if (testUser) {
    const upcomingTrips = await prisma.trip.findMany({
      where: {
        departureDate: { gte: addDays(today, 2), lte: addDays(today, 7) },
        isActive: true,
        isCancelled: false,
      },
      include: {
        route: { include: { origin: true, destination: true } },
        seats: { where: { status: SeatStatus.Available }, take: 2 },
      },
      take: 8,
    });

    let bookingCount = 0;
    const names = [
      'Mohammed Ali', 'Amina Ahmed', 'Ibrahim Hassan', 'Fatima Omar',
      'Yusuf Khalid', 'Zainab Mohammed', 'Ahmad Osman', 'Sara Ibrahim',
    ];

    for (const trip of upcomingTrips) {
      if (trip.seats.length < 1) continue;
      const seat = trip.seats[0]!;
      const name = names[bookingCount % names.length]!;

      const booking = await prisma.transportBooking.create({
        data: {
          bookingReference: `BK-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          userId: testUser.id,
          tripId: trip.id,
          officeId: trip.route.officeId,
          passengerName: name,
          passengerPhone: `+2499${String(Math.floor(10000000 + Math.random() * 90000000))}`,
          passengerEmail: `${name.toLowerCase().replace(' ', '.')}@example.com`,
          totalAmount: trip.price,
          status: TransportBookingStatus.Confirmed,
          confirmedAt: new Date(),
        },
      });

      await prisma.seat.update({
        where: { id: seat.id },
        data: { status: SeatStatus.Booked, bookingId: booking.id },
      });

      await prisma.trip.update({
        where: { id: trip.id },
        data: { availableSeats: { decrement: 1 } },
      });

      await prisma.transportPayment.create({
        data: {
          bookingId: booking.id,
          amount: trip.price,
          method: TransportPaymentMethod.MobileMoney,
          status: TransportPaymentStatus.Paid,
          transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          paidAt: new Date(),
        },
      });

      bookingCount++;
      console.log(`   ✓ ${name}: ${trip.route.origin.city} → ${trip.route.destination.city}`);
    }
    console.log(`✅ Created ${bookingCount} sample bookings\n`);
  } else {
    console.log('⚠️  Test user (office@hotmail.com) not found — skipping bookings\n');
  }

  // 8. Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎉 Transport seeding completed!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📊 Summary:`);
  console.log(`   • ${activePoints.length} assembly points`);
  console.log(`   • ${officeRecords.length} transport offices`);
  console.log(`   • ${totalBuses} buses`);
  console.log(`   • ${routeRecords.length} routes`);
  console.log(`   • ${tripCount} trips`);
  console.log(`   • ${seatCount} seats`);
  console.log('');
  console.log('🔐 Office accounts (password: 1234):');
  for (const cfg of OFFICE_CONFIGS) {
    const company = BUS_COMPANIES.find(c => c.name === cfg.companyName);
    console.log(`   • ${cfg.email.padEnd(30)} — ${company?.name ?? cfg.companyName} (${company?.nameAr ?? ''})`);
  }
  console.log('');
  console.log('🌐 Test at:');
  console.log('   • Public: /en/transport');
  console.log('   • Host:   /en/transport-host');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
