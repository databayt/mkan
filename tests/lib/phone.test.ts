import { describe, expect, it } from 'vitest';
import { normalizePhone, phoneCountry, phonesFromTwenty, twentyPhones } from '@/lib/phone';

describe('normalizePhone', () => {
  it.each([
    ['0788 123 456', 'RW', '+250788123456'],
    ['+250 788-123-456', null, '+250788123456'],
    ['00250788123456', 'SD', '+250788123456'], // explicit code beats the hint
    ['0912310205', 'SD', '+249912310205'],
    ['+249 91 231 0205', 'RW', '+249912310205'],
    ['٠٩١٢٣١٠٢٠٥', 'SD', '+249912310205'],
    ['788123456', null, '+250788123456'], // only fits Rwanda
    ['912310205', null, '+249912310205'], // only fits Sudan
  ] as const)('%s (%s) → %s', (raw, hint, want) => expect(normalizePhone(raw, hint)).toBe(want));

  it.each([
    ['', 'RW'],
    ['12345', 'RW'],
    ['0790244', 'RW'], // partial number
    ['+24903467930', null], // stray 0 after the calling code
    ['+971501234567', null],
  ] as const)('rejects %s', (raw, hint) => expect(normalizePhone(raw, hint)).toBeNull());
});

describe('Twenty composites', () => {
  it('splits by the number’s own country', () => {
    expect(twentyPhones('+250788123456', ['+249912310205'])).toEqual({
      primaryPhoneNumber: '788123456',
      primaryPhoneCountryCode: 'RW',
      primaryPhoneCallingCode: '+250',
      additionalPhones: [{ number: '912310205', countryCode: 'SD', callingCode: '+249' }],
    });
    expect(twentyPhones(null)).toBeUndefined();
  });

  it('reads the calling code back, never the bare national part', () => {
    expect(
      phonesFromTwenty({
        primaryPhoneNumber: '788123456',
        primaryPhoneCallingCode: '+250',
        additionalPhones: [{ number: '0912310205', countryCode: 'SD' }],
      }),
    ).toEqual(['+250788123456', '+249912310205']);
    expect(phonesFromTwenty({ primaryPhoneNumber: '788123456' }, 'RW')).toEqual(['+250788123456']);
    expect(phoneCountry('+250788123456')).toBe('RW');
  });
});
