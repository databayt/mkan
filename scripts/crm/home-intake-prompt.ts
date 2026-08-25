/**
 * The reader prompt for the Slack `#mkan` intake lane — the words Abdout types
 * after meeting a host become fields on a Twenty `home`. Documented at
 * kun.databayt.org/docs/home ("What you can write", "It learns your way of writing").
 *
 * FROZEN PER VERSION. Every record stores the version that read it, so a wrong
 * read can always be traced to the prompt that made it. Bump only through
 * `pnpm home:learn`, and only when the whole fixture set is green.
 */

export const INTAKE_PROMPT_VERSION = 'v1';

/** The CRM's own option lists, fetched live and injected so the reader never invents a value. */
export interface Vocab {
  zones: string[];
  cities: string[];
  propertyTypes: string[];
  amenities: string[];
  highlights: string[];
}

/** What the reader is looking at: a fresh channel message, or a reply inside an intake thread. */
export type ReadMode = 'message' | 'reply';

export interface PromptInput {
  text: string;
  vocab: Vocab;
  mode: ReadMode;
  /** For replies: what the record already holds, so the reader returns only what the words change. */
  known?: unknown;
}

const RESULT_SHAPE = `{
  "kind": "homes" | "update" | "not_home" | "reject",
  "language": "ar" | "en",
  "host": { "name": string|null, "phone": string|null, "whatsapp": string|null },
  "area": { "zone": string|null, "city": string|null, "mapsUrl": string|null, "addressText": string|null },
  "units": [
    {
      "index": number,
      "titleAr": string|null,
      "descriptionAr": string|null,
      "propertyType": string|null,
      "bedrooms": number|null,
      "bathrooms": number|null,
      "beds": number|null,
      "guestCapacity": number|null,
      "priceNightSdg": number|null,
      "priceNote": string|null,
      "priceConfirmed": boolean,
      "amenities": string[],
      "highlights": string[],
      "rawWords": string[]
    }
  ],
  "leftover": string|null
}`;

const EXAMPLE_IN = '1. احمد ٠٩١٢٣١٠٢٠٥ الشقة الاولي غرفتين صالة حمام مطبخ';
const EXAMPLE_OUT = `{"kind":"homes","language":"ar","host":{"name":"أحمد","phone":"+249912310205","whatsapp":null},"area":{"zone":null,"city":null,"mapsUrl":null,"addressText":null},"units":[{"index":1,"titleAr":"الشقة الأولى","descriptionAr":null,"propertyType":"APARTMENT","bedrooms":2,"bathrooms":1,"beds":null,"guestCapacity":null,"priceNightSdg":null,"priceNote":null,"priceConfirmed":false,"amenities":["KITCHEN"],"highlights":[],"rawWords":["صالة"]}],"leftover":null}`;

export function buildIntakePrompt(input: PromptInput): string {
  const { text, vocab, mode, known } = input;
  const lines: string[] = [];
  lines.push(
    'You are the intake reader for mkan.sd, a short-stay rental marketplace in Sudan (mostly Port Sudan).',
    'A field scout met a host, asked about their places, and typed notes into Slack — Arabic or English, any order, no form.',
    'Your only job: turn those words into the JSON below. You never invent a fact. Anything not said is null. Anything you cannot map goes into rawWords or leftover, verbatim.',
    '',
    mode === 'reply'
      ? 'MODE: reply inside an existing intake thread. The record below already exists. Return ONLY what these new words add or correct (kind "update"); unchanged fields stay null. If the words say the home is wrong / not a home / cancel, kind is "reject". If the words are unrelated chatter, kind is "not_home".'
      : 'MODE: a fresh channel message. If it describes one or more places for rent (rooms, price, a host, a phone, an area…), kind is "homes". If it is anything else — chatter, a photo drop, a question, a task about photos — kind is "not_home" with empty units.',
    '',
    'RULES',
    '- Digits: Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Persian digits are digits. ٣٠ الف = 30000. "80k" = 80000. "٤٥ الف" = 45000.',
    '- Phone: a Sudanese mobile written as 09XXXXXXXX or 9XXXXXXXX or with +249/00249 becomes "+2499XXXXXXXX" (E.164, 12 digits after the plus). Anything else that looks like a phone: keep digits with a leading + only if a country code was written.',
    '- One host per message. A numbered list, or several clearly different places, means several units under that host: index 1, 2, 3… in the order written. "الشقة الأولى" is unit 1.',
    '- Rooms: غرفة/غرفتين/ثلاث غرف → bedrooms 1/2/3; حمام/حمامين → bathrooms 1/2; صالة/صالتين is a hall — NOT a bedroom — put it in rawWords; مطبخ → amenity KITCHEN; مكيف → AIR_CONDITIONING; واي فاي/انترنت → WI_FI; موقف/جراج → PARKING; ثلاجة → REFRIGERATOR; تلفزيون → TV; غسالة → WASHER_DRYER; مصعد → ELEVATOR; بلكونة/شرفة → PATIO_OR_BALCONY.',
    '- propertyType: شقة/apartment/flat → APARTMENT; فيلا → VILLA; استوديو/studio/غرفة واحدة بحمامها → ROOMS; بيت مستقل/تاون هاوس → TOWNHOUSE; otherwise null.',
    '- Price: a nightly figure in SDG goes to priceNightSdg. Monthly or SAR or unclear → priceNightSdg null and the words in priceNote. priceConfirmed is true only when the words say the price was confirmed/agreed with the host (السعر مؤكد, agreed, confirmed).',
    '- Area applies to all units unless a unit names its own; zone must be one of the ZONES values, city one of the CITIES values — otherwise null and the place words go to area.addressText.',
    '- amenities and highlights must be values from the lists below; unknown comforts (generator, water tank, solar, furnished, floor) go to rawWords.',
    '- titleAr: the unit\'s own short name if the words give one (e.g. الشقة الأولى, استوديو الدور الأرضي); never write marketing copy. descriptionAr: only sentences the scout actually wrote about that unit.',
    '- language: the language most of the message is written in.',
    '',
    `ZONES: ${vocab.zones.join(', ')}`,
    `CITIES: ${vocab.cities.join(', ')}`,
    `PROPERTY TYPES: ${vocab.propertyTypes.join(', ')}`,
    `AMENITIES: ${vocab.amenities.join(', ')}`,
    `HIGHLIGHTS: ${vocab.highlights.join(', ')}`,
    '',
    'OUTPUT — exactly one JSON object of this shape, no prose, no code fences:',
    RESULT_SHAPE,
    '',
    'EXAMPLE',
    `Message: ${EXAMPLE_IN}`,
    `JSON: ${EXAMPLE_OUT}`,
    '',
  );
  if (mode === 'reply' && known !== undefined) {
    lines.push('THE RECORD SO FAR (JSON):', JSON.stringify(known), '');
  }
  lines.push('THE WORDS TO READ:', '<<<', text, '>>>', '', 'JSON:');
  return lines.join('\n');
}
