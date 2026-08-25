/**
 * Pure core of the Slack `#mkan` intake lane — no I/O, fully tested.
 * Digit + phone normalisation, the reader's result schema, vocabulary
 * enforcement, the gap list, completeness, code minting, and the reply text.
 *
 * The lane is documented at kun.databayt.org/docs/home; the design rule that
 * governs this file: the words are the scout's, the record is a mirror of them,
 * and nothing here guesses.
 */
import { z } from 'zod';
import { deriveChecks } from './trust-score';
import type { Vocab } from './home-intake-prompt';

// ── digits + phones ──────────────────────────────────────────────────────────
const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

/** ٠٩١٢ → 0912. Leaves everything else untouched. */
export function toAsciiDigits(s: string): string {
  let out = '';
  for (const ch of s) {
    const a = ARABIC_INDIC.indexOf(ch);
    const p = PERSIAN.indexOf(ch);
    out += a >= 0 ? String(a) : p >= 0 ? String(p) : ch;
  }
  return out;
}

/**
 * A Sudanese mobile in any of the ways people write it → `+2499XXXXXXXX`.
 * 09xxxxxxxx · 9xxxxxxxx · +249 9x… · 00249 9x… · with spaces/dashes.
 * Returns null when the digits do not make a Sudanese mobile.
 */
export function normalizeSudanPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = toAsciiDigits(raw).replace(/[^\d]/g, '');
  if (d.startsWith('00249')) d = d.slice(5);
  else if (d.startsWith('249')) d = d.slice(3);
  else if (d.startsWith('0')) d = d.slice(1);
  // Sudanese mobiles: 9 digits, leading 9 (Zain/MTN/Sudani: 91,92,99,90,96,…) or 1 (Sudani 12x)
  if (!/^[19]\d{8}$/.test(d)) return null;
  return `+249${d}`;
}

/** Candidate phone runs inside free text (≥9 digits allowing spaces/dashes). */
export function phonesInText(text: string): string[] {
  const ascii = toAsciiDigits(text);
  const found = ascii.match(/(?:\+|00)?\d[\d\s-]{7,}\d/g) ?? [];
  const out: string[] = [];
  for (const f of found) {
    const n = normalizeSudanPhone(f);
    if (n && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Twenty PHONES composite for a normalised `+249…` number. */
export function phonesComposite(e164: string | null | undefined) {
  if (!e164) return undefined;
  return {
    primaryPhoneNumber: e164.replace(/^\+?249/, ''),
    primaryPhoneCountryCode: 'SD',
    primaryPhoneCallingCode: '+249',
    additionalPhones: [],
  };
}

// ── the reader's result ──────────────────────────────────────────────────────
const nullableStr = z.string().nullable().optional().transform((v) => (v && v.trim() ? v.trim() : null));
const nullableNum = z
  .union([z.number(), z.string()])
  .nullable()
  .optional()
  .transform((v) => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : Number(toAsciiDigits(String(v)).replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : null;
  });
const strList = z.array(z.string()).optional().transform((v) => (v ?? []).map((s) => s.trim()).filter(Boolean));

export const unitSchema = z.object({
  index: z.number().int().positive().optional().default(1),
  titleAr: nullableStr,
  descriptionAr: nullableStr,
  propertyType: nullableStr,
  bedrooms: nullableNum,
  bathrooms: nullableNum,
  beds: nullableNum,
  guestCapacity: nullableNum,
  priceNightSdg: nullableNum,
  priceNote: nullableStr,
  priceConfirmed: z.boolean().optional().default(false),
  amenities: strList,
  highlights: strList,
  rawWords: strList,
});
export type Unit = z.infer<typeof unitSchema>;

export const intakeResultSchema = z.object({
  kind: z.enum(['homes', 'update', 'not_home', 'reject']),
  language: z.enum(['ar', 'en']).optional().default('ar'),
  host: z
    .object({ name: nullableStr, phone: nullableStr, whatsapp: nullableStr })
    .optional()
    .default({ name: null, phone: null, whatsapp: null }),
  area: z
    .object({ zone: nullableStr, city: nullableStr, mapsUrl: nullableStr, addressText: nullableStr })
    .optional()
    .default({ zone: null, city: null, mapsUrl: null, addressText: null }),
  units: z.array(unitSchema).optional().default([]),
  leftover: nullableStr,
});
export type IntakeResult = z.infer<typeof intakeResultSchema>;

/** The model's text → the first JSON object in it. Tolerates ```json fences and prose around it. */
export function extractJsonObject(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in the reader output');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Parse + validate the reader output. Throws with the zod message on a bad shape. */
export function parseIntakeResult(text: string): IntakeResult {
  const parsed = intakeResultSchema.safeParse(extractJsonObject(text));
  if (!parsed.success) throw new Error(`reader output failed validation: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return parsed.data;
}

/**
 * Never let a value the CRM does not know reach the CRM. Unknown zone/city/
 * type become null (the words survive in addressText / rawWords); unknown
 * amenities and highlights move to rawWords. Phones are re-normalised here so
 * the model's formatting never matters.
 */
export function enforceVocab(r: IntakeResult, vocab: Vocab): IntakeResult {
  const has = (list: string[], v: string | null) => (v && list.includes(v) ? v : null);
  const area = { ...r.area };
  const zoneIn = area.zone;
  area.zone = has(vocab.zones, area.zone);
  if (zoneIn && !area.zone) area.addressText = [area.addressText, zoneIn].filter(Boolean).join(' · ');
  area.city = has(vocab.cities, area.city);
  const host = {
    ...r.host,
    phone: normalizeSudanPhone(r.host.phone) ?? (r.host.phone ? null : null),
    whatsapp: normalizeSudanPhone(r.host.whatsapp),
  };
  const units = r.units.map((u) => {
    const raw = [...u.rawWords];
    const amenities = u.amenities.filter((a) => (vocab.amenities.includes(a) ? true : (raw.push(a), false)));
    const highlights = u.highlights.filter((h) => (vocab.highlights.includes(h) ? true : (raw.push(h), false)));
    const propertyType = has(vocab.propertyTypes, u.propertyType);
    if (u.propertyType && !propertyType) raw.push(u.propertyType);
    return { ...u, amenities, highlights, propertyType, rawWords: [...new Set(raw)] };
  });
  return { ...r, host, area, units };
}

// ── the level ────────────────────────────────────────────────────────────────
export interface HomeFacts {
  titleAr: string | null;
  descriptionAr: string | null;
  propertyType: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  beds: number | null;
  guestCapacity: number | null;
  priceNightSdg: number | null;
  priceConfirmed: boolean;
  zone: string | null;
  mapsUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  hostPhone: string | null;
  amenities: string[];
  rawWords: string[];
  photoCount: number;
}

export interface Gap {
  key: string;
  ar: string;
  en: string;
}

/** The site's publish floor + a phone. Photos are a nice-to-have on purpose (docs/home → The level). */
export function mustGaps(f: HomeFacts): Gap[] {
  const g: Gap[] = [];
  if (!f.titleAr) g.push({ key: 'title', ar: 'اسم قصير للوحدة', en: 'a title' });
  if (!f.descriptionAr) g.push({ key: 'description', ar: 'وصف بجملة أو جملتين', en: 'a description' });
  if (f.priceNightSdg == null) g.push({ key: 'price', ar: 'سعر الليلة بالجنيه', en: 'price per night (SDG)' });
  if (!f.propertyType) g.push({ key: 'propertyType', ar: 'النوع: شقة / فيلا / استوديو', en: 'type: apartment / villa / studio' });
  if (f.bedrooms == null) g.push({ key: 'bedrooms', ar: 'عدد الغرف', en: 'bedrooms' });
  if (f.bathrooms == null) g.push({ key: 'bathrooms', ar: 'عدد الحمامات', en: 'bathrooms' });
  if (!f.zone && !f.mapsUrl && !(f.latitude != null && f.longitude != null)) g.push({ key: 'place', ar: 'الحي أو رابط الخريطة', en: 'the neighbourhood or a map link' });
  if (!f.hostPhone) g.push({ key: 'phone', ar: 'رقم المضيف', en: 'the host phone' });
  return g;
}

export function niceGaps(f: HomeFacts): Gap[] {
  const g: Gap[] = [];
  if (f.photoCount < 3) g.push({ key: 'photos', ar: 'صور (٣ أو أكثر)', en: 'photos (3+)' });
  if (f.beds == null) g.push({ key: 'beds', ar: 'عدد الأسرّة', en: 'beds' });
  if (f.guestCapacity == null) g.push({ key: 'guests', ar: 'عدد الضيوف', en: 'guests' });
  if (f.amenities.length < 5) g.push({ key: 'amenities', ar: 'المرافق (٥ أو أكثر)', en: 'amenities (5+)' });
  return g;
}

/** Same rubric the trust scorer uses, so no two scripts disagree about a home's number. */
export function completenessPct(f: HomeFacts): number {
  const checks = deriveChecks(
    {
      title: f.titleAr,
      description: f.descriptionAr,
      bedrooms: f.bedrooms,
      beds: f.beds,
      bathrooms: f.bathrooms,
      guestCapacity: f.guestCapacity,
      latitude: f.latitude,
      longitude: f.longitude,
      amenitiesRaw: [...f.amenities, ...f.rawWords],
      photoCount: f.photoCount,
      priceNightSdg: f.priceNightSdg,
      priceConfirmedByHost: f.priceConfirmed,
    },
    undefined,
    { medianPrice: null, isDuplicate: false },
  );
  return checks.dataCompletenessPct;
}

/** Eligible = every must-have present AND the price confirmed with the host. */
export function isEligible(f: HomeFacts): boolean {
  return mustGaps(f).length === 0 && f.priceConfirmed;
}

// ── identity ─────────────────────────────────────────────────────────────────
const MANUAL_MAX = 1000;

/** Next free manual account (0001–1000); scraped hosts live at 1001+. */
export function nextManualAccount(existing: Iterable<string | null | undefined>): string {
  let max = 0;
  for (const a of existing) {
    if (!a || !/^\d{4}$/.test(a)) continue;
    const n = Number(a);
    if (n >= 1 && n <= MANUAL_MAX && n > max) max = n;
  }
  const next = max + 1;
  if (next > MANUAL_MAX) throw new Error('manual account range 0001–1000 is exhausted');
  return String(next).padStart(4, '0');
}

/** Next unit code under an account, scanning every code already taken (CRM + site). */
export function nextListingCode(account: string, taken: Iterable<string | null | undefined>, offset = 0): string {
  let max = 0;
  for (const c of taken) {
    if (!c) continue;
    const m = /^(\d{4})-(\d{2})$/.exec(c);
    if (m && m[1] === account) max = Math.max(max, Number(m[2]));
  }
  const unit = max + 1 + offset;
  if (unit > 99) throw new Error(`account ${account} has no free unit slot`);
  return `${account}-${String(unit).padStart(2, '0')}`;
}

// ── commands typed by a human ────────────────────────────────────────────────
export function parseLiveCommand(text: string): { live: true; code: string | null } | null {
  const t = toAsciiDigits(text).trim();
  const m = /^(?:live|publish|انشر|نشر)(?![\p{L}\p{N}])\s*(\d{4}-\d{2})?/iu.exec(t);
  if (!m) return null;
  return { live: true, code: m[1] ?? null };
}

export function saysPriceConfirmed(text: string): boolean {
  return /السعر\s*مؤكد|سعر\s*مؤكد|price\s*(?:is\s*)?confirmed|confirmed\s*(?:the\s*)?price|agreed/iu.test(text);
}

// ── the reply ────────────────────────────────────────────────────────────────
export interface ReplyUnit {
  code: string | null;
  recordUrl: string | null;
  facts: HomeFacts;
}

const fmtPrice = (n: number | null) => (n == null ? null : `${Math.round(n).toLocaleString('en-US')} SDG`);

/** One thread reply for the whole message — Arabic first, English mirrored, Slack mrkdwn. */
export function buildReply(opts: { hostName: string | null; hostPhone: string | null; units: ReplyUnit[]; promptVersion: string; dryRun?: boolean }): string {
  const out: string[] = [];
  const hostLine = [opts.hostName, opts.hostPhone].filter(Boolean).join(' · ');
  out.push(`${opts.dryRun ? '🧪 *تجربة — لم يُكتب شيء* / dry run\n' : ''}🏠 ${opts.units.length > 1 ? `${opts.units.length} وحدات` : 'وحدة واحدة'}${hostLine ? ` — ${hostLine}` : ''}`);
  for (const u of opts.units) {
    const f = u.facts;
    const got: string[] = [];
    if (f.propertyType) got.push(f.propertyType.toLowerCase());
    if (f.bedrooms != null) got.push(`${f.bedrooms} غرف / bd`);
    if (f.bathrooms != null) got.push(`${f.bathrooms} حمام / ba`);
    if (f.priceNightSdg != null) got.push(`${fmtPrice(f.priceNightSdg)}/night${f.priceConfirmed ? ' ✔ مؤكد' : ''}`);
    if (f.zone) got.push(f.zone.toLowerCase().replace(/_/g, ' '));
    if (f.amenities.length) got.push(f.amenities.map((a) => a.toLowerCase().replace(/_/g, ' ')).join(', '));
    const musts = mustGaps(f);
    const nice = niceGaps(f);
    const pct = completenessPct(f);
    const head = `*${u.code ?? '—'}*${f.titleAr ? ` ${f.titleAr}` : ''}${u.recordUrl ? ` · <${u.recordUrl}|Twenty>` : ''} · ${pct}%`;
    out.push('', head, `فهمت / got: ${got.length ? got.join(' · ') : '—'}`);
    if (f.rawWords.length) out.push(`كلمات محفوظة / kept as notes: ${f.rawWords.join('، ')}`);
    if (musts.length) {
      out.push(`ناقص للنشر / missing before live: ${musts.map((g) => g.ar).join('، ')}`, `(${musts.map((g) => g.en).join(', ')})`);
    } else if (!f.priceConfirmed) {
      out.push('كل الأساسيات موجودة — أكّد السعر مع المضيف واكتب «السعر مؤكد» / all must-haves in — confirm the price with the host and write "price confirmed"');
    } else {
      out.push(`✅ مكتمل — اكتب \`live ${u.code ?? ''}\` للنشر / complete — say \`live ${u.code ?? ''}\` to publish`);
    }
    if (nice.length) out.push(`يحسّن الدرجة / nice to have: ${nice.map((g) => g.ar).join('، ')}`);
  }
  out.push('', `_ردّ في هذا الثريد لأي تصحيح أو إضافة · reply in this thread to correct or add · reader ${opts.promptVersion}_`);
  return out.join('\n');
}
