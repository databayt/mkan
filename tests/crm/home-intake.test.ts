/**
 * The intake lane's pure core — and the growing fixture set: every correction
 * Abdout makes in a #mkan thread becomes a case here (docs/home → "It learns
 * your way of writing"). Fixtures are anonymised: the repo is public.
 */
import { describe, expect, it } from 'vitest';
import {
  buildReply,
  completenessPct,
  enforceVocab,
  extractJsonObject,
  isEligible,
  mustGaps,
  nextListingCode,
  nextManualAccount,
  normalizeSudanPhone,
  parseIntakeResult,
  parseLiveCommand,
  phonesInText,
  saysPriceConfirmed,
  toAsciiDigits,
  type HomeFacts,
} from '../../scripts/crm/home-intake-pure';
import { INTAKE_PROMPT_VERSION, buildIntakePrompt } from '../../scripts/crm/home-intake-prompt';

const VOCAB = {
  zones: ['AL_THAWRA', 'SALALAB', 'CITY_CENTRE', 'UNKNOWN'],
  cities: ['PORT_SUDAN', 'KHARTOUM'],
  propertyTypes: ['APARTMENT', 'VILLA', 'ROOMS'],
  amenities: ['KITCHEN', 'AIR_CONDITIONING', 'WI_FI', 'PARKING', 'TV'],
  highlights: ['GREAT_VIEW'],
};

const facts = (over: Partial<HomeFacts> = {}): HomeFacts => ({
  titleAr: 'الشقة الأولى',
  descriptionAr: 'شقة غرفتين وصالة في حي الثورة قريبة من المطار، مناسبة للعائلات، مطبخ مجهز وتكييف في كل الغرف وموقف سيارة داخل المنزل.',
  propertyType: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 1,
  beds: null,
  guestCapacity: null,
  priceNightSdg: 30000,
  priceConfirmed: false,
  zone: 'AL_THAWRA',
  mapsUrl: null,
  latitude: null,
  longitude: null,
  hostPhone: '+249912310205',
  amenities: ['KITCHEN'],
  rawWords: ['صالة'],
  photoCount: 0,
  ...over,
});

describe('digits and phones', () => {
  it('reads Arabic-Indic digits as digits', () => {
    expect(toAsciiDigits('٠٩١٢٣١٠٢٠٥')).toBe('0912310205');
    expect(toAsciiDigits('٣٠ الف')).toBe('30 الف');
  });
  it('normalises every way a Sudanese mobile is written', () => {
    for (const s of ['0912310205', '٠٩١٢٣١٠٢٠٥', '912310205', '+249 91 231 0205', '00249912310205', '249-912-310-205']) {
      expect(normalizeSudanPhone(s)).toBe('+249912310205');
    }
    expect(normalizeSudanPhone('12345')).toBeNull();
    expect(normalizeSudanPhone('+971501234567')).toBeNull();
  });
  it('finds the phone inside the scout\'s words', () => {
    expect(phonesInText('1. احمد ٠٩١٢٣١٠٢٠٥ الشقة الاولي غرفتين صالة حمام مطبخ')).toEqual(['+249912310205']);
    expect(phonesInText('Fatima 0912 555 000 — villa in Salalab')).toEqual(['+249912555000']);
  });
});

describe('the reader output', () => {
  it('tolerates fences and prose around the JSON', () => {
    expect(extractJsonObject('Sure:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('parses and normalises a full result', () => {
    const r = parseIntakeResult(
      '{"kind":"homes","language":"ar","host":{"name":"أحمد","phone":"0912310205","whatsapp":null},"area":{"zone":"AL_THAWRA","city":null,"mapsUrl":null,"addressText":null},"units":[{"index":1,"titleAr":"الشقة الأولى","descriptionAr":null,"propertyType":"APARTMENT","bedrooms":"٢","bathrooms":1,"beds":null,"guestCapacity":null,"priceNightSdg":30000,"priceNote":null,"priceConfirmed":false,"amenities":["KITCHEN","GENERATOR"],"highlights":[],"rawWords":["صالة"]}],"leftover":null}',
    );
    expect(r.units[0].bedrooms).toBe(2);
    const v = enforceVocab(r, VOCAB);
    expect(v.host.phone).toBe('+249912310205');
    expect(v.units[0].amenities).toEqual(['KITCHEN']);
    expect(v.units[0].rawWords).toEqual(['صالة', 'GENERATOR']);
  });
  it('drops an unknown zone into the address words instead of inventing one', () => {
    const r = parseIntakeResult('{"kind":"homes","host":{},"area":{"zone":"HAY_ALNOOR","addressText":"قرب الجامعة"},"units":[]}');
    const v = enforceVocab(r, VOCAB);
    expect(v.area.zone).toBeNull();
    expect(v.area.addressText).toBe('قرب الجامعة · HAY_ALNOOR');
  });
  it('rejects a shape that is not the contract', () => {
    expect(() => parseIntakeResult('{"kind":"maybe"}')).toThrow(/validation/);
  });
});

describe('the level', () => {
  it('lists the must-haves that are missing, host phone included', () => {
    const gaps = mustGaps(facts({ priceNightSdg: null, hostPhone: null, zone: null }));
    expect(gaps.map((g) => g.key)).toEqual(['price', 'place', 'phone']);
  });
  it('is eligible only with every must-have and the price confirmed', () => {
    expect(isEligible(facts())).toBe(false);
    expect(isEligible(facts({ priceConfirmed: true }))).toBe(true);
    expect(isEligible(facts({ priceConfirmed: true, bathrooms: null }))).toBe(false);
  });
  it('scores completeness with the trust rubric (10 core fields)', () => {
    // title, description ≥100, bedrooms, bathrooms, price = 5 of 10 → 50
    expect(completenessPct(facts())).toBe(50);
    expect(completenessPct(facts({ beds: 2, guestCapacity: 4, photoCount: 3 }))).toBe(80);
  });
});

describe('identity', () => {
  it('mints the next manual account after 0001–0004, ignoring scraped 1001+', () => {
    expect(nextManualAccount(['0001', '0002', '0003', '0004', '1001', '1008', null])).toBe('0005');
    expect(nextManualAccount([])).toBe('0001');
  });
  it('mints unit codes in order under an account', () => {
    expect(nextListingCode('0005', ['0001-01', '0005-01', '0005-02'])).toBe('0005-03');
    expect(nextListingCode('0006', ['0005-01'])).toBe('0006-01');
  });
  it('counts a number held by a host who has no home yet', () => {
    // homes' `account` and hosts' `mkanUsername` are two halves of one sequence: a host
    // filed today may not carry a home until tomorrow, and reading only one side hands
    // the same number to the next host.
    const homes = ['0001', '0002', '0003', '0004'];
    const hosts = ['0001', '0002', '0003', '0004', '0005'];
    expect(nextManualAccount([...homes, ...hosts])).toBe('0006');
    expect(nextManualAccount(homes)).toBe('0005');
  });
  it('is a sequence, not a fact about the host — a nameless, phoneless host still gets the next number', () => {
    expect(nextManualAccount(['0005'])).toBe('0006');
    expect(nextListingCode('0006', [])).toBe('0006-01');
    expect(nextListingCode('0006', ['0006-01'])).toBe('0006-02');
  });
});

describe('the words a human types back', () => {
  it('reads the live word with or without a code, in either language', () => {
    expect(parseLiveCommand('live 0005-01')).toEqual({ live: true, code: '0005-01' });
    expect(parseLiveCommand('انشر')).toEqual({ live: true, code: null });
    expect(parseLiveCommand('the price is 40k')).toBeNull();
  });
  it('hears a confirmed price', () => {
    expect(saysPriceConfirmed('السعر مؤكد مع المضيف')).toBe(true);
    expect(saysPriceConfirmed('price confirmed')).toBe(true);
    expect(saysPriceConfirmed('السعر ٤٠ الف')).toBe(false);
  });
});

describe('the reply and the prompt', () => {
  it('names what was understood, what is missing, and how to correct it', () => {
    const text = buildReply({ hostName: 'أحمد', hostPhone: '+249912310205', units: [{ code: '0005-01', recordUrl: 'https://mkan.databayt.org/object/home/x', facts: facts({ priceNightSdg: null }) }], promptVersion: INTAKE_PROMPT_VERSION });
    expect(text).toContain('0005-01');
    expect(text).toContain('سعر الليلة');
    expect(text).toContain('price per night');
    expect(text).toContain('reader v1');
  });
  it('carries the CRM vocabulary and the scout\'s words into the prompt', () => {
    const p = buildIntakePrompt({ text: 'احمد ٠٩١٢٣١٠٢٠٥ شقة', vocab: VOCAB, mode: 'message' });
    expect(p).toContain('AL_THAWRA');
    expect(p).toContain('احمد ٠٩١٢٣١٠٢٠٥ شقة');
    expect(p).toContain('MODE: a fresh channel message');
  });
});

describe('crossing to the site', () => {
  it('maps Twenty option names onto the site\'s enum names', async () => {
    const { twentyEnumToPrisma, zoneSlug, liveUrl } = await import('../../scripts/crm/home-intake-pure');
    expect(twentyEnumToPrisma('AIR_CONDITIONING')).toBe('AirConditioning');
    expect(twentyEnumToPrisma('WI_FI')).toBe('WiFi');
    expect(twentyEnumToPrisma('TV')).toBe('TV');
    expect(twentyEnumToPrisma('PATIO_OR_BALCONY')).toBe('PatioOrBalcony');
    expect(twentyEnumToPrisma('APARTMENT')).toBe('Apartment');
    expect(zoneSlug('AL_THAWRA')).toBe('al-thawra');
    expect(liveUrl('0005-01')).toBe('https://mkan.sd/ar/listings/0005-01');
  });
});
