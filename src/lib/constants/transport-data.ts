// Sudan Intercity Bus Transportation Data
// Sources: Transport Chamber rates (2025), Sudafax, Musafir, Tirhal

// ─── Types ───────────────────────────────────────────────────────────────────

export type CityStatus = 'active' | 'conflict' | 'limited' | 'suspended';

export interface AssemblyPointData {
  name: string;
  nameAr: string;
  city: string;
  cityAr: string;
  state: string;
  latitude: number;
  longitude: number;
  stationName: string;
  status: CityStatus;
}

export interface RouteData {
  origin: string;
  destination: string;
  price: number;    // SDG
  distance: number; // km
  duration: number; // hours
}

export type CompanyType =
  | 'luxury-coach'
  | 'standard-operator'
  | 'platform'
  | 'terminal-operator'
  | 'logistics'
  | 'state-owned'
  | 'regional';

export type CompanyStatus = 'active' | 'limited' | 'defunct';

export interface BusCompanyData {
  name: string;
  nameAr: string;
  type: CompanyType;
  status: CompanyStatus;
  routes: string[];
  bookingMethods: string[];
  offices: string[];
  fleet?: string;
  notes?: string;
}

// ─── Assembly Points ─────────────────────────────────────────────────────────

export const ASSEMBLY_POINTS: AssemblyPointData[] = [
  {
    name: 'Khartoum Land Terminal',
    nameAr: 'الموقف البري الخرطوم',
    city: 'Khartoum',
    cityAr: 'الخرطوم',
    state: 'Khartoum',
    latitude: 15.5007,
    longitude: 32.5599,
    stationName: 'Khartoum Land Terminal (South Khartoum)',
    status: 'active',
  },
  {
    name: 'Halayeb Station',
    nameAr: 'موقف حلايب',
    city: 'Omdurman',
    cityAr: 'أم درمان',
    state: 'Khartoum',
    latitude: 15.6445,
    longitude: 32.4777,
    stationName: 'Halayeb Station (relocated to Shambat, Bahri Jan 2026)',
    status: 'active',
  },
  {
    name: 'Shambat Station',
    nameAr: 'موقف شمبات',
    city: 'Khartoum North (Bahri)',
    cityAr: 'بحري',
    state: 'Khartoum',
    latitude: 15.6361,
    longitude: 32.5528,
    stationName: 'Shambat Station (new official station since Jan 2026)',
    status: 'active',
  },
  {
    name: 'Port Sudan Bus Terminal',
    nameAr: 'الموقف البري بورتسودان',
    city: 'Port Sudan',
    cityAr: 'بورتسودان',
    state: 'Red Sea',
    latitude: 19.5856,
    longitude: 37.2159,
    stationName: 'Port Sudan Bus Terminal',
    status: 'active',
  },
  {
    name: 'Kassala Bus Station',
    nameAr: 'موقف كسلا',
    city: 'Kassala',
    cityAr: 'كسلا',
    state: 'Kassala',
    latitude: 15.4503,
    longitude: 36.3986,
    stationName: 'Kassala Bus Station',
    status: 'active',
  },
  {
    name: 'Madani Bus Station',
    nameAr: 'موقف ود مدني',
    city: 'Wad Madani',
    cityAr: 'ود مدني',
    state: 'Gezira',
    latitude: 14.4012,
    longitude: 33.5199,
    stationName: 'Madani Bus Station',
    status: 'active',
  },
  {
    name: 'Atbara Bus Terminal',
    nameAr: 'الموقف البري عطبرة',
    city: 'Atbara',
    cityAr: 'عطبرة',
    state: 'Nile',
    latitude: 17.7024,
    longitude: 33.9868,
    stationName: 'Atbara Bus Terminal',
    status: 'active',
  },
  {
    name: 'Shendi Bus Station',
    nameAr: 'موقف شندي',
    city: 'Shendi',
    cityAr: 'شندي',
    state: 'Nile',
    latitude: 16.6833,
    longitude: 33.4333,
    stationName: 'Shendi Bus Station',
    status: 'active',
  },
  {
    name: 'Dongola Bus Station',
    nameAr: 'موقف دنقلا',
    city: 'Dongola',
    cityAr: 'دنقلا',
    state: 'Northern',
    latitude: 19.1753,
    longitude: 30.4767,
    stationName: 'Dongola Bus Station',
    status: 'active',
  },
  {
    name: 'Gedaref Bus Station',
    nameAr: 'موقف القضارف',
    city: 'Gedaref',
    cityAr: 'القضارف',
    state: 'Gedaref',
    latitude: 14.0333,
    longitude: 35.3833,
    stationName: 'Gedaref Bus Station',
    status: 'active',
  },
  {
    name: 'El Obeid Bus Terminal',
    nameAr: 'الموقف البري الأبيض',
    city: 'El Obeid',
    cityAr: 'الأبيض',
    state: 'North Kordofan',
    latitude: 13.1833,
    longitude: 30.2167,
    stationName: 'El Obeid Bus Terminal',
    status: 'active',
  },
  {
    name: 'Sennar Bus Station',
    nameAr: 'موقف سنار',
    city: 'Sennar',
    cityAr: 'سنار',
    state: 'Sennar',
    latitude: 13.55,
    longitude: 33.6167,
    stationName: 'Sennar Bus Station',
    status: 'active',
  },
  {
    name: 'Kosti Bus Station',
    nameAr: 'موقف كوستي',
    city: 'Kosti',
    cityAr: 'كوستي',
    state: 'White Nile',
    latitude: 13.1629,
    longitude: 32.6635,
    stationName: 'Kosti Bus Station',
    status: 'active',
  },
  {
    name: 'Rabak Bus Station',
    nameAr: 'موقف ربك',
    city: 'Rabak',
    cityAr: 'ربك',
    state: 'White Nile',
    latitude: 13.1667,
    longitude: 32.7333,
    stationName: 'Rabak Bus Station',
    status: 'active',
  },
  {
    name: 'Karima/Merowe Bus Station',
    nameAr: 'موقف كريمة/مروي',
    city: 'Karima',
    cityAr: 'كريمة',
    state: 'Northern',
    latitude: 18.55,
    longitude: 31.85,
    stationName: 'Karima/Merowe Bus Station',
    status: 'active',
  },
  {
    name: 'Damazin Bus Station',
    nameAr: 'موقف الدمازين',
    city: 'Ed Damazin',
    cityAr: 'الدمازين',
    state: 'Blue Nile',
    latitude: 11.7667,
    longitude: 34.35,
    stationName: 'Damazin Bus Station',
    status: 'active',
  },
  {
    name: 'Nyala Bus Terminal',
    nameAr: 'الموقف البري نيالا',
    city: 'Nyala',
    cityAr: 'نيالا',
    state: 'South Darfur',
    latitude: 12.05,
    longitude: 24.8833,
    stationName: 'Nyala Bus Terminal',
    status: 'conflict',
  },
  {
    name: 'El Fasher Bus Terminal',
    nameAr: 'الموقف البري الفاشر',
    city: 'El Fasher',
    cityAr: 'الفاشر',
    state: 'North Darfur',
    latitude: 13.6333,
    longitude: 25.35,
    stationName: 'El Fasher Bus Terminal',
    status: 'conflict',
  },
  {
    name: 'Kadugli Bus Station',
    nameAr: 'موقف كادقلي',
    city: 'Kadugli',
    cityAr: 'كادقلي',
    state: 'South Kordofan',
    latitude: 11.0167,
    longitude: 29.7167,
    stationName: 'Kadugli Bus Station',
    status: 'limited',
  },
  {
    name: 'Wadi Halfa Bus Terminal',
    nameAr: 'الموقف البري وادي حلفا',
    city: 'Wadi Halfa',
    cityAr: 'وادي حلفا',
    state: 'Northern',
    latitude: 21.8,
    longitude: 31.35,
    stationName: 'Wadi Halfa Bus Terminal',
    status: 'active',
  },
  {
    name: 'Berber Bus Station',
    nameAr: 'موقف بربر',
    city: 'Berber',
    cityAr: 'بربر',
    state: 'Nile',
    latitude: 18.0167,
    longitude: 33.9833,
    stationName: 'Berber Bus Station',
    status: 'active',
  },
  {
    name: 'Sinja Bus Station',
    nameAr: 'موقف سنجة',
    city: 'Sinja',
    cityAr: 'سنجة',
    state: 'Sennar',
    latitude: 13.15,
    longitude: 33.9333,
    stationName: 'Sinja Bus Station',
    status: 'active',
  },
  {
    name: 'Abu Hamed Bus Station',
    nameAr: 'موقف أبو حمد',
    city: 'Abu Hamed',
    cityAr: 'أبو حمد',
    state: 'Nile',
    latitude: 19.5333,
    longitude: 33.3167,
    stationName: 'Abu Hamed Bus Station',
    status: 'active',
  },
  {
    name: 'El Daein Bus Station',
    nameAr: 'موقف الضعين',
    city: 'El Daein',
    cityAr: 'الضعين',
    state: 'East Darfur',
    latitude: 11.4667,
    longitude: 26.1333,
    stationName: 'El Daein Bus Station',
    status: 'conflict',
  },
  {
    name: 'El Geneina Bus Terminal',
    nameAr: 'الموقف البري الجنينة',
    city: 'El Geneina',
    cityAr: 'الجنينة',
    state: 'West Darfur',
    latitude: 13.45,
    longitude: 22.45,
    stationName: 'El Geneina Bus Terminal',
    status: 'conflict',
  },
  {
    name: 'Manaqil Bus Station',
    nameAr: 'موقف المناقل',
    city: 'Al Manaqil',
    cityAr: 'المناقل',
    state: 'Gezira',
    latitude: 14.25,
    longitude: 32.9833,
    stationName: 'Manaqil Bus Station',
    status: 'active',
  },
  {
    name: 'Duwaym Bus Station',
    nameAr: 'موقف الدويم',
    city: 'Al Duwaym',
    cityAr: 'الدويم',
    state: 'White Nile',
    latitude: 14.0,
    longitude: 32.3167,
    stationName: 'Duwaym Bus Station',
    status: 'active',
  },
];

// ─── Routes ──────────────────────────────────────────────────────────────────

// From Port Sudan (2025 Transport Chamber rates)
const ROUTES_FROM_PORT_SUDAN: RouteData[] = [
  { origin: 'Port Sudan', destination: 'Atbara', price: 48000, distance: 480, duration: 6 },
  { origin: 'Port Sudan', destination: 'Kassala', price: 56000, distance: 568, duration: 8 },
  { origin: 'Port Sudan', destination: 'Shendi', price: 61500, distance: 540, duration: 7 },
  { origin: 'Port Sudan', destination: 'Gedaref', price: 75000, distance: 650, duration: 9 },
  { origin: 'Port Sudan', destination: 'Karima', price: 76000, distance: 700, duration: 9 },
  { origin: 'Port Sudan', destination: 'Omdurman', price: 80000, distance: 680, duration: 12 },
  { origin: 'Port Sudan', destination: 'Wad Madani', price: 98500, distance: 750, duration: 10 },
  { origin: 'Port Sudan', destination: 'Al Duwaym', price: 99000, distance: 850, duration: 12 },
  { origin: 'Port Sudan', destination: 'Dongola', price: 100000, distance: 800, duration: 10 },
  { origin: 'Port Sudan', destination: 'Sennar', price: 105000, distance: 800, duration: 11 },
  { origin: 'Port Sudan', destination: 'Al Manaqil', price: 108000, distance: 780, duration: 11 },
  { origin: 'Port Sudan', destination: 'Kosti', price: 120000, distance: 900, duration: 13 },
];

// From Gedaref
const ROUTES_FROM_GEDAREF: RouteData[] = [
  { origin: 'Gedaref', destination: 'Wad Madani', price: 23000, distance: 200, duration: 3 },
  { origin: 'Gedaref', destination: 'Sennar', price: 33000, distance: 280, duration: 4 },
  { origin: 'Gedaref', destination: 'Rabak', price: 35000, distance: 350, duration: 5 },
  { origin: 'Gedaref', destination: 'Kosti', price: 44500, distance: 400, duration: 6 },
];

// From Kassala
const ROUTES_FROM_KASSALA: RouteData[] = [
  { origin: 'Kassala', destination: 'Port Sudan', price: 56000, distance: 568, duration: 8 },
  { origin: 'Kassala', destination: 'Atbara', price: 47000, distance: 450, duration: 6 },
  { origin: 'Kassala', destination: 'Sennar', price: 54000, distance: 500, duration: 7 },
  { origin: 'Kassala', destination: 'Al Duwaym', price: 60000, distance: 600, duration: 8 },
  { origin: 'Kassala', destination: 'Dongola', price: 88000, distance: 800, duration: 11 },
];

// From Khartoum/Omdurman (estimated based on distance × current rate)
const ROUTES_FROM_KHARTOUM: RouteData[] = [
  { origin: 'Khartoum', destination: 'Wad Madani', price: 25000, distance: 186, duration: 3 },
  { origin: 'Khartoum', destination: 'Shendi', price: 25000, distance: 175, duration: 3 },
  { origin: 'Khartoum', destination: 'Sennar', price: 35000, distance: 300, duration: 4 },
  { origin: 'Khartoum', destination: 'Kosti', price: 40000, distance: 310, duration: 5 },
  { origin: 'Khartoum', destination: 'Atbara', price: 45000, distance: 306, duration: 5 },
  { origin: 'Khartoum', destination: 'Gedaref', price: 50000, distance: 410, duration: 6 },
  { origin: 'Khartoum', destination: 'El Obeid', price: 55000, distance: 570, duration: 8 },
  { origin: 'Khartoum', destination: 'Dongola', price: 65000, distance: 500, duration: 7 },
  { origin: 'Khartoum', destination: 'Kassala', price: 70000, distance: 480, duration: 8 },
  { origin: 'Khartoum', destination: 'Ed Damazin', price: 65000, distance: 550, duration: 8 },
  { origin: 'Khartoum', destination: 'Port Sudan', price: 80000, distance: 680, duration: 12 },
  { origin: 'Khartoum', destination: 'Kadugli', price: 80000, distance: 700, duration: 10 },
  { origin: 'Khartoum', destination: 'El Fasher', price: 110000, distance: 900, duration: 14 },
  { origin: 'Khartoum', destination: 'Nyala', price: 130000, distance: 1000, duration: 16 },
  { origin: 'Khartoum', destination: 'El Geneina', price: 130000, distance: 1100, duration: 18 },
  { origin: 'Omdurman', destination: 'Dongola', price: 65000, distance: 500, duration: 7 },
];

// From Atbara
const ROUTES_FROM_ATBARA: RouteData[] = [
  { origin: 'Atbara', destination: 'Shendi', price: 10000, distance: 130, duration: 2 },
  { origin: 'Atbara', destination: 'Port Sudan', price: 48000, distance: 480, duration: 6 },
  { origin: 'Atbara', destination: 'Dongola', price: 55000, distance: 450, duration: 6 },
];

export const ROUTES: RouteData[] = [
  ...ROUTES_FROM_PORT_SUDAN,
  ...ROUTES_FROM_GEDAREF,
  ...ROUTES_FROM_KASSALA,
  ...ROUTES_FROM_KHARTOUM,
  ...ROUTES_FROM_ATBARA,
];

// ─── Popular Routes (for UI display) ────────────────────────────────────────

export const POPULAR_ROUTES: RouteData[] = [
  { origin: 'Port Sudan', destination: 'Atbara', price: 48000, distance: 480, duration: 6 },
  { origin: 'Port Sudan', destination: 'Kassala', price: 56000, distance: 568, duration: 8 },
  { origin: 'Port Sudan', destination: 'Wad Madani', price: 98500, distance: 750, duration: 10 },
  { origin: 'Port Sudan', destination: 'Dongola', price: 100000, distance: 800, duration: 10 },
  { origin: 'Atbara', destination: 'Dongola', price: 55000, distance: 450, duration: 6 },
  { origin: 'Kassala', destination: 'Gedaref', price: 23000, distance: 200, duration: 3 },
  { origin: 'Khartoum', destination: 'Port Sudan', price: 80000, distance: 680, duration: 12 },
  { origin: 'Khartoum', destination: 'Wad Madani', price: 25000, distance: 186, duration: 3 },
];

// ─── Bus Companies ───────────────────────────────────────────────────────────

export const BUS_COMPANIES: BusCompanyData[] = [
  // ── Digital Platforms ────────────────────────────────────────────────────
  {
    name: 'Tirhal',
    nameAr: 'ترحال',
    type: 'platform',
    status: 'active',
    routes: [
      'Khartoum ↔ Port Sudan',
      'Khartoum ↔ Wadi Halfa',
      'Khartoum ↔ Dongola',
      'Khartoum ↔ Aswan (Egypt)',
    ],
    bookingMethods: ['Mobile app (Android/iOS)', 'WhatsApp', 'Facebook'],
    offices: [
      'Khartoum (Sixty Street pickup)',
      'Khartoum (Al-Wadi Street pickup)',
      'Port Sudan (Red Sea University St)',
      'Wad Madani (Ahmed Araki Bldg, 2F)',
      'El Obeid (Aldouha, Dal Bldg, 2F)',
    ],
    notes: 'Aggregator partnering with Abu Amer, Rodeena, Al-Rifai, Northern Unit. Accepts BushraPay digital wallet.',
  },
  {
    name: 'Musafir',
    nameAr: 'مسافر',
    type: 'platform',
    status: 'active',
    routes: [
      'Port Sudan ↔ Atbara',
      'Port Sudan ↔ Dongola',
      'Atbara ↔ Dongola',
      'Port Sudan ↔ Kassala',
      'Port Sudan ↔ Wad Madani',
      'Port Sudan ↔ Sennar',
      'Port Sudan ↔ Kosti',
      'Port Sudan ↔ Shendi',
      'Port Sudan ↔ Wadi Halfa',
      'Port Sudan ↔ Abu Hamed',
      'Port Sudan ↔ Karima',
      'Port Sudan ↔ Ed Damazin',
      'Port Sudan ↔ Sinja',
      'Khartoum ↔ multiple cities',
      'Cross-border: Aswan, Cairo, Arqin',
    ],
    bookingMethods: ['Website (musafir-sd.com)', 'Mobile app', 'Phone (6525)', 'Fawry payment'],
    offices: ['Online platform (24/7 customer service)'],
    notes: "Sudan's first dedicated bus ticket booking site. Also offers flights, hotels, and parcel delivery.",
  },

  // ── Luxury Coach Operators (The Big Four) ────────────────────────────────
  {
    name: 'Jamal El-Din',
    nameAr: 'جمال الدين',
    type: 'luxury-coach',
    status: 'active',
    routes: [
      'Khartoum ↔ Port Sudan',
      'Khartoum ↔ Kassala',
      'Khartoum ↔ Atbara',
      'Khartoum ↔ Dongola',
      'Khartoum ↔ Karima',
      'Khartoum ↔ El Obeid',
      'Khartoum ↔ Dilling',
    ],
    bookingMethods: ['Walk-up at terminals', 'Phone'],
    offices: ['Khartoum Land Terminal', 'Port Sudan Bus Terminal'],
    fleet: 'AC coaches with reclining seats, hot/cold drinks, snacks',
    notes: 'One of the four major luxury operators. Referenced in Bradt, iExplore, and Atlas travel guides.',
  },
  {
    name: 'MCV',
    nameAr: 'ام سي في',
    type: 'luxury-coach',
    status: 'active',
    routes: [
      'Khartoum ↔ Port Sudan',
      'Khartoum ↔ Kassala',
      'Khartoum ↔ Atbara',
      'Khartoum ↔ Dongola',
      'Khartoum ↔ Karima',
      'Khartoum ↔ El Obeid',
      'Khartoum ↔ Dilling',
    ],
    bookingMethods: ['Walk-up at terminals', 'Phone'],
    offices: ['Khartoum Land Terminal', 'Port Sudan Bus Terminal'],
    fleet: 'Egyptian-manufactured MCV bus bodies, AC coaches',
    notes: 'Named after Manufacturing Commercial Vehicles (Egypt). One of the Big Four luxury operators.',
  },
  {
    name: 'Igbalco',
    nameAr: 'إقبالكو',
    type: 'luxury-coach',
    status: 'active',
    routes: [
      'Khartoum ↔ Port Sudan',
      'Khartoum ↔ Kassala',
      'Khartoum ↔ Atbara',
      'Khartoum ↔ Dongola',
      'Khartoum ↔ Karima',
      'Khartoum ↔ El Obeid',
      'Khartoum ↔ Dilling',
    ],
    bookingMethods: ['Walk-up at terminals', 'Phone'],
    offices: ['Khartoum Land Terminal'],
    fleet: 'AC coaches with reclining seats',
    notes: 'One of the Big Four luxury coach operators.',
  },
  {
    name: 'Marshal',
    nameAr: 'مارشال',
    type: 'luxury-coach',
    status: 'active',
    routes: [
      'Khartoum ↔ Port Sudan',
      'Khartoum ↔ Kassala',
      'Khartoum ↔ Atbara',
      'Khartoum ↔ Dongola',
      'Khartoum ↔ Karima',
      'Khartoum ↔ El Obeid',
      'Khartoum ↔ Dilling',
    ],
    bookingMethods: ['Walk-up at terminals', 'Phone'],
    offices: ['Khartoum Land Terminal'],
    fleet: 'Fast AC coaches, reclining seats, hot/cold drinks, snack service',
    notes: 'One of the Big Four. Known for punctual schedules and onboard service.',
  },

  // ── Major Intercity Operators ────────────────────────────────────────────
  {
    name: 'Abu Amer',
    nameAr: 'أبو عامر',
    type: 'standard-operator',
    status: 'active',
    routes: [
      'Khartoum/Omdurman ↔ Port Sudan',
      'Khartoum ↔ Wadi Halfa',
      'Khartoum ↔ Dongola',
      'Khartoum ↔ Aswan (Egypt)',
    ],
    bookingMethods: ['Walk-up at stations', 'Tirhal app', 'WhatsApp'],
    offices: ['Khartoum Land Terminal', 'Omdurman Halayeb Station'],
    fleet: '2023 model buses',
    notes: 'Tirhal partner operator. Runs modern fleet on long-haul routes.',
  },
  {
    name: 'Rodeena',
    nameAr: 'رودينة',
    type: 'standard-operator',
    status: 'active',
    routes: [
      'Khartoum ↔ Port Sudan',
      'Khartoum ↔ Wadi Halfa',
      'Khartoum ↔ Dongola',
      'Khartoum ↔ Kassala',
      'Khartoum ↔ Aswan (Egypt)',
    ],
    bookingMethods: ['Walk-up at stations', 'Tirhal app', 'WhatsApp'],
    offices: [
      'Khartoum Land Terminal',
      'Kassala (near hospital by the souq)',
    ],
    fleet: '2023 model buses',
    notes: 'Tirhal partner. Recommended by travelers for making fewer stops.',
  },
  {
    name: 'Al-Rifai',
    nameAr: 'الرفاعي',
    type: 'standard-operator',
    status: 'active',
    routes: [
      'Port Sudan corridor routes',
      'Khartoum ↔ Port Sudan',
      'Khartoum ↔ Atbara',
      'Multiple intercity routes',
    ],
    bookingMethods: ['Walk-up at stations', 'Tirhal app', 'Phone'],
    offices: ['Khartoum Land Terminal', 'Port Sudan Bus Terminal'],
    notes: 'Tirhal partner. Culturally prominent in Sudan with distinctive buses.',
  },
  {
    name: 'Al Sharif',
    nameAr: 'الشريف',
    type: 'standard-operator',
    status: 'active',
    routes: [
      'Khartoum ↔ Port Sudan',
      'Khartoum ↔ Kassala',
      'Khartoum ↔ Atbara',
      'Major intercity routes from Khartoum',
    ],
    bookingMethods: ['Walk-up at Khartoum Land Terminal', 'Phone'],
    offices: ['Khartoum Land Terminal'],
    notes: 'Recommended by travelers for making fewer stops on long routes.',
  },
  {
    name: 'Northern Unit Buses',
    nameAr: 'باصات الوحدة الشمالية',
    type: 'regional',
    status: 'active',
    routes: [
      'Dongola ↔ Wadi Halfa',
      'Dongola ↔ Atbara',
      'Northern Sudan corridor',
    ],
    bookingMethods: ['Walk-up at stations', 'Tirhal app'],
    offices: ['Dongola Bus Station', 'Wadi Halfa Bus Terminal'],
    notes: 'Tirhal partner. Specializes in northern Sudan routes along the Nile.',
  },

  // ── Terminal & Logistics Operators ───────────────────────────────────────
  {
    name: 'Elnefeidi Group',
    nameAr: 'مجموعة النفيدي',
    type: 'terminal-operator',
    status: 'active',
    routes: ['Operates Khartoum Land Terminal (all routes)', 'Logistics nationwide'],
    bookingMethods: ['Terminal walk-up (500+ buses daily, 10,000 passengers/day)'],
    offices: ['Khartoum Land Terminal (Meena al-Barre)'],
    fleet: 'Largest land logistics fleet in Sudan. Scania dealer (Bashir Motors).',
    notes: 'Est. 1974. Runs KLT: 4 departure halls (tourist, 2nd class, Nissan, minibus). 30,000 daily passengers at peak.',
  },
  {
    name: 'Al-Mgal Company',
    nameAr: 'شركة المجال المحدودة',
    type: 'logistics',
    status: 'active',
    routes: ['Represents 35+ travel agencies', 'Transport and logistics division'],
    bookingMethods: ['Station offices', 'Phone'],
    offices: [
      'Khartoum (Riyadh Square, Building 22)',
      'Port Sudan (Market area, Ports Building)',
    ],
    notes: 'Holding company with transport and travel divisions. Distributor for multiple travel agencies.',
  },

  // ── State-Owned & Public ─────────────────────────────────────────────────
  {
    name: 'Khartoum State Transport Corp.',
    nameAr: 'هيئة نقل ولاية الخرطوم',
    type: 'state-owned',
    status: 'limited',
    routes: ['Khartoum urban routes', 'Khartoum suburban routes', 'Omdurman ↔ Bahri'],
    bookingMethods: ['Walk-up'],
    offices: ['Khartoum area terminals'],
    notes: 'State-owned. Primarily urban/suburban. Severely impacted by April 2023 war.',
  },

  // ── Regional Operators ───────────────────────────────────────────────────
  {
    name: 'Kassala Express',
    nameAr: 'كسلا اكسبريس',
    type: 'regional',
    status: 'active',
    routes: [
      'Kassala ↔ Port Sudan',
      'Kassala ↔ Gedaref',
      'Kassala ↔ New Halfa',
    ],
    bookingMethods: ['Walk-up at Kassala Bus Station', 'Phone'],
    offices: ['Kassala Bus Station'],
    notes: 'Regional operator serving eastern Sudan routes.',
  },
  {
    name: 'Gezira Transport',
    nameAr: 'نقل الجزيرة',
    type: 'regional',
    status: 'active',
    routes: [
      'Wad Madani ↔ Khartoum',
      'Wad Madani ↔ Sennar',
      'Wad Madani ↔ Gedaref',
      'Wad Madani ↔ Al Manaqil',
    ],
    bookingMethods: ['Walk-up at Madani Bus Station', 'Phone'],
    offices: ['Wad Madani Bus Station'],
    notes: 'Regional operator covering Gezira state routes.',
  },
  {
    name: 'Nile Valley Transport',
    nameAr: 'نقل وادي النيل',
    type: 'regional',
    status: 'active',
    routes: [
      'Atbara ↔ Shendi',
      'Atbara ↔ Berber',
      'Atbara ↔ Abu Hamed',
      'Atbara ↔ Ed Damer',
    ],
    bookingMethods: ['Walk-up at Atbara Bus Terminal', 'Phone'],
    offices: ['Atbara Bus Terminal'],
    notes: 'Regional operator on Nile state short-haul routes.',
  },
  {
    name: 'White Nile Transport',
    nameAr: 'نقل النيل الأبيض',
    type: 'regional',
    status: 'active',
    routes: [
      'Kosti ↔ Rabak',
      'Kosti ↔ Al Duwaym',
      'Kosti ↔ Sennar',
      'Kosti ↔ Khartoum',
    ],
    bookingMethods: ['Walk-up at Kosti Bus Station', 'Phone'],
    offices: ['Kosti Bus Station', 'Rabak Bus Station'],
    notes: 'Regional operator covering White Nile state routes.',
  },
  {
    name: 'Red Sea Transport',
    nameAr: 'نقل البحر الأحمر',
    type: 'regional',
    status: 'active',
    routes: [
      'Port Sudan ↔ Suakin',
      'Port Sudan ↔ Tokar',
      'Port Sudan ↔ Halaib',
    ],
    bookingMethods: ['Walk-up at Port Sudan Bus Terminal', 'Phone'],
    offices: ['Port Sudan Bus Terminal'],
    notes: 'Regional operator serving Red Sea state coastal routes.',
  },

  // ── Defunct / Exited Market ──────────────────────────────────────────────
  {
    name: 'Afras Transport',
    nameAr: 'أفراس للنقل',
    type: 'standard-operator',
    status: 'defunct',
    routes: ['Formerly: multiple intercity routes from Wad Madani'],
    bookingMethods: [],
    offices: ['Wad Madani (closed)'],
    notes: 'Exited market pre-war due to 3,800M SDG accumulated taxes. Displaced 200+ workers. One of 12 companies that left the sector.',
  },
];

// ─── Travel Culture & Practical Info ─────────────────────────────────────────

export const TRAVEL_CULTURE = {
  // Document requirements
  idRequired: true, // National ID, passport, or national number required for interstate travel
  regulatoryBody: 'Union of Transport Chambers (اتحاد غرف النقل)',

  // Pricing system
  pricingFormula: 'Per-kilometer rate set by Transport Chamber',
  historicalRate: 3.5, // SDG per km (old rate)
  priceFactors: ['fuel costs', 'spare parts', 'currency depreciation', 'maintenance'],
  recentIncrease: '21-86% increase reported in 2025',

  // Station culture
  stationEntryFee: true, // Small fee to enter some terminals
  stationName: 'موقف (mawqif)', // Arabic term for bus station/assembly point
  typicalLocation: "Near Souk Ash-Shaabi (people's market) in most towns",

  // Booking methods
  bookingMethods: [
    'Walk-up at station (most common)',
    'WhatsApp (Tirhal and others)',
    'Online platforms (Musafir)',
    'Phone booking',
    'Agent offices',
  ],

  // Payment
  paymentMethods: [
    'Cash (dominant)',
    'Mobile money (emerging)',
    'Bank transfer (for advance booking)',
  ],

  // Travel tips
  departurePattern: 'Most long-distance buses depart early morning (4-6 AM)',
  nightDrivingBan: true, // Buses are not allowed to drive at night in Sudan
  advanceBooking: '50% deposit typical for advance bookings',
  luggagePolicy: 'Usually included, excess charged separately',
  informalSector: 'Many buses operate outside formal terminals',
  midwayStops: 'Buses stop at least once midway for food and prayer',

  // Bus types
  busTypes: [
    'Modern air-conditioned coaches (premium routes)',
    'Standard buses (most common)',
    'Minibuses (shorter routes)',
    'Shared taxis/trucks (rural areas)',
  ],

  // Current situation (2025-2026)
  conflictImpact: 'War since April 2023 disrupted Khartoum services',
  currentHub: 'Port Sudan became de facto transportation hub',
  khartoumStatus: 'Services being restored gradually (Jan 2026 station relocation to Shambat)',
  activeCorridors: [
    'Port Sudan ↔ Atbara ↔ Shendi corridor (Northern/Eastern)',
    'Port Sudan ↔ Kassala ↔ Gedaref corridor (Eastern)',
    'Atbara ↔ Dongola ↔ Wadi Halfa corridor (Northern)',
    'Port Sudan ↔ Wad Madani ↔ Sennar corridor (Central)',
    'Khartoum area (gradually resuming)',
  ],
} as const;

// ─── Industry Stats ──────────────────────────────────────────────────────────

export const INDUSTRY_STATS = {
  preWarFleet: 4000,          // Total buses before April 2023
  currentFleet: 1500,         // Estimated operational buses (~25% of pre-war)
  companiesExited: 60,        // Companies that left the sector (pre-war + post-war)
  regulatoryBody: 'National Chamber of Intercity Bus Owners (الغرفة القومية لأصحاب الباصات السفرية)',
  chairman: 'Ahmed Al-Tarifi',
  kltDailyBuses: 500,         // Khartoum Land Terminal: 500+ buses daily (pre-war)
  kltDailyPassengers: 10000,  // Normal: 10,000; peak: 30,000
  kltDepartureHalls: 4,       // Tourist, 2nd class, Nissan, minibus
  kltOpenedDate: '2004-10-24',
} as const;
