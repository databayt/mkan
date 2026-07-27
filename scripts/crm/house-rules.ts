/**
 * Airbnb's house-rule strings → mkan's structured house-rule fields.
 *
 * Pure and side-effect free, like `airbnb-parse.ts` and `contact-extract.ts`,
 * so it can be tested against real strings without a browser.
 *
 * ── Why parse rather than store the text ───────────────────────────────────
 *
 * The obvious move is to keep Airbnb's Arabic rule strings and render those.
 * It is the wrong one. mkan's `Listing.houseRules` is a structured JSON column
 * — booleans for pets/events/smoking plus quiet hours and one free-text field —
 * and `checkInTime` / `checkOutTime` are their own columns. Airbnb's rules are
 * machine-generated from exactly that kind of structure ("Check-in after 3:00
 * PM", "No pets", "4 guests maximum"), so parsing them back into fields loses
 * nothing and gains everything: the app renders them from its own dictionary,
 * which is already bilingual and already correct in both languages.
 *
 * Storing the Arabic strings instead would mean mkan showed Airbnb's phrasing
 * on a listing the host now owns, forever untranslatable and uneditable.
 *
 * So this parses the ENGLISH rules — machine-generated and stable — and the
 * Arabic comes free from the dictionary. 44 distinct rules across the Sudan
 * dataset, and every one of them is one of these shapes.
 */

export interface ParsedHouseRules {
  /** "3:00 PM", or null when Airbnb said check-in is flexible. */
  checkInTime: string | null;
  checkOutTime: string | null;
  /** True/false when Airbnb states it; null when it says nothing. */
  petsAllowed: boolean | null;
  eventsAllowed: boolean | null;
  smokingAllowed: boolean | null;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  /** Airbnb's own maximum, which can disagree with the listing's guest count. */
  guestsMaximum: number | null;
  commercialPhotographyAllowed: boolean | null;
  /** mkan's CheckInMethod enum value, when Airbnb names one. */
  checkInMethod: 'SelfCheckIn' | 'InPerson' | 'Lockbox' | 'SmartLock' | null;
  /** Anything that matched no rule above, kept verbatim so nothing is silently lost. */
  additional: string[];
}

const TIME = String.raw`(\d{1,2}(?::\d{2})?\s*(?:AM|PM|am|pm))`;

/**
 * Every rule shape observed in the Sudan dataset, most specific first.
 *
 * Order matters: "No parties or events" has to be tested before any looser
 * events pattern, and the negative forms before the positive ones, or "No
 * pets" would match a bare /pets/ and read as allowed.
 */
const RULES: Array<{ re: RegExp; apply: (m: RegExpMatchArray, out: ParsedHouseRules) => void }> = [
  { re: new RegExp(String.raw`^check-?in\s+after\s+${TIME}`, 'i'), apply: (m, o) => { o.checkInTime = m[1].toUpperCase().replace(/\s+/g, ' '); } },
  // A window — "Check-in: 12:00 PM - 2:00 PM". The opening time is the one
  // that matters to a guest; the close is not a field mkan has.
  { re: new RegExp(String.raw`^check-?in:\s*${TIME}\s*[-–]\s*${TIME}`, 'i'), apply: (m, o) => { o.checkInTime = m[1].toUpperCase().replace(/\s+/g, ' '); } },
  // Lockbox before the generic self-check-in, or the more specific detail is lost.
  { re: /^self check-?in with lockbox/i, apply: (_m, o) => { o.checkInMethod = 'Lockbox'; } },
  { re: /^self check-?in with smart ?lock/i, apply: (_m, o) => { o.checkInMethod = 'SmartLock'; } },
  { re: /^self check-?in/i, apply: (_m, o) => { o.checkInMethod = 'SelfCheckIn'; } },
  { re: /^no commercial photography|^commercial photography is not allowed/i, apply: (_m, o) => { o.commercialPhotographyAllowed = false; } },
  { re: /^commercial photography allowed/i, apply: (_m, o) => { o.commercialPhotographyAllowed = true; } },
  { re: new RegExp(String.raw`^check-?out\s+before\s+${TIME}`, 'i'), apply: (m, o) => { o.checkOutTime = m[1].toUpperCase().replace(/\s+/g, ' '); } },
  // "Flexible check-in" means Airbnb has no fixed time — recording a made-up
  // one would be worse than recording none.
  { re: /^flexible check-?in/i, apply: (_m, o) => { o.checkInTime = null; } },
  { re: /^(\d+)\s+guests?\s+maximum/i, apply: (m, o) => { o.guestsMaximum = parseInt(m[1], 10); } },
  { re: /^no pets/i, apply: (_m, o) => { o.petsAllowed = false; } },
  { re: /^pets allowed/i, apply: (_m, o) => { o.petsAllowed = true; } },
  { re: /^no parties or events|^no parties|^no events/i, apply: (_m, o) => { o.eventsAllowed = false; } },
  { re: /^(?:parties|events) allowed/i, apply: (_m, o) => { o.eventsAllowed = true; } },
  { re: /^no smoking|^smoking is not allowed/i, apply: (_m, o) => { o.smokingAllowed = false; } },
  { re: /^smoking is allowed|^smoking allowed/i, apply: (_m, o) => { o.smokingAllowed = true; } },
  {
    re: new RegExp(String.raw`^quiet hours.*?${TIME}.*?${TIME}`, 'i'),
    apply: (m, o) => { o.quietHoursStart = m[1].toUpperCase(); o.quietHoursEnd = m[2].toUpperCase(); },
  },
];

export function parseHouseRules(rules: readonly string[] | null | undefined): ParsedHouseRules {
  const out: ParsedHouseRules = {
    checkInTime: null,
    checkOutTime: null,
    petsAllowed: null,
    eventsAllowed: null,
    smokingAllowed: null,
    quietHoursStart: null,
    quietHoursEnd: null,
    guestsMaximum: null,
    commercialPhotographyAllowed: null,
    checkInMethod: null,
    additional: [],
  };
  for (const raw of rules ?? []) {
    const rule = String(raw).trim().replace(/\s+/g, ' ');
    if (!rule) continue;
    const hit = RULES.find((r) => r.re.test(rule));
    if (hit) hit.apply(rule.match(hit.re)!, out);
    else out.additional.push(rule);
  }
  return out;
}

/**
 * The `houseRules` JSON exactly as `src/lib/actions/listing-actions.ts`
 * validates it — booleans omitted rather than sent null, since the editor
 * coerces a missing key to false and a null would read as "the host said no".
 */
export function toListingHouseRules(p: ParsedHouseRules): Record<string, unknown> | null {
  const json: Record<string, unknown> = {};
  if (p.petsAllowed !== null) json.petsAllowed = p.petsAllowed;
  if (p.eventsAllowed !== null) json.eventsAllowed = p.eventsAllowed;
  if (p.smokingAllowed !== null) json.smokingAllowed = p.smokingAllowed;
  if (p.commercialPhotographyAllowed !== null) json.commercialPhotographyAllowed = p.commercialPhotographyAllowed;
  if (p.quietHoursStart && p.quietHoursEnd) {
    json.quietHoursEnabled = true;
    json.quietHoursStart = p.quietHoursStart;
    json.quietHoursEnd = p.quietHoursEnd;
  }
  // Whatever did not parse is kept as text rather than dropped. It is the
  // host's own wording, and they can edit it once they claim the listing.
  if (p.additional.length) json.additionalRules = p.additional.join('\n');
  return Object.keys(json).length ? json : null;
}
