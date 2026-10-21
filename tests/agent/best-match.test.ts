/**
 * Best match: must-haves, distance to a place, unrated broker homes and
 * "unfurnished" — the ranking rules behind the first card.
 */
import { describe, expect, it } from 'vitest';
import { hasMustHave, passesHardFilters, rankCandidates, scoreCandidate, type Candidate } from '@/components/agent/rank';
import { EMPTY_REQUIREMENTS, type Requirements } from '@/components/agent/requirements';
import { relaxations } from '@/components/agent/relax';

const base: Requirements = { ...EMPTY_REQUIREMENTS, stay: 'long' };
const home = (over: Partial<Candidate>): Candidate =>
  ({
    id: 1,
    hostId: 'h',
    rentPeriod: 'MONTHLY',
    priceMonth: 450_000,
    pricePerNight: null,
    monthlyDiscount: null,
    cleaningFee: null,
    bedrooms: 2,
    guestCount: 4,
    district: 'Gasabo',
    averageRating: null,
    numberOfReviews: null,
    confirmedAt: null,
    latitude: -1.953,
    longitude: 30.093,
    ...over,
  }) as Candidate;

const kigaliHeights = { name: 'Kigali Heights', lat: -1.9531, lng: 30.0936 };

describe('must-haves', () => {
  it('scores what a listing says, and reads silence as unknown, not as a no', () => {
    expect(hasMustHave(home({ amenities: ['Parking'] }), 'parking')).toBe(true);
    expect(hasMustHave(home({ isParkingIncluded: true }), 'parking')).toBe(true);
    expect(hasMustHave(home({ amenities: ['WiFi'] }), 'parking')).toBe(false);
    expect(hasMustHave(home({ amenities: [], highlights: [] }), 'waterTank')).toBeNull();
    expect(hasMustHave(home({ highlights: ['QuietNeighborhood'] }), 'quiet')).toBe(true);
  });

  it('a home with the must-have beats one without, and the card names what to ask', () => {
    const r = { ...base, mustHaves: ['parking', 'waterTank'] } as Requirements;
    const withIt = scoreCandidate(home({ id: 1, amenities: ['Parking', 'WaterTank'] }), r)!;
    const without = scoreCandidate(home({ id: 2, amenities: ['WiFi'] }), r)!;
    const silent = scoreCandidate(home({ id: 3 }), r)!;
    expect(withIt.score).toBeGreaterThan(silent.score);
    expect(silent.score).toBeGreaterThan(without.score);
    expect(withIt.mustHaves).toEqual({ matched: ['parking', 'waterTank'], unknown: [] });
    expect(silent.mustHaves).toEqual({ matched: [], unknown: ['parking', 'waterTank'] });
  });
});

describe('near a place', () => {
  it('ranks by distance, softly, and says how far', () => {
    const r = { ...base, near: kigaliHeights };
    const close = home({ id: 1, latitude: -1.954, longitude: 30.094 });
    const far = home({ id: 2, hostId: 'x', latitude: -1.99, longitude: 30.13 });
    const { ranked } = rankCandidates([far, close], r);
    expect(ranked.map((x) => x.id)).toEqual([1, 2]);
    expect(ranked[0]!.km).toBeLessThan(0.3);
    expect(ranked[0]!.reasons).toContain('nearPlace');
    expect(ranked[1]!.reasons).not.toContain('nearPlace');
  });

  it('a lead with only a district pin neither gains nor loses distance points', () => {
    const r = { ...base, near: kigaliHeights };
    const lead = scoreCandidate(home({ approxLocation: true }), r)!;
    const plain = scoreCandidate(home({ approxLocation: true }), base)!;
    expect(lead.score).toBe(plain.score);
    expect(lead.km).toBeUndefined();
  });

  it('widens away from the place when nothing is near it', () => {
    const steps = relaxations({ ...base, near: kigaliHeights }).map((a) => a.steps.map((s) => s.key));
    expect(steps).toContainEqual(['near']);
  });
});

describe('fair to broker homes', () => {
  it('an unrated home scores as a decent one, not as zero', () => {
    const unrated = scoreCandidate(home({ averageRating: null, numberOfReviews: 0 }), base)!;
    const rated = scoreCandidate(home({ averageRating: 4.5, numberOfReviews: 0 }), base)!;
    expect(unrated.score).toBe(rated.score);
  });

  it('"unfurnished" leaves out nightly homes and homes known to be furnished', () => {
    const r = { ...base, furnished: false };
    expect(passesHardFilters(home({ rentPeriod: 'NIGHTLY', pricePerNight: 40_000 }), r)).toBe(false);
    expect(passesHardFilters(home({ furnished: true }), r)).toBe(false);
    expect(passesHardFilters(home({ furnished: null }), r)).toBe(true);
  });
});

describe('features from a video', () => {
  it('turns the reader\'s phrases into listing facts', async () => {
    const { factsFromFeatures } = await import('@/components/agent/amenities');
    expect(factsFromFeatures(['parking', 'water tank', 'fenced compound', 'furnished', 'near main road'])).toEqual({
      amenities: ['Parking', 'WaterTank'],
      furnished: true,
      isParkingIncluded: true,
      isPetsAllowed: false,
    });
    expect(factsFromFeatures(['unfurnished', 'generator', 'balcony']).furnished).toBe(false);
    expect(factsFromFeatures(['unfurnished', 'generator', 'balcony']).amenities).toEqual(['BackupGenerator', 'PatioOrBalcony']);
    expect(factsFromFeatures([])).toEqual({ amenities: [], furnished: null, isParkingIncluded: false, isPetsAllowed: false });
  });
});
