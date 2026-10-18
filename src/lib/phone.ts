/**
 * Phones for both markets — Sudan (+249) and Rwanda (+250) — in one place.
 *
 * Every lane used to carry its own normaliser, and the ones that wrote to
 * Twenty hard-coded `+249`: a Kigali broker synced up from the site came back
 * tagged Sudanese, and the webhook stored Twenty's bare national number
 * (`7881…`) as if it were whole, so `wa.me` links built from it went nowhere.
 * The rule now: E.164 inside mkan, Twenty's split composite only at the edge.
 */

export type PhoneCountry = 'SD' | 'RW';

const CALLING: Record<PhoneCountry, string> = { SD: '249', RW: '250' };

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';
const asciiDigits = (s: string): string =>
  [...s]
    .map((ch) => {
      const a = ARABIC_INDIC.indexOf(ch);
      if (a >= 0) return String(a);
      const p = PERSIAN.indexOf(ch);
      return p >= 0 ? String(p) : ch;
    })
    .join('');

/** National significant number → valid mobile for that country? */
const MOBILE: Record<PhoneCountry, RegExp> = {
  // Zain/MTN/Sudani: 9 digits, leading 9 or 1 (Sudani 12x).
  SD: /^[19]\d{8}$/,
  // MTN 078/079, Airtel 072/073.
  RW: /^7[2389]\d{7}$/,
};

function asCountry(d: string, c: PhoneCountry): string | null {
  return MOBILE[c].test(d) ? `+${CALLING[c]}${d}` : null;
}

/**
 * Any way a person writes a mobile → `+249…` / `+250…`, or null.
 *
 * An explicit calling code wins over the hint, so a `+250` number on a Sudan
 * home stays Rwandan. Without one, the hint decides; with no hint, a number
 * that only fits one country's mobile pattern takes that country.
 */
export function normalizePhone(raw: string | null | undefined, hint?: PhoneCountry | null): string | null {
  if (!raw) return null;
  let d = asciiDigits(raw).replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  for (const c of ['SD', 'RW'] as const) {
    const cc = CALLING[c];
    if (d.startsWith(cc) && d.length === cc.length + 9) return asCountry(d.slice(cc.length), c);
  }
  if (d.startsWith('0')) d = d.slice(1);
  if (hint) return asCountry(d, hint);
  const fits = (['SD', 'RW'] as const).filter((c) => MOBILE[c].test(d));
  const [only] = fits;
  return fits.length === 1 && only ? asCountry(d, only) : null;
}

/** Which market an E.164 number belongs to. */
export function phoneCountry(e164: string | null | undefined): PhoneCountry | null {
  if (!e164) return null;
  if (e164.startsWith('+250')) return 'RW';
  if (e164.startsWith('+249')) return 'SD';
  return null;
}

/** Twenty PHONES composite for a normalised number (undefined when there is none). */
export function twentyPhones(e164: string | null | undefined, additional: string[] = []) {
  const c = phoneCountry(e164);
  if (!e164 || !c) return undefined;
  const split = (n: string) => {
    const cc = phoneCountry(n);
    return cc
      ? { number: n.slice(CALLING[cc].length + 1), countryCode: cc, callingCode: `+${CALLING[cc]}` }
      : null;
  };
  return {
    primaryPhoneNumber: e164.slice(CALLING[c].length + 1),
    primaryPhoneCountryCode: c,
    primaryPhoneCallingCode: `+${CALLING[c]}`,
    additionalPhones: additional
      .map(split)
      .filter((p): p is NonNullable<typeof p> => !!p),
  };
}

interface TwentyPhonesRead {
  primaryPhoneNumber?: string | null;
  primaryPhoneCallingCode?: string | null;
  primaryPhoneCountryCode?: string | null;
  additionalPhones?: { number?: string | null; callingCode?: string | null; countryCode?: string | null }[] | null;
}

/**
 * Every number on a Twenty PHONES composite, normalised. Twenty hands back the
 * national part and the calling code separately — reading only
 * `primaryPhoneNumber` is how calling codes were lost.
 */
export function phonesFromTwenty(p: TwentyPhonesRead | null | undefined, hint?: PhoneCountry | null): string[] {
  if (!p) return [];
  const one = (n?: string | null, cc?: string | null, country?: string | null) => {
    if (!n?.trim()) return null;
    const ctry = country === 'RW' || country === 'SD' ? country : hint;
    return normalizePhone(`${cc ?? ''}${n}`, ctry ?? null) ?? normalizePhone(n, ctry ?? null);
  };
  const out = [
    one(p.primaryPhoneNumber, p.primaryPhoneCallingCode, p.primaryPhoneCountryCode),
    ...(p.additionalPhones ?? []).map((a) => one(a.number, a.callingCode, a.countryCode)),
  ].filter((n): n is string => !!n);
  return [...new Set(out)];
}
