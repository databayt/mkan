/**
 * Port Sudan Master Zones Gazetteer & Matching Engine (45 Zones).
 *
 * Canonical registry of all recognized Port Sudan accommodation and residential
 * zones across 5 administrative sectors (Central, South, East, North Expansion, Coastal Tourism).
 *
 * Derived from data/home/portsudan master directory.
 */

export type PortSudanSector =
  | 'central'
  | 'south'
  | 'east'
  | 'north_expansion'
  | 'coastal_tourism'
  | 'uncertain';

export interface PortSudanZone {
  slug: string;
  canonicalName: string;
  nameAr: string;
  nameEn: string;
  sector: PortSudanSector;
  sectorAr: string;
  sectorEn: string;
  lat: number | null;
  lng: number | null;
  radiusKm: number | null;
  aliases: string[];
  description: string;
  priorityScore: number;
  tier: 'CRITICAL_IMMEDIATE' | 'MEDIUM_EXPANSION' | 'MONITOR_OPPORTUNITY' | 'LOW_PRIORITY';
}

export const PORT_SUDAN_SECTORS: Record<PortSudanSector, { ar: string; en: string }> = {
  central: { ar: "وحدة وسط", en: "Central Locality" },
  south: { ar: "وحدة جنوب", en: "South Locality" },
  east: { ar: "وحدة شرق / البر الشرقي", en: "East Locality" },
  north_expansion: { ar: "المربعات الحديثة", en: "North Expansion" },
  coastal_tourism: { ar: "المحور السياحي", en: "Coastal Tourism" },
  uncertain: { ar: "غير محدد", en: "Unspecified" },
};

export const PORT_SUDAN_ZONES: PortSudanZone[] = [
  {
    slug: "abu-hashish",
    canonicalName: "أبو حشيش",
    nameAr: "أبو حشيش",
    nameEn: "Abu Hashish",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.6416667,
    lng: 37.2305556,
    radiusKm: 0.8,
    aliases: ["Abu Hashish", "أبو حشيش شمال", "ساحل أبو حشيش"],
    description: "North-eastern coastal quarter with proximity to the northern port entrance and coastal inlets.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "airport-district",
    canonicalName: "حي المطار",
    nameAr: "حي المطار",
    nameEn: "Airport District",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.5765167,
    lng: 37.2057813,
    radiusKm: 1.5,
    aliases: ["حي المطار", "Hay Almatar", "Airport Area", "قرب المطار", "منطقة المطار"],
    description: "Southern residential area near Port Sudan International Airport and national transit roads.",
    priorityScore: 11,
    tier: "MONITOR_OPPORTUNITY",
  },
  {
    slug: "al-askala",
    canonicalName: "الأسكلة",
    nameAr: "الأسكلة",
    nameEn: "Al-Askala",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.615,
    lng: 37.228,
    radiusKm: 0.8,
    aliases: ["Askala", "Al Askala", "حي الأسكلة", "منطقة الاسكلة"],
    description: "East coast maritime and port area adjacent to the main harbor basin and passenger docks.",
    priorityScore: 24,
    tier: "MEDIUM_EXPANSION",
  },
  {
    slug: "al-huda",
    canonicalName: "حي الهدى",
    nameAr: "حي الهدى",
    nameEn: "Al-Huda",
    sector: "north_expansion",
    sectorAr: "المربعات الحديثة",
    sectorEn: "North Expansion",
    lat: 19.648,
    lng: 37.208,
    radiusKm: 0.9,
    aliases: ["الهدى", "Al Huda", "حي الهدى شمال", "مربع الهدى"],
    description: "Northern expansion residential area north of Salalab featuring newer housing subdivisions.",
    priorityScore: 2,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "al-kaylo",
    canonicalName: "منطقة الكيلو",
    nameAr: "منطقة الكيلو",
    nameEn: "Al-Kaylo",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.565,
    lng: 37.19,
    radiusKm: 1.5,
    aliases: ["الكيلو", "كيلو 4", "كيلو 5", "منطقة الكيلو جنوب", "Al Kaylo"],
    description: "Southern industrial, warehouse, and residential fringe along the highway to Suakin.",
    priorityScore: 4,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "al-mirghaniya",
    canonicalName: "الميرغنية",
    nameAr: "الميرغنية",
    nameEn: "Al-Mirghaniya",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.598,
    lng: 37.206,
    radiusKm: 0.7,
    aliases: ["الميرغنية", "Al Mirghaniya", "حي الميرغنية", "Mirghani"],
    description: "Established southern residential quarter situated west of Deim Sawakin and south of Deim Musa.",
    priorityScore: 2,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "al-qadisiya",
    canonicalName: "القادسية",
    nameAr: "القادسية",
    nameEn: "Al-Qadisiya",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.625,
    lng: 37.229,
    radiusKm: 0.7,
    aliases: ["حي القادسية", "Al Qadisiya", "القادسية شرق"],
    description: "Residential district in eastern Port Sudan between Deim Al-Noor and the eastern shore.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "al-riyadh",
    canonicalName: "الرياض",
    nameAr: "الرياض",
    nameEn: "Al-Riyadh",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.58,
    lng: 37.208,
    radiusKm: 0.7,
    aliases: ["حي الرياض", "الرياض بورتسودان", "Al Riyadh Port Sudan"],
    description: "Planned southern residential district with newer private homes and apartment constructions.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "al-sadaqa",
    canonicalName: "الصداقة",
    nameAr: "الصداقة",
    nameEn: "Al-Sadaqa",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.575,
    lng: 37.212,
    radiusKm: 0.7,
    aliases: ["حي الصداقة", "Al Sadaqa"],
    description: "Quiet southern residential neighborhood near the airport axis.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "al-thawra",
    canonicalName: "حي الثورة",
    nameAr: "حي الثورة",
    nameEn: "Al-Thawra / Al-Thawrat",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.638,
    lng: 37.224,
    radiusKm: 0.9,
    aliases: ["الثورة", "Al Thawra", "الثورات", "حي الثورات"],
    description: "Eastern residential quarter north of Deim Al-Noor with multi-block residential sectors.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "arous",
    canonicalName: "عروس",
    nameAr: "عروس",
    nameEn: "Arous",
    sector: "coastal_tourism",
    sectorAr: "المحور السياحي",
    sectorEn: "Coastal Tourism",
    lat: 20.0024,
    lng: 37.1871,
    radiusKm: 25.0,
    aliases: ["منتجع عروس", "شاطئ عروس", "Arous", "Arous Resort", "Iman Village", "مخيم عروس", "قرية عروس"],
    description: "World-renowned coastal tourism and diving corridor located ~45 km north of Port Sudan city center along pristine Red Sea reefs.",
    priorityScore: 4,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "bashir-city",
    canonicalName: "مدينة البشير السكنية",
    nameAr: "مدينة البشير السكنية",
    nameEn: "Bashir Residential City",
    sector: "north_expansion",
    sectorAr: "المربعات الحديثة",
    sectorEn: "North Expansion",
    lat: 19.655,
    lng: 37.195,
    radiusKm: 1.0,
    aliases: ["مدينة البشير", "Bashir City", "مربع البشير"],
    description: "Modern planned residential community in north-western expansion zone.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "city-centre",
    canonicalName: "وسط المدينة",
    nameAr: "وسط المدينة",
    nameEn: "City Centre",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.6213889,
    lng: 37.2102778,
    radiusKm: 1.2,
    aliases: ["وسط المدينة", "Town Centre", "Downtown", "وسط بورتسودان", "Central Port Sudan", "السوق الكبير", "وسط السوق", "قلب بورتسودان"],
    description: "Commercial and administrative epicentre of Port Sudan hosting the grand marketplace (السوق الكبير), corporate offices, banks, and major transport stops.",
    priorityScore: 28,
    tier: "MEDIUM_EXPANSION",
  },
  {
    slug: "dabaiwa",
    canonicalName: "دبايوا",
    nameAr: "دبايوا",
    nameEn: "Dabaiwa",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.624,
    lng: 37.202,
    radiusKm: 0.7,
    aliases: ["دبايوا", "حي دبايوا", "Dabaywa", "نادي دبايوا", "أبدوت مول", "Abdot Mall"],
    description: "Central residential neighborhood situated directly west of downtown, hosting prominent commercial landmarks and active rental apartments.",
    priorityScore: 10,
    tier: "MONITOR_OPPORTUNITY",
  },
  {
    slug: "dar-al-naeem",
    canonicalName: "دار النعيم",
    nameAr: "دار النعيم",
    nameEn: "Dar Al-Naeem",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.585,
    lng: 37.202,
    radiusKm: 0.7,
    aliases: ["دار النعيم", "حي دار النعيم", "Dar Al Naeem"],
    description: "Southern residential quarter with detached family homes and residential compounds.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "dar-al-salam",
    canonicalName: "دار السلام",
    nameAr: "دار السلام",
    nameEn: "Dar Al-Salam",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.582,
    lng: 37.198,
    radiusKm: 0.7,
    aliases: ["دار السلام", "حي دار السلام جنوب", "Dar Al Salam"],
    description: "South-western residential neighborhood bordering the outer ring.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "deim-al-noor",
    canonicalName: "ديم النور",
    nameAr: "ديم النور",
    nameEn: "Deim Al-Noor",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.628,
    lng: 37.226,
    radiusKm: 0.8,
    aliases: ["ديم النور", "Deim El Noor", "ديم النور شرق", "Deim Al Noor"],
    description: "Historical eastern quarter nestled between the passenger harbour and the eastern shore.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "deim-al-tijani",
    canonicalName: "ديم التيجاني",
    nameAr: "ديم التيجاني",
    nameEn: "Deim Al-Tijani",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.631,
    lng: 37.228,
    radiusKm: 0.6,
    aliases: ["ديم التيجاني", "ديم تيجاني", "Deim Tijani"],
    description: "Compact eastern residential enclave adjacent to Deim Al-Noor.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "deim-arab",
    canonicalName: "ديم عرب",
    nameAr: "ديم عرب",
    nameEn: "Deim Arab",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.6141667,
    lng: 37.2005556,
    radiusKm: 0.8,
    aliases: ["ديم عرب", "Deim Arab", "Soog Deim Arab", "سوق ديم عرب", "أم درمان البجا"],
    description: "One of Port Sudan’s oldest, most vibrant cultural and commercial quarters with bustling street markets.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "deim-jaber",
    canonicalName: "ديم جابر",
    nameAr: "ديم جابر",
    nameEn: "Deim Jaber",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.608,
    lng: 37.204,
    radiusKm: 0.7,
    aliases: ["ديم جابر", "Deim Jaber", "Deim Gaber"],
    description: "Central-south residential deim with dense urban housing and neighborhood commercial shops.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "deim-madina",
    canonicalName: "ديم المدينة",
    nameAr: "ديم المدينة",
    nameEn: "Deim Al-Madina",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.6166255,
    lng: 37.2066764,
    radiusKm: 0.8,
    aliases: ["ديم المدينة", "ديم مدينة", "Deim Madina", "ديم مدينه غرب", "Deim West", "منطقة الاستاد"],
    description: "Historical residential quarter wrapping around the main city stadium and central sporting complex.",
    priorityScore: 9,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "deim-musa",
    canonicalName: "ديم موسى",
    nameAr: "ديم موسى",
    nameEn: "Deim Musa",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.605,
    lng: 37.2113889,
    radiusKm: 0.8,
    aliases: ["ديم موسى", "Deim Musa", "الديوم الجنوبية"],
    description: "Prominent southern residential district located between downtown and Deim Sawakin.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "deim-sawakin",
    canonicalName: "ديم سواكن",
    nameAr: "ديم سواكن",
    nameEn: "Deim Sawakin",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.601,
    lng: 37.212,
    radiusKm: 0.8,
    aliases: ["ديم سواكن", "Deim Sawakin", "Deim Suakin", "ديم سواكن جنوب"],
    description: "Historical quarter named after the historic coastal port of Suakin, featuring guest suites and family housing.",
    priorityScore: 2,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "deim-sijn",
    canonicalName: "ديم سجن",
    nameAr: "ديم سجن",
    nameEn: "Deim Sijn",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.6175,
    lng: 37.209,
    radiusKm: 0.5,
    aliases: ["ديم سجن", "ديم السجن", "Deim Sijn", "Deim Prison"],
    description: "Small central residential enclave situated between Deim Al-Madina and the railway corridor.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "digna",
    canonicalName: "حي دقنة",
    nameAr: "حي دقنة",
    nameEn: "Digna District",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.6089,
    lng: 37.2213,
    radiusKm: 0.9,
    aliases: ["دقنة", "حي دقنة", "Digna", "Daqna", "Degna", "منطقة الميناء والكورنيش", "كورنيش دقنة", "شارع الاذاعة والتلفزيون", "مستشفى دقنة"],
    description: "Prime seafront and port corridor along the corniche. Encompasses Prince Osman Digna Passenger Port, Osman Digna Hospital, and premier waterfront hotel and apartment operations.",
    priorityScore: 62,
    tier: "CRITICAL_IMMEDIATE",
  },
  {
    slug: "flamingo",
    canonicalName: "فلمنغو",
    nameAr: "فلمنغو",
    nameEn: "Flamingo",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.6876,
    lng: 37.2401,
    radiusKm: 1.6,
    aliases: ["فلمنغو", "Falamingu", "Flamingo", "Flamingo Bay", "ميناء فلمنغو", "خور فلمنغو"],
    description: "Far northern coastal and naval port harbor located ~8 km north of the city center.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "hadal",
    canonicalName: "هدل",
    nameAr: "هدل",
    nameEn: "Hadal",
    sector: "north_expansion",
    sectorAr: "المربعات الحديثة",
    sectorEn: "North Expansion",
    lat: 19.6437057,
    lng: 37.2182555,
    radiusKm: 1.0,
    aliases: ["هدل", "سوق هدل", "Hadal", "حي الخليج", "شقق الخليج", "حي هدل"],
    description: "Booming north-eastern expansion corridor hosting commercial market blocks and modern furnished apartment rentals.",
    priorityScore: 9,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "hayy-al-aghareeq",
    canonicalName: "حي الأغاريق",
    nameAr: "حي الأغاريق",
    nameEn: "Greek Quarter",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.6185,
    lng: 37.212,
    radiusKm: 0.6,
    aliases: [
      "حي الأغاريق",
      "الأغاريق",
      "حي الإغريق",
      "الإغريق",
      "حي الاغريق",
      "الاغريق",
      "الاغاريق",
      "Greek District",
      "Greek Quarter",
      "حي اليونانيين",
      "Aghareeq",
    ],
    description: "Historical cosmopolitan quarter established in the early 20th century by Greek maritime merchants.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "hayy-al-azama",
    canonicalName: "حي العظمة",
    nameAr: "حي العظمة",
    nameEn: "Hayy Al-Azama",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.62,
    lng: 37.2085,
    radiusKm: 0.6,
    aliases: ["حي العظمة", "العظمة", "Al-Azama District", "Al Azama"],
    description: "Prime central residential neighborhood located immediately adjacent to the downtown market.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "hayy-al-jamia",
    canonicalName: "حي الجامعة",
    nameAr: "حي الجامعة",
    nameEn: "University District",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.626,
    lng: 37.2115,
    radiusKm: 0.7,
    aliases: ["حي الجامعة", "خور كلاب", "Khor Kilab", "حي جامعة البحر الأحمر", "Red Sea University Area", "منطقة الجامعة"],
    description: "Academic and residential hub surrounding the Red Sea University main campus and teaching facilities.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "hayy-al-shati",
    canonicalName: "حي الشاطئ",
    nameAr: "حي الشاطئ",
    nameEn: "Al-Shati / Beach District",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.588,
    lng: 37.218,
    radiusKm: 0.8,
    aliases: ["حي الشاطئ", "الشاطئ", "Beach Quarter", "كورنيش الشاطئ", "Al Shati", "Coral Coast"],
    description: "South-eastern coastal quarter along the southern corniche featuring open public beaches and beachfront villas.",
    priorityScore: 9,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "kurya",
    canonicalName: "كوريا",
    nameAr: "كوريا",
    nameEn: "Kurya",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.5958333,
    lng: 37.1991667,
    radiusKm: 0.9,
    aliases: ["كوريا", "ديم كوريا", "Deim Kurya", "Kurya"],
    description: "Southern residential quarter with detached family homes, private compounds, and expanding rental apartments.",
    priorityScore: 2,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "malaha",
    canonicalName: "الملاحة",
    nameAr: "الملاحة",
    nameEn: "Al Malaha",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.6101861,
    lng: 37.2150728,
    radiusKm: 0.8,
    aliases: ["الملاحة", "Al Malaha", "Al Malaga", "Al Malaja", "الملجة", "سوق الملاحة", "حي الملاحة"],
    description: "High-density commercial marketplace quarter and residential district bridging downtown and the southern deims.",
    priorityScore: 36,
    tier: "MEDIUM_EXPANSION",
  },
  {
    slug: "philip",
    canonicalName: "فلب",
    nameAr: "فلب",
    nameEn: "Philip",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.573,
    lng: 37.2,
    radiusKm: 0.7,
    aliases: ["فلب", "حي فيليب", "حي فلب", "Philip"],
    description: "Southern residential quarter featuring villa developments and residential compounds.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "popular-market",
    canonicalName: "السوق الشعبي",
    nameAr: "السوق الشعبي",
    nameEn: "Popular Market",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.6270857,
    lng: 37.1995833,
    radiusKm: 0.6,
    aliases: ["السوق الشعبي", "Souq Al Shaabi", "السوق الشعبي بورتسودان", "الموقف العام", "Popular Market"],
    description: "High-traffic commercial, wholesale, and intercity bus transport nexus in western Port Sudan.",
    priorityScore: 7,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "railway-district",
    canonicalName: "السكة حديد",
    nameAr: "السكة حديد",
    nameEn: "Railway District",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.6210458,
    lng: 37.2069813,
    radiusKm: 0.6,
    aliases: ["السكة حديد", "حي السكة حديد", "محطة السكة حديد", "ورش السكة حديد", "Railway District", "سكة حديد", "سوق سكة حديد"],
    description: "Historical quarter centered on the Sudan Railways terminal, locomotive workshops, and administrative offices.",
    priorityScore: 10,
    tier: "MONITOR_OPPORTUNITY",
  },
  {
    slug: "salalab",
    canonicalName: "سلالاب",
    nameAr: "سلالاب",
    nameEn: "Salalab",
    sector: "north_expansion",
    sectorAr: "المربعات الحديثة",
    sectorEn: "North Expansion",
    lat: 19.6350442,
    lng: 37.1900278,
    radiusKm: 1.4,
    aliases: ["سلالاب", "ديم سلاب", "Deim Salalab", "سلالاب شرق", "سلالاب غرب", "سلالاب مربع 1", "سلالاب مربع 3", "الواحة", "Salalab"],
    description: "Expansive north-western residential quarter with active multi-story construction, family residences, and mid-term furnished flats.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "salbona",
    canonicalName: "سلبونا",
    nameAr: "سلبونا",
    nameEn: "Salbona",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.636,
    lng: 37.23,
    radiusKm: 0.8,
    aliases: ["سلبونا", "السقالة", "سوق السمك السقالة", "Salbona Port", "Salbona", "حي سلبونا"],
    description: "Iconic eastern coastal quarter hosting Port Sudan’s celebrated fish market (سوق السمك / السقالة) and coastal maritime dining.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "souq-libya",
    canonicalName: "سوق ليبيا",
    nameAr: "سوق ليبيا",
    nameEn: "Libya Market",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.5789292,
    lng: 37.1934267,
    radiusKm: 0.8,
    aliases: ["سوق ليبيا", "Souq Libya", "سوق ليبيا جنوب", "Libya Market"],
    description: "Southern commercial marketplace near the highway access route connecting toward Suakin and national transit.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "taqaddum",
    canonicalName: "حي التقدم",
    nameAr: "حي التقدم",
    nameEn: "Al-Taqaddum",
    sector: "central",
    sectorAr: "وحدة وسط",
    sectorEn: "Central Locality",
    lat: 19.618,
    lng: 37.205,
    radiusKm: 0.6,
    aliases: ["حي التقدم", "التقدم", "Hayy Al Taqaddum", "Taqaddum"],
    description: "Dense residential neighborhood located in the central core between Deim Al-Madina and the main market.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "tarab-hadal",
    canonicalName: "حي طراب حدال",
    nameAr: "حي طراب حدال",
    nameEn: "Hayy Tarab Hadal",
    sector: "north_expansion",
    sectorAr: "المربعات الحديثة",
    sectorEn: "North Expansion",
    lat: 19.6583333,
    lng: 37.2072222,
    radiusKm: 1.1,
    aliases: ["حي طراب حدال", "طراب حدال", "Tarab Hadal", "ترب هول"],
    description: "Northern residential quarter situated north of Salalab and west of Hadal.",
    priorityScore: 7,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "town-station",
    canonicalName: "محطة المدينة",
    nameAr: "محطة المدينة",
    nameEn: "Town Station",
    sector: "east",
    sectorAr: "وحدة شرق / البر الشرقي",
    sectorEn: "East Locality",
    lat: 19.6333333,
    lng: 37.2333333,
    radiusKm: 0.9,
    aliases: ["محطة المدينة", "Town Station", "Mahattat Al-Madina"],
    description: "North-eastern maritime transit and passenger station quarter beside the harbour approaches.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "transit",
    canonicalName: "ترانزيت",
    nameAr: "ترانزيت",
    nameEn: "Transit District",
    sector: "south",
    sectorAr: "وحدة جنوب",
    sectorEn: "South Locality",
    lat: 19.598,
    lng: 37.214,
    radiusKm: 0.8,
    aliases: ["ترانزيت", "حي ترانزيت", "منطقة الترانزيت", "Transit Quarter", "Transit"],
    description: "Southern district near the port access roads; highly prominent in real estate classifieds for international NGO staff and furnished rentals.",
    priorityScore: 12,
    tier: "MONITOR_OPPORTUNITY",
  },
  {
    slug: "umm-al-qura",
    canonicalName: "أم القرى",
    nameAr: "أم القرى",
    nameEn: "Umm Al-Qura",
    sector: "north_expansion",
    sectorAr: "المربعات الحديثة",
    sectorEn: "North Expansion",
    lat: 19.6693681,
    lng: 37.1892649,
    radiusKm: 1.3,
    aliases: ["أم القرى", "Umm Al Qura", "أم القرى شمال"],
    description: "Northern residential suburb representing newer residential sprawl along the northern exit.",
    priorityScore: 0,
    tier: "LOW_PRIORITY",
  },
  {
    slug: "unknown",
    canonicalName: "غير محدد / عام",
    nameAr: "غير محدد / عام",
    nameEn: "Unassigned / Generic",
    sector: "uncertain",
    sectorAr: "غير محدد",
    sectorEn: "Unspecified",
    lat: null,
    lng: null,
    radiusKm: null,
    aliases: ["unknown", "other", "unassigned", "بورتسودان عام", "عام"],
    description: "Catch-all bucket for city-wide leads or listings with missing or placeholder coordinates.",
    priorityScore: 10,
    tier: "MONITOR_OPPORTUNITY",
  },
];

export const PORT_SUDAN_ZONE_BY_SLUG = new Map<string, PortSudanZone>(
  PORT_SUDAN_ZONES.map((z) => [z.slug, z])
);

const R_EARTH_KM = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

function foldArabic(s: string): string {
  return s
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, '');
}

/** Check if coordinates fall within greater Port Sudan coastal bounding territory */
export function isPortSudanCoords(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  // Port Sudan coastal bounding box: 19.3°N to 20.3°N, 36.8°E to 37.6°E
  return lat >= 19.3 && lat <= 20.3 && lng >= 36.8 && lng <= 37.6;
}

/** Lookup a zone by its slug */
export function getPortSudanZone(slug: string | null | undefined): PortSudanZone | undefined {
  if (!slug) return undefined;
  return PORT_SUDAN_ZONE_BY_SLUG.get(slug.toLowerCase().trim());
}

/** Get localized display label for a Port Sudan zone */
export function getPortSudanZoneLabel(slug: string | null | undefined, locale: string): string | null {
  const zone = getPortSudanZone(slug);
  if (!zone) return null;
  return locale === "ar" ? zone.nameAr : zone.nameEn;
}

/** Match coordinates against Port Sudan zones (nearest centroid within radius) */
export function classifyPortSudanPoint(lat: number, lng: number): PortSudanZone | null {
  if (!isPortSudanCoords(lat, lng)) return null;

  let bestZone: PortSudanZone | null = null;
  let bestDist = Infinity;

  for (const z of PORT_SUDAN_ZONES) {
    if (z.lat == null || z.lng == null || z.slug === "unknown") continue;
    const dist = haversineKm(lat, lng, z.lat, z.lng);
    const radius = z.radiusKm ?? 1.2;
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      bestZone = z;
    }
  }

  return bestZone;
}

/** Match text (title, address, query) against Port Sudan zone names, slugs, and aliases */
export function matchPortSudanZoneByText(text: string | null | undefined): PortSudanZone | null {
  if (!text) return null;
  const raw = text.toLowerCase().trim();
  if (!raw) return null;
  const folded = foldArabic(raw);

  // Exact slug match
  const directSlug = PORT_SUDAN_ZONE_BY_SLUG.get(raw);
  if (directSlug) return directSlug;

  for (const z of PORT_SUDAN_ZONES) {
    if (z.slug === "unknown") continue;
    const candidates = [
      z.slug,
      z.nameEn.toLowerCase(),
      z.nameAr,
      z.canonicalName,
      ...(z.aliases || []),
    ];

    for (const cand of candidates) {
      if (!cand || cand.length < 2) continue;
      const candLower = cand.toLowerCase();
      if (raw === candLower || raw.includes(candLower)) return z;
      const candFolded = foldArabic(candLower);
      if (candFolded && (folded === candFolded || folded.includes(candFolded))) return z;
    }
  }

  return null;
}

/** Resolve the most accurate Port Sudan zone using both coordinates and text */
export function resolvePortSudanZone(
  lat?: number | null,
  lng?: number | null,
  text?: string | null
): PortSudanZone | null {
  const hasCoords =
    lat != null &&
    lng != null &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    !(lat === 0 && lng === 0);
  const inPSCoords = hasCoords ? isPortSudanCoords(lat, lng) : false;

  const rawText = (text ?? "").toLowerCase();
  const mentionsPortSudan =
    rawText.includes("port sudan") ||
    rawText.includes("portsudan") ||
    rawText.includes("بورتسودان") ||
    rawText.includes("بور سودان") ||
    rawText.includes("red sea") ||
    rawText.includes("البحر الاحمر");

  // If coordinates are definitively outside Port Sudan and text does not mention Port Sudan, skip
  if (hasCoords && !inPSCoords && !mentionsPortSudan) {
    return null;
  }

  // 1. If text explicitly names a zone (and is either in PS coords, mentions PS, or no coords given)
  if (text) {
    const textMatch = matchPortSudanZoneByText(text);
    if (textMatch) {
      if (inPSCoords || mentionsPortSudan || !hasCoords) {
        return textMatch;
      }
    }
  }

  // 2. Classify by coordinates if in Port Sudan
  if (inPSCoords && lat != null && lng != null) {
    const coordMatch = classifyPortSudanPoint(lat, lng);
    if (coordMatch) return coordMatch;
    return PORT_SUDAN_ZONE_BY_SLUG.get("city-centre") ?? null;
  }

  // 3. If text mentions Port Sudan but no specific zone matched
  if (mentionsPortSudan) {
    return PORT_SUDAN_ZONE_BY_SLUG.get("city-centre") ?? null;
  }

  return null;
}

/** Search matching zones for user autocomplete query */
export function searchPortSudanZones(
  query: string,
  locale: string = "ar",
  limit: number = 10
): PortSudanZone[] {
  const trimmed = query.trim();
  if (!trimmed) {
    // Return top priority zones by default
    return PORT_SUDAN_ZONES.filter((z) => z.slug !== "unknown")
      .sort((a, b) => b.priorityScore - a.priorityScore)
      .slice(0, limit);
  }

  const raw = trimmed.toLowerCase();
  const folded = foldArabic(raw);

  const matched: Array<{ zone: PortSudanZone; score: number }> = [];

  for (const z of PORT_SUDAN_ZONES) {
    if (z.slug === "unknown") continue;
    let matchScore = 0;

    const names = [
      { text: z.nameAr, weight: 10 },
      { text: z.nameEn.toLowerCase(), weight: 10 },
      { text: z.slug, weight: 8 },
      { text: z.canonicalName, weight: 9 },
      ...(z.aliases || []).map((a) => ({ text: a, weight: 6 })),
      { text: z.sectorAr, weight: 4 },
      { text: z.sectorEn.toLowerCase(), weight: 4 },
    ];

    for (const { text, weight } of names) {
      if (!text) continue;
      const tLower = text.toLowerCase();
      if (tLower === raw) {
        matchScore = Math.max(matchScore, weight * 2);
      } else if (tLower.startsWith(raw)) {
        matchScore = Math.max(matchScore, weight * 1.5);
      } else if (tLower.includes(raw)) {
        matchScore = Math.max(matchScore, weight);
      }

      const tFolded = foldArabic(tLower);
      if (tFolded && folded) {
        if (tFolded === folded) {
          matchScore = Math.max(matchScore, weight * 2);
        } else if (tFolded.startsWith(folded)) {
          matchScore = Math.max(matchScore, weight * 1.5);
        } else if (tFolded.includes(folded)) {
          matchScore = Math.max(matchScore, weight);
        }
      }
    }

    if (matchScore > 0) {
      matched.push({ zone: z, score: matchScore + z.priorityScore * 0.1 });
    }
  }

  matched.sort((a, b) => b.score - a.score);
  return matched.slice(0, limit).map((m) => m.zone);
}
