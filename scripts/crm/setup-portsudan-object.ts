
import { config } from 'dotenv';
config({ override: true });
import { execSync } from 'child_process';

const API_URL = (process.env.TWENTY_API_URL ?? 'http://localhost:3100').replace(/\/+$/, '');
const API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8' }).trim();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function gql(query: string, variables?: any) {
  await sleep(300);
  const res = await fetch(`${API_URL}/metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (json.errors) console.warn('GQL Error:', JSON.stringify(json.errors));
  return json;
}

const PORT_SUDAN_ZONE_OPTIONS = [
  'ABU_HASHISH', 'AIRPORT_DISTRICT', 'AL_ASKALA', 'AL_HUDA', 'AL_KAYLO', 'AL_MIRGHANIYA',
  'AL_QADISIYA', 'AL_RIYADH', 'AL_SADAQA', 'AL_THAWRA', 'AROUS', 'BASHIR_CITY',
  'CITY_CENTRE', 'DABAIWA', 'DAR_AL_NAEEM', 'DAR_AL_SALAM', 'DEIM_AL_NOOR', 'DEIM_AL_TIJANI',
  'DEIM_ARAB', 'DEIM_JABER', 'DEIM_MADINA', 'DEIM_MUSA', 'DEIM_SAWAKIN', 'DEIM_SIJN',
  'DIGNA', 'FLAMINGO', 'HADAL', 'HAYY_AL_AGHAREEQ', 'HAYY_AL_AZAMA', 'HAYY_AL_JAMIA',
  'HAYY_AL_SHATI', 'KURYA', 'MALAHA', 'PHILIP', 'POPULAR_MARKET', 'RAILWAY_DISTRICT',
  'SALALAB', 'SALBONA', 'SOUQ_LIBYA', 'TAQADDUM', 'TARAB_HADAL', 'TOWN_STATION',
  'TRANSIT', 'UMM_AL_QURA', 'UNKNOWN',
];

const MKAN_AMENITIES = [
  'WASHER_DRYER', 'AIR_CONDITIONING', 'DISHWASHER', 'HIGH_SPEED_INTERNET', 'HARDWOOD_FLOORS',
  'WALK_IN_CLOSETS', 'MICROWAVE', 'REFRIGERATOR', 'POOL', 'GYM', 'PARKING', 'PETS_ALLOWED',
  'WI_FI', 'KITCHEN', 'TV', 'DEDICATED_WORKSPACE', 'ELEVATOR', 'PATIO_OR_BALCONY',
  'BACKYARD', 'HOT_TUB', 'BATHTUB', 'BBQ_GRILL', 'OUTDOOR_DINING', 'OUTDOOR_SHOWER',
  'FIRE_PIT', 'INDOOR_FIREPLACE', 'POOL_TABLE', 'PIANO', 'BEACH_ACCESS', 'LAKE_ACCESS',
  'EVCHARGER', 'CRIB', 'BREAKFAST', 'HAIR_DRYER', 'LUGGAGE_DROPOFF', 'BEDROOM_LOCK',
  'SMOKE_ALARM', 'CARBON_MONOXIDE_ALARM', 'FIRE_EXTINGUISHER', 'FIRST_AID_KIT', 'SECURITY_CAMERAS',
];

const MKAN_HIGHLIGHTS = [
  'HIGH_SPEED_INTERNET_ACCESS', 'WASHER_DRYER', 'AIR_CONDITIONING', 'HEATING', 'SMOKE_FREE',
  'CABLE_READY', 'SATELLITE_TV', 'DOUBLE_VANITIES', 'TUB_SHOWER', 'INTERCOM',
  'SPRINKLER_SYSTEM', 'RECENTLY_RENOVATED', 'CLOSE_TO_TRANSIT', 'GREAT_VIEW', 'QUIET_NEIGHBORHOOD',
];

async function main() {
  console.log('--- Setting up Port Sudan Object Fields ---');

  const objRes = await gql('query { objects(paging: { first: 50 }) { edges { node { id nameSingular fieldsList { id name } } } } }');
  const portSudanObj = objRes.data.objects.edges.find((e: any) => e.node.nameSingular === 'portSudan')?.node;
  if (!portSudanObj) {
    console.error('portSudan object not found!');
    return;
  }
  console.log('Found portSudan object:', portSudanObj.id);

  const existingFieldNames = new Set(portSudanObj.fieldsList.map((f: any) => f.name));

  const fieldsToAdd = [
    { name: 'account', label: 'Account', type: 'TEXT', icon: 'IconKey' },
    { name: 'listingId', label: 'Listing ID', type: 'TEXT', icon: 'IconHash' },
    { name: 'hostName', label: 'Host name', type: 'TEXT', icon: 'IconUser' },
    { name: 'hostPhone', label: 'Phone', type: 'PHONES', icon: 'IconPhone' },
    { name: 'hostWhatsapp', label: 'WhatsApp', type: 'PHONES', icon: 'IconBrandWhatsapp' },
    { name: 'titleAr', label: 'Title (AR)', type: 'TEXT' },
    { name: 'titleEn', label: 'Title (EN)', type: 'TEXT' },
    { name: 'descriptionAr', label: 'Description (AR)', type: 'TEXT' },
    { name: 'descriptionEn', label: 'Description (EN)', type: 'TEXT' },
    { name: 'spaceAr', label: 'Space (AR)', type: 'TEXT' },
    { name: 'spaceEn', label: 'Space (EN)', type: 'TEXT' },
    { name: 'guestAccessAr', label: 'Guest Access (AR)', type: 'TEXT' },
    { name: 'guestAccessEn', label: 'Guest Access (EN)', type: 'TEXT' },
    { name: 'notesAr', label: 'Notes (AR)', type: 'TEXT' },
    { name: 'notesEn', label: 'Notes (EN)', type: 'TEXT' },
    { name: 'airbnbCategoryAr', label: 'Category (AR)', type: 'TEXT' },
    { name: 'zone', label: 'Zone', type: 'SELECT', options: PORT_SUDAN_ZONE_OPTIONS.map((v, i) => ({ value: v, label: v === 'RAILWAY_DISTRICT' ? 'Ska Hadded' : v, position: i, color: 'blue' })) },
    { name: 'googleMapsUrl', label: 'Google Maps', type: 'LINKS', icon: 'IconMapPin' },
    { name: 'listingUrl', label: 'Listing URL', type: 'LINKS', icon: 'IconLink' },
    { name: 'bedrooms', label: 'Bedrooms', type: 'NUMBER' },
    { name: 'bathrooms', label: 'Bathrooms', type: 'NUMBER' },
    { name: 'beds', label: 'Beds', type: 'NUMBER' },
    { name: 'guestCapacity', label: 'Guest capacity', type: 'NUMBER' },
    { name: 'priceNightSdg', label: 'Price / night (SDG)', type: 'CURRENCY' },
    { name: 'amenities', label: 'Amenities', type: 'MULTI_SELECT', options: MKAN_AMENITIES.map((v, i) => ({ value: v, label: v, position: i, color: 'green' })) },
    { name: 'highlights', label: 'Highlights', type: 'MULTI_SELECT', options: MKAN_HIGHLIGHTS.map((v, i) => ({ value: v, label: v, position: i, color: 'sky' })) },
    { name: 'propertyType', label: 'Type', type: 'SELECT', options: ['APARTMENT', 'VILLA', 'TOWNHOUSE', 'COTTAGE', 'TINYHOUSE', 'ROOMS'].map((v, i) => ({ value: v, label: v, position: i, color: 'orange' })) },
    { name: 'publishState', label: 'Status', type: 'SELECT', options: ['DRAFT', 'IMPORTED_BUSY', 'LIVE', 'DELISTED'].map((v, i) => ({ value: v, label: v, position: i, color: 'emerald' })) },
    { name: 'overallTrustScore', label: 'Score', type: 'NUMBER' },
  ];

  for (const f of fieldsToAdd) {
    if (existingFieldNames.has(f.name)) {
      console.log(`  = Field ${f.name} already exists`);
      continue;
    }
    console.log(`  + Adding field ${f.name} (${f.type})`);
    await gql(`
      mutation CreateField($input: CreateOneFieldMetadataInput!) {
        createOneField(input: $input) { id name }
      }
    `, {
      input: {
        field: {
          objectMetadataId: portSudanObj.id,
          name: f.name,
          label: f.label,
          type: f.type,
          icon: f.icon,
          options: (f as any).options,
        }
      }
    });
  }

  console.log('--- Port Sudan Object Ready ---');
}

main().catch(console.error);
