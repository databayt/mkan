/**
 * Phase 1, item 1 — search respects the brief (chat-funnel.md, 2026-11-21). Each case is a real chat:
 *   …715  "400k-500k furnished" got 800k villas · …922  150k got "Shop for rent" and "Business room"
 *   …114  "max 150k" + "kicukiro, remera, kabeza": a 500k flat first, and only Remera kept.
 */
import { describe, expect, it } from 'vitest';
import { passesHardFilters, rankCandidates, notAHome, type Candidate } from '@/components/agent/rank';
import { EMPTY_REQUIREMENTS, mergeRequirements, parseRequirements, priceRange, reconcile, type Requirements } from '@/components/agent/requirements';
import { relaxations } from '@/components/agent/relax';

const base: Requirements = { ...EMPTY_REQUIREMENTS, stay: 'long', pricePeriod: 'month' };
let n = 0;
const home = (over: Partial<Candidate>): Candidate =>
  ({
    id: ++n,
    hostId: `h${n}`,
    title: 'Room in Kigali',
    rentPeriod: 'MONTHLY',
    priceMonth: 120_000,
    pricePerNight: null,
    monthlyDiscount: null,
    cleaningFee: null,
    bedrooms: 1,
    guestCount: 2,
    district: 'Kicukiro',
    averageRating: null,
    numberOfReviews: null,
    confirmedAt: null,
    latitude: -1.97,
    longitude: 30.1,
    ...over,
  }) as Candidate;

describe('a price range is read by its top (…715)', () => {
  it('"400k-500k" is a ceiling of 500k, not 400k', () => {
    expect(parseRequirements('400k-500k').maxPrice).toBe(500_000);
    expect(priceRange('400k-500k')).toEqual({ low: 400_000, high: 500_000 });
  });
  it('reads the other ways tenants write one', () => {
    expect(parseRequirements('200,000-250,000').maxPrice).toBe(250_000);
    expect(parseRequirements('Budget: 200-250k Furnished').maxPrice).toBe(250_000);
    expect(parseRequirements('between 300 to 450k').maxPrice).toBe(450_000);
    expect(parseRequirements('1.2m - 1.5m').maxPrice).toBe(1_500_000);
  });
  it('is not fooled by bedrooms, home codes or a single figure', () => {
    expect(parseRequirements('2-3 bedrooms').maxPrice).toBeNull();
    expect(parseRequirements('K5808').maxPrice).toBeNull();
    expect(parseRequirements('max 150k').maxPrice).toBe(150_000);
  });
  it('the 800k villas of …715 never fit a 400-500k brief', () => {
    const r = { ...base, ...parseRequirements('400k-500k'), furnished: true, bedrooms: 2, stay: 'long' as const };
    const villa = home({ title: '2-bedroom villa in Muyange', priceMonth: 800_000, bedrooms: 2, furnished: true });
    const fits = home({ title: 'Furnished 2-bedroom house', priceMonth: 450_000, bedrooms: 2, furnished: true });
    expect(passesHardFilters(villa, r)).toBe(false);
    expect(rankCandidates([villa, fits], r).ranked.map((x) => x.id)).toEqual([fits.id]);
  });
});

describe('the budget is a hard ceiling (…114)', () => {
  const r = { ...base, maxPrice: 150_000, bedrooms: 1 };
  it('lets a home through at most 10% over, never 500k for 150k', () => {
    expect(passesHardFilters(home({ priceMonth: 160_000 }), r)).toBe(true);
    expect(passesHardFilters(home({ priceMonth: 166_000 }), r)).toBe(false);
    const flat = home({ title: '1-bedroom unfurnished apartment in Kibagabaga', priceMonth: 500_000 });
    const room = home({ title: 'Single room in Gikondo', priceMonth: 130_000 });
    expect(rankCandidates([flat, room], r).ranked.map((x) => x.id)).toEqual([room.id]);
  });
  it('widens the budget only when nothing else is left, as its own step', () => {
    const steps = relaxations(r).filter((x) => x.steps.some((s) => s.key === 'budget'));
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]!.requirements.maxPrice).toBe(200_000);
  });
});

describe('a shop is not a home (…922)', () => {
  const r = { ...base, maxPrice: 150_000 };
  it('drops shops, business rooms and commercial units', () => {
    for (const title of ['Shop for rent in Gikondo main road', 'Business room in Nyendo', 'Commercial space for rent', 'Boutique to let in Remera', 'Warehouse in Masaka', 'House for sale in Kanombe']) {
      expect(notAHome(home({ title }), r), title).toBe(true);
    }
  });
  it('keeps real rooms, and a home that merely has a store or a garage', () => {
    for (const title of ['Room for rent in Chapel for 150,000 RWF', '3-bedroom annex for rent in Busanza', '2-bedroom house with garage and store']) {
      expect(notAHome(home({ title }), r), title).toBe(false);
    }
  });
  it('keeps nightly stays out of a monthly search, however they are priced', () => {
    expect(notAHome(home({ rentPeriod: 'NIGHTLY', pricePerNight: 2_000, title: 'Cosy studio' }), r)).toBe(true);
    expect(notAHome(home({ title: 'Affordable Airbnb stay in Remera, Kigali', priceMonth: 36_250 }), r)).toBe(true);
    expect(rankCandidates([home({ title: 'Shop for rent', priceMonth: 130_000 }), home({ title: 'Business room', priceMonth: 130_000 }), home({ title: 'Single room in Gikondo', priceMonth: 120_000 })], r).ranked).toHaveLength(1);
  });
});

describe('the places a tenant listed all stay (…114)', () => {
  it('"kicukiro, remera, kabeza" keeps Remera and Kabeza together, and the district', () => {
    const p = parseRequirements('Around kicukiro, remera, kabeza');
    expect(p.neighbourhoods).toEqual(['Remera', 'Kabeza']);
    expect(p.neighbourhood).toBe('Remera');
    expect(p.district).toBe('KICUKIRO');
  });
  it('a single place stays a single place', () => {
    expect(parseRequirements('around Remera').neighbourhoods).toBeNull();
  });
  it('the district is not flipped to the first place when the tenant listed several', () => {
    const stated = parseRequirements('1 bedroom around kicukiro, remera, kabeza max 150k');
    const merged = reconcile(base, mergeRequirements(base, stated), stated);
    expect(merged.district).toBe('KICUKIRO');
    expect(merged.neighbourhoods).toEqual(['Remera', 'Kabeza']);
  });
  it('a home in the district the list names is kept, one far away is not', () => {
    const r = { ...base, ...parseRequirements('1 bedroom around kicukiro, remera, kabeza max 150k') };
    const inKicukiro = home({ district: 'Kicukiro', zone: 'kigali/kicukiro/kicukiro', title: 'Single room in Gikondo' });
    const far = home({ district: 'Nyarugenge', zone: 'kigali/nyarugenge/nyamirambo', latitude: -1.98, longitude: 30.045, title: 'Room in Nyamirambo' });
    expect(passesHardFilters(inKicukiro, r)).toBe(true);
    expect(passesHardFilters(far, r)).toBe(false);
  });
  it('a newly named single place replaces the list', () => {
    const before = { ...base, neighbourhood: 'Remera', neighbourhoods: ['Remera', 'Kabeza'] };
    const stated = parseRequirements('just Kimironko');
    expect(reconcile(before, mergeRequirements(before, stated), stated).neighbourhoods).toBeNull();
  });
});
