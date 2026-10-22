/**
 * Where a lead sits and what renting it costs — the pure decisions shared by
 * the mirror (tiktok-mirror.ts: Twenty home → Listing + Location) and the
 * backfill (backfill-terms.ts: the rows written before either existed).
 * No network, no database.
 */
import { DISTRICTS } from '../../src/lib/geo/rwanda-places';
import { resolveZone, type ResolvedZone } from '../../src/lib/geo/kigali-zones';
import { mergeTerms, statesTerms, termsFromText, type AdTerms } from './terms-pure';
import { TikTokReadSchema } from './tiktok-pure';

type Row = Record<string, unknown>;

/** Sources whose rows are leads: the pin is a zone centre, not the home's gate. */
export const LEAD_SOURCES = ['TIKTOK', 'FACEBOOK', 'WEB'] as const;

export interface LeadTerms {
  depositMonths: number | null;
  /** A fraction of the first rent (0.25 = 25%); Twenty keeps the percent. */
  commissionPct: number | null;
  noCommission: boolean | null;
  viewingFee: number | null;
  waterIncluded: boolean | null;
  electricityIncluded: boolean | null;
  termsSource: 'AD';
}

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const utilityBool = (v: unknown): boolean | null => (v === 'INCLUDED' ? true : v === 'SEPARATE' ? false : null);

/**
 * A Twenty home's terms → the Listing's. Twenty's `noCommission` is a BOOLEAN
 * defaulting to false, so only `true` is a statement; false counts when the
 * ad names a commission. Null when the ad states no term at all.
 */
export function termsFromHome(home: Row): LeadTerms | null {
  const pct = numOrNull(home.commissionPct);
  const fee = numOrNull(home.viewingFee);
  const t = {
    depositMonths: numOrNull(home.depositMonths),
    commissionPct: pct != null && pct > 0 ? Math.round(pct * 100) / 10_000 : null,
    noCommission: home.noCommission === true ? true : pct != null && pct > 0 ? false : null,
    viewingFee: fee != null ? Math.round(fee) : null,
    waterIncluded: utilityBool(home.water),
    electricityIncluded: utilityBool(home.electricity),
  };
  return Object.values(t).some((v) => v != null) ? { ...t, termsSource: 'AD' } : null;
}

/** The district code for a Location.state written either way ("GASABO" by the old demand form, "Gasabo" by the mirror). */
export const districtOfState = (state: string | null | undefined) =>
  DISTRICTS.find((d) => d.code === String(state ?? '').trim().toUpperCase()) ?? null;

/**
 * Where a lead sits: the place the ad names (the reader's neighbourhood), else
 * its title, resolved on the Kigali zone tree. A zone in another district than
 * the one the CRM filed is a misread title ("…like Nyarutarama") and is ignored.
 */
export function zoneForLead(at: { neighbourhood: string | null; title: string | null; districtCode: string | null }): ResolvedZone | null {
  let broad: ResolvedZone | null = null;
  for (const text of [at.neighbourhood, at.title]) {
    const z = resolveZone({ text, pinIsReal: false });
    if (!z || (at.districtCode && z.district !== at.districtCode)) continue;
    // "Gasabo" as the address says less than "… in Kibagabaga" in the title.
    if (z.zone.level !== 'district') return z;
    broad ??= z;
  }
  return broad;
}

export interface LocationRow {
  address: string;
  state: string;
  latitude: number;
  longitude: number;
  sector: string | null;
  neighbourhood: string | null;
  listings: { source: string | null; title: string }[];
}

export type LocationPatch = Partial<Pick<LocationRow, 'state' | 'latitude' | 'longitude' | 'sector' | 'neighbourhood'>>;

/**
 * A Kigali Location's zone, the way the mirror would write it today. A lead
 * resolves from its text and moves to the zone's centre (still approximate);
 * any other row keeps its pin and may be placed by it. Empty = nothing changes.
 */
export function planLocation(loc: LocationRow): LocationPatch {
  const lead = loc.listings.some((l) => (LEAD_SOURCES as readonly string[]).includes(l.source ?? ''));
  const district = districtOfState(loc.state);
  let zone = lead
    ? zoneForLead({ neighbourhood: loc.address, title: loc.listings[0]?.title ?? null, districtCode: district?.code ?? null })
    : resolveZone({ text: loc.address, lat: loc.latitude, lng: loc.longitude, pinIsReal: true });
  // "Kicukiro, Kigali" names only the district; a real pin says which sector.
  if (!lead && zone?.zone.level === 'district') zone = resolveZone({ lat: loc.latitude, lng: loc.longitude }) ?? zone;
  const want: LocationPatch = {
    sector: zone?.sector ?? null,
    neighbourhood: zone?.neighbourhood ?? null,
  };
  // A lead's district follows its zone when the CRM filed none; other rows only get their casing fixed.
  const named = district ?? (lead && zone ? (DISTRICTS.find((d) => d.code === zone.district) ?? null) : null);
  if (named && loc.state !== named.nameEn) want.state = named.nameEn;
  if (lead && zone && zone.zone.level !== 'district') Object.assign(want, { latitude: zone.zone.lat, longitude: zone.zone.lng });
  const patch: LocationPatch = {};
  for (const [k, v] of Object.entries(want) as [keyof LocationPatch, never][]) if (loc[k] !== v) (patch as Row)[k] = v;
  return patch;
}

export interface ListingTermsRow {
  priceMonth: number | null;
  furnished: boolean | null;
  depositMonths: number | null;
  commissionPct: number | null;
  noCommission: boolean | null;
  viewingFee: number | null;
  waterIncluded: boolean | null;
  electricityIncluded: boolean | null;
  termsSource: 'AD' | 'BROKER' | null;
}

export type ListingTermsPatch = Partial<Omit<ListingTermsRow, 'priceMonth'>>;

/** A stored reader answer (any prompt version) → the terms it states. */
export function termsFromStoredRead(read: unknown): Partial<AdTerms> | null {
  if (!read || typeof read !== 'object') return null;
  const r = TikTokReadSchema.safeParse(read);
  return r.success ? r.data : null;
}

/**
 * What the ad's words add to a lead: only fields still empty are filled, so a
 * human's or a later reader's value is never overwritten. Returns the Prisma
 * patch and the same facts in Twenty's `home` shape (commission as a percent).
 */
export function planListingTerms(row: ListingTermsRow, texts: (string | null | undefined)[], stored: Partial<AdTerms> | null = null): { data: ListingTermsPatch; twenty: Row } {
  const t = mergeTerms(stored, termsFromText(texts.filter(Boolean).join('\n'), { priceRwf: row.priceMonth }));
  const data: ListingTermsPatch = {};
  const twenty: Row = {};
  if (row.furnished == null && t.furnished != null) {
    data.furnished = t.furnished;
    twenty.furnishing = t.furnished ? 'FURNISHED' : 'UNFURNISHED';
  }
  if (row.depositMonths == null && t.depositMonths != null) twenty.depositMonths = data.depositMonths = t.depositMonths;
  if (t.commission) {
    if (row.commissionPct == null && t.commission.pct != null) {
      data.commissionPct = t.commission.pct / 100;
      twenty.commissionPct = t.commission.pct;
    }
    if (row.noCommission == null) twenty.noCommission = data.noCommission = t.commission.none;
  }
  if (row.viewingFee == null && t.viewingFee != null) twenty.viewingFee = data.viewingFee = t.viewingFee;
  if (row.waterIncluded == null && t.water) {
    data.waterIncluded = t.water === 'INCLUDED';
    twenty.water = t.water;
  }
  if (row.electricityIncluded == null && t.electricity) {
    data.electricityIncluded = t.electricity === 'INCLUDED';
    twenty.electricity = t.electricity;
  }
  const states = statesTerms(t) && Object.keys(data).some((k) => k !== 'furnished');
  if (states && row.termsSource == null) data.termsSource = 'AD';
  return { data, twenty };
}
