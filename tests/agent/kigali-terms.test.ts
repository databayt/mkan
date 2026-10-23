/**
 * What a Kigali tenant decides on — home type, purpose, furnishing, water,
 * commission — read by the rules, filtered and ranked without hiding homes
 * whose ad is silent, priced from the ad's own terms, and asked in one
 * clarify card when a first message says almost nothing.
 */
import { describe, expect, it } from 'vitest';
import { longStayCost, typicalMoveInMultiple } from '@/components/agent/cost';
import { passesHardFilters, rankCandidates, type Candidate } from '@/components/agent/rank';
import { relaxations } from '@/components/agent/relax';
import {
  clarifyFields,
  coerceRequirements,
  EMPTY_REQUIREMENTS,
  inferStay,
  mergeRequirements,
  parseAdjustments,
  parseRequirements,
  reconcile,
} from '@/components/agent/requirements';
import { coerceMemory } from '@/components/agent/memory';
import { termsFacts } from '@/components/agent/writer';

const lead = (extra: Partial<Candidate> = {}): Candidate =>
  ({
    id: 1,
    hostId: 'broker',
    rentPeriod: 'MONTHLY',
    pricePerNight: null,
    priceMonth: 400_000,
    monthlyDiscount: null,
    cleaningFee: null,
    bedrooms: 2,
    guestCount: 2,
    district: 'GASABO',
    averageRating: null,
    numberOfReviews: null,
    confirmedAt: null,
    latitude: -1.896,
    longitude: 30.112,
    approxLocation: true,
    ...extra,
  }) as Candidate;

const base = { ...EMPTY_REQUIREMENTS, stay: 'long' as const };

describe('reading what Kigali tenants decide on', () => {
  it('reads home types in en / ar / rw / fr', () => {
    expect(parseRequirements('self compound unfurnished in Kicukiro for my family')).toMatchObject({
      homeType: 'house',
      furnished: false,
      district: 'KICUKIRO',
      purpose: 'family',
    });
    expect(parseRequirements('an apartment in Kacyiru').homeType).toBe('apartment');
    expect(parseRequirements('room near the university, no commission')).toMatchObject({ homeType: 'room', area: 'university', noCommission: true });
    expect(parseRequirements('self-contained near Remera').homeType).toBe('room');
    expect(parseRequirements('studio in Kiyovu')).toMatchObject({ homeType: 'studio', bedrooms: 0 });
    expect(parseRequirements('أريد شقة في كاتشيرو').homeType).toBe('apartment');
    expect(parseRequirements('بيت مستقل لعائلتي').homeType).toBe('house');
    expect(parseRequirements('Ndashaka inzu yigenga i Kicukiro').homeType).toBe('house');
    expect(parseRequirements('Icyumba hafi ya kaminuza, nta komisiyo')).toMatchObject({ homeType: 'room', noCommission: true, area: 'university' });
    expect(parseRequirements('appartement meublé à Kimihurura').homeType).toBe('apartment');
  });

  it('does not read a living room or a bedroom count as a room to rent', () => {
    expect(parseRequirements('2 bedroom with a big living room in Remera').homeType).toBeNull();
    expect(parseRequirements('3 bedroom house').homeType).toBeNull();
  });

  it('reads the purpose: family, study, work', () => {
    expect(parseRequirements('a home for my family').purpose).toBe('family');
    expect(parseRequirements("I'm a student at UR").purpose).toBe('study');
    expect(parseRequirements('apartment with water included, office in Kacyiru')).toMatchObject({
      homeType: 'apartment',
      waterIncluded: true,
      purpose: 'business',
      neighbourhood: 'Kacyiru',
    });
    expect(parseRequirements('أنا طالب في الجامعة').purpose).toBe('study');
    expect(parseRequirements('Ndashaka inzu hafi y’akazi, ku kazi i Kacyiru').purpose).toBe('business');
    // A desk at home is the workspace must-have, not a move for work.
    const home = parseRequirements('I need a home office');
    expect(home.purpose).toBeNull();
    expect(home.mustHaves).toEqual(['workspace']);
  });

  it('reads water in the rent and no commission in en / ar / rw / fr', () => {
    expect(parseRequirements('water included please').waterIncluded).toBe(true);
    expect(parseRequirements('شقة شاملة الماء بدون عمولة')).toMatchObject({ waterIncluded: true, noCommission: true });
    expect(parseRequirements('amazi ari mu bukode, nta komisiyo')).toMatchObject({ waterIncluded: true, noCommission: true });
    expect(parseRequirements('directly from the owner').noCommission).toBe(true);
    expect(parseRequirements('sans commission, eau comprise')).toMatchObject({ noCommission: true, waterIncluded: true });
    // A water tank is a must-have, not water in the rent.
    expect(parseRequirements('with a water tank').waterIncluded).toBeNull();
  });

  it('broker terms and a house mean monthly rent', () => {
    expect(inferStay(parseRequirements('no commission in Remera')).stay).toBe('long');
    expect(inferStay(parseRequirements('self compound in Kicukiro')).stay).toBe('long');
  });

  it('reads stored searches and memories from before home types', () => {
    expect(coerceRequirements({ compound: true, family: true, stay: 'long' })).toMatchObject({ homeType: 'house', purpose: 'family', stay: 'long' });
    const mem = coerceMemory({ prefs: { compound: { value: true, at: '2026-10-01T00:00:00Z', source: 'said' } } });
    expect(mem.prefs.homeType?.value).toBe('house');
  });

  it('keeps a studio and a bedroom count consistent', () => {
    const studio = mergeRequirements(EMPTY_REQUIREMENTS, parseRequirements('studio in Kiyovu'));
    const bigger = parseAdjustments('something bigger', studio);
    expect(bigger.set.bedrooms).toBe(1);
    expect(bigger.clear).toContain('homeType');
    // Bedrooms said after a studio: the studio goes.
    expect(reconcile(studio, { ...studio, bedrooms: 2 }, { bedrooms: 2 })).toMatchObject({ homeType: null, bedrooms: 2 });
  });

  it('keeps the must-haves a model reads even when one is unknown', () => {
    expect(coerceRequirements({ mustHaves: ['parking', 'jacuzzi'] }).mustHaves).toEqual(['parking']);
  });
});

describe('filtering and ranking without hiding silent ads', () => {
  it('furnished drops homes known to be the other, keeps silent ones lower and says to ask', () => {
    const r = { ...base, furnished: true };
    expect(passesHardFilters(lead({ furnished: false }), r)).toBe(false);
    expect(passesHardFilters(lead({ furnished: null }), r)).toBe(true);
    const { ranked } = rankCandidates([lead({ id: 1, furnished: null }), lead({ id: 2, hostId: 'b', furnished: true })], r);
    expect(ranked.map((x) => x.id)).toEqual([2, 1]);
    expect(ranked[1]!.ask).toContain('furnishing');
    expect(ranked[0]!.reasons).toContain('furnished');
  });

  it('a home type keeps leads with no type, after the ones that match', () => {
    const r = { ...base, homeType: 'apartment' as const };
    expect(passesHardFilters(lead({ propertyType: 'Villa' }), r)).toBe(false);
    const { ranked } = rankCandidates([lead({ id: 1, propertyType: null }), lead({ id: 2, hostId: 'b', propertyType: 'Apartment' })], r);
    expect(ranked.map((x) => x.id)).toEqual([2, 1]);
    expect(ranked[1]!.ask).toContain('homeType');
  });

  it('a studio is no bedroom', () => {
    const r = { ...base, homeType: 'studio' as const, bedrooms: 0 };
    expect(passesHardFilters(lead({ bedrooms: 0 }), r)).toBe(true);
    expect(passesHardFilters(lead({ bedrooms: 2 }), r)).toBe(false);
    expect(passesHardFilters(lead({ bedrooms: null }), r)).toBe(true);
  });

  it('no commission: owners and "no commission" ads in, a stated commission out, silence kept lower', () => {
    const r = { ...base, noCommission: true };
    expect(passesHardFilters(lead({ terms: { commissionPct: 0.25 } }), r)).toBe(false);
    expect(passesHardFilters(lead({ terms: { noCommission: false } }), r)).toBe(false);
    const { ranked } = rankCandidates(
      [lead({ id: 1, terms: {} }), lead({ id: 2, hostId: 'b', terms: { owner: true } }), lead({ id: 3, hostId: 'c', priceMonth: 410_000, terms: { noCommission: true } })],
      r,
    );
    expect(ranked.at(-1)!.id).toBe(1);
    expect(ranked.at(-1)!.ask).toContain('commission');
    expect(ranked[0]!.reasons).toContain('noCommission');
  });

  it('water included: a "paid separately" ad is out, silence kept with an ask', () => {
    const r = { ...base, waterIncluded: true };
    expect(passesHardFilters(lead({ terms: { waterIncluded: false } }), r)).toBe(false);
    const { ranked } = rankCandidates([lead({ terms: {} })], r);
    expect(ranked[0]!.ask).toEqual(['water']);
  });

  it('a family wants 2+ bedrooms but keeps leads that do not say', () => {
    const r = { ...base, purpose: 'family' as const };
    expect(passesHardFilters(lead({ bedrooms: 1 }), r)).toBe(false);
    expect(passesHardFilters(lead({ bedrooms: null }), r)).toBe(true);
    expect(passesHardFilters(lead({ bedrooms: 2 }), r)).toBe(true);
  });

  it('places a lead by its zone slug, not its address words', () => {
    const r = { ...base, neighbourhood: 'Kimihurura' };
    expect(passesHardFilters(lead({ zone: 'gasabo/kimihurura' }), r)).toBe(true);
    expect(passesHardFilters(lead({ zone: 'gasabo/remera', address: 'Kimihurura' }), r)).toBe(false);
    // No zone yet (before the backfill): the address still places it.
    expect(passesHardFilters(lead({ zone: null, address: 'Kimihurura, near KCC' }), r)).toBe(true);
  });

  it('scores a lead near a place by its zone centre', () => {
    const r = { ...base, near: { name: 'Kigali Convention Centre', lat: -1.9536, lng: 30.0928 } };
    const { ranked } = rankCandidates([lead({ id: 1, zone: 'gasabo/kimihurura' }), lead({ id: 2, hostId: 'b', zone: 'gasabo/kacyiru' })], r);
    expect(ranked[0]!.km).toBeDefined();
  });

  it('widens water and commission before the budget', () => {
    const steps = relaxations({ ...base, waterIncluded: true, noCommission: true, maxPrice: 300_000, pricePeriod: 'month' })
      .filter((a) => a.steps.length === 1)
      .map((a) => a.steps[0]!.key);
    expect(steps).toEqual(['water', 'commission', 'budget']);
  });
});

describe('move-in cost from the ad', () => {
  const home = { rentPeriod: 'MONTHLY' as const, pricePerNight: null, priceMonth: 400_000, monthlyDiscount: null, cleaningFee: null };

  it('uses the ad terms and marks them, falls back to typical for the rest', () => {
    const c = longStayCost({ ...home, terms: { depositMonths: 1, commissionPct: 0.1, waterIncluded: true } })!;
    const line = (k: string) => c.lines.find((l) => l.key === k);
    expect(line('deposit')).toMatchObject({ amount: 400_000, qty: 1, source: 'ad' });
    expect(line('commission')).toMatchObject({ amount: 40_000, qty: 10, source: 'ad' });
    expect(line('commission')!.amountHigh).toBeUndefined();
    expect(line('viewingFee')).toMatchObject({ amount: 5_000, source: 'typical' });
    expect(line('water')).toMatchObject({ status: 'included', source: 'ad' });
    expect(line('electricity')).toMatchObject({ status: 'unknown' });
    expect(c.total).toBe(1_200_000 + 400_000 + 40_000 + 5_000);
    expect(c.totalHigh).toBe(c.total);
  });

  it("an owner's home has no commission and no viewing fee", () => {
    const c = longStayCost({ ...home, terms: { owner: true } })!;
    expect(c.lines.some((l) => l.key === 'commission')).toBe(false);
    expect(c.lines.some((l) => l.key === 'viewingFee')).toBe(false);
    expect(c.total).toBe(1_200_000 + 200_000);
  });

  it('"no commission" in the ad drops the commission line', () => {
    const c = longStayCost({ ...home, terms: { noCommission: true } })!;
    expect(c.lines.some((l) => l.key === 'commission')).toBe(false);
  });

  it('the typical multiple matches the constants', () => {
    expect(typicalMoveInMultiple()).toBe(3.8);
  });

  it('the writer gets the ad terms, never the typical ones, and no money', () => {
    const ad = longStayCost({ ...home, terms: { depositMonths: 1, noCommission: true, waterIncluded: false } })!;
    expect(termsFacts(ad.lines)).toEqual(['a deposit of 1 month', 'no commission', 'water paid separately']);
    expect(termsFacts(longStayCost(home)!.lines)).toEqual([]);
  });
});

describe('the clarify card', () => {
  const read = (text: string) => inferStay(mergeRequirements(EMPTY_REQUIREMENTS, parseRequirements(text)));

  it('asks a vague first message what is missing, most result-changing first', () => {
    // Monthly rentals only: the stay is never asked.
    expect(clarifyFields(read('I need a place'), { first: true, tapped: false })).toEqual(['homeType', 'furnished', 'purpose']);
    // A self compound says the kind of home and the stay (monthly): the rest is asked.
    expect(clarifyFields(read('I need a self compound'), { first: true, tapped: false })).toEqual(['furnished', 'purpose']);
    // Fewer than two missing: search now.
    expect(clarifyFields(read('unfurnished self compound for my family'), { first: true, tapped: false })).toBeNull();
  });

  it('searches straight away when the message is specific, tapped or not the first', () => {
    expect(clarifyFields(read('2 bedroom in Kicukiro'), { first: true, tapped: false })).toBeNull();
    expect(clarifyFields(read('I need a place'), { first: false, tapped: false })).toBeNull();
    expect(clarifyFields(read('I need a place'), { first: true, tapped: true })).toBeNull();
  });
});
