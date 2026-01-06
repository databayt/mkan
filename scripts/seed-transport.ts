import { config } from 'dotenv';
config({ path: '.env.local' });

import { PrismaClient, BusAmenity, SeatStatus, TransportBookingStatus, TransportPaymentMethod, TransportPaymentStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Sudanese Assembly Points (Bus Stations)
const assemblyPoints = [
  {
    name: 'Khartoum Main Bus Station',
    nameAr: 'محطة الخرطوم الرئيسية للحافلات',
    address: 'Nile Street, Downtown',
    city: 'Khartoum',
    latitude: 15.5007,
    longitude: 32.5599,
  },
  {
    name: 'Omdurman Bus Terminal',
    nameAr: 'موقف أم درمان للحافلات',
    address: 'Souq Omdurman Area',
    city: 'Omdurman',
    latitude: 15.6507,
    longitude: 32.4799,
  },
  {
    name: 'Port Sudan Central Station',
    nameAr: 'محطة بورتسودان المركزية',
    address: 'Red Sea Boulevard',
    city: 'Port Sudan',
    latitude: 19.6158,
    longitude: 37.2164,
  },
  {
    name: 'Wad Madani Bus Station',
    nameAr: 'محطة ود مدني للحافلات',
    address: 'Al Jazira Street',
    city: 'Wad Madani',
    latitude: 14.4019,
    longitude: 33.5199,
  },
  {
    name: 'Kassala Bus Terminal',
    nameAr: 'موقف كسلا للحافلات',
    address: 'Central Market Area',
    city: 'Kassala',
    latitude: 15.4507,
    longitude: 36.3999,
  },
  {
    name: 'Gedaref Bus Station',
    nameAr: 'محطة القضارف للحافلات',
    address: 'Main Highway Road',
    city: 'Gedaref',
    latitude: 14.0263,
    longitude: 35.3898,
  },
  {
    name: 'Atbara Railway Station',
    nameAr: 'محطة عطبرة',
    address: 'Railway District',
    city: 'Atbara',
    latitude: 17.7076,
    longitude: 33.9963,
  },
  {
    name: 'Kosti Bus Terminal',
    nameAr: 'موقف كوستي للحافلات',
    address: 'White Nile Street',
    city: 'Kosti',
    latitude: 13.1652,
    longitude: 32.6614,
  },
  {
    name: 'Dongola Bus Station',
    nameAr: 'محطة دنقلا للحافلات',
    address: 'Northern Highway',
    city: 'Dongola',
    latitude: 19.1753,
    longitude: 30.4764,
  },
];

// Transport company owners
const transportOwners = [
  { email: 'ahmed.hassan@khartoumexpress.sd', username: 'Ahmed Hassan', password: '123456' },
  { email: 'fatima.mustafa@goldenstar.sd', username: 'Fatima Mustafa', password: '123456' },
  { email: 'omar.ibrahim@nilevalley.sd', username: 'Omar Ibrahim', password: '123456' },
  { email: 'aisha.mohamed@redsea.sd', username: 'Aisha Mohamed', password: '123456' },
  { email: 'yusuf.abdalla@unity.sd', username: 'Yusuf Abdalla', password: '123456' },
  { email: 'maryam.osman@sunrise.sd', username: 'Maryam Osman', password: '123456' },
];

// Transport Offices (Bus Companies)
const transportOffices = [
  {
    name: 'Khartoum Express',
    nameAr: 'خرطوم اكسبرس',
    description: 'Premium intercity bus service connecting major Sudanese cities with comfort and reliability.',
    descriptionAr: 'خدمة حافلات فاخرة بين المدن تربط المدن السودانية الكبرى براحة وموثوقية.',
    phone: '+249912345678',
    email: 'info@khartoumexpress.sd',
    licenseNumber: 'KRT-2024-001',
    baseCity: 'Khartoum',
    ownerIndex: 0,
  },
  {
    name: 'Golden Star Bus',
    nameAr: 'نجم ذهبي',
    description: 'Affordable and comfortable bus travel across Sudan with modern fleet.',
    descriptionAr: 'سفر بالحافلات بأسعار معقولة ومريحة عبر السودان بأسطول حديث.',
    phone: '+249923456789',
    email: 'booking@goldenstar.sd',
    licenseNumber: 'OMD-2024-002',
    baseCity: 'Omdurman',
    ownerIndex: 1,
  },
  {
    name: 'Nile Valley Travel',
    nameAr: 'وادي النيل للسفريات',
    description: 'Your trusted partner for safe and comfortable journeys along the Nile.',
    descriptionAr: 'شريكك الموثوق لرحلات آمنة ومريحة على طول النيل.',
    phone: '+249934567890',
    email: 'travel@nilevalley.sd',
    licenseNumber: 'KRT-2024-003',
    baseCity: 'Khartoum',
    ownerIndex: 2,
  },
  {
    name: 'Red Sea Transport',
    nameAr: 'نقل البحر الأحمر',
    description: 'Connecting the Red Sea coast with the heart of Sudan.',
    descriptionAr: 'يربط ساحل البحر الأحمر بقلب السودان.',
    phone: '+249945678901',
    email: 'info@redseatransport.sd',
    licenseNumber: 'PSA-2024-004',
    baseCity: 'Port Sudan',
    ownerIndex: 3,
  },
  {
    name: 'Unity Coaches',
    nameAr: 'حافلات الوحدة',
    description: 'Eastern Sudan bus service with focus on customer satisfaction.',
    descriptionAr: 'خدمة حافلات شرق السودان مع التركيز على رضا العملاء.',
    phone: '+249956789012',
    email: 'unity@coaches.sd',
    licenseNumber: 'KSL-2024-005',
    baseCity: 'Kassala',
    ownerIndex: 4,
  },
  {
    name: 'Sunrise Travel',
    nameAr: 'شروق السفر',
    description: 'Start your journey with us - luxury buses for all destinations.',
    descriptionAr: 'ابدأ رحلتك معنا - حافلات فاخرة لجميع الوجهات.',
    phone: '+249967890123',
    email: 'hello@sunrisetravel.sd',
    licenseNumber: 'KRT-2024-006',
    baseCity: 'Khartoum',
    ownerIndex: 5,
  },
];

// Bus configurations
const busConfigs = [
  // Budget buses (minibuses)
  { type: 'budget', capacity: 14, amenities: [BusAmenity.AirConditioning, BusAmenity.Luggage] },
  { type: 'budget', capacity: 18, amenities: [BusAmenity.AirConditioning, BusAmenity.Luggage] },
  // Standard buses
  { type: 'standard', capacity: 45, amenities: [BusAmenity.AirConditioning, BusAmenity.WiFi, BusAmenity.Toilet, BusAmenity.Luggage] },
  { type: 'standard', capacity: 50, amenities: [BusAmenity.AirConditioning, BusAmenity.WiFi, BusAmenity.Toilet, BusAmenity.Luggage, BusAmenity.Refreshments] },
  // Premium buses
  { type: 'premium', capacity: 40, amenities: [BusAmenity.AirConditioning, BusAmenity.WiFi, BusAmenity.USB, BusAmenity.LegRoom, BusAmenity.Toilet, BusAmenity.Refreshments, BusAmenity.Entertainment, BusAmenity.Luggage, BusAmenity.Reclining] },
  { type: 'premium', capacity: 35, amenities: [BusAmenity.AirConditioning, BusAmenity.WiFi, BusAmenity.USB, BusAmenity.LegRoom, BusAmenity.Toilet, BusAmenity.Refreshments, BusAmenity.Entertainment, BusAmenity.Luggage, BusAmenity.Reclining] },
];

const busModels = [
  { manufacturer: 'Higer', model: 'KLQ6128', years: [2018, 2019, 2020, 2021] },
  { manufacturer: 'Yutong', model: 'ZK6122', years: [2019, 2020, 2021, 2022] },
  { manufacturer: 'King Long', model: 'XMQ6129', years: [2017, 2018, 2019, 2020] },
  { manufacturer: 'Mercedes-Benz', model: 'Tourismo', years: [2020, 2021, 2022] },
  { manufacturer: 'Volvo', model: 'B11R', years: [2019, 2020, 2021, 2022] },
  { manufacturer: 'Ashok Leyland', model: 'Falcon', years: [2018, 2019, 2020] },
];

// Routes with realistic data
const routes = [
  { origin: 'Khartoum', destination: 'Port Sudan', distance: 780, duration: 720, basePrice: 16000 }, // 12 hours
  { origin: 'Khartoum', destination: 'Wad Madani', distance: 190, duration: 240, basePrice: 4000 }, // 4 hours
  { origin: 'Khartoum', destination: 'Kassala', distance: 500, duration: 540, basePrice: 10500 }, // 9 hours
  { origin: 'Khartoum', destination: 'Gedaref', distance: 400, duration: 420, basePrice: 8500 }, // 7 hours
  { origin: 'Khartoum', destination: 'Atbara', distance: 340, duration: 360, basePrice: 7000 }, // 6 hours
  { origin: 'Khartoum', destination: 'Kosti', distance: 270, duration: 300, basePrice: 5500 }, // 5 hours
  { origin: 'Khartoum', destination: 'Dongola', distance: 480, duration: 480, basePrice: 9500 }, // 8 hours
  { origin: 'Port Sudan', destination: 'Kassala', distance: 450, duration: 480, basePrice: 9500 }, // 8 hours
  { origin: 'Port Sudan', destination: 'Gedaref', distance: 550, duration: 600, basePrice: 11500 }, // 10 hours
  { origin: 'Omdurman', destination: 'Wad Madani', distance: 200, duration: 270, basePrice: 4200 }, // 4.5 hours
  { origin: 'Omdurman', destination: 'Kosti', distance: 280, duration: 320, basePrice: 5800 }, // 5.3 hours
  { origin: 'Wad Madani', destination: 'Gedaref', distance: 210, duration: 240, basePrice: 4500 }, // 4 hours
  { origin: 'Wad Madani', destination: 'Kassala', distance: 310, duration: 330, basePrice: 6500 }, // 5.5 hours
  { origin: 'Kassala', destination: 'Gedaref', distance: 100, duration: 120, basePrice: 2500 }, // 2 hours
  { origin: 'Atbara', destination: 'Dongola', distance: 280, duration: 300, basePrice: 5800 }, // 5 hours
];

// Departure times
const departureTimes = ['05:00', '07:30', '10:00', '14:00', '17:00', '20:00'];

// Helper functions
function generatePlateNumber(city: string, index: number): string {
  const cityPrefixes: Record<string, string> = {
    'Khartoum': 'KRT',
    'Omdurman': 'OMD',
    'Port Sudan': 'PSA',
    'Wad Madani': 'WMD',
    'Kassala': 'KSL',
    'Gedaref': 'GDF',
    'Atbara': 'ATB',
    'Kosti': 'KST',
    'Dongola': 'DNG',
  };
  const prefix = cityPrefixes[city] || 'SDN';
  return `${prefix}-${String(index + 1).padStart(5, '0')}`;
}

function generateSeatLayout(capacity: number): { rows: number; columns: number; layout: string[][] } {
  const columns = 4;
  const rows = Math.ceil(capacity / columns);
  const layout: string[][] = [];

  let seatNum = 0;
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < columns; c++) {
      if (seatNum < capacity) {
        const rowLetter = String.fromCharCode(65 + r);
        row.push(`${rowLetter}${c + 1}`);
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
  const parts = departureTime.split(':').map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const arrivalHours = Math.floor(totalMinutes / 60) % 24;
  const arrivalMinutes = totalMinutes % 60;
  return `${String(arrivalHours).padStart(2, '0')}:${String(arrivalMinutes).padStart(2, '0')}`;
}

async function main() {
  console.log('🚌 Starting transport data seeding...\n');

  // Clear existing transport data
  console.log('🧹 Clearing existing transport data...');
  await prisma.transportPayment.deleteMany();
  await prisma.seat.deleteMany();
  await prisma.transportBooking.deleteMany();
  await prisma.trip.deleteMany();
  await prisma.route.deleteMany();
  await prisma.bus.deleteMany();
  await prisma.transportOffice.deleteMany();
  await prisma.assemblyPoint.deleteMany();
  console.log('✅ Cleared existing transport data\n');

  // Create assembly points
  console.log('📍 Creating assembly points...');
  const createdAssemblyPoints: Record<string, number> = {};
  for (const point of assemblyPoints) {
    const created = await prisma.assemblyPoint.create({ data: point });
    createdAssemblyPoints[point.city] = created.id;
    console.log(`   ✓ ${point.name} (${point.nameAr})`);
  }
  console.log(`✅ Created ${assemblyPoints.length} assembly points\n`);

  // Create transport office owners
  console.log('👤 Creating transport office owners...');
  const createdOwners: string[] = [];
  for (const owner of transportOwners) {
    const hashedPassword = await bcrypt.hash(owner.password, 10);
    const user = await prisma.user.upsert({
      where: { email: owner.email },
      update: { password: hashedPassword, emailVerified: new Date() },
      create: {
        email: owner.email,
        username: owner.username,
        password: hashedPassword,
        role: 'USER',
        emailVerified: new Date(),
      },
    });
    createdOwners.push(user.id);
    console.log(`   ✓ ${owner.username} (${owner.email})`);
  }
  console.log(`✅ Created ${transportOwners.length} transport office owners\n`);

  // Create transport offices
  console.log('🏢 Creating transport offices...');
  const createdOffices: { id: number; name: string; baseCity: string }[] = [];
  for (const office of transportOffices) {
    const assemblyPointId = createdAssemblyPoints[office.baseCity];
    const ownerId = createdOwners[office.ownerIndex];
    if (!ownerId || !assemblyPointId) {
      console.error(`Missing data for office: ${office.name}`);
      continue;
    }
    const created = await prisma.transportOffice.create({
      data: {
        name: office.name,
        nameAr: office.nameAr,
        description: office.description,
        descriptionAr: office.descriptionAr,
        phone: office.phone,
        email: office.email,
        licenseNumber: office.licenseNumber,
        ownerId,
        assemblyPointId,
        isVerified: true,
        isActive: true,
        rating: 4.0 + Math.random() * 0.9,
        reviewCount: Math.floor(50 + Math.random() * 200),
      },
    });
    createdOffices.push({ id: created.id, name: office.name, baseCity: office.baseCity });
    console.log(`   ✓ ${office.name} (${office.nameAr})`);
  }
  console.log(`✅ Created ${transportOffices.length} transport offices\n`);

  // Create buses for each office
  console.log('🚐 Creating buses...');
  const createdBuses: { id: number; officeId: number; capacity: number; type: string }[] = [];
  let busIndex = 0;
  for (const office of createdOffices) {
    // Each office gets 3-4 buses
    const numBuses = 3 + Math.floor(Math.random() * 2);
    for (let i = 0; i < numBuses; i++) {
      const busConfig = busConfigs[Math.floor(Math.random() * busConfigs.length)];
      const busModel = busModels[Math.floor(Math.random() * busModels.length)];
      if (!busConfig || !busModel) continue;
      const year = busModel.years[Math.floor(Math.random() * busModel.years.length)] ?? busModel.years[0] ?? 2023;
      const seatLayout = generateSeatLayout(busConfig.capacity);

      const bus = await prisma.bus.create({
        data: {
          plateNumber: generatePlateNumber(office.baseCity, busIndex),
          model: busModel.model,
          manufacturer: busModel.manufacturer,
          year,
          capacity: busConfig.capacity,
          amenities: busConfig.amenities,
          seatLayout: seatLayout,
          officeId: office.id,
          isActive: true,
        },
      });
      createdBuses.push({ id: bus.id, officeId: office.id, capacity: busConfig.capacity, type: busConfig.type });
      busIndex++;
    }
    console.log(`   ✓ ${office.name}: ${numBuses} buses`);
  }
  console.log(`✅ Created ${createdBuses.length} buses\n`);

  // Create routes
  console.log('🛤️ Creating routes...');
  const createdRoutes: { id: number; officeId: number; origin: string; destination: string; duration: number; basePrice: number }[] = [];
  for (const office of createdOffices) {
    // Each office operates 3-5 routes
    const officeRoutes = routes.filter(r =>
      r.origin === office.baseCity ||
      (Math.random() > 0.6 && (r.origin === 'Khartoum' || r.destination === 'Khartoum'))
    ).slice(0, 5);

    for (const routeData of officeRoutes) {
      const originId = createdAssemblyPoints[routeData.origin];
      const destId = createdAssemblyPoints[routeData.destination];

      if (originId && destId) {
        try {
          const route = await prisma.route.create({
            data: {
              officeId: office.id,
              originId,
              destinationId: destId,
              basePrice: routeData.basePrice,
              duration: routeData.duration,
              distance: routeData.distance,
              isActive: true,
            },
          });
          createdRoutes.push({
            id: route.id,
            officeId: office.id,
            origin: routeData.origin,
            destination: routeData.destination,
            duration: routeData.duration,
            basePrice: routeData.basePrice,
          });
        } catch {
          // Skip duplicate routes
        }
      }
    }
    console.log(`   ✓ ${office.name}: routes created`);
  }
  console.log(`✅ Created ${createdRoutes.length} routes\n`);

  // Create trips for the next 14 days
  console.log('📅 Creating trips and seats...');
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let tripCount = 0;
  let seatCount = 0;

  // Batch process trips and seats
  const tripBatches: { trip: { routeId: number; busId: number; departureDate: Date; departureTime: string; arrivalTime: string; price: number; availableSeats: number }; busCapacity: number }[] = [];

  for (const route of createdRoutes) {
    const officeBuses = createdBuses.filter(b => b.officeId === route.officeId);
    if (officeBuses.length === 0) continue;

    // Create trips for 5 days (reduced for faster seeding)
    for (let day = 1; day <= 5; day++) {
      const tripDate = addDays(today, day);

      // 2 trips per route per day
      const numTrips = 2;
      const selectedTimes = departureTimes.slice(0, numTrips);

      for (const departureTime of selectedTimes) {
        const bus = officeBuses[Math.floor(Math.random() * officeBuses.length)];
        if (!bus) continue;
        const priceMultiplier = bus.type === 'premium' ? 1.5 : bus.type === 'standard' ? 1.2 : 1.0;
        const price = Math.round(route.basePrice * priceMultiplier);
        const arrivalTime = calculateArrivalTime(departureTime, route.duration);

        tripBatches.push({
          trip: {
            routeId: route.id,
            busId: bus.id,
            departureDate: tripDate,
            departureTime,
            arrivalTime,
            price,
            availableSeats: bus.capacity,
          },
          busCapacity: bus.capacity,
        });
      }
    }
  }

  // Create trips in smaller batches with delays to avoid connection timeouts
  const BATCH_SIZE = 10;
  const DELAY_MS = 500;

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  for (let i = 0; i < tripBatches.length; i += BATCH_SIZE) {
    const batch = tripBatches.slice(i, i + BATCH_SIZE);

    try {
      for (const { trip: tripData, busCapacity } of batch) {
        const trip = await prisma.trip.create({
          data: {
            ...tripData,
            isActive: true,
            isCancelled: false,
          },
        });
        tripCount++;

        // Create seats using createMany for efficiency
        const seatLayout = generateSeatLayout(busCapacity);
        const seatsData: { tripId: number; seatNumber: string; row: number; column: number; seatType: string; status: SeatStatus }[] = [];

        for (let r = 0; r < seatLayout.rows; r++) {
          const row = seatLayout.layout[r];
          if (!row) continue;
          for (let c = 0; c < row.length; c++) {
            const seatNumber = row[c];
            if (!seatNumber) continue;
            const seatType = c === 0 || c === 3 ? 'window' : 'aisle';

            seatsData.push({
              tripId: trip.id,
              seatNumber,
              row: r + 1,
              column: c + 1,
              seatType,
              status: SeatStatus.Available,
            });
          }
        }

        // Batch create seats
        await prisma.seat.createMany({
          data: seatsData,
        });
        seatCount += seatsData.length;
      }
    } catch (error) {
      console.log(`   ⚠️ Error in batch, retrying after delay...`);
      await sleep(2000);
      // Retry the batch once
      for (const { trip: tripData, busCapacity } of batch) {
        try {
          const trip = await prisma.trip.create({
            data: {
              ...tripData,
              isActive: true,
              isCancelled: false,
            },
          });
          tripCount++;

          const seatLayout = generateSeatLayout(busCapacity);
          const seatsData: { tripId: number; seatNumber: string; row: number; column: number; seatType: string; status: SeatStatus }[] = [];

          for (let r = 0; r < seatLayout.rows; r++) {
            const row = seatLayout.layout[r];
            if (!row) continue;
            for (let c = 0; c < row.length; c++) {
              const seatNumber = row[c];
              if (!seatNumber) continue;
              const seatType = c === 0 || c === 3 ? 'window' : 'aisle';

              seatsData.push({
                tripId: trip.id,
                seatNumber,
                row: r + 1,
                column: c + 1,
                seatType,
                status: SeatStatus.Available,
              });
            }
          }

          await prisma.seat.createMany({
            data: seatsData,
          });
          seatCount += seatsData.length;
        } catch {
          console.log(`   ⚠️ Skipped one trip due to error`);
        }
      }
    }

    console.log(`   Progress: ${Math.min(i + BATCH_SIZE, tripBatches.length)}/${tripBatches.length} trips`);

    // Add delay between batches to avoid overwhelming the database
    if (i + BATCH_SIZE < tripBatches.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`✅ Created ${tripCount} trips with ${seatCount} seats\n`);

  // Create sample bookings
  console.log('🎫 Creating sample bookings...');
  const testUser = await prisma.user.findUnique({ where: { email: 'office@hotmail.com' } });

  if (testUser) {
    // Get some trips for booking
    const upcomingTrips = await prisma.trip.findMany({
      where: {
        departureDate: { gte: addDays(today, 2), lte: addDays(today, 7) },
        isActive: true,
        isCancelled: false,
      },
      include: {
        route: { include: { origin: true, destination: true, office: true } },
        seats: { where: { status: SeatStatus.Available }, take: 4 },
      },
      take: 10,
    });

    let bookingCount = 0;
    const passengerNames = [
      'Mohammed Ali', 'Amina Ahmed', 'Ibrahim Hassan', 'Fatima Omar',
      'Yusuf Khalid', 'Zainab Mohammed', 'Ahmad Osman', 'Sara Ibrahim',
      'Khalid Abdalla', 'Hawa Yusuf',
    ];

    for (const trip of upcomingTrips) {
      if (trip.seats.length < 2) continue;

      const numSeats = 1 + Math.floor(Math.random() * 2);
      const selectedSeats = trip.seats.slice(0, numSeats);
      const passengerName = passengerNames[Math.floor(Math.random() * passengerNames.length)] ?? 'Test User';
      const totalAmount = trip.price * numSeats;

      const statuses: TransportBookingStatus[] = [
        TransportBookingStatus.Confirmed,
        TransportBookingStatus.Confirmed,
        TransportBookingStatus.Pending,
        TransportBookingStatus.Completed,
      ];
      const status = statuses[Math.floor(Math.random() * statuses.length)] ?? TransportBookingStatus.Confirmed;

      const booking = await prisma.transportBooking.create({
        data: {
          userId: testUser.id,
          tripId: trip.id,
          officeId: trip.route.officeId,
          passengerName,
          passengerPhone: `+2499${String(Math.floor(10000000 + Math.random() * 90000000))}`,
          passengerEmail: `${passengerName.toLowerCase().replace(' ', '.')}@example.com`,
          totalAmount,
          status,
          confirmedAt: status === TransportBookingStatus.Confirmed || status === TransportBookingStatus.Completed ? new Date() : null,
        },
      });

      // Update seats
      for (const seat of selectedSeats) {
        await prisma.seat.update({
          where: { id: seat.id },
          data: {
            status: status === TransportBookingStatus.Pending ? SeatStatus.Reserved : SeatStatus.Booked,
            bookingId: booking.id,
          },
        });
      }

      // Update available seats count
      await prisma.trip.update({
        where: { id: trip.id },
        data: { availableSeats: { decrement: numSeats } },
      });

      // Create payment
      const paymentMethods: TransportPaymentMethod[] = [
        TransportPaymentMethod.MobileMoney,
        TransportPaymentMethod.CashOnArrival,
        TransportPaymentMethod.BankTransfer,
      ];
      const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)] ?? TransportPaymentMethod.MobileMoney;
      const paymentStatus = status === TransportBookingStatus.Pending
        ? TransportPaymentStatus.Pending
        : TransportPaymentStatus.Paid;

      await prisma.transportPayment.create({
        data: {
          bookingId: booking.id,
          amount: totalAmount,
          method: paymentMethod,
          status: paymentStatus,
          transactionId: paymentStatus === TransportPaymentStatus.Paid ? `TXN-${Date.now()}-${Math.random().toString(36).substring(7)}` : null,
          paidAt: paymentStatus === TransportPaymentStatus.Paid ? new Date() : null,
        },
      });

      bookingCount++;
      console.log(`   ✓ Booking: ${passengerName} - ${trip.route.origin.city} → ${trip.route.destination.city}`);
    }
    console.log(`✅ Created ${bookingCount} sample bookings\n`);
  } else {
    console.log('⚠️  Test user (office@hotmail.com) not found. Run seed:test-user first.\n');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🎉 Transport data seeding completed successfully!');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`📊 Summary:`);
  console.log(`   • ${assemblyPoints.length} assembly points (cities)`);
  console.log(`   • ${transportOwners.length} transport office owners`);
  console.log(`   • ${transportOffices.length} transport offices`);
  console.log(`   • ${createdBuses.length} buses`);
  console.log(`   • ${createdRoutes.length} routes`);
  console.log(`   • ${tripCount} trips`);
  console.log(`   • ${seatCount} seats`);
  console.log('');
  console.log('🔐 Test accounts (password: 123456):');
  for (const owner of transportOwners) {
    console.log(`   • ${owner.email}`);
  }
  console.log('');
  console.log('🌐 Test the transport feature at:');
  console.log('   • Public: /en/transport');
  console.log('   • Host: /en/transport-host');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
