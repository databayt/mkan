/**
 * Seed & Synchronize the 4 Manual Hosts (0001 عبدوت, 0002 دقنة, 0003 حسين, 0004 السند)
 * and their 26 real estate homes directly into Twenty CRM with full Airbnb-patterned metadata.
 *
 * Implements the 4-Beat Airbnb Layout:
 *   - Opening Hook
 *   - The space (spaceEn / spaceAr)
 *   - Guest access (guestAccessEn / guestAccessAr)
 *   - Other things to note (notesEn / notesAr)
 *   - Google Maps Location URL
 *
 * Populates all 28 columns:
 *   account, host, listingId, name, hostPhone, hostWhatsapp, titleEn, titleAr, descriptionEn,
 *   descriptionAr, spaceEn, spaceAr, guestAccessEn, guestAccessAr, notesEn, notesAr,
 *   airbnbCategoryAr, amenities, highlights, publishState, overallTrustScore, photoStage,
 *   propertyType, listingUrl, googleMapsUrl, country, city, zone.
 *
 * Usage:
 *   npx tsx scripts/crm/seed-manual-hosts-crm.ts --apply
 */
import { config } from 'dotenv';
config({ override: true });

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const REST = `${API_URL}/rest`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const linkOne = (url: string | null | undefined, label = '') =>
  url ? { primaryLinkUrl: url, primaryLinkLabel: label, secondaryLinks: [] } : undefined;
const linkMany = (urls: string[]) =>
  urls.length ? { primaryLinkUrl: urls[0], primaryLinkLabel: '', secondaryLinks: urls.slice(1).map((u) => ({ label: '', url: u })) } : undefined;
const currency = (amount: number | null | undefined, code = 'SDG') =>
  amount != null ? { amountMicros: Math.round(amount * 1_000_000), currencyCode: code } : undefined;
const phones = (num: string | null | undefined) =>
  num ? { primaryPhoneNumber: num.replace(/^\+?249/, ''), primaryPhoneCountryCode: 'SD', primaryPhoneCallingCode: '+249', additionalPhones: [] } : undefined;
const toUpperSnake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();

const clean = <T extends Record<string, unknown>>(o: T): Partial<T> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && !(Array.isArray(v) && v.length === 0))) as Partial<T>;

const MIN_GAP_MS = 600;
let lastCallAt = 0;
async function throttle() {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown, attempt = 0): Promise<any> {
  await throttle();
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 429 && attempt < 8) {
    const backoff = 10_000 * (attempt + 1);
    console.warn(`  … 429 rate limit — waiting ${backoff / 1000}s (attempt ${attempt + 1})`);
    await sleep(backoff);
    return rest(method, path, body, attempt + 1);
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

const records = (res: any, plural: string): any[] => {
  const d = res?.data ?? res;
  const v = d?.[plural] ?? d;
  if (Array.isArray(v)) return v;
  if (Array.isArray(v?.edges)) return v.edges.map((e: any) => e.node);
  return [];
};

// ── Manual Host Profiles ─────────────────────────────────────────────────────
const MANUAL_HOST_PROFILES: Record<string, { name: string; username: string; phone?: string; whatsapp?: string; notes: string }> = {
  '0001': {
    name: 'عبدوت',
    username: '0001',
    phone: '+249915494649',
    whatsapp: '+249915494649',
    notes: 'عقارات ورثة تقسيم التركة العائلية (البيت الكبير + عمارة الفرن) — السكة حديد، بورتسودان (هاتف المالك 0915494649).',
  },
  '0002': {
    name: 'دقنة',
    username: '0002',
    phone: '+249912846648',
    whatsapp: '+249912846648',
    notes: 'عمارة حي السكة حديد متعددة الطوابق — بورتسودان (هاتف المالك 0912846648).',
  },
  '0003': {
    name: 'حسين',
    username: '0003',
    phone: '+24903467930',
    whatsapp: '+24903467930',
    notes: 'عمارة حسين في بورتسودان — حي الإغريق (هاتف المالك 0024903467930).',
  },
  '0004': {
    name: 'السند',
    username: '0004',
    phone: '+249912538883',
    whatsapp: '+249912538883',
    notes: 'مشغل دبي للشقق المفروشة — سوق سكة حديد، بورتسودان (هاتف المالك 0912538883).',
  },
};

// ── Master 4-Beat Airbnb Copywriting Dictionary for all 26 Listings ──────────
interface FullListingData {
  titleAr: string;
  titleEn: string;
  categoryAr: string;
  category: string;
  zone: string;
  googleMapsUrl: string;
  spaceAr: string;
  spaceEn: string;
  guestAccessAr: string;
  guestAccessEn: string;
  notesAr: string;
  notesEn: string;
  amenities: string[];
  highlights: string[];
  propertyType: string;
  bedrooms: number;
  bathrooms: number;
  guestCount: number;
  estNightlySdg?: number;
}

const LISTINGS_COPY_MAP: Record<string, FullListingData> = {
  // ───────────────────────────────────────────────────────────────────────────
  // HOST 0001: عبدوت (7 Units — السكة حديد / Ska Hadded)
  // ───────────────────────────────────────────────────────────────────────────
  '0001-01': {
    titleAr: 'جناح تنفيذي فسيح بغرفتين وصالتين وحمّامين — السكة حديد، بورتسودان',
    titleEn: 'Spacious 2-Bedroom Executive Suite with Dual Salons · Ska Hadded, Port Sudan',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6138,37.2185',
    spaceAr: '• غرفتا نوم هادئتان بمراتب فندقية مريحة وخزائن ملابس رحبة.\n• صالتا جلوس فسيحتان مجهزتان بأطقم أرائك فاخرة وشاشة تلفزيون ذكية.\n• مطبخ متكامل ومجهز بالكامل ببوتاجاز، ثلاجة، غلاية، وكافة أدوات الطهي وإعداد الشاي والقهوة.\n• حمامان نظيفان بتشطيبات متكاملة ومياه دافئة.',
    spaceEn: '• Two quiet bedrooms with comfortable hotel-grade mattresses and ample wardrobe storage.\n• Dual spacious living salons with plush seating and smart TV.\n• Fully equipped kitchen with gas stove, refrigerator, kettle, and cookware for family meals.\n• Two clean, fully fitted bathrooms with hot water.',
    guestAccessAr: 'الشقة بالكامل مخصصة للضيوف بخصوصية تامة واستقلالية في الطابق الثاني.',
    guestAccessEn: 'Full, private access to the entire 2nd-floor apartment.',
    notesAr: '• تتوفر خزانات مياه ومولد كهربائي احتياطي لضمان راحة البال واستمرار الإمداد.\n• تكييف هواء اسبليت في جميع الغرف.\n• موقع مميز في حي السكة حديد قريب من الخدمات والأسواق.',
    notesEn: '• Standby backup generator and dedicated water tanks for continuous peace of mind.\n• Split-unit air conditioning throughout.\n• Prime location in Ska Hadded (Railway District) close to markets and city amenities.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'PARKING', 'TV'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS', 'GREAT_VIEW'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 2,
    guestCount: 5,
  },
  '0001-02': {
    titleAr: 'شقة أرضية مريحة بمدخل خاص وسهولة وصول — السكة حديد',
    titleEn: 'Accessible Ground-Floor 1-Bedroom Flat with Private Entry · Ska Hadded',
    categoryAr: 'شقق في قلب المدينة',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6138,37.2185',
    spaceAr: '• غرفة نوم رئيسية مريحة بسرير مزدوج وخزانة ملابس.\n• صالة استقبال دافئة ومفتوحة مع هول واسع وجلسة مريحة.\n• مطبخ مجهز بثلاجة وموقد وأدوات إعداد الطعام.\n• حمام متكامل بنظافة تامة.',
    spaceEn: '• Comfortable master bedroom with double bed and wardrobe storage.\n• Warm open living lounge and spacious hall with cozy seating.\n• Fitted kitchen with refrigerator, stove, and meal-prep essentials.\n• Clean, fully equipped bathroom.',
    guestAccessAr: 'مدخل خاص مستقل في الطابق الأرضي دون أي درج — مثالي لكبار السن وسهولة نقل الأمتعة.',
    guestAccessEn: 'Private ground-floor entrance with step-free access — ideal for seniors and easy luggage arrival.',
    notesAr: '• مولد كهربائي احتياطي وخزانات مياه متوفرة على مدار الساعة.\n• تكييف اسبليت متكامل.',
    notesEn: '• 24/7 standby generator and dedicated water storage tanks.\n• Split-unit AC throughout.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'PARKING'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 3,
  },
  '0001-03': {
    titleAr: 'شقة مشمسة بدور علوي وتهوية ممتازة — السكة حديد',
    titleEn: 'Sunlit Upper-Floor 2-Bedroom Flat with Open Breeze · Ska Hadded',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6138,37.2185',
    spaceAr: '• غرفتا نوم مشرقتان بأسرة مريحة وإضاءة طبيعية دافئة.\n• هول وصالة جلوس واسعة تنعم بتهوية علوية ممتازة بعيداً عن صخب الشارع.\n• مطبخ مجهز بكافة الأساسيات.\n• حمام مجهز بالكامل ونظيف.',
    spaceEn: '• Two bright bedrooms with comfortable beds and natural light.\n• Spacious hall and living area with excellent elevated airflow away from street noise.\n• Fully equipped kitchen with cookware.\n• Full, pristine bathroom.',
    guestAccessAr: 'الشقة بالكامل تحت تصرفك في الطابق العلوي الهادئ.',
    guestAccessEn: 'Exclusive private access to the entire upper-floor flat.',
    notesAr: '• مجهزة بمولد احتياطي وخزانات مياه لضمان استمرار الخدمات.\n• تكييف اسبليت في كافة الغرف.',
    notesEn: '• Standby generator and water tanks for worry-free stay.\n• Split AC in all rooms.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'PARKING'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 4,
  },
  '0001-04': {
    titleAr: 'استوديو أنيق بهول واسع ومطبخ مجهز — السكة حديد',
    titleEn: 'Charming Studio with Large Living Hall · Ska Hadded, Port Sudan',
    categoryAr: 'استوديوهات عصرية',
    category: 'DESIGN',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6138,37.2185',
    spaceAr: '• مساحة نوم مريحة بسرير مزدوج ومفروشات فندقية أنيقة.\n• هول استقبال رحب مع ركن جلوس أنيق وشاشة تلفزيون.\n• ركن مطبخ مجهز بثلاجة وغلاية وموقد سريع.\n• حمام خاص متكامل.',
    spaceEn: '• Comfortable sleeping area with double bed and fresh hotel-grade linens.\n• Spacious living hall with chic seating and flat-screen TV.\n• Kitchenette with refrigerator, kettle, and quick-cooking stove.\n• Pristine private bathroom.',
    guestAccessAr: 'الاستوديو بالكامل مخصص للضيف بخصوصية تامة واستقلالية.',
    guestAccessEn: 'Entire studio flat is exclusively for the guest with complete privacy.',
    notesAr: '• تيار كهربائي ومياه مستمرة مع مولد وخزانات احتياطية.\n• تكييف اسبليت عالي البرودة.',
    notesEn: '• Reliable power and water backed by generator and storage tanks.\n• High-efficiency split air conditioning.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'REFRIGERATOR', 'TV'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'ROOMS',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0001-05': {
    titleAr: 'شقة هادئة بغرفتين لإقامة عائلية مريحة — السكة حديد',
    titleEn: 'Peaceful 2-Bedroom Family Home · Ska Hadded, Port Sudan',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6138,37.2185',
    spaceAr: '• غرفتا نوم عائليتان بأسرة مريحة وخزائن ملابس.\n• صالة معيشة دافئة بطابع منزلي مريح.\n• مطبخ متكامل لإعداد الوجبات العائلية.\n• حمام مجهز بكافة الخدمات.',
    spaceEn: '• Two family bedrooms with comfortable bedding and storage.\n• Warm living lounge with relaxing home ambience.\n• Full kitchen equipped for family meals.\n• Clean, fully fitted bathroom.',
    guestAccessAr: 'الشقة بالكامل متاحة للضيوف مع سهولة الوصول والهدوء التام.',
    guestAccessEn: 'Full private access to the entire apartment in a peaceful setting.',
    notesAr: '• متوفر مولد كهربائي احتياطي وخزانات مياه.\n• تكييف اسبليت بالكامل.',
    notesEn: '• Standby generator and backup water tanks.\n• Split AC throughout.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'PARKING'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 4,
  },
  '0001-06': {
    titleAr: 'الدور الأخير الهادئ بصالون وإطلالة مفتوحة — السكة حديد',
    titleEn: 'Top-Floor Peaceful 3-Bedroom Flat with Open City Views · Ska Hadded',
    categoryAr: 'إطلالات بانورامية',
    category: 'TOP_OF_THE_WORLD',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6141,37.2180',
    spaceAr: '• ثلاث غرف نوم واسعة بمراتب مريحة.\n• صالون استقبال فسيح ومميز بإطلالة مفتوحة على المدينة وتهوية ممتازة.\n• مطبخ واسع ومجهز بالكامل بكافة أجهزة وأدوات الطبخ.\n• حمامان نظيفان ومجهزان بالكامل.',
    spaceEn: '• Three spacious bedrooms with restful beds.\n• Expansive reception salon with panoramic city outlooks and great breeze.\n• Fully equipped large kitchen with cookware and appliances.\n• Two clean, fully fitted bathrooms.',
    guestAccessAr: 'الدور الأخير بالكامل بخصوصية تامة واستقلالية مطلقة.',
    guestAccessEn: 'Exclusive private access to the top-floor residence.',
    notesAr: '• مولد كهربائي احتياطي وخزانات مياه إضافية لضمان راحة البال.\n• تكييف اسبليت في كافة الغرف والصالون.',
    notesEn: '• Standby power generator and dedicated water tanks.\n• Split-unit AC in all bedrooms and salon.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'PARKING', 'TV'],
    highlights: ['GREAT_VIEW', 'HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 3,
    bathrooms: 2,
    guestCount: 6,
  },
  '0001-07': {
    titleAr: 'شقة عائلية مشرقة بثلاث غرف وثلاثة حمّامات — مبنى الفرن، السكة حديد',
    titleEn: 'Bright 3-Bedroom 3-Bathroom Family Residence · Ska Hadded',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6141,37.2180',
    spaceAr: '• ثلاث غرف نوم رحبة تمنح كل فرد خصوصيته التامة.\n• ثلاثة حمامات متكاملة تضمن الراحة التامة للعائلات الكبيرة.\n• صالة معيشة فسيحة ومشرقة.\n• مطبخ حديث مجهز بالكامل.',
    spaceEn: '• Three spacious bedrooms providing complete privacy for everyone.\n• Three full bathrooms ensuring seamless comfort for large families.\n• Bright, expansive living room.\n• Modern, fully equipped kitchen.',
    guestAccessAr: 'الشقة بالكامل مخصصة للضيوف في الطابق الأول بالقرب من المدخل.',
    guestAccessEn: 'Entire 1st floor residence with quick, easy access.',
    notesAr: '• تتوفر خزانات مياه ومولد كهربائي احتياطي.\n• تكييف اسبليت كامل.',
    notesEn: '• Standby backup generator and dedicated water tanks.\n• Full split-unit air conditioning.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'PARKING', 'TV'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 3,
    bathrooms: 3,
    guestCount: 6,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // HOST 0002: دقنة (10 Units — Railway Building / Ska Hadded)
  // ───────────────────────────────────────────────────────────────────────────
  '0002-01': {
    titleAr: 'شقة واسعة بأربع غرف وصالتين وبلكونة — الطابق الأول، السكة حديد',
    titleEn: 'Grand 4-Bedroom Residence with Dual Salons & Balcony · Ska Hadded',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6145,37.2170',
    spaceAr: '• أربع غرف نوم واسعة تتسع للعائلات الكبيرة أو الوفود.\n• صالتا استقبال مريحتان مع شرفة خارجية واسعة.\n• مطبخ عائلي متكامل مجهز بكافة الأواني والأجهزة.\n• حمامان متكاملان ونظيفان.',
    spaceEn: '• Four generous bedrooms accommodating large families or travel groups.\n• Dual reception living salons opening to a wide outdoor balcony.\n• Full family kitchen with cookware and appliances.\n• Two clean, fully equipped bathrooms.',
    guestAccessAr: 'الشقة بالكامل في الطابق الأول مع بلكونة خاصة ومدخل آمن.',
    guestAccessEn: 'Entire 1st floor flat with private balcony and secure entry.',
    notesAr: '• تتوفر خزانات مياه احتياطية ومولد كهربائي.\n• بالقرب من الأسواق ووسائل النقل.\n• للحجز اتصل بالمضيف مباشرة: 0912846648.',
    notesEn: '• Standby water tanks and backup generator onsite.\n• Close to commercial markets and transport in Ska Hadded.\n• Call host directly for booking: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'PATIO_OR_BALCONY', 'TV'],
    highlights: ['GREAT_VIEW', 'HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 4,
    bathrooms: 2,
    guestCount: 8,
  },
  '0002-02': {
    titleAr: 'شقة مريحة بغرفة ومطبخ وهول — الطابق الثاني، السكة حديد',
    titleEn: 'Cozy 1-Bedroom Flat with Full Kitchen & Hall · Ska Hadded',
    categoryAr: 'شقق في قلب المدينة',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6145,37.2170',
    spaceAr: '• غرفة نوم رئيسية مجهزة بسرير مريح وخزانة.\n• هول وصالة استقبال مريحة.\n• مطبخ مستقل مجهز بجميع الأساسيات.\n• حمام خاص نظيف.',
    spaceEn: '• Master bedroom with comfortable bed and closet.\n• Welcoming hall and seating lounge.\n• Separate kitchen with essentials.\n• Clean private bathroom.',
    guestAccessAr: 'الشقة بالكامل في الطابق الثاني بخصوصية تامة.',
    guestAccessEn: 'Full private access to the 2nd-floor unit.',
    notesAr: '• إمدادات مياه مستمرة ومولد احتياطي.\n• تواصل مع المالك: 0912846648.',
    notesEn: '• Continuous water supply and backup power in Ska Hadded.\n• Contact host: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0002-03': {
    titleAr: 'شقة أرضية بغرفتين وهول ومدخل ميسر — السكة حديد',
    titleEn: 'Accessible Ground-Floor 2-Bedroom Home · Ska Hadded',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6145,37.2170',
    spaceAr: '• غرفتا نوم مريحتان للعائلة.\n• هول وصالة جلوس واسعة.\n• مطبخ متكامل.\n• حمام نظيف وسهل الوصول.',
    spaceEn: '• Two comfortable family bedrooms.\n• Spacious hall and living area.\n• Full kitchen.\n• Clean, accessible bathroom.',
    guestAccessAr: 'شقة الطابق الأرضي دون درج، سهلة الوصول لكبار السن وحقائب السفر.',
    guestAccessEn: 'Ground-floor step-free access in Ska Hadded, ideal for elderly guests.',
    notesAr: '• خزانات مياه ومولد كهربائي لراحة البال.\n• هاتف المالك: 0912846648.',
    notesEn: '• Backup water and generator for peace of mind.\n• Host phone: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 4,
  },
  '0002-04': {
    titleAr: 'شقة مضيئة بغرفة وصالة ومطبخ — الطابق الثاني (شقة 2)',
    titleEn: 'Bright 1-Bedroom Apartment with Kitchen & Living Area · 2nd Floor, Ska Hadded',
    categoryAr: 'شقق في قلب المدينة',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6145,37.2170',
    spaceAr: '• غرفة نوم هادئة ومكيفة.\n• صالة معيشة مع طاولة طعام صغيرة.\n• مطبخ مجهز ببوتاجاز وثلاجة.\n• حمام متكامل.',
    spaceEn: '• Quiet, air-conditioned bedroom.\n• Living area with small dining setup.\n• Kitchen equipped with stove and fridge.\n• Full bathroom.',
    guestAccessAr: 'الشقة بالكامل مخصصة للضيوف.',
    guestAccessEn: 'Exclusive private access to the apartment.',
    notesAr: '• خدمات متكاملة وماء مستمر.\n• هاتف الحجز: 0912846648.',
    notesEn: '• Full amenities and continuous water.\n• Booking phone: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0002-05': {
    titleAr: 'شقة هادئة بغرفة وهول ومطبخ — الطابق الثاني (شقة 3)',
    titleEn: 'Quiet 1-Bedroom Urban Flat with Equipped Kitchen · 2nd Floor, Ska Hadded',
    categoryAr: 'شقق في قلب المدينة',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6145,37.2170',
    spaceAr: '• غرفة نوم بسرير مريح وخزانة ملابس.\n• هول جلوس عملي.\n• مطبخ بكامل أدواته.\n• حمام خاص نظيف.',
    spaceEn: '• Bedroom with comfortable bed and wardrobe.\n• Practical living hall.\n• Fully equipped kitchen.\n• Clean private bathroom.',
    guestAccessAr: 'خصوصية تامة في الطابق الثاني.',
    guestAccessEn: 'Full privacy on the second floor.',
    notesAr: '• خزانات مياه ومولد كهربائي احتياطي.\n• هاتف المالك: 0912846648.',
    notesEn: '• Water tanks and standby power generator.\n• Host contact: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0002-06': {
    titleAr: 'شقة سطوح منعشة بغرفة ومطبخ وهول وإطلالة مفتوحة — السكة حديد',
    titleEn: 'Breezy Rooftop 1-Bedroom Retreat with Open Views · Ska Hadded',
    categoryAr: 'إطلالات بانورامية',
    category: 'TOP_OF_THE_WORLD',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6145,37.2170',
    spaceAr: '• غرفة نوم هادئة بالسطوح تنعم بأعلى درجات الهدوء والتهوية الطبيعية.\n• هول استقبال واسع.\n• مطبخ مجهز.\n• حمام خاص متكامل.',
    spaceEn: '• Peaceful rooftop bedroom with superior natural ventilation.\n• Spacious living hall.\n• Equipped kitchen.\n• Full private bathroom.',
    guestAccessAr: 'شقة السطوح بالكامل مع إمكانية التمتع بالهواء الطلق.',
    guestAccessEn: 'Entire rooftop unit with open terrace access in Ska Hadded.',
    notesAr: '• تيار مياه وكهرباء مدعوم بمولد وخزانات.\n• هاتف المالك: 0912846648.',
    notesEn: '• Continuous water and generator backup.\n• Host phone: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['GREAT_VIEW', 'HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0002-07': {
    titleAr: 'شقة سطوح ثانية بتهوية ممتازة وخصوصية تامة — السكة حديد',
    titleEn: 'Private Rooftop 1-Bedroom Flat with Open Sky Terrace · Ska Hadded',
    categoryAr: 'إطلالات بانورامية',
    category: 'TOP_OF_THE_WORLD',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6145,37.2170',
    spaceAr: '• غرفة نوم مريحة ومضاءة بنور الشمس.\n• صالة معيشة بإطلالة مفتوحة.\n• مطبخ عملي مجهز.\n• حمام نظيف.',
    spaceEn: '• Sunlit, comfortable bedroom.\n• Living area with open sky view.\n• Practical fitted kitchen.\n• Pristine bathroom.',
    guestAccessAr: 'الشقة بالكامل مخصصة للضيوف.',
    guestAccessEn: 'Full private access for guests.',
    notesAr: '• خزانات مياه ومولد كهربائي احتياطي.\n• هاتف المالك: 0912846648.',
    notesEn: '• Water tanks and standby power.\n• Host phone: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['GREAT_VIEW', 'HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0002-08': {
    titleAr: 'شقة أرضية واسعة بغرفتين وهول ومطبخ مستقل — السكة حديد',
    titleEn: 'Spacious Ground-Floor 2-Bedroom Flat with Separate Kitchen · Ska Hadded',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6145,37.2170',
    spaceAr: '• غرفتا نوم عائليتان مريحتان.\n• هول وصالة استقبال واسعة.\n• مطبخ مستقل مجهز بجميع الأساسيات.\n• حمام متكامل ونظيف.',
    spaceEn: '• Two comfortable family bedrooms.\n• Generous living hall.\n• Fully equipped separate kitchen.\n• Full clean bathroom.',
    guestAccessAr: 'الطابق الأرضي بمدخل سهل ومريح.',
    guestAccessEn: 'Ground floor with easy access in Ska Hadded.',
    notesAr: '• خدمات متوفرة على مدار الساعة.\n• هاتف المالك: 0912846648.',
    notesEn: '• 24/7 services and water backup.\n• Host phone: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 4,
  },
  '0002-09': {
    titleAr: 'شقة بإطلالة بحرية ونسيم عليل — بورتسودان',
    titleEn: 'Coastal View 2-Bedroom Apartment with Sea Breeze · Port Sudan',
    categoryAr: 'إطلالات بحرية',
    category: 'BEACHFRONT',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6200,37.2250',
    spaceAr: '• غرفتا نوم بإطلالة مريحة ونسيم بحري عليل.\n• صالة معيشة واسعة.\n• مطبخ مجهز بكافة الأدوات.\n• حمام متكامل.',
    spaceEn: '• Two bedrooms with relaxing coastal views and breeze.\n• Spacious living room.\n• Fully equipped kitchen.\n• Complete bathroom.',
    guestAccessAr: 'الشقة بالكامل بخصوصية تامة.',
    guestAccessEn: 'Entire flat for guest use.',
    notesAr: '• مولد وخزانات مياه متوفرة.\n• هاتف المالك: 0912846648.',
    notesEn: '• Standby generator and water tanks.\n• Host phone: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'PATIO_OR_BALCONY'],
    highlights: ['GREAT_VIEW', 'HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 4,
  },
  '0002-10': {
    titleAr: 'استوديو عصري ومريح بالقرب من حي المطار — بورتسودان',
    titleEn: 'Modern Airport-District Studio with High Convenience · Port Sudan',
    categoryAr: 'استوديوهات عصرية',
    category: 'DESIGN',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.5850,37.2100',
    spaceAr: '• استوديو متكامل بسرير مريح، هول جلوس، وركن مطبخ وحمام خاص.\n• مثالي للمسافرين والقادمين عبر المطار.',
    spaceEn: '• Self-contained studio with comfortable bed, lounge area, kitchenette, and private bath.\n• Ideal for travelers and airport transit.',
    guestAccessAr: 'الاستوديو بالكامل مخصص للضيف.',
    guestAccessEn: 'Full private access to the studio.',
    notesAr: '• متوفر مولد وخزانات مياه.\n• هاتف المالك: 0912846648.',
    notesEn: '• Backup power and water tanks.\n• Host phone: +249912846648.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'ROOMS',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // HOST 0003: حسين (6 Units — Hayy Al-Aghareeq)
  // ───────────────────────────────────────────────────────────────────────────
  '0003-01': {
    titleAr: 'شقة مريحة بغرفة وصالة ومطبخ — الطابق الثاني، حي الإغريق',
    titleEn: 'Comfortable 1-Bedroom Flat with Living Hall · Hayy Al-Aghareeq',
    categoryAr: 'شقق في قلب المدينة',
    category: 'ICONIC_CITIES',
    zone: 'HAYY_AL_AGHAREEQ',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6182,37.2154',
    spaceAr: '• غرفة نوم مريحة بمرتبة فندقية وخزانة ملابس.\n• صالة معيشة هادئة ومفروشة.\n• مطبخ مستقل مجهز ببوتاجاز وثلاجة.\n• حمام خاص متكامل.',
    spaceEn: '• Comfortable bedroom with hotel mattress and wardrobe.\n• Peaceful furnished living room.\n• Separate kitchen with stove and fridge.\n• Full private bathroom.',
    guestAccessAr: 'الشقة بالكامل في الطابق الثاني بخصوصية تامة.',
    guestAccessEn: 'Full private access to the 2nd-floor apartment.',
    notesAr: '• مولد كهربائي احتياطي وخزانات مياه لضمان راحة البال.\n• هاتف المالك المباشر: 0024903467930.',
    notesEn: '• Standby generator and water tanks for uninterrupted comfort.\n• Direct host phone: +24903467930.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0003-02': {
    titleAr: 'شقة هادئة بغرفة وصالة ومطبخ مستقل — الطابق الثاني (شقة 2)',
    titleEn: 'Quiet 1-Bedroom Urban Stay with Fitted Kitchen · 2nd Floor',
    categoryAr: 'شقق في قلب المدينة',
    category: 'ICONIC_CITIES',
    zone: 'HAYY_AL_AGHAREEQ',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6182,37.2154',
    spaceAr: '• غرفة نوم هادئة ومكيفة.\n• صالة استقبال أنيقة.\n• مطبخ مجهز بجميع الأساسيات.\n• حمام نظيف ومتكامل.',
    spaceEn: '• Quiet, air-conditioned bedroom.\n• Chic living lounge.\n• Kitchen equipped with cooking essentials.\n• Clean, fitted bathroom.',
    guestAccessAr: 'الشقة بالكامل مخصصة للضيوف.',
    guestAccessEn: 'Entire apartment is exclusively for guests.',
    notesAr: '• خدمات مستمرة ومياه متوفرة.\n• هاتف المالك: 0024903467930.',
    notesEn: '• Continuous services and water supply.\n• Host contact: +24903467930.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0003-03': {
    titleAr: 'شقة عائلية مشرقة بغرفتين وصالة ومطبخ — الطابق الثالث، حي الإغريق',
    titleEn: 'Bright 2-Bedroom Family Apartment · 3rd Floor, Hayy Al-Aghareeq',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'HAYY_AL_AGHAREEQ',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6182,37.2154',
    spaceAr: '• غرفتا نوم عائليتان بأسرة مريحة وخزائن رحبة.\n• صالة معيشة فسيحة تنعم بتهوية ممتازة وإضاءة طبيعية.\n• مطبخ متكامل لطهي الوجبات.\n• حمام نظيف ومتكامل التجهيزات.',
    spaceEn: '• Two family bedrooms with comfortable bedding and spacious closets.\n• Expansive living room with great ventilation and natural sunlight.\n• Full kitchen for family cooking.\n• Pristine, fully equipped bathroom.',
    guestAccessAr: 'الشقة بالكامل في الطابق الثالث مع هدوء تام وخصوصية.',
    guestAccessEn: 'Entire 3rd-floor apartment in a tranquil setting.',
    notesAr: '• تتوفر خزانات مياه ومولد كهربائي احتياطي.\n• هاتف المالك: 0024903467930.',
    notesEn: '• Backup water storage and power generator available.\n• Host phone: +24903467930.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 4,
  },
  '0003-04': {
    titleAr: 'شقة دور علوي بغرفة وصالة وتهوية علوية — الطابق الثالث، حي الإغريق',
    titleEn: 'Airy 3rd-Floor 1-Bedroom Flat with Open Ventilation · Al-Aghareeq',
    categoryAr: 'شقق في قلب المدينة',
    category: 'ICONIC_CITIES',
    zone: 'HAYY_AL_AGHAREEQ',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6182,37.2154',
    spaceAr: '• غرفة نوم بسرير مريح وخزانة ملابس.\n• صالة معيشة بإطلالة مريحة وتهوية علوية منعشة.\n• مطبخ مستقل.\n• حمام متكامل.',
    spaceEn: '• Bedroom with comfortable bed and closet.\n• Living room with pleasant elevated airflow.\n• Separate kitchen.\n• Full bathroom.',
    guestAccessAr: 'الشقة بالكامل مخصصة للضيوف.',
    guestAccessEn: 'Full private access for guests.',
    notesAr: '• تيار مياه وكهرباء مستمر.\n• هاتف المالك: 0024903467930.',
    notesEn: '• Continuous water and reliable power.\n• Host phone: +24903467930.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0003-05': {
    titleAr: 'شقة هادئة بدور علوي بغرفة وصالة ومطبخ — الطابق الثالث (شقة 3)',
    titleEn: 'Tranquil 1-Bedroom Upper Flat · 3rd Floor, Hayy Al-Aghareeq',
    categoryAr: 'شقق في قلب المدينة',
    category: 'ICONIC_CITIES',
    zone: 'HAYY_AL_AGHAREEQ',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6182,37.2154',
    spaceAr: '• غرفة نوم هادئة ومفروشة بعناية.\n• صالة استقبال دافئة.\n• مطبخ متكامل بجميع الأدوات.\n• حمام نظيف.',
    spaceEn: '• Tranquil, thoughtfully furnished bedroom.\n• Warm living lounge.\n• Complete kitchen with cookware.\n• Pristine bathroom.',
    guestAccessAr: 'الشقة بالكامل تحت تصرفك.',
    guestAccessEn: 'Entire unit is for guest use.',
    notesAr: '• مولد كهربائي وخزانات مياه.\n• هاتف المالك: 0024903467930.',
    notesEn: '• Backup generator and water tanks.\n• Host phone: +24903467930.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0003-06': {
    titleAr: 'شقة فسيحة بغرفتين وصالة ومطبخ مجهز — الطابق الثاني (شقة 3)',
    titleEn: 'Spacious 2-Bedroom Flat with Complete Kitchen · 2nd Floor',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'HAYY_AL_AGHAREEQ',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6182,37.2154',
    spaceAr: '• غرفتا نوم مريحتان ومؤثثتان بالكامل.\n• صالة معيشة واسعة ومريحة لجميع أفراد الأسرة.\n• مطبخ مجهز ببوتاجاز وثلاجة وكافة الأواني.\n• حمام متكامل.',
    spaceEn: '• Two comfortable, fully furnished bedrooms.\n• Spacious living room for the whole family.\n• Kitchen equipped with stove, fridge, and cookware.\n• Full bathroom.',
    guestAccessAr: 'الشقة بالكامل بخصوصية تامة في الطابق الثاني.',
    guestAccessEn: 'Complete privacy in the 2nd-floor flat.',
    notesAr: '• مولد كهربائي احتياطي وخزانات مياه متوفرة.\n• هاتف المالك: 0024903467930.',
    notesEn: '• Standby generator and backup water tanks.\n• Host phone: +24903467930.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 4,
  },

  // ───────────────────────────────────────────────────────────────────────────
  // HOST 0004: السند (3 Units — Mashghal Dubai, Railway Market / Ska Hadded)
  // ───────────────────────────────────────────────────────────────────────────
  '0004-01': {
    titleAr: 'استوديو عصري مفروش ومجهز بالكامل — مشغل دبي، سوق سكة حديد',
    titleEn: 'Modern Fully Furnished Studio · Dubai Workshop, Ska Hadded',
    categoryAr: 'استوديوهات عصرية',
    category: 'DESIGN',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6125,37.2190',
    spaceAr: '• مساحة معيشة ونوم عصرية مجهزة بسرير مريح ومفروشات أنيقة.\n• هول استقبال مع شاشة تلفزيون ذكية وتكييف سبليت عالي البرودة.\n• ركن مطبخ مجهز بثلاجة، غلاية، وكافة أدوات إعداد المشروبات والوجبات الخفيفة.\n• حمام خاص متكامل ونظيف.',
    spaceEn: '• Contemporary studio living and sleeping space with comfortable bed and stylish furnishings.\n• Living hall with smart TV and high-efficiency split AC.\n• Kitchenette equipped with refrigerator, kettle, and meal-prep essentials.\n• Pristine, fully fitted private bathroom.',
    guestAccessAr: 'الاستوديو بالكامل مخصص للضيوف بخصوصية تامة واستقلالية في مبنى مشغل دبي.',
    guestAccessEn: 'Full private access to the entire studio in the Dubai Workshop building, Ska Hadded.',
    notesAr: '• يتوفر مولد كهربائي احتياطي بالاتفاق لضمان استمرارية التيار.\n• خزانات مياه احتياطية تضمن إمداد المياه على مدار الساعة.\n• موقع حيوي ممتاز في سوق سكة حديد.\n• للتواصل المباشر مع المالك: 0912538883.',
    notesEn: '• Standby power generator available upon agreement for uninterrupted power.\n• Standby backup water tanks ensuring continuous water supply.\n• Prime central location in Ska Hadded (Railway Market).\n• Direct host contact: +249912538883.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'REFRIGERATOR', 'TV'],
    highlights: ['HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'ROOMS',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
  },
  '0004-02': {
    titleAr: 'شقة عائلية مفروشة بغرفتين وبلكونة شرقية ومجلس — مشغل دبي، سوق سكة حديد',
    titleEn: 'Spacious 2BR Furnished Apartment with East Balcony & Majlis · Dubai Workshop, Ska Hadded',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6125,37.2190',
    spaceAr: '• غرفتا نوم مجهزتان بـ 7 أسرة مريحة مع مفروشات نظيفة وخزائن ملابس.\n• صالة استقبال واسعة تجمع بين طقم جلوس كلاسيكي فاخر وطقم عربي أصيل (مجلس) لجلسات عائلية دافئة.\n• بلكونة شرقية متميزة تنعم بنسمات الصباح والتهوية الطبيعية.\n• مطبخ متكامل ومجهز بالكامل ببوتاجاز، ثلاجة، كولر مياه باردة، وأواني طهي.\n• تكييف هواء سبليت عالي الكفاءة، شاشة تلفزيون ذكية، غسالة ملابس، ومكواة مع طاولة كوي.\n• حمام مقعدين متكامل ونظيف.',
    spaceEn: '• Two comfortable bedrooms equipped with 7 beds, clean linens, and wardrobes.\n• Generous living room combining a luxury sofa set with a traditional Arabic majlis seating area.\n• East-facing private balcony offering pleasant morning breezes and natural light.\n• Fully equipped kitchen with stove, refrigerator, chilled water cooler, and cookware.\n• High-efficiency split air conditioning, smart TV, washing machine, and iron with board.\n• Full bathroom equipped with two toilets and pristine fixtures.',
    guestAccessAr: 'الشقة بالكامل بخصوصية تامة للضيوف، مع مدخل مستقل وسهل الوصول في الطابق الأول.',
    guestAccessEn: 'Exclusive and private access to the entire apartment, with easy first-floor staircase access in Ska Hadded.',
    notesAr: '• يتوفر مولد كهربائي احتياطي بالاتفاق لضمان استمرارية التيار.\n• خزانات مياه احتياطية تضمن إمداد المياه على مدار الساعة.\n• موقع مركزي مميز في سوق سكة حديد بالقرب من المراكز التجارية ووسائل النقل.\n• للحجز المباشر اتصل بالمالك: 0912538883.',
    notesEn: '• Standby power generator available upon agreement for uninterrupted electricity.\n• Standby backup water tanks ensuring 24/7 water availability.\n• Prime central location in Ska Hadded (Railway Market) within walking distance of shopping and transport.\n• Call host directly: +249912538883.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'WASHER_DRYER', 'KITCHEN', 'TV', 'REFRIGERATOR', 'PATIO_OR_BALCONY'],
    highlights: ['GREAT_VIEW', 'WASHER_DRYER', 'HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 7,
  },
  '0004-03': {
    titleAr: 'شقة مفروشة راقية بغرفتين وبلكونة شرقية ومجلس — الطابق الثاني، مشغل دبي',
    titleEn: 'Bright 2BR Furnished Apartment with East Balcony & Majlis · 2nd Floor, Ska Hadded',
    categoryAr: 'منازل عائلية',
    category: 'ICONIC_CITIES',
    zone: 'RAILWAY_DISTRICT',
    googleMapsUrl: 'https://www.google.com/maps?q=19.6125,37.2190',
    spaceAr: '• غرفتا نوم واسعتان مجهزتان بـ 7 أسرة مريحة ومفروشات فندقية أنيقة.\n• صالة معيشة رحبة تضم طقم جلوس عصري ومجلس عربي تقليدي مريح.\n• بلكونة شرقية بإطلالة مفتوحة وتهوية علوية ممتازة بعيداً عن ضجيج الشارع.\n• مطبخ مجهز بالكامل بجميع مستلزمات الطهي، كولر مياه، وثلاجة.\n• تكييف هواء سبليت بارد، شاشة تلفزيون، غسالة ملابس ومكواة.\n• حمام مقعدين متكامل ونظيف بجميع التجهيزات.',
    spaceEn: '• Two spacious bedrooms with 7 comfortable beds and fresh linens.\n• Large living hall featuring a contemporary sofa set and traditional Arabic majlis.\n• East-facing balcony with open views and refreshing sea-breeze ventilation.\n• Fully equipped kitchen with complete cookware, chilled water cooler, and refrigerator.\n• Split-unit air conditioning, TV, washing machine, and iron.\n• Full bathroom with two toilets and complete amenities.',
    guestAccessAr: 'الشقة بالكامل مخصصة للضيوف للاستمتاع بإقامة مستقلة وهادئة في الطابق الثاني.',
    guestAccessEn: 'Guests have complete, private access to the whole 2nd-floor apartment throughout their stay in Ska Hadded.',
    notesAr: '• يتوفر مولد كهربائي احتياطي بالاتفاق.\n• إمدادات مياه مستمرة عبر خزانات مياه احتياطية.\n• قريبة جداً من المواقف والأسواق المركزية في بورتسودان.\n• للحجز اتصل بالمالك: 0912538883.',
    notesEn: '• Backup standby generator available upon agreement.\n• Continuous water supply backed by dedicated storage tanks.\n• Steps away from Ska Hadded central hubs and transportation.\n• Contact host: +249912538883.',
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'WASHER_DRYER', 'KITCHEN', 'TV', 'REFRIGERATOR', 'PATIO_OR_BALCONY'],
    highlights: ['GREAT_VIEW', 'WASHER_DRYER', 'HIGH_SPEED_INTERNET_ACCESS'],
    propertyType: 'APARTMENT',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 7,
  },
};

const VALID_AMENITIES = new Set([
  'WASHER_DRYER', 'AIR_CONDITIONING', 'DISHWASHER', 'HIGH_SPEED_INTERNET', 'HARDWOOD_FLOORS',
  'WALK_IN_CLOSETS', 'MICROWAVE', 'REFRIGERATOR', 'POOL', 'GYM', 'PARKING', 'PETS_ALLOWED',
  'WI_FI', 'KITCHEN', 'TV', 'DEDICATED_WORKSPACE', 'ELEVATOR', 'PATIO_OR_BALCONY',
  'BACKYARD', 'HOT_TUB', 'BATHTUB', 'BBQ_GRILL', 'OUTDOOR_DINING', 'OUTDOOR_SHOWER',
  'FIRE_PIT', 'INDOOR_FIREPLACE', 'POOL_TABLE', 'PIANO', 'BEACH_ACCESS', 'LAKE_ACCESS',
  'EVCHARGER', 'CRIB', 'BREAKFAST', 'HAIR_DRYER', 'LUGGAGE_DROPOFF', 'BEDROOM_LOCK',
  'SMOKE_ALARM', 'CARBON_MONOXIDE_ALARM', 'FIRE_EXTINGUISHER', 'FIRST_AID_KIT', 'SECURITY_CAMERAS',
]);

const VALID_HIGHLIGHTS = new Set([
  'HIGH_SPEED_INTERNET_ACCESS', 'WASHER_DRYER', 'AIR_CONDITIONING', 'HEATING', 'SMOKE_FREE',
  'CABLE_READY', 'SATELLITE_TV', 'DOUBLE_VANITIES', 'TUB_SHOWER', 'INTERCOM',
  'SPRINKLER_SYSTEM', 'RECENTLY_RENOVATED', 'CLOSE_TO_TRANSIT', 'GREAT_VIEW', 'QUIET_NEIGHBORHOOD',
]);

const mapAmenity = (a: string) => {
  const up = toUpperSnake(a);
  if (up === 'FREE_PARKING_ON_PREMISES') return 'PARKING';
  if (up === 'HOT_WATER') return undefined;
  if (up === 'STANDBY_GENERATOR') return undefined;
  return VALID_AMENITIES.has(up) ? up : undefined;
};

const mapHighlight = (h: string) => {
  const up = toUpperSnake(h);
  if (up === 'SELF_CHECKIN') return undefined;
  if (up === 'FAST_WIFI') return 'HIGH_SPEED_INTERNET_ACCESS';
  if (up === 'HIGH_TRUST_HOST') return undefined;
  return VALID_HIGHLIGHTS.has(up) ? up : undefined;
};

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('SEEDING 4 MANUAL HOSTS & 26 REAL HOMES INTO TWENTY CRM (AIRBNB COPY + MAPS)');
  console.log('═══════════════════════════════════════════════════════════════════════════════');

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  const users = await prisma.user.findMany({
    where: { email: { in: Object.keys(MANUAL_HOST_PROFILES) } },
    include: {
      listings: {
        include: {
          location: true,
        },
      },
    },
    orderBy: { email: 'asc' },
  });

  console.log(`\nFound ${users.length} manual hosts with ${users.reduce((acc, u) => acc + u.listings.length, 0)} total listings in Prisma DB.`);

  // 1. Query existing Twenty CRM hosts
  const existingHostsRes = await rest('GET', 'hosts?limit=200&depth=0');
  const existingHosts = records(existingHostsRes, 'hosts');
  const hostByEmail = new Map<string, any>();
  const hostByUsername = new Map<string, any>();
  const hostByName = new Map<string, any>();

  for (const h of existingHosts) {
    if (h.mkanAccountEmail?.primaryEmailValue) hostByEmail.set(h.mkanAccountEmail.primaryEmailValue.toLowerCase(), h);
    if (h.mkanUsername) hostByUsername.set(h.mkanUsername, h);
    if (h.name) hostByName.set(h.name, h);
  }

  // 2. Query existing Twenty CRM homes
  const existingHomesRes = await rest('GET', 'homes?limit=300&depth=0');
  const existingHomes = records(existingHomesRes, 'homes');
  const homeByListingId = new Map<string, any>();
  const homeByName = new Map<string, any>();

  for (const h of existingHomes) {
    if (h.listingId) homeByListingId.set(String(h.listingId), h);
    if (h.mkanListingId) homeByListingId.set(String(h.mkanListingId), h);
    if (h.titleAr || h.title) homeByName.set((h.titleAr ?? h.title) as string, h);
    if (h.titleAr) homeByName.set(h.titleAr, h);
  }

  // 3. Upsert Hosts
  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  console.log('1. UPSERTING HOSTS IN TWENTY CRM');
  console.log('─────────────────────────────────────────────────────────────────────────────');

  const twentyHostIdByPrismaId = new Map<string, string>();

  for (const u of users) {
    const profile = MANUAL_HOST_PROFILES[u.email];
    let existingHost = hostByEmail.get(u.email.toLowerCase()) ?? hostByUsername.get(profile.username) ?? hostByName.get(profile.name);

    const hostPayload = clean({
      mkanUsername: profile.username,
      mkanAccountEmail: { primaryEmail: u.email, additionalEmails: [] },
      name: profile.name,
      phone: phones(profile.phone ?? u.phoneNumber),
      whatsapp: phones(profile.whatsapp ?? u.phoneNumber),
      source: 'OTHER',
      hostTrustScore: 100,
      hostTrustBand: 'TRUSTED',
      notes: profile.notes,
    });

    let twentyHostId: string;
    if (existingHost?.id) {
      console.log(`  = Updating Host ${profile.username} (${profile.name}) [id: ${existingHost.id}]`);
      await rest('PATCH', `hosts/${existingHost.id}`, hostPayload);
      twentyHostId = existingHost.id;
    } else {
      console.log(`  + Creating Host ${profile.username} (${profile.name})`);
      const created = await rest('POST', 'hosts', hostPayload);
      twentyHostId = created.data?.createHost?.id ?? created.id;
    }
    twentyHostIdByPrismaId.set(u.id, twentyHostId);
    twentyHostIdByPrismaId.set(u.email, twentyHostId);
  }

  // 4. Upsert Homes
  console.log('\n─────────────────────────────────────────────────────────────────────────────');
  console.log('2. UPSERTING 26 HOMES IN TWENTY CRM (WITH AIRBNB COPY + GOOGLE MAPS)');
  console.log('─────────────────────────────────────────────────────────────────────────────');

  let updatedHomes = 0;
  let createdHomes = 0;

  for (const u of users) {
    const profile = MANUAL_HOST_PROFILES[u.email];
    const twentyHostId = twentyHostIdByPrismaId.get(u.id) ?? twentyHostIdByPrismaId.get(u.email);

    for (let i = 0; i < u.listings.length; i++) {
      const l = u.listings[i];
      const structuredListingId = `${profile.username}-${String(i + 1).padStart(2, '0')}`;
      const copyData = LISTINGS_COPY_MAP[structuredListingId];

      const titleAr = copyData?.titleAr ?? l.title ?? `شقة ${structuredListingId}`;
      const titleEn = copyData?.titleEn ?? `Apartment ${structuredListingId} · Ska Hadded, Port Sudan`;
      const categoryAr = copyData?.categoryAr ?? 'منازل عائلية';
      const category = copyData?.category ?? 'ICONIC_CITIES';
      const zone = copyData?.zone ?? 'RAILWAY_DISTRICT';
      const googleMapsUrl = copyData?.googleMapsUrl ?? `https://www.google.com/maps?q=${l.location?.latitude ?? 19.6158},${l.location?.longitude ?? 37.2164}`;

      const spaceAr = copyData?.spaceAr ?? '• مساحات معيشة ونوم مريحة ومجهزة بالكامل.';
      const spaceEn = copyData?.spaceEn ?? '• Fully equipped living and sleeping spaces.';
      const guestAccessAr = copyData?.guestAccessAr ?? 'الشقة بالكامل مخصصة للضيوف بخصوصية تامة.';
      const guestAccessEn = copyData?.guestAccessEn ?? 'Full private access to the entire home.';
      const notesAr = copyData?.notesAr ?? '• مولد كهربائي احتياطي وخزانات مياه متوفرة.\n• للحجز اتصل بالمضيف مباشرة.';
      const notesEn = copyData?.notesEn ?? '• Backup generator and water tanks.\n• Contact host directly for booking.';

      // Full 4-Beat combined descriptions
      const fullDescAr = `${titleAr}\n\nالمسكن:\n${spaceAr}\n\nوصول الضيوف:\n${guestAccessAr}\n\nملاحظات أخرى:\n${notesAr}`;
      const fullDescEn = `${titleEn}\n\nThe space:\n${spaceEn}\n\nGuest access:\n${guestAccessEn}\n\nOther things to note:\n${notesEn}`;

      const finalAmenities = (copyData?.amenities ?? (l.amenities ?? []))
        .map(mapAmenity)
        .filter((a): a is string => Boolean(a));

      const finalHighlights = (copyData?.highlights ?? (l.highlights ?? []))
        .map(mapHighlight)
        .filter((h): h is string => Boolean(h));

      const homePayload = clean({
        account: profile.username,
        hostId: twentyHostId,
        hostName: profile.name,
        hostPhone: phones(profile.phone ?? u.phoneNumber),
        hostWhatsapp: phones(profile.whatsapp ?? u.phoneNumber),
        hostAttribution: 'MEET_YOUR_HOST',

        name: titleAr,
        title: titleAr,
        titleAr: titleAr,
        titleEn: titleEn,
        description: fullDescAr,
        descriptionAr: fullDescAr,
        descriptionEn: fullDescEn,

        spaceAr: spaceAr,
        spaceEn: spaceEn,
        guestAccessAr: guestAccessAr,
        guestAccessEn: guestAccessEn,
        notesAr: notesAr,
        notesEn: notesEn,

        airbnbCategoryAr: categoryAr,
        airbnbCategory: category,

        country: 'SUDAN',
        city: 'PORT_SUDAN',
        zone: zone,
        homeAddress: {
          addressStreet1: l.location?.address ?? 'السكة حديد، بورتسودان',
          addressCity: 'Port Sudan',
          addressState: 'Red Sea',
          addressCountry: 'Sudan',
          addressLat: l.location?.latitude ?? 19.6138,
          addressLng: l.location?.longitude ?? 37.2185,
        },

        bedrooms: copyData?.bedrooms ?? l.bedrooms ?? 1,
        bathrooms: copyData?.bathrooms ?? (l.bathrooms ? Math.round(l.bathrooms) : 1),
        beds: copyData?.bedrooms ? Math.max(copyData.bedrooms, copyData.bedrooms * 2) : 2,
        guestCapacity: copyData?.guestCount ?? l.guestCount ?? 2,

        amenities: finalAmenities.length ? finalAmenities : ['AIR_CONDITIONING', 'WI_FI', 'REFRIGERATOR'],
        highlights: finalHighlights.length ? finalHighlights : undefined,

        priceNightSdg: currency(l.pricePerNight ?? copyData?.estNightlySdg, 'SDG'),
        priceConfirmedByHost: true,

        overallTrustScore: 100,
        homeTrustScore: 100,
        trustBand: 'AUTO_ONBOARD',
        qualificationStatus: 'QUALIFIED',
        qualificationScore: 100,
        publishReady: true,

        photoStage: (l.photoUrls ?? []).length > 0 ? 'ACCEPTABLE' : 'NOT_FOUND',
        photoUrls: linkMany(l.photoUrls ?? []),
        photoCount: (l.photoUrls ?? []).length,
        coverPhotoUrl: linkOne((l.photoUrls ?? [])[0]),

        propertyType: copyData?.propertyType ?? toUpperSnake(l.propertyType ?? 'Apartment'),
        publishState: l.isPublished ? 'LIVE' : 'IMPORTED_BUSY',
        homeStatus: l.isPublished ? 'LIVE' : 'READY_FOR_IMPORT',

        listingId: structuredListingId,
        mkanListingId: l.id,
        listingUrl: linkOne(`https://mkan.sd/listings/${structuredListingId}`, `${structuredListingId}`),
        googleMapsUrl: linkOne(googleMapsUrl, 'Google Maps'),

        source: 'OTHER',
        labels: ['MANUAL', 'HIGH', 'REVIEWED'],
        importedAt: new Date().toISOString(),
      });

      let existingHome = homeByListingId.get(structuredListingId) ?? homeByListingId.get(String(l.id)) ?? homeByName.get(l.title ?? '') ?? homeByName.get(titleAr);
      if (existingHome?.id) {
        console.log(`  = Updating Home [${structuredListingId}] [${profile.name}] "${titleAr.slice(0, 36)}" (Zone: ${zone})`);
        await rest('PATCH', `homes/${existingHome.id}`, homePayload);
        updatedHomes++;
      } else {
        console.log(`  + Creating Home [${structuredListingId}] [${profile.name}] "${titleAr.slice(0, 36)}" (Zone: ${zone})`);
        await rest('POST', 'homes', homePayload);
        createdHomes++;
      }
    }
  }

  console.log(`\n✅ Finished: ${createdHomes} created, ${updatedHomes} updated in Twenty CRM.`);
}

main().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
