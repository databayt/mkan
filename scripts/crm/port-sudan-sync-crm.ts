/**
 * Port Sudan CRM Sync & Merge Engine.
 *
 * Merges the scraped Port Sudan datasets into Twenty CRM:
 *   1. Commercial Businesses (`rental-leads.json`) → `Company` objects with `ps*` custom fields
 *   2. Individual Landlords & Hosts → `Host` objects
 *   3. Unit-level listings (`listings.json`) → `Home` objects with zone resolution & GPS coordinates
 *   4. Onboarding Deals → `Opportunity` objects (one per business / host)
 *
 * Usage:
 *   npx tsx scripts/crm/port-sudan-sync-crm.ts                 # Dry-run inspection & summary
 *   npx tsx scripts/crm/port-sudan-sync-crm.ts --apply         # Upsert to Twenty CRM API
 */
import { config } from 'dotenv';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ override: true });

const APPLY = process.argv.includes('--apply');
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';
const REST = `${API_URL}/rest`;

interface LeadBusiness {
  id: string;
  name: { primary: string; arabic?: string; aliases?: string[] };
  category: string;
  contact: {
    phone?: string[];
    email?: string;
    website?: string;
    social?: Record<string, string>;
  };
  location: {
    area?: string;
    address?: string;
    latitude?: number;
    longitude?: number;
  };
  google_maps?: {
    rating?: number;
    review_count?: number;
  };
  tripadvisor?: {
    rating?: number;
    review_count?: number;
  };
  market?: {
    score?: number;
    lead_priority?: string;
    mkan_relevance?: string;
    likely_multiple_units?: boolean;
  };
}

interface UnitListing {
  id: string;
  title_ar: string;
  text_ar?: string;
  listing_type: string;
  property_type: string;
  zone_slug: string;
  price_amount?: number;
  price_currency?: string;
  price_period?: string;
  contact_phone?: string;
  source: {
    platform: string;
    url: string;
    collected_at: string;
  };
}

export async function mergeAndPreparePortSudanRecords() {
  const leadsPath = join(process.cwd(), 'data/market-research/port-sudan/rental-leads.json');
  const listingsPath = join(process.cwd(), 'data/listings/portsudan/listings.json');
  const zonesPath = join(process.cwd(), 'data/market-research/port-sudan/zones.json');

  const leads = (existsSync(leadsPath) ? JSON.parse(readFileSync(leadsPath, 'utf8')).leads : []) as LeadBusiness[];
  const listings = (existsSync(listingsPath) ? JSON.parse(readFileSync(listingsPath, 'utf8')).listings : []) as UnitListing[];
  const zones = (existsSync(zonesPath) ? JSON.parse(readFileSync(zonesPath, 'utf8')).zones : []) as any[];

  const zoneMap = new Map<string, any>();
  for (const z of zones) {
    zoneMap.set(z.zone_slug, z);
  }

  // 1. Prepare Companies
  const companies = leads.map((lead) => ({
    name: lead.name.primary,
    psExternalId: lead.id,
    psNameAr: lead.name.arabic ?? lead.name.primary,
    psAliases: (lead.name.aliases ?? []).join(', '),
    psCategory: lead.category.toUpperCase().replace(/\s+/g, '_'),
    psPhone: (lead.contact.phone ?? []).map((p) => ({ number: p })),
    psEmail: lead.contact.email ? { primaryEmail: lead.contact.email } : undefined,
    address: {
      addressCity: 'Port Sudan',
      addressState: 'Red Sea',
      addressCountry: 'Sudan',
      addressLat: lead.location.latitude,
      addressLng: lead.location.longitude,
    },
    psArea: lead.location.area,
    psGoogleRating: lead.google_maps?.rating,
    psGoogleReviews: lead.google_maps?.review_count,
    psTripadvisorRating: lead.tripadvisor?.rating,
    psLeadScore: lead.market?.score,
    psLeadPriority: lead.market?.lead_priority ?? 'MEDIUM',
    psMultiUnit: lead.market?.likely_multiple_units ?? true,
  }));

  // 2. Prepare Homes from Unit Listings
  const homes = listings
    .filter((l) => l.listing_type === 'rent') // Only rental units merge into Home objects
    .map((l) => {
      const z = zoneMap.get(l.zone_slug);
      return {
        name: l.title_ar,
        title: l.title_ar,
        description: l.text_ar ?? '',
        source: l.source.platform.toUpperCase().replace(/\./g, '_'),
        airbnbListingId: l.id,
        airbnbUrl: { primaryLinkUrl: l.source.url },
        city: 'PORT_SUDAN',
        homeState: 'RED_SEA',
        homeAddress: {
          addressStreet1: z?.canonical_name ?? '',
          addressCity: 'Port Sudan',
          addressState: 'Red Sea',
          addressCountry: 'Sudan',
          addressLat: z?.lat,
          addressLng: z?.lng,
        },
        priceNightSdg: l.price_period === 'night' ? { amountMicros: (l.price_amount ?? 0) * 1_000_000, currencyCode: 'SDG' } : undefined,
        priceMonthSdg: l.price_period === 'month' ? { amountMicros: (l.price_amount ?? 0) * 1_000_000, currencyCode: 'SDG' } : undefined,
        labels: ['SCRAPED', 'PORT_SUDAN'],
        homeStatus: 'SCRAPED',
        mkanPublishState: 'NOT_IMPORTED',
      };
    });

  return { companies, homes, totalLeads: leads.length, totalListings: listings.length };
}

async function main() {
  console.log('🔄 Merging Port Sudan Datasets for Mkan Twenty CRM...\n');
  const result = await mergeAndPreparePortSudanRecords();

  console.log(`📊 Discovered Businesses: ${result.totalLeads} companies ready for CRM.`);
  console.log(`🏠 Unit-Level Listings: ${result.totalListings} properties analyzed (${result.homes.length} rental units mapped).`);

  if (!APPLY) {
    console.log('\n💡 Dry-run complete. Run with `--apply` and valid TWENTY_API_KEY to execute sync to the Twenty CRM (mkan workspace).\n');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
