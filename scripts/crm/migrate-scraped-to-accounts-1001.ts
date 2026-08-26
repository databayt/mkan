
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';
import { PrismaClient, PropertyType, Amenity, Highlight } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();
const REST = `${API_URL}/rest`;



const VALID_CRM_AMENITIES = new Set([
  'WASHER_DRYER', 'AIR_CONDITIONING', 'DISHWASHER', 'HIGH_SPEED_INTERNET', 'HARDWOOD_FLOORS',
  'WALK_IN_CLOSETS', 'MICROWAVE', 'REFRIGERATOR', 'POOL', 'GYM', 'PARKING', 'PETS_ALLOWED',
  'WI_FI', 'KITCHEN', 'TV', 'DEDICATED_WORKSPACE', 'ELEVATOR', 'PATIO_OR_BALCONY', 'BACKYARD',
  'HOT_TUB', 'BATHTUB', 'BBQ_GRILL', 'OUTDOOR_DINING', 'OUTDOOR_SHOWER', 'FIRE_PIT',
  'INDOOR_FIREPLACE', 'POOL_TABLE', 'PIANO', 'BEACH_ACCESS', 'LAKE_ACCESS', 'EVCHARGER',
  'CRIB', 'BREAKFAST', 'HAIR_DRYER', 'LUGGAGE_DROPOFF', 'BEDROOM_LOCK', 'SMOKE_ALARM',
  'CARBON_MONOXIDE_ALARM', 'FIRE_EXTINGUISHER', 'FIRST_AID_KIT', 'SECURITY_CAMERAS'
]);

const AMENITY_MAP: Record<string, Amenity> = {
  AIR_CONDITIONING: 'AirConditioning',
  WI_FI: 'WiFi',
  KITCHEN: 'Kitchen',
  REFRIGERATOR: 'Refrigerator',
  TV: 'TV',
  PATIO_OR_BALCONY: 'PatioOrBalcony',
  FREE_PARKING: 'Parking',
  WASHER: 'WasherDryer',
  ELEVATOR: 'Elevator',
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function rest(method: 'GET' | 'POST' | 'PATCH', path: string, body?: unknown): Promise<any> {
  await sleep(150);
  const res = await fetch(`${REST}/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`REST ${method} ${path} → ${res.status}: ${JSON.stringify(json).slice(0, 400)}`);
  return json;
}

interface ScrapedHostPlan {
  airbnbListingId: string;
  account: string;
  listingId: string;
  hostName: string;
  hostNameAr: string;
  sourceHostId: string;
  titleEn: string;
  titleAr: string;
  spaceEn: string;
  spaceAr: string;
  guestAccessEn: string;
  guestAccessAr: string;
  notesEn: string;
  notesAr: string;
  bedrooms: number;
  beds: number;
  bathrooms: number;
  guestCapacity: number;
  priceSdg: number;
  propertyType: string;
  airbnbCategoryAr: string;
  zone: string;
  zoneKey: string;
  districtAr: string;
  districtEn: string;
  lat: number;
  lng: number;
  amenities: string[];
  photoUrls: string[];
}

const SCRAPED_PORT_SUDAN_PLANS: ScrapedHostPlan[] = [
  {
    airbnbListingId: '1696436270388915687',
    account: '1001',
    listingId: '1001-01',
    hostName: 'Tahir',
    hostNameAr: 'طاهر',
    sourceHostId: '507978533',
    titleEn: 'Luxury Studio Apartment with Services Hay Almatar',
    titleAr: 'استوديو فاخر متكامل الخدمات — حي المطار',
    spaceEn: 'Modern, fully air-conditioned studio in the prestigious Hay Almatar neighborhood, featuring a comfortable bed, stylish lounge with smart TV, and a fully equipped kitchenette for a peaceful stay.',
    spaceAr: 'استوديو فندقي حديث ومكيف بالكامل في قلب حي المطار الراقي، يضم سريراً مريحاً ومساحة جلوس أنيقة مع شاشة ذكية ومطبخاً مجهزاً بكافة المستلزمات لإقامة هادئة ومريحة.',
    guestAccessEn: 'Full private access to the studio with free on-site parking and modern elevator access.',
    guestAccessAr: 'دخول كامل ومستقل للاستوديو مع موقف سيارات مجاني ومصعد حديث.',
    notesEn: 'High-speed Wi-Fi and 24/7 continuous air conditioning, ideal for business travelers and visitors.',
    notesAr: 'خدمة واي فاي سريعة وتكييف ممتاز على مدار الساعة، مثالي لرجال الأعمال والمسافرين.',
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    guestCapacity: 2,
    priceSdg: 85000,
    propertyType: 'APARTMENT',
    airbnbCategoryAr: 'استوديو فاخر',
    zone: 'AIRPORT_DISTRICT',
    zoneKey: 'airport-district',
    districtAr: 'حي المطار',
    districtEn: 'Airport District',
    lat: 19.5765167,
    lng: 37.2057813,
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'REFRIGERATOR', 'TV', 'PARKING', 'WASHER_DRYER', 'ELEVATOR'],
    photoUrls: [
      'https://a0.muscache.com/im/pictures/hosting/Hosting-1696436270388915687/original/1688729784.jpeg',
      'https://a0.muscache.com/im/pictures/hosting/Hosting-1696436270388915687/original/1688729785.jpeg',
      'https://a0.muscache.com/im/pictures/hosting/Hosting-1696436270388915687/original/1688729786.jpeg'
    ]
  },
  {
    airbnbListingId: '1730495124401785705',
    account: '1002',
    listingId: '1002-01',
    hostName: 'Hashim',
    hostNameAr: 'هاشم',
    sourceHostId: '162695069',
    titleEn: 'Smart Boutique Hotel in Port Sudan near Airport',
    titleAr: 'فندق بوتيك عصري — قرب مطار بورتسودان',
    spaceEn: 'Smart boutique suite with premium finishes and hotel-grade amenities near Port Sudan International Airport, offering a dedicated workspace and high-speed Wi-Fi.',
    spaceAr: 'جناح فندقي ذكي بتشطيب راقٍ وخدمات متكاملة بالقرب من مطار بورتسودان الدولي، يوفر بيئة مثالية للراحة بعد السفر مع مساحة عمل مريحة وإنترنت فائق السرعة.',
    guestAccessEn: '24/7 reception desk, private secured parking with exterior security cameras.',
    guestAccessAr: 'استقبال على مدار 24 ساعة، وموقف سيارات خاص ومؤمن بكاميرات مراقبة.',
    notesEn: 'Laundry services, breakfast options, and backup power generator available.',
    notesAr: 'تتوفر خدمات الغسيل والإفطار ومولد كهرباء احتياطي لضمان استمرارية التيار.',
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    guestCapacity: 2,
    priceSdg: 90000,
    propertyType: 'ROOMS',
    airbnbCategoryAr: 'غرفة فندقية بوتيك',
    zone: 'AIRPORT_DISTRICT',
    zoneKey: 'airport-district',
    districtAr: 'حي المطار',
    districtEn: 'Airport District',
    lat: 19.5947,
    lng: 37.2085,
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'TV', 'PARKING', 'WASHER_DRYER', 'GENERATOR'],
    photoUrls: [
      'https://cdn.databayt.org/mkan/uploads/1730495124401785705/eab3db3d-8190-4aca-822b-ce6785d3b2a0.jpg',
      'https://cdn.databayt.org/mkan/uploads/1730495124401785705/4ae30cf8-e9fd-405e-950c-de714be39658.jpg'
    ]
  },
  {
    airbnbListingId: '1359527853314799247',
    account: '1003',
    listingId: '1003-01',
    hostName: 'Moe Gi',
    hostNameAr: 'معتز',
    sourceHostId: '468184872',
    titleEn: 'Stylish Staycation Spot',
    titleAr: 'شقة عصرية راقية ومميزة — بورتسودان',
    spaceEn: 'Elegant modern apartment with designer furnishings in central Port Sudan, featuring 2 spacious bedrooms, a living lounge, and a fully fitted kitchen.',
    spaceAr: 'شقة سكنية أنيقة بتصميم عصري مميز وأثاث فاخر في موقع مركزي بورتسودان، تضم غرفتي نوم وصالة واسعة ومطبخاً متكاملاً لإقامة عائلية متميزة.',
    guestAccessEn: 'Full private access to the entire apartment with dedicated parking.',
    guestAccessAr: 'الشقة بالكامل تحت تصرف الضيوف مع خصوصية تامة وموقف مخصص.',
    notesEn: 'Equipped with brand new split ACs, smart TV, and independent water storage.',
    notesAr: 'مزودة بمكيفات اسبليت جديدة وشاشة ذكية وخزان مياه مستقل.',
    bedrooms: 2,
    beds: 2,
    bathrooms: 2,
    guestCapacity: 3,
    priceSdg: 102000,
    propertyType: 'APARTMENT',
    airbnbCategoryAr: 'شقة عائلية مفروشة',
    zone: 'CITY_CENTRE',
    zoneKey: 'city-centre',
    districtAr: 'وسط المدينة',
    districtEn: 'City Centre',
    lat: 19.639908,
    lng: 37.218192,
    amenities: ['AIR_CONDITIONING', 'KITCHEN', 'REFRIGERATOR', 'TV', 'WASHER_DRYER', 'PARKING', 'WATER_TANK'],
    photoUrls: [
      'https://cdn.databayt.org/mkan/uploads/1359527853314799247/photo1.jpg'
    ]
  },
  {
    airbnbListingId: '1475219497357463082',
    account: '1004',
    listingId: '1004-01',
    hostName: 'Muhamed',
    hostNameAr: 'محمد',
    sourceHostId: '710101408',
    titleEn: 'Mirak Suites',
    titleAr: 'أجنحة ميراك الفندقية — بورتسودان',
    spaceEn: 'Mirak Suites in Al-Mirghaniya offers premium furnished suites with sea/city vistas and daily housekeeping.',
    spaceAr: 'أجنحة ميراك الفندقية في حي الميرغنية تقدم غرفاً وأجنحة مفروشة بأعلى المعايير، مع إطلالات ساحلية وخدمة فندقية يومية.',
    guestAccessEn: 'Full access to the private suite, building reception lobby, and shared courtyard.',
    guestAccessAr: 'دخول كامل للجناح ومرافق المبنى مع بهو استقبال وحديقة خلفية.',
    notesEn: 'Luggage drop-off allowed, backup generator, and continuous water supply.',
    notesAr: 'خدمة حفظ الأمتعة ومولد كهرباء وتشغيل مستمر للمياه والتكييف.',
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    guestCapacity: 3,
    priceSdg: 77000,
    propertyType: 'APARTMENT',
    airbnbCategoryAr: 'جناح فندقي',
    zone: 'AL_MIRGHANIYA',
    zoneKey: 'al-mirghaniya',
    districtAr: 'الميرغنية',
    districtEn: 'Al-Mirghaniya',
    lat: 19.6014,
    lng: 37.20647,
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'KITCHEN', 'TV', 'WASHER_DRYER', 'PARKING', 'GENERATOR'],
    photoUrls: [
      'https://a0.muscache.com/im/pictures/hosting/Hosting-1475219497357463082/original/b840cff6-c872-4ea7-b67f-17ad7d1b28b9.jpeg'
    ]
  },
  {
    airbnbListingId: '1228112964456623221',
    account: '1005',
    listingId: '1005-01',
    hostName: 'Iman',
    hostNameAr: 'إيمان',
    sourceHostId: '520590808',
    titleEn: 'SRSR Iman Village Eco Lodge PS',
    titleAr: 'قرية إيمان البيئية — ريزورت ساحلي بورتسودان',
    spaceEn: 'The premier eco lodge north of Port Sudan (Arous area) between mountains and the Red Sea reefs, offering serene nature and coastal living.',
    spaceAr: 'القرية البيئية الفريدة شمال بورتسودان (منطقة عروس) بين البحر والجبل، شاليهات بيئية بإطلالة ساحرة على الشعاب المرجانية وأجواء طبيعية هادئة.',
    guestAccessEn: 'Direct beach access, outdoor camp grounds, and dining patio.',
    guestAccessAr: 'وصول مباشر للشاطئ ومساحات التخييم والمطعم الخارجي.',
    notesEn: 'Perfect for diving enthusiasts and tranquil seaside getaways.',
    notesAr: 'مثالية لعشاق الغوص والاسترخاء بعيداً عن صخب المدينة.',
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    guestCapacity: 2,
    priceSdg: 68000,
    propertyType: 'ROOMS',
    airbnbCategoryAr: 'شاليه بيئي على الشاطئ',
    zone: 'AROUS',
    zoneKey: 'arous',
    districtAr: 'عروس',
    districtEn: 'Arous',
    lat: 19.9978,
    lng: 37.1924,
    amenities: ['AIR_CONDITIONING', 'KITCHEN', 'TV', 'PARKING', 'WASHER_DRYER'],
    photoUrls: [
      'https://cdn.databayt.org/mkan/uploads/1228112964456623221/photo1.jpg'
    ]
  },
  {
    airbnbListingId: '1205831581863107211',
    account: '1006',
    listingId: '1006-01',
    hostName: 'Mutwakil',
    hostNameAr: 'متوكل',
    sourceHostId: '405142420',
    titleEn: 'Arous Red Sea Eco Resort & Diving Camp',
    titleAr: 'مخيم عروس السياحي للغوص — ساحل البحر الأحمر',
    spaceEn: 'World-famous Arous Red Sea Diving Resort, located 45 km north of Port Sudan on pristine reefs with comfortable sea-view rooms.',
    spaceAr: 'منتجع ومخيم عروس العالمي للغوص، يقع على بعد 45 كم شمال بورتسودان في أحد أجمل مواقع الغوص في العالم مع غرف مريحة ومطعم بحري.',
    guestAccessEn: 'Access to all resort facilities, diving center, and private beach.',
    guestAccessAr: 'وصول لكامل مرافق المنتجع، مركز الغوص، والشاطئ الخاص.',
    notesEn: 'Wi-Fi, air conditioning, and guided diving expeditions available.',
    notesAr: 'يتوفر إنترنت وتكييف ورحلات غوص استكشافية برفقة مدربين محترفين.',
    bedrooms: 1,
    beds: 2,
    bathrooms: 1,
    guestCapacity: 2,
    priceSdg: 34000,
    propertyType: 'ROOMS',
    airbnbCategoryAr: 'مخيم ومنتجع غوص',
    zone: 'AROUS',
    zoneKey: 'arous',
    districtAr: 'عروس',
    districtEn: 'Arous',
    lat: 20.0024,
    lng: 37.1871,
    amenities: ['AIR_CONDITIONING', 'WI_FI', 'PARKING', 'TV'],
    photoUrls: [
      'https://cdn.databayt.org/mkan/uploads/1205831581863107211/photo1.jpg'
    ]
  },
  {
    airbnbListingId: '1379646799119443021',
    account: '1007',
    listingId: '1007-01',
    hostName: 'Mohmmed',
    hostNameAr: 'محمد',
    sourceHostId: '684964458',
    titleEn: 'Shared Accommodation for Men in Port Sudan',
    titleAr: 'سكن رجالي مشترك ومكيف — حي الهدى',
    spaceEn: 'Clean, air-conditioned shared accommodation for men in Hay Al-Huda, with AC rooms, shared lounge, kitchen, and courtyard.',
    spaceAr: 'سكن شبابي ورجالي مشترك نظيف ومكيف في حي الهدى، يضم غرفاً مكيفة وصالة مريحة ومطبخاً مشتركاً وحوشاً واسعاً.',
    guestAccessEn: 'Access to shared living room, kitchen, and outdoor patio.',
    guestAccessAr: 'استخدام مرافق السكن المشتركة والصالة والمطبخ.',
    notesEn: 'Quiet, respectful environment suitable for employees and visitors.',
    notesAr: 'بيئة هادئة ومناسبة للموظفين والزوار مع تكييف ممتاز.',
    bedrooms: 2,
    beds: 5,
    bathrooms: 1,
    guestCapacity: 5,
    priceSdg: 25000,
    propertyType: 'ROOMS',
    airbnbCategoryAr: 'سكن مشترك',
    zone: 'AL_HUDA',
    zoneKey: 'al-huda',
    districtAr: 'حي الهدى',
    districtEn: 'Al-Huda',
    lat: 19.649245,
    lng: 37.201605,
    amenities: ['AIR_CONDITIONING', 'TV', 'KITCHEN', 'WASHER_DRYER'],
    photoUrls: [
      'https://cdn.databayt.org/mkan/uploads/1379646799119443021/photo1.jpg'
    ]
  },
  {
    airbnbListingId: '1392738255867997981',
    account: '1008',
    listingId: '1008-01',
    hostName: 'Osman',
    hostNameAr: 'عثمان',
    sourceHostId: '529232181',
    titleEn: 'Bed in Cozy Room in Janayen / Kurya',
    titleAr: 'سرير في غرفة مريحة وهادئة — حي الجناين / كوريا',
    spaceEn: 'Budget-friendly bed in a cozy room in Janayen / Kurya neighborhood, with air conditioning, equipped kitchen, and quiet surroundings.',
    spaceAr: 'إقامة اقتصادية مريحة في غرفة مشتركة بحي الجناين / كوريا، مع تكييف هواء ومطبخ مجهز وموقع هادئ قريب من الخدمات.',
    guestAccessEn: 'Access to the bedroom, kitchen, and shared bathroom.',
    guestAccessAr: 'استخدام الغرفة المخصصة والمطبخ والحمام المشترك.',
    notesEn: 'Excellent option for short stays and solo travelers.',
    notesAr: 'خيار ممتاز للإقامات القصيرة والمسافرين الفرديين.',
    bedrooms: 1,
    beds: 1,
    bathrooms: 1,
    guestCapacity: 1,
    priceSdg: 25000,
    propertyType: 'ROOMS',
    airbnbCategoryAr: 'سرير في غرفة مشتركة',
    zone: 'KURYA',
    zoneKey: 'kurya',
    districtAr: 'كوريا',
    districtEn: 'Kurya',
    lat: 19.6029,
    lng: 37.1959,
    amenities: ['AIR_CONDITIONING', 'KITCHEN', 'TV', 'PARKING'],
    photoUrls: [
      'https://cdn.databayt.org/mkan/uploads/1392738255867997981/4861849b-0278-4bba-a5ae-98f993d10e4d.jpg'
    ]
  }
];

async function main() {
  console.log('=== MIGRATING 8 SCRAPED AIRBNB LISTINGS TO ACCOUNTS 1001..1008 ===\n');

  // 1. Fetch portSudans from CRM
  const psRes = await rest('GET', 'portSudans?limit=100&depth=0');
  const existingPs = psRes.data?.portSudans ?? psRes.data ?? [];
  const existingByAirbnbId = new Map(existingPs.map((p: any) => [p.listingId, p]));

  // Connect Prisma DB
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  let pos = 27;

  for (const item of SCRAPED_PORT_SUDAN_PLANS) {
    const fullDescAr = `${item.spaceAr}

وصول الضيوف:
${item.guestAccessAr}

ملاحظات أخرى:
${item.notesAr}`;
    const fullDescEn = `${item.spaceEn}

Guest Access:
${item.guestAccessEn}

Other notes:
${item.notesEn}`;

    const crmPayload = {
      account: item.account,
      listingId: item.listingId,
      hostName: item.hostName,
      titleEn: item.titleEn,
      titleAr: item.titleAr,
      spaceEn: item.spaceEn,
      spaceAr: item.spaceAr,
      guestAccessEn: item.guestAccessEn,
      guestAccessAr: item.guestAccessAr,
      notesEn: item.notesEn,
      notesAr: item.notesAr,
      descriptionEn: fullDescEn,
      descriptionAr: fullDescAr,
      bedrooms: item.bedrooms,
      beds: item.beds,
      bathrooms: item.bathrooms,
      guestCapacity: item.guestCapacity,
      priceNightSdg: { amountMicros: item.priceSdg * 1_000_000, currencyCode: 'SDG' },
      propertyType: item.propertyType,
      airbnbCategoryAr: item.airbnbCategoryAr,
      amenities: item.amenities.filter((a: string) => VALID_CRM_AMENITIES.has(a)),
      highlights: ['CLOSE_TO_TRANSIT', 'GREAT_VIEW'],
      overallTrustScore: 65,
      photoStage: 'ACCEPTABLE',
      listingUrl: {
        primaryLinkUrl: `https://www.airbnb.com/rooms/${item.airbnbListingId}`,
        primaryLinkLabel: `Airbnb #${item.airbnbListingId}`
      },
      googleMapsUrl: {
        primaryLinkUrl: `https://www.google.com/maps?q=${item.lat},${item.lng}`,
        primaryLinkLabel: 'Google Maps Pin'
      },
      country: 'SUDAN',
      city: 'PORT_SUDAN',
      zone: item.zone,
      publishState: 'LIVE',
      position: pos++,
    };

    // Find existing CRM record by original airbnb listing id OR item.listingId
    const existing = existingByAirbnbId.get(item.airbnbListingId) || existingByAirbnbId.get(item.listingId);
    if (existing) {
      await rest('PATCH', `portSudans/${existing.id}`, crmPayload);
      console.log(`[CRM UPDATED] Account ${item.account} -> ListingID: ${item.listingId} (${item.titleAr.slice(0, 35)})`);
    } else {
      await rest('POST', 'portSudans', crmPayload);
      console.log(`[CRM CREATED] Account ${item.account} -> ListingID: ${item.listingId} (${item.titleAr.slice(0, 35)})`);
    }

    // 2. Sync to MKAN Postgres DB
    // Find or Upsert Host User by sourceHostId
    let hostUser = await prisma.user.findFirst({
      where: {
        sourceHostId: item.sourceHostId
      }
    });

    if (hostUser) {
      // update email if needed
      try {
        hostUser = await prisma.user.update({
          where: { id: hostUser.id },
          data: {
            email: `${item.account}@mkan.org`,
          }
        });
      } catch (e) {
        // ignore email collision if already set
      }
    } else {
      hostUser = await prisma.user.create({
        data: {
          email: `${item.account}@mkan.org`,
          username: `${item.hostName}-${item.account}`,
          sourceHostId: item.sourceHostId,
          role: 'MANAGER',
        }
      });
    }

    // Create / Update Location
    const location = await prisma.location.create({
      data: {
        city: 'Port Sudan',
        state: 'Red Sea',
        country: 'Sudan',
        postalCode: '33311',
        address: `${item.districtAr}، بورتسودان`,
        latitude: item.lat,
        longitude: item.lng,
        zoneKey: item.zoneKey,
      }
    });

    // Upsert Listing in DB
    const existingDbListing = await prisma.listing.findFirst({
      where: {
        OR: [
          { sourceListingId: item.listingId },
          { sourceListingId: item.airbnbListingId }
        ]
      }
    });

    const listingDbData = {
      sourceListingId: item.listingId,
      source: 'AIRBNB' as any,
      sourceHostId: item.sourceHostId,
      sourceUrl: `https://www.airbnb.com/rooms/${item.airbnbListingId}`,
      canonicalLocale: 'ar',
      title: item.titleAr,
      description: fullDescAr,
      pricePerNight: item.priceSdg,
      bedrooms: item.bedrooms,
      bathrooms: item.bathrooms,
      guestCount: item.guestCapacity,
      propertyType: (item.propertyType === 'ROOMS' ? 'Rooms' : 'Apartment') as PropertyType,
      amenities: item.amenities.map((a: string) => AMENITY_MAP[a]).filter(Boolean) as Amenity[],
      highlights: ['GreatView', 'CloseToTransit'] as Highlight[],
      isPublished: true,
      draft: false,
      claimedAt: null,
      hostId: hostUser.id,
      locationId: location.id,
    };

    if (existingDbListing) {
      await prisma.listing.update({
        where: { id: existingDbListing.id },
        data: listingDbData
      });
      console.log(`  [DB UPDATED] #${existingDbListing.id} -> ListingID: ${item.listingId}`);
    } else {
      const created = await prisma.listing.create({
        data: {
          ...listingDbData,
          photoUrls: item.photoUrls,
        }
      });
      console.log(`  [DB CREATED] #${created.id} -> ListingID: ${item.listingId}`);
    }
  }

  console.log('\n✅ Successfully migrated all 8 scraped Airbnb listings to accounts 1001..1008!');
}

main().catch(console.error);
