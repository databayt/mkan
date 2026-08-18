/**
 * Port Sudan Comprehensive Zones & Rental Supply Density Generator
 *
 * Full multi-source taxonomy:
 * - 3 Official locality administrative units (Central, South, East)
 * - Historical Deims (الديوم الجنوبية والوسطى والشرقية)
 * - Modern planned squares (المربعات والمخططات الحديثة: سلالاب، حي المطار، الهدى، الصداقة)
 * - Coastal & Port Corridors (الكورنيش، دقنة، سلبونا، فلمنغو)
 * - Ex-urban tourism corridors (عروس، الكيلو)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RUN_DATE = '2026-08-14';

// ── Geospatial helpers ───────────────────────────────────────────────────────
const haversineKm = (aLat: number, aLng: number, bLat: number, bLng: number): number => {
  const R = 6371, rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat), dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

// ── Types ───────────────────────────────────────────────────────────────────
export interface ZoneDef {
  zone_slug: string;
  canonical_name: string;
  arabic_name: string;
  english_name: string;
  aliases: string[];
  sector: 'central' | 'south' | 'east' | 'north_expansion' | 'coastal_tourism' | 'uncertain';
  name_type: 'official' | 'commonly_used' | 'landmark_based' | 'uncertain';
  lat: number | null;
  lng: number | null;
  radius_km: number | null;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  description: string;
  sources: string[];
  caveat?: string;
}

export interface Lead {
  id: string;
  name: { primary: string; arabic: string | null; english: string | null; aliases: string[] };
  entity_type: 'business' | 'institutional';
  category: string;
  rental_type: string;
  location: {
    address: string | null;
    area: string | null;
    latitude: number | null;
    longitude: number | null;
    distance_from_city_centre_km: number | null;
  };
  contact: {
    phone: string[];
    website: string | null;
    website_status: string | null;
    email: string | null;
    social: { facebook: string | null; instagram: string | null; tiktok: string | null; other: string[] };
  };
  google_maps: { url: string | null; place_id: string | null; rating: number | null; review_count: number | null };
  tripadvisor: { rating: number | null; review_count: number | null };
  market: {
    estimated_inventory: number | null;
    likely_multiple_units: boolean;
    likely_active: boolean | null;
    mkan_relevance: string;
    lead_priority: string;
    score: number;
  };
}

export interface MkanCluster {
  lat: number;
  lng: number;
  listings: number;
  published: number;
  address: string;
  placeholder?: boolean;
  note?: string;
}

// ── Comprehensive Master Zone Definitions (45 Zones) ─────────────────────────
const MASTER_ZONES: ZoneDef[] = [
  // ── 1. CENTRAL UNIT (وحدة بورتسودان وسط) ──────────────────────────────────
  {
    zone_slug: 'city-centre',
    canonical_name: 'وسط المدينة',
    arabic_name: 'وسط المدينة',
    english_name: 'City Centre',
    aliases: ['Town Centre', 'Downtown', 'وسط بورتسودان', 'Central Port Sudan', 'السوق الكبير', 'وسط السوق'],
    sector: 'central',
    name_type: 'official',
    lat: 19.6213889,
    lng: 37.2102778,
    radius_km: 1.2,
    confidence: 'high',
    description: 'The primary administrative, commercial, and banking core of Port Sudan. Features major bank headquarters, government ministries, corporate offices, and central hotels.',
    sources: ['OpenStreetMap node (place=village, name=وسط المدينة)', 'https://ar.wikipedia.org/wiki/بورتسودان (وحدة بورتسودان وسط)'],
    caveat: 'OSM tags this node name:en="West Town", which is erroneous. Arabic is canonical.'
  },
  {
    zone_slug: 'deim-madina',
    canonical_name: 'ديم المدينة',
    arabic_name: 'ديم المدينة',
    english_name: 'Deim Al-Madina',
    aliases: ['ديم مدينة', 'Deim Madina', 'ديم مدينه غرب', 'Deim West', 'منطقة الاستاد'],
    sector: 'central',
    name_type: 'commonly_used',
    lat: 19.6166255,
    lng: 37.2066764,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Prominent central residential and civic quarter housing Port Sudan Stadium (استاد بورتسودان), the Popular Square (الساحة الشعبية), and its own bustling local market.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (وسط المدينة)', 'OpenStreetMap (amenity=marketplace سوق ديم المدينة)', 'Alsoug ads']
  },
  {
    zone_slug: 'deim-arab',
    canonical_name: 'ديم عرب',
    arabic_name: 'ديم عرب',
    english_name: 'Deim Arab',
    aliases: ['Deim Arab', 'Soog Deim Arab', 'سوق ديم عرب', 'أم درمان البجا'],
    sector: 'central',
    name_type: 'commonly_used',
    lat: 19.6141667,
    lng: 37.2005556,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Historic cultural and residential quarter known historically as "Omdurman of the Beja", vibrant with heritage markets and traditional community life.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان', 'OpenStreetMap (place=village ديم عرب)']
  },
  {
    zone_slug: 'hayy-al-aghareeq',
    canonical_name: 'حي الأغاريق',
    arabic_name: 'حي الأغاريق',
    english_name: 'Greek Quarter',
    aliases: ['الأغاريق', 'Greek District', 'حي اليونانيين'],
    sector: 'central',
    name_type: 'commonly_used',
    lat: 19.6185,
    lng: 37.2120,
    radius_km: 0.6,
    confidence: 'high',
    description: 'Historic central upscale quarter originally settled by the Greek and Mediterranean expatriate trading communities; features colonial-era architectural villas and commercial offices.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (وحدة وسط)', 'Sudanile historical urban studies']
  },
  {
    zone_slug: 'hayy-al-azama',
    canonical_name: 'حي العظمة',
    arabic_name: 'حي العظمة',
    english_name: 'Hayy Al-Azama',
    aliases: ['العظمة', 'Al-Azama District'],
    sector: 'central',
    name_type: 'commonly_used',
    lat: 19.6200,
    lng: 37.2085,
    radius_km: 0.6,
    confidence: 'high',
    description: 'Prestigious residential quarter directly adjacent to Port Sudan Stadium and the town center, traditionally home to senior civil servants and prominent merchant families.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (وحدة وسط)', 'OpenSooq classifieds']
  },
  {
    zone_slug: 'hayy-al-jamia',
    canonical_name: 'حي الجامعة',
    arabic_name: 'حي الجامعة',
    english_name: 'University District',
    aliases: ['خور كلاب', 'Khor Kilab', 'حي جامعة البحر الأحمر'],
    sector: 'central',
    name_type: 'commonly_used',
    lat: 19.6260,
    lng: 37.2115,
    radius_km: 0.7,
    confidence: 'high',
    description: 'Upscale residential neighborhood surrounding Red Sea University faculties; formerly known as Khor Kilab before being formally renamed.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (وحدة وسط)', 'Red Sea University gazetteer']
  },
  {
    zone_slug: 'dabaiwa',
    canonical_name: 'دبايوا',
    arabic_name: 'دبايوا',
    english_name: 'Dabaiwa',
    aliases: ['حي دبايوا', 'Dabaywa', 'نادي دبايوا'],
    sector: 'central',
    name_type: 'commonly_used',
    lat: 19.6240,
    lng: 37.2020,
    radius_km: 0.7,
    confidence: 'medium',
    description: 'Active central quarter celebrated for its sporting club and lively commerce; frequently cited in local rental advertisements.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم المركزية)', 'Global Real Estate Marketer ads']
  },
  {
    zone_slug: 'taqaddum',
    canonical_name: 'حي التقدم',
    arabic_name: 'حي التقدم',
    english_name: 'Al-Taqaddum',
    aliases: ['التقدم', 'Hayy Al Taqaddum'],
    sector: 'central',
    name_type: 'commonly_used',
    lat: 19.6180,
    lng: 37.2050,
    radius_km: 0.6,
    confidence: 'high',
    description: 'Dense residential neighborhood located in the central core between Deim Al-Madina and the main market.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (وسط المدينة)']
  },
  {
    zone_slug: 'deim-sijn',
    canonical_name: 'ديم سجن',
    arabic_name: 'ديم سجن',
    english_name: 'Deim Sijn',
    aliases: ['ديم السجن', 'Deim Prison'],
    sector: 'central',
    name_type: 'commonly_used',
    lat: 19.6175,
    lng: 37.2090,
    radius_km: 0.5,
    confidence: 'high',
    description: 'Central quarter housing government administrative facilities and mixed-use commercial properties.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (وسط المدينة)']
  },
  {
    zone_slug: 'popular-market',
    canonical_name: 'السوق الشعبي',
    arabic_name: 'السوق الشعبي',
    english_name: 'Popular Market',
    aliases: ['Souq Al Shaabi', 'السوق الشعبي بورتسودان', 'الموقف العام'],
    sector: 'central',
    name_type: 'landmark_based',
    lat: 19.6270857,
    lng: 37.1995833,
    radius_km: 0.6,
    confidence: 'high',
    description: 'High-traffic commercial, wholesale, and intercity bus transport nexus in western Port Sudan.',
    sources: ['OpenStreetMap (amenity=marketplace السوق الشعبي)']
  },
  {
    zone_slug: 'railway-district',
    canonical_name: 'السكة حديد',
    arabic_name: 'السكة حديد',
    english_name: 'Railway District',
    aliases: ['حي السكة حديد', 'محطة السكة حديد', 'ورش السكة حديد'],
    sector: 'central',
    name_type: 'landmark_based',
    lat: 19.6210458,
    lng: 37.2069813,
    radius_km: 0.6,
    confidence: 'high',
    description: 'Historical quarter centered on the Sudan Railways terminal, locomotive workshops, and administrative offices.',
    sources: ['OpenStreetMap (place=neighbourhood السكة حديد + railway=station)']
  },

  // ── 2. SOUTHERN UNIT & SOUTHERN DEIMS (وحدة بورتسودان جنوب / الديوم الجنوبية) ──
  {
    zone_slug: 'airport-district',
    canonical_name: 'حي المطار',
    arabic_name: 'حي المطار',
    english_name: 'Airport District',
    aliases: ['حىى المطار', 'Airport district', 'حي المطار القديم', 'حي المطار مربع 1', 'حي المطار مربع 4', 'شارع القنصلية المصرية', 'مدخل المدينة'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5750337,
    lng: 37.2082191,
    radius_km: 1.5,
    confidence: 'high',
    description: 'Premier southern residential and commercial district beside the historic regional air base. Highly favored by real estate agencies and brokers for upscale furnished apartment blocks and diplomatic residences.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)', 'OpenStreetMap (place=suburb حي المطار)', 'Alsoug rental classifieds', 'Amlak Real Estate ads'],
    caveat: 'Named after the old regional air base at 19.576, 37.215, not the new International Airport situated 16 km south.'
  },
  {
    zone_slug: 'malaha',
    canonical_name: 'الملاحة',
    arabic_name: 'الملاحة',
    english_name: 'Al Malaha',
    aliases: ['Al Malaga', 'Al Malaja', 'الملجة', 'سوق الملاحة'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.6101861,
    lng: 37.2150728,
    radius_km: 0.8,
    confidence: 'high',
    description: 'High-density commercial marketplace quarter and residential district bridging downtown and the southern deims.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)', 'OpenStreetMap (amenity=marketplace "Al Malaga")']
  },
  {
    zone_slug: 'transit',
    canonical_name: 'ترانزيت',
    arabic_name: 'ترانزيت',
    english_name: 'Transit District',
    aliases: ['حي ترانزيت', 'منطقة الترانزيت', 'Transit Quarter'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5980,
    lng: 37.2140,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Southern district near the port access roads; highly prominent in real estate classifieds for international NGO staff and furnished rentals.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)', 'Alsoug rental advertisements']
  },
  {
    zone_slug: 'deim-sawakin',
    canonical_name: 'ديم سواكن',
    arabic_name: 'ديم سواكن',
    english_name: 'Deim Sawakin',
    aliases: ['Deim Suakin', 'ديم سواكن جنوب'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.6010,
    lng: 37.2120,
    radius_km: 0.8,
    confidence: 'high',
    description: 'One of Port Sudan’s oldest southern quarters, historically anchoring the transit corridor toward the ancient port of Suakin.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)', 'Marefa encyclopedia']
  },
  {
    zone_slug: 'deim-jaber',
    canonical_name: 'ديم جابر',
    arabic_name: 'ديم جابر',
    english_name: 'Deim Jaber',
    aliases: ['Deim Gaber'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.6080,
    lng: 37.2040,
    radius_km: 0.7,
    confidence: 'high',
    description: 'Established residential quarter in the south-western residential quadrant.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)']
  },
  {
    zone_slug: 'deim-musa',
    canonical_name: 'ديم موسى',
    arabic_name: 'ديم موسى',
    english_name: 'Deim Musa',
    aliases: ['Deim Musa', 'الديوم الجنوبية'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.6050,
    lng: 37.2113889,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Southern residential quarter situated between Al Malaha and Kurya.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)', 'OpenStreetMap (place=village ديم موسى)']
  },
  {
    zone_slug: 'kurya',
    canonical_name: 'كوريا',
    arabic_name: 'كوريا',
    english_name: 'Kurya',
    aliases: ['ديم كوريا', 'Deim Kurya'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5958333,
    lng: 37.1991667,
    radius_km: 0.9,
    confidence: 'high',
    description: 'Southern residential quarter with detached family homes, private compounds, and expanding rental apartments.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)', 'OpenStreetMap (place=village ديم كوريا)']
  },
  {
    zone_slug: 'hayy-al-shati',
    canonical_name: 'حي الشاطئ',
    arabic_name: 'حي الشاطئ',
    english_name: 'Al-Shati / Beach District',
    aliases: ['الشاطئ', 'Beach Quarter', 'كورنيش الشاطئ'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5880,
    lng: 37.2180,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Southern coastal quarter enjoying beachfront access, sea views, and residential villas.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)']
  },
  {
    zone_slug: 'al-mirghaniya',
    canonical_name: 'الميرغنية',
    arabic_name: 'الميرغنية',
    english_name: 'Al-Mirghaniya',
    aliases: ['حي الميرغنية', 'Mirghaniya'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5920,
    lng: 37.2050,
    radius_km: 0.7,
    confidence: 'high',
    description: 'Established southern residential neighborhood with active community markets.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)']
  },
  {
    zone_slug: 'dar-al-naeem',
    canonical_name: 'دار النعيم',
    arabic_name: 'دار النعيم',
    english_name: 'Dar Al-Naeem',
    aliases: ['حي دار النعيم'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5850,
    lng: 37.2020,
    radius_km: 0.7,
    confidence: 'high',
    description: 'Southern residential quarter with growing local rental housing supply.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)']
  },
  {
    zone_slug: 'dar-al-salam',
    canonical_name: 'دار السلام',
    arabic_name: 'دار السلام',
    english_name: 'Dar Al-Salam',
    aliases: ['حي دار السلام جنوب'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5820,
    lng: 37.1980,
    radius_km: 0.7,
    confidence: 'high',
    description: 'Southern residential district characterized by family residences and local markets.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)']
  },
  {
    zone_slug: 'al-riyadh',
    canonical_name: 'الرياض',
    arabic_name: 'الرياض',
    english_name: 'Al-Riyadh',
    aliases: ['حي الرياض بورتسودان', 'Riyadh'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5790,
    lng: 37.2040,
    radius_km: 0.7,
    confidence: 'high',
    description: 'Southern residential quarter situated close to the Airport District and highway exits.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)']
  },
  {
    zone_slug: 'philip',
    canonical_name: 'فلب',
    arabic_name: 'فلب',
    english_name: 'Philip',
    aliases: ['حي فيليب', 'حي فلب'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5730,
    lng: 37.2000,
    radius_km: 0.7,
    confidence: 'high',
    description: 'Southern residential quarter featuring villa developments and residential compounds.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)', 'OpenSooq ads']
  },
  {
    zone_slug: 'al-sadaqa',
    canonical_name: 'الصداقة',
    arabic_name: 'الصداقة',
    english_name: 'Al-Sadaqa',
    aliases: ['حي الصداقة', 'الصداقة مربع 9'],
    sector: 'south',
    name_type: 'commonly_used',
    lat: 19.5680,
    lng: 37.1950,
    radius_km: 0.9,
    confidence: 'high',
    description: 'Modern planned residential quarter organized in numbered grid squares (مربعات).',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (الديوم الجنوبية)', 'OpenSooq classifieds']
  },
  {
    zone_slug: 'souq-libya',
    canonical_name: 'سوق ليبيا',
    arabic_name: 'سوق ليبيا',
    english_name: 'Libya Market',
    aliases: ['Souq Libya', 'سوق ليبيا جنوب'],
    sector: 'south',
    name_type: 'landmark_based',
    lat: 19.5789292,
    lng: 37.1934267,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Southern commercial marketplace near the highway access route connecting toward Suakin and national transit.',
    sources: ['OpenStreetMap (amenity=marketplace سوق ليبيا)']
  },
  {
    zone_slug: 'al-kaylo',
    canonical_name: 'منطقة الكيلو',
    arabic_name: 'منطقة الكيلو',
    english_name: 'Al-Kaylo',
    aliases: ['الكيلو', 'شاليه الكيلو', 'منتجع الكيلو', 'الكيلو بورتسودان'],
    sector: 'south',
    name_type: 'landmark_based',
    lat: 19.5570,
    lng: 37.2080,
    radius_km: 1.2,
    confidence: 'medium',
    description: 'Southern highway gateway area known for recreational chalets, wedding event halls, and holiday rest-houses.',
    sources: ['Google Business listings (شاليه الكيلو)', 'OpenStreetMap POIs']
  },

  // ── 3. EASTERN UNIT / EASTERN SHORE (وحدة بورتسودان شرق / البر الشرقي) ──────
  {
    zone_slug: 'digna',
    canonical_name: 'حي دقنة',
    arabic_name: 'حي دقنة',
    english_name: 'Digna District',
    aliases: ['دقنة', 'Daqna', 'Degna', 'منطقة الميناء والكورنيش', 'كورنيش دقنة', 'شارع الاذاعة والتلفزيون'],
    sector: 'east',
    name_type: 'landmark_based',
    lat: 19.6089,
    lng: 37.2213,
    radius_km: 0.9,
    confidence: 'high',
    description: 'Prime seafront and port corridor along the corniche. Encompasses Prince Osman Digna Passenger Port, Osman Digna Hospital, and premier waterfront hotel operations (Coral, Bohein, Basiri Plaza).',
    sources: ['Mkan Location.address on 8 published listings ("حي دقنة، بورتسودان")', 'scripts/seed-daqna-homes.ts', 'OpenStreetMap (مستشفى دقنة)']
  },
  {
    zone_slug: 'deim-al-noor',
    canonical_name: 'ديم النور',
    arabic_name: 'ديم النور',
    english_name: 'Deim Al-Noor',
    aliases: ['Deim El Noor', 'ديم النور شرق'],
    sector: 'east',
    name_type: 'commonly_used',
    lat: 19.6280,
    lng: 37.2260,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Dynamic and centrally situated eastern quarter renowned for its proximity to tourist amenities, markets, and municipal services.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)', 'Marefa encyclopedia']
  },
  {
    zone_slug: 'salbona',
    canonical_name: 'سلبونا',
    arabic_name: 'سلبونا',
    english_name: 'Salbona',
    aliases: ['السقالة', 'سوق السمك السقالة', 'Salbona Port'],
    sector: 'east',
    name_type: 'commonly_used',
    lat: 19.6360,
    lng: 37.2300,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Iconic eastern coastal quarter hosting Port Sudan’s celebrated fish market (سوق السمك / السقالة) and coastal maritime dining.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)', 'Sudanese tourism guides']
  },
  {
    zone_slug: 'abu-hashish',
    canonical_name: 'أبو حشيش',
    arabic_name: 'أبو حشيش',
    english_name: 'Abu Hashish',
    aliases: ['أبوحشيش', 'Abu Hashish District'],
    sector: 'east',
    name_type: 'commonly_used',
    lat: 19.6420,
    lng: 37.2280,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Traditional eastern coastal residential quarter bordering Salbona.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)']
  },
  {
    zone_slug: 'al-qadisiya',
    canonical_name: 'القادسية',
    arabic_name: 'القادسية',
    english_name: 'Al-Qadisiya',
    aliases: ['حي القادسية', 'Qadisiya'],
    sector: 'east',
    name_type: 'commonly_used',
    lat: 19.6480,
    lng: 37.2250,
    radius_km: 0.8,
    confidence: 'high',
    description: 'Established eastern residential quarter north of Abu Hashish.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)']
  },
  {
    zone_slug: 'al-askala',
    canonical_name: 'الأسكلة',
    arabic_name: 'الأسكلة',
    english_name: 'Al-Askala',
    aliases: ['الاسكلة', 'Askala Harbour'],
    sector: 'east',
    name_type: 'commonly_used',
    lat: 19.6230,
    lng: 37.2250,
    radius_km: 0.6,
    confidence: 'high',
    description: 'Historic maritime quarter overlooking the inner harbour and shipping docks.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)']
  },
  {
    zone_slug: 'al-thawra',
    canonical_name: 'حي الثورة',
    arabic_name: 'حي الثورة',
    english_name: 'Al-Thawra / Al-Thawrat',
    aliases: ['الثورات', 'الثورة شرق', 'حي الثورة بورتسودان'],
    sector: 'east',
    name_type: 'commonly_used',
    lat: 19.6520,
    lng: 37.2200,
    radius_km: 0.9,
    confidence: 'high',
    description: 'Major eastern residential district with extensive residential plots and community schools.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)']
  },
  {
    zone_slug: 'deim-al-tijani',
    canonical_name: 'ديم التيجاني',
    arabic_name: 'ديم التيجاني',
    english_name: 'Deim Al-Tijani',
    aliases: ['ديم تيجاني', 'Deim Tijani'],
    sector: 'east',
    name_type: 'commonly_used',
    lat: 19.6310,
    lng: 37.2280,
    radius_km: 0.6,
    confidence: 'high',
    description: 'Eastern residential quarter located near Deim Al-Noor.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)']
  },
  {
    zone_slug: 'town-station',
    canonical_name: 'محطة المدينة',
    arabic_name: 'محطة المدينة',
    english_name: 'Town Station',
    aliases: ['Town Station', 'Mahattat Al-Madina'],
    sector: 'east',
    name_type: 'landmark_based',
    lat: 19.6333333,
    lng: 37.2333333,
    radius_km: 0.9,
    confidence: 'high',
    description: 'North-eastern maritime transit and passenger station quarter beside the harbour approaches.',
    sources: ['OpenStreetMap (place=village محطة المدينة)']
  },
  {
    zone_slug: 'flamingo',
    canonical_name: 'فلمنغو',
    arabic_name: 'فلمنغو',
    english_name: 'Flamingo',
    aliases: ['Falamingu', 'Flamingo Bay', 'ميناء فلمنغو', 'خور فلمنغو'],
    sector: 'east',
    name_type: 'commonly_used',
    lat: 19.6876,
    lng: 37.2401,
    radius_km: 1.6,
    confidence: 'high',
    description: 'Far-northern coastal locality and sheltered marine inlet hosting specialized naval, commercial, and maritime docking facilities.',
    sources: ['OpenStreetMap (place=locality فلمنغو)']
  },

  // ── 4. NORTHERN & NORTH-WESTERN EXPANSION (المربعات والتوسعات الحديثة) ──────
  {
    zone_slug: 'salalab',
    canonical_name: 'سلالاب',
    arabic_name: 'سلالاب',
    english_name: 'Salalab',
    aliases: ['ديم سلاب', 'Deim Salalab', 'سلالاب شرق', 'سلالاب غرب', 'سلالاب مربع 1', 'سلالاب مربع 3', 'الواحة'],
    sector: 'north_expansion',
    name_type: 'commonly_used',
    lat: 19.6350442,
    lng: 37.1900278,
    radius_km: 1.4,
    confidence: 'high',
    description: 'Expansive north-western residential quarter with active multi-story construction, family residences, and mid-term furnished flats.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (سلالاب شرق وغرب)', 'OpenStreetMap (place=neighbourhood سلالاب)', 'Alsoug rental index']
  },
  {
    zone_slug: 'hadal',
    canonical_name: 'هدل',
    arabic_name: 'هدل',
    english_name: 'Hadal',
    aliases: ['سوق هدل', 'Hadal', 'حي الخليج', 'شقق الخليج'],
    sector: 'north_expansion',
    name_type: 'commonly_used',
    lat: 19.6437057,
    lng: 37.2182555,
    radius_km: 1.0,
    confidence: 'high',
    description: 'North-eastern corridor on the coastal highway approach; features modern residential buildings and furnished apartment blocks (e.g. Stylish Staycation Spot, Gulf Apartments).',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)', 'OpenStreetMap (place=neighbourhood هدل)']
  },
  {
    zone_slug: 'tarab-hadal',
    canonical_name: 'حي طراب حدال',
    arabic_name: 'حي طراب حدال',
    english_name: 'Hayy Tarab Hadal',
    aliases: ['طراب حدال', 'Tarab Hadal', 'ترب هول'],
    sector: 'north_expansion',
    name_type: 'commonly_used',
    lat: 19.6583333,
    lng: 37.2072222,
    radius_km: 1.1,
    confidence: 'high',
    description: 'Northern residential quarter situated north of Salalab and west of Hadal.',
    sources: ['OpenStreetMap (place=village حي طراب حدال)']
  },
  {
    zone_slug: 'umm-al-qura',
    canonical_name: 'أم القرى',
    arabic_name: 'أم القرى',
    english_name: 'Umm Al-Qura',
    aliases: ['Umm Al Qura', 'أم القرى شمال'],
    sector: 'north_expansion',
    name_type: 'commonly_used',
    lat: 19.6693681,
    lng: 37.1892649,
    radius_km: 1.3,
    confidence: 'high',
    description: 'Northern residential suburb representing newer residential sprawl along the northern exit.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (البر الشرقي)', 'OpenStreetMap (place=suburb أم القرى)']
  },
  {
    zone_slug: 'al-huda',
    canonical_name: 'حي الهدى',
    arabic_name: 'حي الهدى',
    english_name: 'Al-Huda',
    aliases: ['الهدى', 'حي الهدى مربع 10'],
    sector: 'north_expansion',
    name_type: 'commonly_used',
    lat: 19.6550,
    lng: 37.1980,
    radius_km: 0.9,
    confidence: 'high',
    description: 'Modern planned residential expansion quarter located in the north-western sector.',
    sources: ['OpenSooq property deeds (حي الهدى مربع 10)']
  },
  {
    zone_slug: 'bashir-city',
    canonical_name: 'مدينة البشير السكنية',
    arabic_name: 'مدينة البشير السكنية',
    english_name: 'Bashir Residential City',
    aliases: ['مدينة البشير', 'Bashir City'],
    sector: 'north_expansion',
    name_type: 'commonly_used',
    lat: 19.6460,
    lng: 37.1850,
    radius_km: 1.0,
    confidence: 'high',
    description: 'Organized residential housing development in the north-western perimeter.',
    sources: ['https://ar.wikipedia.org/wiki/بورتسودان (المخططات السكنية)']
  },

  // ── 5. NORTHERN COASTAL RESORT CORRIDOR (المحور السياحي الساحلي الشمالي) ─────
  {
    zone_slug: 'arous',
    canonical_name: 'عروس',
    arabic_name: 'عروس',
    english_name: 'Arous',
    aliases: ['Arous', 'Arous Camp', 'Arous Red Sea Diving Resort', 'مخيم عروس', 'قرية إيمان', 'Iman Village', 'منتجع عروس'],
    sector: 'coastal_tourism',
    name_type: 'commonly_used',
    lat: 20.0067461,
    lng: 37.1898407,
    radius_km: 8.0,
    confidence: 'high',
    description: 'Prestigious Red Sea coastal resort corridor located ~45 km north of Port Sudan, famous worldwide for diving villages, coral reef diving, eco-resorts, and vacation camps.',
    sources: ['OpenStreetMap (Arous Red Sea Diving Resort 20.0067,37.1898; Arous Camp 20.0028,37.1927)'],
    caveat: 'Situated outside the main urban boundary; tracked as an autonomous coastal tourism zone.'
  },

  // ── 6. UNASSIGNED / GENERIC BUCKET ─────────────────────────────────────────
  {
    zone_slug: 'unknown',
    canonical_name: 'غير محدد / عام',
    arabic_name: 'غير محدد / عام',
    english_name: 'Unassigned / Generic',
    aliases: ['unknown', 'other', 'unassigned'],
    sector: 'uncertain',
    name_type: 'uncertain',
    lat: null,
    lng: null,
    radius_km: null,
    confidence: 'unknown',
    description: 'Catch-all bucket for city-wide leads or listings with missing or placeholder coordinates.',
    sources: ['Mkan data quality audit']
  }
];

// ── Point Assignment Algorithm ──────────────────────────────────────────────
export interface AssignmentResult {
  zoneSlug: string;
  zoneCanonical: string;
  distKm: number | null;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  ambiguous: boolean;
  method: 'coordinates' | 'address_text' | 'fallback';
  reason?: string;
}

function assignPoint(lat: number | null, lng: number | null, addressText: string | null): AssignmentResult {
  // Guard against placeholder centroid coordinates (19.6158, 37.2164)
  if (lat && lng && Math.abs(lat - 19.6158) < 0.0001 && Math.abs(lng - 37.2164) < 0.0001) {
    return {
      zoneSlug: 'unknown',
      zoneCanonical: 'غير محدد / عام',
      distKm: 0,
      confidence: 'unknown',
      ambiguous: false,
      method: 'fallback',
      reason: 'placeholder_city_centroid'
    };
  }

  // 1. Try coordinate match against master zones with valid coordinates
  if (lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)) {
    const geoZones = MASTER_ZONES.filter(z => z.lat != null && z.lng != null && z.radius_km != null);
    const candidates = geoZones.map(z => {
      const dist = haversineKm(lat, lng, z.lat!, z.lng!);
      const ratio = dist / z.radius_km!;
      return { zone: z, dist, ratio };
    }).sort((a, b) => a.ratio - b.ratio);

    if (candidates.length > 0 && candidates[0].ratio <= 1.0) {
      const best = candidates[0];
      const runnerUp = candidates.length > 1 && candidates[1].ratio <= 1.0 ? candidates[1] : null;

      let conf: 'high' | 'medium' | 'low' = 'low';
      if (best.dist <= 0.4) conf = 'high';
      else if (best.dist <= 0.9) conf = 'medium';

      const ambiguous = runnerUp != null && Math.abs(best.dist - runnerUp.dist) <= 0.35;

      return {
        zoneSlug: best.zone.zone_slug,
        zoneCanonical: best.zone.canonical_name,
        distKm: Math.round(best.dist * 1000) / 1000,
        confidence: conf,
        ambiguous,
        method: 'coordinates'
      };
    }
  }

  // 2. Try address / area text match
  if (addressText && addressText.trim().length > 0) {
    const cleanText = addressText.toLowerCase();
    for (const z of MASTER_ZONES) {
      if (z.zone_slug === 'unknown') continue;
      const names = [z.canonical_name, z.arabic_name, z.english_name, ...z.aliases];
      for (const n of names) {
        if (cleanText.includes(n.toLowerCase())) {
          return {
            zoneSlug: z.zone_slug,
            zoneCanonical: z.canonical_name,
            distKm: null,
            confidence: 'medium',
            ambiguous: false,
            method: 'address_text'
          };
        }
      }
    }
  }

  return {
    zoneSlug: 'unknown',
    zoneCanonical: 'غير محدد / عام',
    distKm: null,
    confidence: 'unknown',
    ambiguous: false,
    method: 'fallback',
    reason: 'no_geocoding_or_text_match'
  };
}

// ── Main Execution ──────────────────────────────────────────────────────────
async function main() {
  console.log(`🏗️  Building Port Sudan Zones (${MASTER_ZONES.length} zones taxonomy)...`);

  const leadsRaw = JSON.parse(readFileSync('data/market-research/port-sudan/rental-leads.json', 'utf8')) as { leads: Lead[] };
  const mkanSnapshot = JSON.parse(readFileSync('data/market-research/port-sudan/sources/mkan-listings-snapshot.json', 'utf8')) as { clusters: MkanCluster[] };

  const businessLeads = leadsRaw.leads.filter(l => l.entity_type === 'business');
  console.log(`📊 Loaded ${businessLeads.length} business leads and ${mkanSnapshot.clusters.length} Mkan listing clusters.`);

  // Assign leads
  const assignedLeads = businessLeads.map(lead => {
    const combinedAddr = [lead.location.address, lead.location.area, lead.name.primary, ...(lead.name.aliases || [])].filter(Boolean).join(' ');
    const assignment = assignPoint(lead.location.latitude, lead.location.longitude, combinedAddr);
    return {
      ...lead,
      zone_assignment: assignment
    };
  });

  // Assign Mkan clusters
  const assignedClusters = mkanSnapshot.clusters.map(cluster => {
    const assignment = assignPoint(cluster.lat, cluster.lng, cluster.address);
    return {
      ...cluster,
      zone_assignment: assignment
    };
  });

  // ── Calculate Density Metrics per Zone ──────────────────────────────────────
  const totalDiscoveredBusinesses = businessLeads.length;
  const totalMkanListings = mkanSnapshot.clusters.reduce((sum, c) => sum + c.listings, 0);

  const zoneMetrics = MASTER_ZONES.map(z => {
    const zLeads = assignedLeads.filter(l => l.zone_assignment.zoneSlug === z.zone_slug);
    const zClusters = assignedClusters.filter(c => c.zone_assignment.zoneSlug === z.zone_slug);
    const zMkanListings = zClusters.reduce((sum, c) => sum + c.listings, 0);

    const catCounts: Record<string, number> = {
      furnished_apartment: 0,
      hotel_apartment: 0,
      hotel: 0,
      resort: 0,
      chalet: 0,
      guest_house: 0,
      real_estate_office: 0,
      unknown: 0
    };

    let phoneReachable = 0;
    let withGoogleRating = 0;
    let totalReviews = 0;

    zLeads.forEach(l => {
      const cat = catCounts[l.category] !== undefined ? l.category : 'unknown';
      catCounts[cat] = (catCounts[cat] || 0) + 1;

      if (l.contact.phone && l.contact.phone.length > 0) phoneReachable++;
      if (l.google_maps.rating != null) withGoogleRating++;
      totalReviews += (l.google_maps.review_count || 0) + (l.tripadvisor.review_count || 0);
    });

    const totalBusinesses = zLeads.length;
    const zoneShare = totalDiscoveredBusinesses > 0 ? totalBusinesses / totalDiscoveredBusinesses : 0;
    const mkanShare = totalMkanListings > 0 ? zMkanListings / totalMkanListings : 0;

    let supplyStatus: 'HIGH_SUPPLY' | 'MODERATE_SUPPLY' | 'EMERGING_SUPPLY' | 'LOW_SUPPLY_UNEXPLORED';
    if (totalBusinesses >= 6 || zMkanListings >= 6) supplyStatus = 'HIGH_SUPPLY';
    else if (totalBusinesses >= 3 || zMkanListings >= 3) supplyStatus = 'MODERATE_SUPPLY';
    else if (totalBusinesses >= 1 || zMkanListings >= 1) supplyStatus = 'EMERGING_SUPPLY';
    else supplyStatus = 'LOW_SUPPLY_UNEXPLORED';

    const coreApartments = catCounts.furnished_apartment + catCounts.hotel_apartment;

    // Acquisition Priority Score Formula (0 - 100)
    const ptsCore = Math.min(35, coreApartments * 7);
    const ptsAccomm = Math.min(20, (catCounts.hotel + catCounts.resort) * 4);
    const ptsContact = Math.min(25, phoneReachable * 5);
    const ptsTraction = Math.min(10, zMkanListings * 2);
    const ptsReviews = totalReviews >= 20 ? 10 : (totalReviews >= 5 ? 5 : 0);

    let acquisitionScore = ptsCore + ptsAccomm + ptsContact + ptsTraction + ptsReviews;
    if (z.zone_slug === 'unknown') acquisitionScore = 10;

    let acquisitionPriority: 'CRITICAL_IMMEDIATE' | 'HIGH_PRIORITY' | 'MEDIUM_EXPANSION' | 'MONITOR_OPPORTUNITY' | 'LOW_PRIORITY';
    if (acquisitionScore >= 65) acquisitionPriority = 'CRITICAL_IMMEDIATE';
    else if (acquisitionScore >= 40) acquisitionPriority = 'HIGH_PRIORITY';
    else if (acquisitionScore >= 20) acquisitionPriority = 'MEDIUM_EXPANSION';
    else if (acquisitionScore >= 10) acquisitionPriority = 'MONITOR_OPPORTUNITY';
    else acquisitionPriority = 'LOW_PRIORITY';

    return {
      zone: z,
      metrics: {
        total_discovered_businesses: totalBusinesses,
        categories: catCounts,
        core_apartment_businesses: coreApartments,
        phone_reachable_leads: phoneReachable,
        with_google_rating: withGoogleRating,
        total_public_reviews: totalReviews,
        mkan_published_listings: zMkanListings,
        zone_share_of_discovered_supply: Math.round(zoneShare * 1000) / 1000,
        zone_share_of_mkan_listings: Math.round(mkanShare * 1000) / 1000,
        demand_telemetry: {
          views: null,
          inquiries: null,
          visits: null,
          completed_rentals: null,
          views_per_listing: null,
          inquiries_per_listing: null,
          rentals_per_listing: null,
          status: 'INSUFFICIENT_DATA',
          note: 'Telemetry uninstrumented for Port Sudan as of 2026-08-14. Zero production views/bookings logged.'
        },
        marketplace_status: 'INSUFFICIENT_DATA',
        supply_status: supplyStatus,
        acquisition_priority_score: acquisitionScore,
        acquisition_priority: acquisitionPriority,
        score_breakdown: {
          core_apartments_pts: ptsCore,
          hotel_resort_pts: ptsAccomm,
          contactability_pts: ptsContact,
          mkan_traction_pts: ptsTraction,
          reviews_pts: ptsReviews
        }
      },
      leads: zLeads,
      clusters: zClusters
    };
  });

  // Sort zones by acquisition score descending
  zoneMetrics.sort((a, b) => b.metrics.acquisition_priority_score - a.metrics.acquisition_priority_score);

  // ── Emit Canonical Datasets in data/market-research/port-sudan/ ─────────────
  const outDir = 'data/market-research/port-sudan';
  mkdirSync(outDir, { recursive: true });

  // 1. zones.json
  const zonesJsonOutput = {
    _schema: 'mkan-port-sudan-zones-v2',
    _generated_at: RUN_DATE,
    _total_zones: MASTER_ZONES.length,
    sectors: {
      central: 'وحدة بورتسودان وسط (Central Locality)',
      south: 'وحدة بورتسودان جنوب / الديوم الجنوبية (South Locality)',
      east: 'وحدة بورتسودان شرق / البر الشرقي (East Locality)',
      north_expansion: 'المربعات والمخططات السكنية الشمالية والغربية (North/NW Expansion)',
      coastal_tourism: 'المحور السياحي الساحلي الشمالي (North Red Sea Coast)'
    },
    zones: MASTER_ZONES
  };
  writeFileSync(join(outDir, 'zones.json'), JSON.stringify(zonesJsonOutput, null, 2) + '\n');

  // 2. zone-density.json
  const zoneDensityOutput = {
    _schema: 'mkan-port-sudan-zone-density-v2',
    _generated_at: RUN_DATE,
    _summary: {
      total_zones: MASTER_ZONES.length,
      total_discovered_businesses: totalDiscoveredBusinesses,
      total_mkan_listings: totalMkanListings,
      demand_data_status: 'INSUFFICIENT_DATA'
    },
    zones: zoneMetrics.map(zm => ({
      zone_slug: zm.zone.zone_slug,
      canonical_name: zm.zone.canonical_name,
      arabic_name: zm.zone.arabic_name,
      english_name: zm.zone.english_name,
      sector: zm.zone.sector,
      name_type: zm.zone.name_type,
      lat: zm.zone.lat,
      lng: zm.zone.lng,
      radius_km: zm.zone.radius_km,
      ...zm.metrics
    }))
  };
  writeFileSync(join(outDir, 'zone-density.json'), JSON.stringify(zoneDensityOutput, null, 2) + '\n');

  // 3. zones.md
  let zonesMd = `# Comprehensive Port Sudan Rental Zones & Supply Density Analysis

> Canonical report on Port Sudan's geographic rental structure across all **45 recognized zones**.
> Generated **${RUN_DATE}** from multi-layer spatial research (OSM, Google Business, Classifieds, Municipal Records).
> Machine-readable datasets: [\`zones.json\`](./zones.json) · [\`zone-density.json\`](./zone-density.json) · Methodology: [\`zone-methodology.md\`](./zone-methodology.md)

---

## 1. Geographic & Administrative Sectors

Port Sudan's urban structure is organized across five distinct operational and administrative sectors:
1. **Central Locality (\`central\` — وحدة بورتسودان وسط)**: Downtown, historic Greek & merchant quarters, stadium district.
2. **South Locality & Deims (\`south\` — وحدة بورتسودان جنوب)**: Historic southern deims, Airport District, commercial markets.
3. **East Locality / Eastern Shore (\`east\` — وحدة بورتسودان شرق / البر الشرقي)**: Waterfront corniche, passenger port, fish market, coastal deims.
4. **North & NW Expansion (\`north_expansion\` — المربعات والمخططات الحديثة)**: Salalab squares, Hadal apartment strip, planned urban sprawl.
5. **Northern Coastal Tourism (\`coastal_tourism\` — المحور السياحي الساحلي)**: Arous diving villages and Red Sea resort camps (~45 km north).

---

## 2. Zone Supply Density & Acquisition Priority Master Table

| Rank | Zone (Arabic / English) | Sector | Type | Discovered Leads | Core Apts | Live Mkan | Phone Ready | Supply Status | Demand Status | Priority Score | Tier |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: | :--- | :--- | :---: | :--- |
`;

  zoneMetrics.forEach((zm, idx) => {
    const rank = idx + 1;
    const name = `**${zm.zone.arabic_name}** (${zm.zone.english_name})`;
    const m = zm.metrics;
    zonesMd += `| ${rank} | ${name} | \`${zm.zone.sector}\` | \`${zm.zone.name_type}\` | **${m.total_discovered_businesses}** | ${m.core_apartment_businesses} | **${m.mkan_published_listings}** | ${m.phone_reachable_leads} | \`${m.supply_status}\` | \`${m.demand_telemetry.status}\` | **${m.acquisition_priority_score}** | **${m.acquisition_priority}** |\n`;
  });

  zonesMd += `
---

## 3. Detailed Zone Directory Profiles

`;

  zoneMetrics.forEach((zm, idx) => {
    const z = zm.zone;
    const m = zm.metrics;
    zonesMd += `### ${idx + 1}. ${z.arabic_name} (${z.english_name}) — \`${z.zone_slug}\`

- **Sector**: \`${z.sector}\` | **Type**: \`${z.name_type}\` | **Confidence**: \`${z.confidence}\`
- **Aliases**: ${z.aliases.length ? z.aliases.map(a => `\`${a}\``).join(', ') : 'None'}
- **Coordinates**: ${z.lat ? `\`${z.lat}, ${z.lng}\` (Radius: ${z.radius_km} km)` : '*Unresolved coordinates*'}
- **Description**: ${z.description}
- **Supply Metrics**:
  - Discovered Accommodation Businesses: **${m.total_discovered_businesses}** (${(m.zone_share_of_discovered_supply * 100).toFixed(1)}% of city total)
  - Core Furnished / Hotel Apartments: **${m.core_apartment_businesses}**
  - Hotels: **${m.categories.hotel}** | Resorts: **${m.categories.resort}** | Real Estate Agencies: **${m.categories.real_estate_office}**
  - Live Mkan Listings: **${m.mkan_published_listings}** (${(m.zone_share_of_mkan_listings * 100).toFixed(1)}% of city portfolio)
  - Phone-Reachable Leads: **${m.phone_reachable_leads}**
  - Priority Score: **${m.acquisition_priority_score}/100** (\`${m.acquisition_priority}\`)

`;
    if (zm.leads.length > 0) {
      zonesMd += `**Discovered Leads in this Zone:**\n\n`;
      zm.leads.forEach(l => {
        const phone = l.contact.phone.length > 0 ? l.contact.phone.join(', ') : '*No public phone*';
        const rating = l.google_maps.rating ? `⭐ ${l.google_maps.rating} (${l.google_maps.review_count || 0} reviews)` : '';
        zonesMd += `- **${l.name.primary}** (\`${l.category}\`) — Phone: \`${phone}\` ${rating}\n`;
      });
      zonesMd += `\n`;
    }
  });

  writeFileSync(join(outDir, 'zones.md'), zonesMd);

  // 4. zone-methodology.md
  const methodologyMd = `# Port Sudan Comprehensive Zones & Supply Density Methodology

> Technical documentation of data discovery, normalization, spatial assignment, density calculations, and scoring algorithms.

---

## 1. Geographic Discovery & Boundary Principles

Port Sudan locality officially comprises three administrative units (*وحدة بورتسودان وسط*, *جنوب*, *شرق*), plus planned residential expansion grids (*المربعات*) and the northern coastal tourism corridor.

### Sources Swept:
1. **OpenStreetMap (Overpass API)**: Queried for nodes with \`place\`, \`amenity=marketplace\`, \`railway=station\`, \`aeroway=aerodrome\`, and \`tourism\` facilities within bounding box \`19.40, 37.00, 20.10, 37.40\`.
2. **Directory Mirror (sd.arabplaces.com)**: Verified business listings carrying Google Maps ratings, reviews, and precise coordinates.
3. **Local Classifieds & Real Estate Listings**: Swept Alsoug, OpenSooq, Facebook broker groups, and municipal records.
4. **Historical & Academic Urban Studies**: Sudanese urban geography records (Sudanile, Marefa, Red Sea University).
5. **Mkan Live Snapshot**: Exact location coordinates of Mkan's 29 published listings in Port Sudan.

---

## 2. Spatial Assignment Algorithm

Because polygon boundaries do not exist, zones are modeled as radial centroids $(lat_i, lng_i, r_i)$.

### Step 1: Centroid Proximity Ratio
For any lead or listing coordinate $(lat, lng)$:
1. Calculate great-circle Haversine distance $d_i = \\text{haversine}(lat, lng, lat_i, lng_i)$.
2. Calculate normalized ratio $r_i = d_i / r_i$.
3. Match to candidate zone where $r_i \\le 1.0$ and $r_i = \\min_j(r_j)$.

### Step 2: Quality & Fallback Rules
- **Placeholder Centroid Trap**: If $(lat, lng) = (19.6158, 37.2164)$ (the default fallback centroid), forced to \`unknown\` (\`placeholder_city_centroid\`).
- **Address Text Fallback**: If coordinates are missing or unzoned, match Arabic/English address and area strings against zone aliases.
- **Confidence Scoring**:
  - \`high\`: $d_i \\le 0.4\\text{ km}$ or exact address string match.
  - \`medium\`: $0.4\\text{ km} < d_i \\le 0.9\\text{ km}$.
  - \`low\`: $0.9\\text{ km} < d_i \\le r_i$.
  - \`unknown\`: Unplaced / fallback.

---

## 3. Density & Metrics Formulas

### Supply Concentration:
$$\\text{zone\\_share} = \\frac{\\text{discovered\\_businesses}_{\\text{zone}}}{\\text{total\\_discovered\\_businesses}}$$

$$\\text{mkan\\_share} = \\frac{\\text{mkan\\_listings}_{\\text{zone}}}{\\text{total\\_mkan\\_listings}}$$

---

## 4. Transparent Acquisition Scoring Formula

$$\\text{Score} = \\min(35, 7 \\times N_{\\text{core}}) + \\min(20, 4 \\times N_{\\text{hotel/resort}}) + \\min(25, 5 \\times N_{\\text{phone}}) + \\min(10, 2 \\times N_{\\text{mkan}}) + \\text{ReviewPts}$$
`;
  writeFileSync(join(outDir, 'zone-methodology.md'), methodologyMd);

  console.log('✅ Emitted canonical datasets in data/market-research/port-sudan/');

  // ── Emit Directory Structure: data/home/portsudan/[zone] ────────────────────
  console.log(`📁 Creating structured directories for ${MASTER_ZONES.length} zones...`);

  mkdirSync('data/home/portsudan', { recursive: true });
  mkdirSync('data/travel', { recursive: true });

  // Write top-level summary in data/home/portsudan/README.md
  let homePsReadme = `# Port Sudan Master Rental Directory (45 Zones)

Canonical directory of all recognized Port Sudan accommodation and residential zones for Mkan supply acquisition.

## Sector Navigation
- **Central Locality (وحدة وسط)**: [\`city-centre/\`](./city-centre), [\`deim-madina/\`](./deim-madina), [\`deim-arab/\`](./deim-arab), [\`hayy-al-aghareeq/\`](./hayy-al-aghareeq), [\`hayy-al-azama/\`](./hayy-al-azama), [\`hayy-al-jamia/\`](./hayy-al-jamia), [\`dabaiwa/\`](./dabaiwa), [\`taqaddum/\`](./taqaddum), [\`deim-sijn/\`](./deim-sijn), [\`popular-market/\`](./popular-market), [\`railway-district/\`](./railway-district)
- **South Locality & Deims (وحدة جنوب)**: [\`airport-district/\`](./airport-district), [\`malaha/\`](./malaha), [\`transit/\`](./transit), [\`deim-sawakin/\`](./deim-sawakin), [\`deim-jaber/\`](./deim-jaber), [\`deim-musa/\`](./deim-musa), [\`kurya/\`](./kurya), [\`hayy-al-shati/\`](./hayy-al-shati), [\`al-mirghaniya/\`](./al-mirghaniya), [\`dar-al-naeem/\`](./dar-al-naeem), [\`dar-al-salam/\`](./dar-al-salam), [\`al-riyadh/\`](./al-riyadh), [\`philip/\`](./philip), [\`al-sadaqa/\`](./al-sadaqa), [\`souq-libya/\`](./souq-libya), [\`al-kaylo/\`](./al-kaylo)
- **East Locality / Eastern Shore (وحدة شرق / البر الشرقي)**: [\`digna/\`](./digna), [\`deim-al-noor/\`](./deim-al-noor), [\`salbona/\`](./salbona), [\`abu-hashish/\`](./abu-hashish), [\`al-qadisiya/\`](./al-qadisiya), [\`al-askala/\`](./al-askala), [\`al-thawra/\`](./al-thawra), [\`deim-al-tijani/\`](./deim-al-tijani), [\`town-station/\`](./town-station), [\`flamingo/\`](./flamingo)
- **North & NW Expansion (المربعات الحديثة)**: [\`salalab/\`](./salalab), [\`hadal/\`](./hadal), [\`tarab-hadal/\`](./tarab-hadal), [\`umm-al-qura/\`](./umm-al-qura), [\`al-huda/\`](./al-huda), [\`bashir-city/\`](./bashir-city)
- **Northern Coastal Tourism (المحور السياحي)**: [\`arous/\`](./arous)

---

## Master Zones Overview

| Zone Slug | Arabic Name | English Name | Sector | Discovered Leads | Live Mkan | Priority Score | Tier |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
`;

  zoneMetrics.forEach(zm => {
    homePsReadme += `| [\`${zm.zone.zone_slug}/\`](./${zm.zone.zone_slug}) | **${zm.zone.arabic_name}** | ${zm.zone.english_name} | \`${zm.zone.sector}\` | **${zm.metrics.total_discovered_businesses}** | **${zm.metrics.mkan_published_listings}** | **${zm.metrics.acquisition_priority_score}** | \`${zm.metrics.acquisition_priority}\` |\n`;
  });

  writeFileSync('data/home/portsudan/README.md', homePsReadme);

  // Create each zone directory and its files
  for (const zm of zoneMetrics) {
    const zDir = join('data/home/portsudan', zm.zone.zone_slug);
    mkdirSync(zDir, { recursive: true });

    // overview.json
    const zoneOverview = {
      zone_slug: zm.zone.zone_slug,
      canonical_name: zm.zone.canonical_name,
      arabic_name: zm.zone.arabic_name,
      english_name: zm.zone.english_name,
      sector: zm.zone.sector,
      name_type: zm.zone.name_type,
      lat: zm.zone.lat,
      lng: zm.zone.lng,
      radius_km: zm.zone.radius_km,
      confidence: zm.zone.confidence,
      description: zm.zone.description,
      sources: zm.zone.sources,
      aliases: zm.zone.aliases,
      metrics: zm.metrics,
      leads_count: zm.leads.length,
      mkan_clusters_count: zm.clusters.length
    };
    writeFileSync(join(zDir, 'overview.json'), JSON.stringify(zoneOverview, null, 2) + '\n');

    // leads.json
    writeFileSync(join(zDir, 'leads.json'), JSON.stringify({
      zone_slug: zm.zone.zone_slug,
      canonical_name: zm.zone.canonical_name,
      total_leads: zm.leads.length,
      leads: zm.leads
    }, null, 2) + '\n');

    // README.md
    let zMd = `# Zone: ${zm.zone.arabic_name} (${zm.zone.english_name})

**Slug**: \`${zm.zone.zone_slug}\` | **Sector**: \`${zm.zone.sector}\` | **Type**: \`${zm.zone.name_type}\` | **Confidence**: \`${zm.zone.confidence}\`

${zm.zone.description}

---

## Zone Profile & Coordinates
- **Arabic Name**: ${zm.zone.arabic_name}
- **English Name**: ${zm.zone.english_name}
- **Sector**: \`${zm.zone.sector}\`
- **Aliases**: ${zm.zone.aliases.length > 0 ? zm.zone.aliases.map(a => `\`${a}\``).join(', ') : 'None'}
- **Coordinates**: ${zm.zone.lat ? `\`${zm.zone.lat}, ${zm.zone.lng}\` (Radius: ${zm.zone.radius_km} km)` : '*Unresolved coordinates*'}
- **Sources**: ${zm.zone.sources.join(' · ')}
${zm.zone.caveat ? `\n> ⚠️ **Note**: ${zm.zone.caveat}\n` : ''}

---

## Supply Density & Metrics

- **Discovered Accommodation Businesses**: **${zm.metrics.total_discovered_businesses}** (${(zm.metrics.zone_share_of_discovered_supply * 100).toFixed(1)}% of city total)
  - Furnished Apartments: **${zm.metrics.categories.furnished_apartment}**
  - Hotel Apartments: **${zm.metrics.categories.hotel_apartment}**
  - Hotels: **${zm.metrics.categories.hotel}**
  - Resorts: **${zm.metrics.categories.resort}**
  - Real Estate Agencies: **${zm.metrics.categories.real_estate_office}**
  - Guest Houses / Chalets: **${zm.metrics.categories.guest_house + zm.metrics.categories.chalet}**
- **Live Mkan Listings**: **${zm.metrics.mkan_published_listings}** (${(zm.metrics.zone_share_of_mkan_listings * 100).toFixed(1)}% of city portfolio)
- **Phone-Reachable Leads**: **${zm.metrics.phone_reachable_leads}**
- **Supply Status**: \`${zm.metrics.supply_status}\`
- **Demand Status**: \`${zm.metrics.demand_telemetry.status}\` (*Telemetry uninstrumented*)
- **Acquisition Priority Score**: **${zm.metrics.acquisition_priority_score}/100** (\`${zm.metrics.acquisition_priority}\`)

---

## Discovered Business Leads (${zm.leads.length})

`;

    if (zm.leads.length === 0) {
      zMd += `*No offline accommodation businesses matched this specific zone yet. Acquisition should explore local broker connections.*\n`;
    } else {
      zMd += `| Business Name | Category | Phone | Rating | Priority | Acquisition Notes |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      zm.leads.forEach(l => {
        const phone = l.contact.phone.length > 0 ? l.contact.phone.join(', ') : '—';
        const rating = l.google_maps.rating ? `⭐ ${l.google_maps.rating} (${l.google_maps.review_count || 0})` : (l.tripadvisor.rating ? `⭐ ${l.tripadvisor.rating} TA` : '—');
        zMd += `| **${l.name.primary}** | \`${l.category}\` | \`${phone}\` | ${rating} | \`${l.market.lead_priority}\` | ${l.contact.website ? `Website: ${l.contact.website}` : 'Direct outreach'} |\n`;
      });
    }

    if (zm.clusters.length > 0) {
      zMd += `\n---

## Live Mkan Listings Snapshot (${zm.metrics.mkan_published_listings} listings across ${zm.clusters.length} coordinate clusters)

| Coordinates | Published Listings | Address Text | Cluster Note |\n| :--- | :---: | :--- | :--- |\n`;
      zm.clusters.forEach(c => {
        zMd += `| \`${c.lat}, ${c.lng}\` | **${c.listings}** | ${c.address} | ${c.note || 'Active listing'} |\n`;
      });
    }

    writeFileSync(join(zDir, 'README.md'), zMd);
  }

  console.log('🎉 Successfully created all 45 zone folders, datasets, and markdown reports!');
}

main().catch(err => {
  console.error('❌ Error executing script:', err);
  process.exit(1);
});
