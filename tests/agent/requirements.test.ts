/**
 * The deterministic reader on its own — what a Groq or rules turn gets on
 * prod while the Claude reader is dark: must-haves in en/fr/rw/ar, French
 * and Swahili rooms, stays and money, and places to live near (schools too).
 */
import { describe, expect, it } from 'vitest';
import { landmarkNamed, nearestSchool, SCHOOLS } from '@/components/agent/areas';
import { clearFields, EMPTY_REQUIREMENTS, mergeRequirements, parseRequirements } from '@/components/agent/requirements';

const must = (text: string) => parseRequirements(text).mustHaves ?? [];

describe('must-haves without Claude', () => {
  it('reads them in English', () => {
    expect(must('2 bedroom with parking, a generator and a quiet street')).toEqual(expect.arrayContaining(['parking', 'generator', 'quiet']));
    expect(must('good wifi, a desk and a balcony, pets allowed')).toEqual(expect.arrayContaining(['wifi', 'workspace', 'balcony', 'pets']));
    expect(must('a gated house with a garden and a water tank')).toEqual(expect.arrayContaining(['security', 'garden', 'waterTank']));
  });

  it('reads them in French', () => {
    expect(must('appartement calme avec parking, citerne et groupe électrogène')).toEqual(expect.arrayContaining(['quiet', 'parking', 'waterTank', 'generator']));
    expect(must('une maison avec jardin et gardien, ascenseur')).toEqual(expect.arrayContaining(['garden', 'security', 'elevator']));
  });

  it('reads them in Kinyarwanda', () => {
    expect(must("inzu ifite parikingi n'ikigega cy'amazi, hatuje urusaku")).toEqual(expect.arrayContaining(['parking', 'waterTank', 'quiet']));
    expect(must('inzu ifite umuzamu na moteri')).toEqual(expect.arrayContaining(['security', 'generator']));
  });

  it('reads them in Arabic', () => {
    expect(must('شقة هادئة فيها موقف ومولد وحارس')).toEqual(expect.arrayContaining(['quiet', 'parking', 'generator', 'security']));
    expect(must('بيت فيه حديقة وإنترنت وبلكونة وخزان')).toEqual(expect.arrayContaining(['garden', 'wifi', 'balcony', 'waterTank']));
  });

  it('keeps furnished a field, not a must-have', () => {
    const r = parseRequirements('appartement meublé avec parking');
    expect(r.furnished).toBe(true);
    expect(r.mustHaves).toEqual(['parking']);
    expect(parseRequirements('non meublé').furnished).toBe(false);
  });

  it('skips what the tenant says they do not need', () => {
    expect(must('no need for parking, but a garden please')).toEqual(['garden']);
    expect(must("I don't have the dog anymore")).toEqual([]);
    expect(must('sans parking')).toEqual([]);
  });

  it('does not invent must-haves from ordinary words', () => {
    expect(must('2 bedroom near my office in Kacyiru, 500k a month')).toEqual([]);
    expect(parseRequirements('2 bedroom please').stay).toBeNull(); // "please" is not a lease
  });

  it('adds up across turns, and a clear drops them', () => {
    let r = mergeRequirements(EMPTY_REQUIREMENTS, parseRequirements('with parking'));
    r = mergeRequirements(r, parseRequirements('and a garden'));
    expect(r.mustHaves).toEqual(['parking', 'garden']);
    r = mergeRequirements(r, parseRequirements('also parking'));
    expect(r.mustHaves).toEqual(['parking', 'garden']);
    expect(clearFields(r, ['mustHaves']).mustHaves).toBeNull();
  });
});

describe('French and Swahili', () => {
  it('reads French rooms, months, nights and money', () => {
    expect(parseRequirements('deux chambres à Kicukiro, 400 mille par mois')).toMatchObject({ bedrooms: 2, stay: 'long', maxPrice: 400_000, pricePeriod: 'month' });
    // A "3 pièces" counts the living room: two bedrooms.
    expect(parseRequirements('un 3 pièces à Kicukiro').bedrooms).toBe(2);
    expect(parseRequirements('un studio pour 4 nuits, pas cher')).toMatchObject({ stay: 'short', nights: 4, bedrooms: 0, cheap: true });
  });

  it('reads Swahili rooms, months, nights and money', () => {
    expect(parseRequirements('nyumba ya vyumba vitatu Kicukiro, elfu 400 kwa mwezi')).toMatchObject({
      bedrooms: 3,
      district: 'KICUKIRO',
      stay: 'long',
      maxPrice: 400_000,
      pricePeriod: 'month',
    });
    expect(parseRequirements('chumba kimoja usiku 3, watu 2, bei nafuu')).toMatchObject({ bedrooms: 1, stay: 'short', nights: 3, guests: 2, cheap: true });
  });

  it('reads a unit-first figure once', () => {
    expect(parseRequirements("ibyumba bibiri, ibihumbi 300 ku kwezi")).toMatchObject({ bedrooms: 2, maxPrice: 300_000 });
  });

  it('does not read a phone number, a year or a decimal point as money', () => {
    expect(parseRequirements('2 bedroom in Remera, call me on 0788123456').maxPrice).toBeNull();
    expect(parseRequirements('studio in Kiyovu, moving in January 2027').maxPrice).toBeNull();
    expect(parseRequirements('rent max 400k a month, I have 1.5M to move in')).toMatchObject({ maxPrice: 400_000, maxUpfront: 1_500_000 });
  });
});

describe('near a place', () => {
  it('pins a named landmark or school when the message asks to be near it', () => {
    expect(parseRequirements('3 bedrooms close to Green Hills Academy').near?.name).toBe('Green Hills Academy');
    expect(parseRequirements('deux chambres près du Lycée de Kigali').near?.name).toBe('Lycée de Kigali');
    expect(parseRequirements('near KCC').near?.name).toBe('Kigali Convention Centre');
    expect(parseRequirements('داير بيت تلاتة غرف قريب من المطار')).toMatchObject({ bedrooms: 3, near: { name: 'Kigali International Airport' } });
    // A place word with no "near" is not a pin.
    expect(parseRequirements('my kids go to Green Hills').near).toBeNull();
  });

  it('pins a bare "near a school" to the school by the place named', () => {
    expect(parseRequirements('2 bedroom near a school in Kimihurura').near?.name).toBe('Green Hills Academy');
    for (const text of ["hafi y'ishuri i Kicukiro", "près d'une école à Kicukiro", 'قرب مدرسة في كيتشوكيرو']) {
      const pin = parseRequirements(text).near;
      expect(SCHOOLS.find((s) => s.name === pin?.name)?.district).toBe('KICUKIRO');
    }
  });

  it('leaves a bare "near a school" with no place unpinned', () => {
    expect(parseRequirements('near a school').near).toBeNull();
    expect(nearestSchool({})).toBeUndefined();
  });

  it("lets the Claude reader's school names resolve", () => {
    expect(landmarkNamed('KICS')?.name).toBe('Kigali International Community School');
    expect(landmarkNamed('Ecole Belge')?.name).toBe('École Belge de Kigali');
    expect(landmarkNamed('Lycée de Kigali')?.name).toBe('Lycée de Kigali');
    expect(landmarkNamed('the french school')?.name).toBe('École Française Antoine de Saint-Exupéry');
    expect(landmarkNamed('المطار')?.name).toBe('Kigali International Airport');
    expect(landmarkNamed('مدرسة')).toBeUndefined();
    expect(SCHOOLS.length).toBeGreaterThanOrEqual(18);
    for (const s of SCHOOLS) expect(s.lat > -2.1 && s.lat < -1.85 && s.lng > 29.95 && s.lng < 30.25).toBe(true);
  });
});
