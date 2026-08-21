/**
 * Seed the real building of owner السند (Al-Sanad) — مشغل دبي (Mashghal Dubai)
 * in سوق سكة حديد (Railway Market), Port Sudan onto host 0004@mkan.org.
 *
 * Source: owner-supplied layout for مشغل دبي, سوق سكة حديد, Port Sudan:
 *   Owner : السند
 *   Phone : 00249912538883 -> +249912538883 (E.164 for tel: dialing)
 *   Building: مشغل دبي
 *   Zone: سوق سكة حديد (Railway Market / Railway District, Port Sudan)
 *
 *   Units:
 *     1. الشقة الأولى — الطابق الأول: غرفتين (7 سرير) + صالة (طقم جلوس + عربي) + مطبخ جاهز + كولر + شاشة + تكييف + غسالة + مكواة + بلكونة شرقية + حمام مقعدين متكامل + مولد بالاتفاق.
 *     2. الشقة الثانية — الطابق الثاني: غرفتين (7 سرير) + صالة (طقم جلوس + عربي) + مطبخ جاهز + كولر + شاشة + تكييف + غسالة + مكواة + بلكونة شرقية + حمام مقعدين متكامل + مولد بالاتفاق.
 *     3. شقة استوديو: استوديو مفروش ومجهز بالكامل في سوق سكة حديد (غرفة وهول ومطبخ وحمام وتكييف وشاشة).
 *
 * Usage:
 *   set -a && source .env && set +a && npx tsx scripts/seed-sanad-homes.ts
 */
import { config } from 'dotenv';
// Load .env BEFORE anything reads process.env; dynamic import of @/lib/db in main()
config({ override: true });

import bcrypt from 'bcryptjs';
import { PropertyType, CancellationPolicy, Amenity, Highlight, UserRole } from '@prisma/client';

const HOST_EMAIL = '0004@mkan.org';
const HOST_USERNAME = 'السند';
const HOST_PHONE = '+249912538883';
const HOST_PASSWORD_PLAIN = '1234';

const BUILDING = {
  address: 'مشغل دبي، سوق سكة حديد، بورتسودان',
  city: 'Port Sudan',
  state: 'Red Sea',
  country: 'Sudan',
  latitude: 19.6210458,
  longitude: 37.2069813,
  zoneKey: 'railway-district',
} as const;

let prisma: (typeof import('@/lib/db'))['db'];

type SanadUnit = {
  title: string;
  titleEn: string;
  description: string;
  descriptionEn: string;
  bedrooms: number;
  bathrooms: number;
  guestCount: number;
  estNightlySdg: number;
  amenities: Amenity[];
  highlights: Highlight[];
  houseRules?: Record<string, unknown>;
};

const UNITS: SanadUnit[] = [
  // ── الشقة الأولى — الطابق الأول ─────────────────────────────────────────────
  {
    title: 'شقة عائلية مفروشة بغرفتين وبلكونة شرقية ومجلس — مشغل دبي، سوق سكة حديد',
    titleEn: 'Spacious 2BR Furnished Apartment with East Balcony & Majlis — Dubai Workshop',
    description:
      'استمتع بإقامة عائلية مريحة ومتكاملة في قلب بورتسودان، بمبنى مشغل دبي في سوق سكة حديد. شقة فسيحة ومفروشة بالكامل في الطابق الأول، تتميز بتهوية ممتازة وموقع حيوي قريب من كافة الأسواق والخدمات والمواصلات.<br /><br /><b>المسكن</b><br />• غرفتا نوم مجهزتان بـ 7 أسرة مريحة مع مفروشات نظيفة وخزائن ملابس.<br />• صالة استقبال واسعة تجمع بين طقم جلوس كلاسيكي فاخر وطقم عربي أصيل (مجلس) لجلسات عائلية دافئة.<br />• بلكونة شرقية متميزة تنعم بنسمات الصباح والتهوية الطبيعية.<br />• مطبخ متكامل ومجهز بالكامل ببوتاجاز، ثلاجة، كولر مياه باردة، وأواني طهي.<br />• تكييف هواء سبليت عالي الكفاءة، شاشة تلفزيون ذكية، غسالة ملابس، ومكواة مع طاولة كوي.<br />• حمام مقعدين متكامل ونظيف.<br /><br /><b>إمكانية وصول الضيف</b><br />الشقة بالكامل بخصوصية تامة للضيوف، مع مدخل مستقل وسهل الوصول في الطابق الأول.<br /><br /><b>أشياء أخرى يجب ملاحظتها</b><br />• يتوفر مولد كهربائي احتياطي بالاتفاق لضمان استمرارية التيار.<br />• خزانات مياه احتياطية تضمن إمداد المياه على مدار الساعة.<br />• موقع مركزي مميز في سوق سكة حديد بالقرب من المراكز التجارية ووسائل النقل.',
    descriptionEn:
      'Enjoy a comfortable and fully equipped family stay in the heart of Port Sudan, located at the Dubai Workshop building in the Railway Market. A spacious and fully furnished 1st-floor apartment featuring excellent natural ventilation and a prime central location close to markets, transit, and services.<br /><br /><b>The space</b><br />• 2 comfortable bedrooms equipped with 7 beds, clean linens, and wardrobes.<br />• Generous living room combining a luxury sofa set with a traditional Arabic majlis seating area for warm gatherings.<br />• East-facing private balcony offering pleasant morning breezes and natural light.<br />• Fully equipped kitchen with stove, refrigerator, chilled water cooler, and cookware.<br />• High-efficiency split air conditioning, smart TV, washing machine, and iron with board.<br />• Full bathroom equipped with two toilets and pristine fixtures.<br /><br /><b>Guest access</b><br />Exclusive and private access to the entire apartment, with easy first-floor staircase access.<br /><br /><b>Other things to note</b><br />• Standby power generator available upon agreement for uninterrupted electricity.<br />• Standby backup water tanks ensuring 24/7 water availability.<br />• Prime central location in Railway Market within walking distance of shopping and transport hubs.',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 7,
    estNightlySdg: 60_000,
    amenities: [
      Amenity.AirConditioning,
      Amenity.WasherDryer,
      Amenity.Kitchen,
      Amenity.TV,
      Amenity.Refrigerator,
      Amenity.PatioOrBalcony,
    ],
    highlights: [
      Highlight.AirConditioning,
      Highlight.WasherDryer,
      Highlight.CloseToTransit,
      Highlight.GreatView,
    ],
    houseRules: {
      generator: 'مولد كهربائي بالاتفاق',
      balcony: 'بلكونة شرقية',
      seating: 'طقم جلوس + طقم عربي',
    },
  },
  // ── الشقة الثانية — الطابق الثاني ────────────────────────────────────────────
  {
    title: 'شقة مفروشة راقية بغرفتين وبلكونة شرقية ومجلس — الطابق الثاني، مشغل دبي',
    titleEn: 'Bright 2BR Furnished Apartment with East Balcony & Majlis — 2nd Floor',
    description:
      'شقة أنيقة ومفروشة بالكامل في الطابق الثاني بمبنى مشغل دبي، تمنحك الهدوء والتهوية الرائعة مع إطلالة شرقية مفتوحة في سوق سكة حديد ببورتسودان. مثالية للعائلات والمجموعات الباحثة عن الراحة والخصوصية.<br /><br /><b>المسكن</b><br />• غرفتا نوم واسعتان مجهزتان بـ 7 أسرة مريحة ومفروشات فندقية أنيقة.<br />• صالة معيشة رحبة تضم طقم جلوس عصري ومجلس عربي تقليدي مريح.<br />• بلكونة شرقية بإطلالة مفتوحة وتهوية علوية ممتازة بعيداً عن ضجيج الشارع.<br />• مطبخ مجهز بالكامل بجميع مستلزمات الطهي، كولر مياه، وثلاجة.<br />• تكييف هواء سبليت بارد، شاشة تلفزيون، غسالة ملابس ومكواة.<br />• حمام مقعدين متكامل ونظيف بجميع التجهيزات.<br /><br /><b>إمكانية وصول الضيف</b><br />الشقة بالكامل مخصصة للضيوف للاستمتاع بإقامة مستقلة وهادئة.<br /><br /><b>أشياء أخرى يجب ملاحظتها</b><br />• يتوفر مولد كهربائي احتياطي بالاتفاق.<br />• إمدادات مياه مستمرة عبر خزانات مياه احتياطية.<br />• قريبة جداً من المواقف والأسواق المركزية في بورتسودان.',
    descriptionEn:
      'An elegant, fully furnished apartment on the 2nd floor of Dubai Workshop building, offering peaceful comfort, great ventilation, and open eastern views in the Railway Market, Port Sudan. Ideal for families and travel groups seeking privacy and convenience.<br /><br /><b>The space</b><br />• 2 spacious bedrooms with 7 comfortable beds and fresh linens.<br />• Large living hall featuring a contemporary sofa set and traditional Arabic majlis.<br />• East-facing balcony with open views and refreshing sea-breeze ventilation.<br />• Fully equipped kitchen with complete cookware, chilled water cooler, and refrigerator.<br />• Split-unit air conditioning, TV, washing machine, and iron.<br />• Full bathroom with two toilets and complete amenities.<br /><br /><b>Guest access</b><br />Guests have complete, private access to the whole apartment throughout their stay.<br /><br /><b>Other things to note</b><br />• Backup standby generator available upon agreement.<br />• Continuous water supply backed by dedicated storage tanks.<br />• Steps away from Port Sudan\'s main commercial hubs and transportation.',
    bedrooms: 2,
    bathrooms: 1,
    guestCount: 7,
    estNightlySdg: 60_000,
    amenities: [
      Amenity.AirConditioning,
      Amenity.WasherDryer,
      Amenity.Kitchen,
      Amenity.TV,
      Amenity.Refrigerator,
      Amenity.PatioOrBalcony,
    ],
    highlights: [
      Highlight.AirConditioning,
      Highlight.WasherDryer,
      Highlight.CloseToTransit,
      Highlight.GreatView,
    ],
    houseRules: {
      generator: 'مولد كهربائي بالاتفاق',
      balcony: 'بلكونة شرقية',
      seating: 'طقم جلوس + طقم عربي',
    },
  },
  // ── شقة استوديو ─────────────────────────────────────────────────────────────
  {
    title: 'استوديو عصري مفروش ومجهز بالكامل — مشغل دبي، سوق سكة حديد',
    titleEn: 'Modern Fully Equipped Studio Apartment — Dubai Workshop, Railway Market',
    description:
      'استوديو عملي وأنيق مجهز بالكامل في مبنى مشغل دبي بسوق سكة حديد، بورتسودان. خيار مثالي للأفراد، رجال الأعمال، والثنائيات الباحثين عن إقامة مريحة وهادئة في موقع استراتيجي نابض بالحياة.<br /><br /><b>المسكن</b><br />• غرفة نوم مريحة بفرش نظيف وهول استقبال مريح.<br />• مطبخ مجهز بالأجهزة الأساسية، ثلاجة، وكولر مياه.<br />• تكييف هواء سبليت عالي الجودة وشاشة تلفزيون مسطحة.<br />• حمام خاص متكامل ونظيف.<br /><br /><b>إمكانية وصول الضيف</b><br />الاستوديو بالكامل خاص بالضيف بمدخل آمن وخصوصية تامة.<br /><br /><b>أشياء أخرى يجب ملاحظتها</b><br />• إمداد مياه وكهرباء موثوق، مع خيار المولد الاحتياطي بالاتفاق.<br />• موقع مركزي يتيح الوصول السريع لوسط المدينة ومحطات النقل.',
    descriptionEn:
      'A practical, stylish, and fully equipped studio apartment at the Dubai Workshop building in Railway Market, Port Sudan. Perfect for solo travelers, business professionals, and couples looking for a cozy, peaceful stay in a prime central hub.<br /><br /><b>The space</b><br />• Comfortable bedroom space with fresh linens and a cozy living area.<br />• Equipped kitchenette with essential appliances, refrigerator, and water cooler.<br />• High-quality split air conditioning and flat-screen TV.<br />• Private, sparkling clean full bathroom.<br /><br /><b>Guest access</b><br />Entire studio apartment is exclusively for the guest with full privacy.<br /><br /><b>Other things to note</b><br />• Reliable water and electricity, with generator backup available upon agreement.<br />• Centrally located with fast access to Port Sudan downtown and transit routes.',
    bedrooms: 1,
    bathrooms: 1,
    guestCount: 2,
    estNightlySdg: 30_000,
    amenities: [
      Amenity.AirConditioning,
      Amenity.Kitchen,
      Amenity.TV,
      Amenity.Refrigerator,
    ],
    highlights: [
      Highlight.AirConditioning,
      Highlight.CloseToTransit,
      Highlight.QuietNeighborhood,
    ],
  },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' && !process.env.FORCE_SEED) {
    throw new Error('Refusing to seed production without FORCE_SEED=1');
  }

  prisma = (await import('@/lib/db')).db;

  console.log(`🏢 Al-Sanad (السند) — Dubai Workshop building seed → host ${HOST_EMAIL} (${UNITS.length} units, Port Sudan, SDG)\n`);

  // 1. Upsert host 0004
  const hashedPassword = await bcrypt.hash(HOST_PASSWORD_PLAIN, 10);
  const host = await prisma.user.upsert({
    where: { email: HOST_EMAIL },
    update: {
      username: HOST_USERNAME,
      phoneNumber: HOST_PHONE,
      role: UserRole.MANAGER,
      emailVerified: new Date(),
      password: hashedPassword,
    },
    create: {
      email: HOST_EMAIL,
      username: HOST_USERNAME,
      phoneNumber: HOST_PHONE,
      password: hashedPassword,
      role: UserRole.MANAGER,
      emailVerified: new Date(),
    },
    select: { id: true, email: true, username: true, phoneNumber: true },
  });

  console.log(`👤 Host account ready: ${host.email} (Username: ${host.username}, Phone: ${host.phoneNumber}, Role: MANAGER)`);

  // 2. Delete ONLY host 0004's existing listings (FK-safe)
  const owned = await prisma.listing.findMany({
    where: { hostId: host.id },
    select: { id: true, locationId: true },
  });
  const listingIds = owned.map((l) => l.id);
  const locationIds = owned.map((l) => l.locationId).filter((id): id is number => id != null);

  if (listingIds.length > 0) {
    await prisma.review.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.booking.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.seasonalPricing.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.blockedDate.deleteMany({ where: { listingId: { in: listingIds } } });
    await prisma.application.deleteMany({ where: { propertyId: { in: listingIds } } });
    await prisma.lease.deleteMany({ where: { propertyId: { in: listingIds } } });
    await prisma.listing.deleteMany({ where: { id: { in: listingIds } } });
    if (locationIds.length > 0) {
      await prisma.location.deleteMany({ where: { id: { in: locationIds } } });
    }
    console.log(`🧹 Removed ${listingIds.length} existing listing(s) from ${HOST_EMAIL}`);
  }

  // 3. Create the 3 published units
  let created = 0;
  for (let i = 0; i < UNITS.length; i++) {
    const u = UNITS[i]!;
    const location = await prisma.location.create({
      data: {
        address: BUILDING.address,
        city: BUILDING.city,
        state: BUILDING.state,
        country: BUILDING.country,
        postalCode: String(44401 + i),
        latitude: BUILDING.latitude,
        longitude: BUILDING.longitude,
        zoneKey: BUILDING.zoneKey,
      },
    });

    const listing = await prisma.listing.create({
      data: {
        title: u.title,
        description: u.description,
        pricePerNight: u.estNightlySdg,
        securityDeposit: u.estNightlySdg * 5,
        photoUrls: [], // placeholder fallback
        amenities: u.amenities,
        highlights: u.highlights,
        bedrooms: u.bedrooms,
        bathrooms: u.bathrooms,
        guestCount: u.guestCount,
        propertyType: PropertyType.Apartment,
        postedDate: new Date(),
        draft: false,
        isPublished: true,
        locationId: location.id,
        hostId: host.id,
        cancellationPolicy: CancellationPolicy.Flexible,
        checkInTime: '15:00',
        checkOutTime: '11:00',
        minStay: 1,
        maxStay: 365,
        houseRules: u.houseRules ? (u.houseRules as any) : undefined,
      },
    });

    // 4. Seed ar->en translation into cache for instant bilingual rendering
    await prisma.translation.upsert({
      where: {
        sourceText_sourceLanguage_targetLanguage: {
          sourceText: u.title,
          sourceLanguage: 'ar',
          targetLanguage: 'en',
        },
      },
      update: { translatedText: u.titleEn, provider: 'manual' },
      create: {
        sourceText: u.title,
        sourceLanguage: 'ar',
        targetLanguage: 'en',
        translatedText: u.titleEn,
        provider: 'manual',
      },
    });

    await prisma.translation.upsert({
      where: {
        sourceText_sourceLanguage_targetLanguage: {
          sourceText: u.description,
          sourceLanguage: 'ar',
          targetLanguage: 'en',
        },
      },
      update: { translatedText: u.descriptionEn, provider: 'manual' },
      create: {
        sourceText: u.description,
        sourceLanguage: 'ar',
        targetLanguage: 'en',
        translatedText: u.descriptionEn,
        provider: 'manual',
      },
    });

    created += 1;
    console.log(`  ✅ [Listing #${listing.id}] ${u.title} — ${u.estNightlySdg.toLocaleString()} SDG/night, ${u.bedrooms}🛏 ${u.bathrooms}🛁 (Zone: ${BUILDING.zoneKey})`);
  }

  // Seed address translation
  await prisma.translation.upsert({
    where: {
      sourceText_sourceLanguage_targetLanguage: {
        sourceText: BUILDING.address,
        sourceLanguage: 'ar',
        targetLanguage: 'en',
      },
    },
    update: { translatedText: 'Dubai Workshop, Railway Market, Port Sudan', provider: 'manual' },
    create: {
      sourceText: BUILDING.address,
      sourceLanguage: 'ar',
      targetLanguage: 'en',
      translatedText: 'Dubai Workshop, Railway Market, Port Sudan',
      provider: 'manual',
    },
  });

  console.log(`\n🎉 Done! Host ${HOST_EMAIL} (${host.id}) now owns ${created} published homes in mkan.`);
  console.log(`🔑 Credentials: Username / Email: 0004 or 0004@mkan.org | Password: ${HOST_PASSWORD_PLAIN}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });
