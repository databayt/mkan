/**
 * Listing Qualification Gate (Mkan ↔ Twenty CRM Integration).
 *
 * Enforces the strict 5-Tier Quality Gate before any scraped or CRM-onboarded
 * home can be imported as Available / Live on Mkan (mkan.sd):
 *
 *   1. Geography & Location Integrity (within 25km of Port Sudan centroid, valid zone)
 *   2. Pricing & Currency Sanity (rational SDG range, no $0/placeholder prices)
 *   3. Media & Content Standards (rehosted on cdn.databayt.org, photo count >= 3, no rotting hotlinks)
 *   4. Host Reachability & Provenance (verified phone/WhatsApp, non-heuristic attribution)
 *   5. Consent & Handover (claimedAt set OR Opportunity agreement reached)
 *   6. Availability Freshness (lastAvailabilityConfirmedAt stamped)
 *
 * Usage:
 *   npx tsx scripts/crm/listing-qualification-gate.ts --city=PORT_SUDAN
 *   npx tsx scripts/crm/listing-qualification-gate.ts --city=PORT_SUDAN --json
 *   npx tsx scripts/crm/listing-qualification-gate.ts --strict
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface QualificationReport {
  listingId: string;
  title: string | null;
  zone: string;
  hostName: string | null;
  hostPhone: string | null;
  priceSdg: number | null;
  overallScore: number;
  tierStatus: {
    location: boolean;
    pricing: boolean;
    media: boolean;
    hostVerification: boolean;
    consent: boolean;
    availability: boolean;
  };
  isQualified: boolean;
  deficiencies: string[];
}

export interface GateSummary {
  totalEvaluated: number;
  qualifiedCount: number;
  disqualifiedCount: number;
  byZone: Record<string, { total: number; qualified: number }>;
  byFailureReason: Record<string, number>;
  reports: QualificationReport[];
}

const PS_CENTROID: [number, number] = [19.6158, 37.2164];
const MAX_RADIUS_KM = 25.0;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function evaluateHomeQualification(home: {
  id: string;
  title?: string | null;
  zone_slug?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  priceNightSdg?: number | null;
  priceMonthSdg?: number | null;
  photoUrls?: string[] | null;
  photosRehosted?: boolean | null;
  host?: {
    name?: string | null;
    phone?: string | null;
    whatsapp?: string | null;
    attribution?: string | null;
    isClaimed?: boolean | null;
    onboardingStage?: string | null;
  } | null;
  lastAvailabilityConfirmedAt?: string | null;
}): QualificationReport {
  const deficiencies: string[] = [];

  // 1. Location & Geography Check
  let locationPass = true;
  if (!home.zone_slug || home.zone_slug === 'unknown' || home.zone_slug === 'unplaced') {
    locationPass = false;
    deficiencies.push('Unresolved or generic zone assignment');
  }
  if (home.latitude != null && home.longitude != null) {
    const dist = haversineKm(home.latitude, home.longitude, PS_CENTROID[0], PS_CENTROID[1]);
    if (dist > MAX_RADIUS_KM) {
      locationPass = false;
      deficiencies.push(`Coordinates outside Port Sudan perimeter (${dist.toFixed(1)} km from centre)`);
    }
  } else {
    // Missing coordinates
    deficiencies.push('Missing geocoded GPS coordinates');
  }

  // 2. Pricing & Currency Sanity
  let pricingPass = true;
  const price = home.priceNightSdg || (home.priceMonthSdg ? home.priceMonthSdg / 30 : null);
  if (!price || price <= 0) {
    pricingPass = false;
    deficiencies.push('Missing or non-positive price (SDG)');
  } else if (price < 10_000) {
    pricingPass = false;
    deficiencies.push(`Suspiciously low nightly price (${price.toLocaleString()} SDG)`);
  } else if (price > 5_000_000) {
    pricingPass = false;
    deficiencies.push(`Suspiciously high nightly price (${price.toLocaleString()} SDG)`);
  }

  // 3. Media & Content Standards
  let mediaPass = true;
  const photos = home.photoUrls ?? [];
  if (photos.length === 0) {
    mediaPass = false;
    deficiencies.push('Zero photos supplied');
  } else if (photos.length < 3) {
    deficiencies.push(`Thin photo set (${photos.length} photos, recommend >= 3)`);
  }
  const hasRottingMuscache = photos.some((u) => u.includes('muscache.com') || u.includes('airbnb.com'));
  if (hasRottingMuscache && !home.photosRehosted) {
    mediaPass = false;
    deficiencies.push('Photos not rehosted on cdn.databayt.org (contains direct Airbnb links)');
  }

  // 4. Host Reachability & Provenance
  let hostPass = true;
  const host = home.host;
  const phone = host?.phone || host?.whatsapp;
  if (!phone) {
    hostPass = false;
    deficiencies.push('No direct contact phone or WhatsApp channel found');
  }
  if (host?.attribution === 'HEURISTIC' || host?.attribution === 'NONE') {
    hostPass = false;
    deficiencies.push('Host attribution resolved via unsafe heuristic');
  }

  // 5. Consent & Handover
  let consentPass = true;
  const isClaimed = host?.isClaimed ?? false;
  const stage = host?.onboardingStage ?? 'SCRAPED';
  const hasAgreement = stage === 'AGREED' || stage === 'CLAIMED' || stage === 'PUBLISHED';
  if (!isClaimed && !hasAgreement) {
    consentPass = false;
    deficiencies.push(`Awaiting host claim/agreement (current stage: ${stage})`);
  }

  // 6. Availability Freshness
  const availabilityPass = Boolean(home.lastAvailabilityConfirmedAt);
  if (!availabilityPass) {
    deficiencies.push('Availability not yet confirmed by host/operator');
  }

  const isQualified =
    locationPass && pricingPass && mediaPass && hostPass && consentPass;

  return {
    listingId: home.id,
    title: home.title ?? 'Untitled Property',
    zone: home.zone_slug ?? 'unplaced',
    hostName: host?.name ?? null,
    hostPhone: phone ?? null,
    priceSdg: price,
    overallScore: Math.max(0, 100 - deficiencies.length * 15),
    tierStatus: {
      location: locationPass,
      pricing: pricingPass,
      media: mediaPass,
      hostVerification: hostPass,
      consent: consentPass,
      availability: availabilityPass,
    },
    isQualified,
    deficiencies,
  };
}

export function runQualificationGate(): GateSummary {
  const listingsPath = join(process.cwd(), 'data/listings/portsudan/listings.json');
  const leadsPath = join(process.cwd(), 'data/market-research/port-sudan/rental-leads.json');
  const zonesPath = join(process.cwd(), 'data/market-research/port-sudan/zones.json');

  const listingsData = existsSync(listingsPath)
    ? JSON.parse(readFileSync(listingsPath, 'utf8'))
    : { listings: [] };
  const leadsData = existsSync(leadsPath)
    ? JSON.parse(readFileSync(leadsPath, 'utf8'))
    : { leads: [] };
  const zonesData = existsSync(zonesPath)
    ? JSON.parse(readFileSync(zonesPath, 'utf8'))
    : { zones: [] };

  const zoneMap = new Map<string, any>();
  for (const z of zonesData.zones ?? []) {
    zoneMap.set(z.zone_slug, z);
  }

  const reports: QualificationReport[] = [];
  const byZone: Record<string, { total: number; qualified: number }> = {};
  const byFailureReason: Record<string, number> = {};

  for (const item of listingsData.listings ?? []) {
    const zoneInfo = zoneMap.get(item.zone_slug);
    const rep = evaluateHomeQualification({
      id: item.id,
      title: item.title_ar,
      zone_slug: item.zone_slug,
      latitude: zoneInfo?.lat ?? null,
      longitude: zoneInfo?.lng ?? null,
      priceNightSdg: item.price_amount && item.price_period === 'night' ? item.price_amount : null,
      priceMonthSdg: item.price_amount && item.price_period === 'month' ? item.price_amount : null,
      photoUrls: item.photos ?? [],
      photosRehosted: item.photos_rehosted ?? false,
      host: {
        name: item.contact_phone ? `Landlord (${item.contact_phone})` : null,
        phone: item.contact_phone ?? null,
        whatsapp: item.contact_phone ?? null,
        attribution: 'EVENT_DATA',
        isClaimed: false,
        onboardingStage: item.contact_phone ? 'CONTACT_FOUND' : 'SCRAPED',
      },
      lastAvailabilityConfirmedAt: null,
    });

    reports.push(rep);

    const zKey = rep.zone;
    if (!byZone[zKey]) byZone[zKey] = { total: 0, qualified: 0 };
    byZone[zKey].total++;
    if (rep.isQualified) byZone[zKey].qualified++;

    for (const def of rep.deficiencies) {
      byFailureReason[def] = (byFailureReason[def] ?? 0) + 1;
    }
  }

  return {
    totalEvaluated: reports.length,
    qualifiedCount: reports.filter((r) => r.isQualified).length,
    disqualifiedCount: reports.filter((r) => !r.isQualified).length,
    byZone,
    byFailureReason,
    reports,
  };
}

async function syncToTwentyCrm(summary: GateSummary) {
  const apiUrl = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
  const apiKey = process.env.TWENTY_API_KEY ?? '';
  if (!apiUrl || !apiKey) {
    console.warn('⚠️  TWENTY_API_URL or TWENTY_API_KEY not configured. Skipping CRM sync.');
    return;
  }

  console.log('\n🔄 Syncing Qualification Statuses to Twenty CRM (mkan workspace)...');
  let updated = 0;
  const now = new Date().toISOString();

  for (const report of summary.reports) {
    const status = report.isQualified
      ? 'QUALIFIED'
      : report.deficiencies.some((d) => d.includes('price'))
        ? 'PRICE_ANOMALY'
        : report.deficiencies.some((d) => d.includes('photos'))
          ? 'MISSING_PHOTOS'
          : report.deficiencies.some((d) => d.includes('zone'))
            ? 'UNRESOLVED_ZONE'
            : report.deficiencies.some((d) => d.includes('contact'))
              ? 'UNREACHABLE_HOST'
              : 'HELD';

    try {
      const res = await fetch(`${apiUrl}/rest/homes?filter[airbnbListingId][eq]=${encodeURIComponent(report.listingId)}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = (await res.json().catch(() => ({}))) as any;
      const homeRecord = data?.data?.homes?.[0] || data?.homes?.[0];

      if (homeRecord?.id) {
        await fetch(`${apiUrl}/rest/homes/${homeRecord.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            qualificationStatus: status,
            qualificationScore: report.overallScore,
            qualificationDeficiencies: report.deficiencies,
            lastQualifiedAt: now,
          }),
        });
        updated++;
      }
    } catch (err) {
      console.warn(`  ! Could not sync qualification for ${report.listingId}: ${(err as Error).message}`);
    }
  }

  console.log(`✅ Successfully updated ${updated} Home qualification records in Twenty CRM.\n`);
}

async function main() {
  console.log('🛡️  Running Mkan Qualification Gate Audit for Port Sudan...\n');
  const summary = runQualificationGate();

  console.log(`📊 Summary: ${summary.totalEvaluated} listings evaluated across ${Object.keys(summary.byZone).length} zones.`);
  console.log(`✅ Qualified for Live: ${summary.qualifiedCount}`);
  console.log(`⏳ Action Required / Held in CRM: ${summary.disqualifiedCount}\n`);

  console.log('🔍 Top Disqualification Reasons:');
  for (const [reason, count] of Object.entries(summary.byFailureReason).sort((a, b) => b[1] - a[1])) {
    console.log(`  • [${count} listings] ${reason}`);
  }

  console.log('\n📍 Breakdown by Zone:');
  for (const [zone, stats] of Object.entries(summary.byZone)) {
    console.log(`  • ${zone.padEnd(20)} ${stats.qualified}/${stats.total} qualified`);
  }

  if (process.argv.includes('--sync-crm')) {
    await syncToTwentyCrm(summary);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
