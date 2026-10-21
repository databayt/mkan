/**
 * The model writes the words; the guard decides whether anyone sees them.
 * No API calls — the writer's output is written by hand.
 */
import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ db: {} }));
import { allowedNumbers, asciiDigits, describeSearch, guardText, writerFacts } from '@/components/agent/writer';
import { EMPTY_REQUIREMENTS } from '@/components/agent/requirements';
import type { ShortlistItem } from '@/components/agent/types';

const allowed = allowedNumbers({ bedrooms: 2, km: '1.2 km from Kigali Heights', count: 6 });
const ok = (text: string, over: Partial<Parameters<typeof guardText>[1]> = {}) =>
  guardText(text, { allowed, maxLen: 200, lang: 'en', anyConfirmed: false, ...over });

describe('the guard', () => {
  it('lets through words built from the facts', () => {
    expect(ok('I found 6 homes in Kicukiro; the first is 1.2 km from Kigali Heights and has 2 bedrooms.')).toBeTruthy();
  });

  it('refuses a number the facts do not hold — in any digits', () => {
    expect(ok('It has 3 bedrooms.')).toBeNull();
    expect(asciiDigits('٣ غرف')).toBe('3 غرف');
    expect(ok('فيه ٣ غرف', { lang: 'ar' })).toBeNull();
    expect(ok('فيه ٢ غرف', { lang: 'ar' })).toBeTruthy();
  });

  it('refuses any price or currency: the cards show prices', () => {
    expect(ok('A good deal at RWF 2 a month')).toBeNull();
    expect(ok('Under $6 a night')).toBeNull();
  });

  it('never calls a home available unless a broker confirmed', () => {
    expect(ok('This one is available now.')).toBeNull();
    expect(ok('This one is available now.', { anyConfirmed: true })).toBeTruthy();
    expect(ok('هذا المنزل متاح', { lang: 'ar' })).toBeNull();
  });

  it('wants the tenant\'s script, and a short line', () => {
    expect(ok('A quiet home near your work.', { lang: 'ar' })).toBeNull();
    expect(ok('منزل هادئ قرب عملك', { lang: 'en' })).toBeNull();
    expect(ok('x'.repeat(201))).toBeNull();
  });

  it('reads 1,200 as one number on both sides', () => {
    expect(allowedNumbers('a viewing fee of about RWF 5,000').has('5000')).toBe(true);
    expect(guardText('The viewing fee is about RWF 5,000.', { allowed: allowedNumbers('RWF 5,000'), maxLen: 200, lang: 'en', anyConfirmed: false, allowMoney: true })).toBeTruthy();
  });
});

describe('facts for the writer', () => {
  it('says the search in plain words, with no money and no dates', () => {
    const search = describeSearch({ ...EMPTY_REQUIREMENTS, stay: 'long', district: 'KICUKIRO', bedrooms: 2, maxPrice: 500_000, pricePeriod: 'month', mustHaves: ['parking', 'waterTank'], moveIn: '2026-11-01' });
    expect(search).toEqual(['monthly rent', 'Kicukiro district', '2 bedrooms', 'within their budget', 'must have parking, a water tank']);
    expect(search.join(' ')).not.toMatch(/500|2026/);
  });

  it('gives each card a ref and only its facts', () => {
    const item = { id: 9, title: '2-bedroom in Niboye', district: 'KICUKIRO', bedrooms: 2, bathrooms: 1, cost: { headline: 450_000, period: 'month' }, reasons: ['typicalPrice', 'inBudget'], availability: 'unconfirmed', mustHaves: { matched: ['parking'], unknown: ['waterTank'] }, place: { name: 'Kigali Heights', km: 2.4 }, lead: { handle: 'x', sourceUrl: null } } as unknown as ShortlistItem;
    const facts = writerFacts({ lang: 'ar', requirements: { ...EMPTY_REQUIREMENTS, stay: 'long' }, relaxed: [{ key: 'budget', to: 650_000 }], shortlist: [item], refine: 'maxPrice' });
    expect(facts.homes[0]).toMatchObject({ ref: 'h1', has: ['parking'], askBroker: ['a water tank'], distance: '2.4 km from Kigali Heights', typicalPrice: true, inBudget: true, brokerHome: true, confirmed: false });
    expect(facts.widened).toEqual(['a slightly higher budget']);
    expect(facts.followUp).toBe('the budget');
    expect(JSON.stringify(facts)).not.toMatch(/450|650/);
  });
});
