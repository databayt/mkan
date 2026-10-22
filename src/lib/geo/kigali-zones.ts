/**
 * Kigali zones — the one tree every Kigali place name and pin resolves into:
 * district → sector (umurenge) → neighbourhood (the names renters use).
 *
 * Before this file there were two neighbourhood lists that disagreed
 * (rwanda-places.ts and agent/areas.ts), the 35 sectors were private, and the
 * CRM knew only the three districts. Both files now derive from this tree, the
 * mirror pins a lead at its neighbourhood instead of its district's centre,
 * and the Twenty `zone` object is seeded from it (crm:zones).
 *
 * Coordinates are approximate (a sector or cell centre to ~300 m), like the
 * rest of the gazetteer. Slugs are paths — `gasabo`, `gasabo/remera`,
 * `gasabo/remera/nyarutarama` — so the parent is in the key.
 */

export type KigaliDistrict = "GASABO" | "KICUKIRO" | "NYARUGENGE";
export type ZoneLevel = "district" | "sector" | "neighbourhood";

export interface KigaliZone {
  slug: string;
  level: ZoneLevel;
  district: KigaliDistrict;
  /** The sector slug for a neighbourhood; the district slug for a sector. */
  parent: string | null;
  nameEn: string;
  nameAr: string;
  nameRw: string;
  lat: number;
  lng: number;
  /** How far from the centre still counts as "in" this zone. */
  radiusKm: number;
  /** Other spellings people write. Matched case- and accent-insensitively. */
  aliases: string[];
  /** Offered as a neighbourhood choice in the agent (wizard chips, the reader's list). */
  popular?: boolean;
}

type D = [KigaliDistrict, string, string, number, number];
const DISTRICT_ROWS: D[] = [
  ["NYARUGENGE", "Nyarugenge", "نياروغينغي", -1.9601, 30.043],
  ["GASABO", "Gasabo", "غاسابو", -1.896, 30.112],
  ["KICUKIRO", "Kicukiro", "كيتشوكيرو", -1.99, 30.11],
];

/** [name, district, ar, lat, lng, aliases, popular] */
type S = [string, KigaliDistrict, string, number, number, string[]?, boolean?];
const SECTOR_ROWS: S[] = [
  ["Gitega", "NYARUGENGE", "غيتيغا", -1.96, 30.055],
  ["Kanyinya", "NYARUGENGE", "كانيينيا", -1.93, 30.01],
  // "Kigali" is also the city: the sector is matched only by its alias.
  ["Kigali", "NYARUGENGE", "كيغالي", -1.955, 30.02, ["kigali sector", "umurenge wa kigali"]],
  ["Kimisagara", "NYARUGENGE", "كيميساغارا", -1.959, 30.043],
  ["Mageragere", "NYARUGENGE", "ماغيراغيري", -2.03, 30.02],
  ["Muhima", "NYARUGENGE", "موهيما", -1.942, 30.056, [], true],
  ["Nyakabanda", "NYARUGENGE", "نياكابندا", -1.968, 30.045],
  ["Nyamirambo", "NYARUGENGE", "نياميرامبو", -1.98, 30.04, [], true],
  // Likewise the district: "Nyarugenge" alone means the district.
  ["Nyarugenge", "NYARUGENGE", "نياروغينغي", -1.95, 30.06, ["nyarugenge sector", "town", "mu mujyi"]],
  ["Rwezamenyo", "NYARUGENGE", "رويزامينيو", -1.972, 30.05],
  ["Bumbogo", "GASABO", "بومبوغو", -1.89, 30.15],
  ["Gatsata", "GASABO", "غاتساتا", -1.92, 30.055],
  ["Gikomero", "GASABO", "غيكوميرو", -1.86, 30.17],
  ["Gisozi", "GASABO", "غيسوزي", -1.921, 30.068, [], true],
  ["Jabana", "GASABO", "جابانا", -1.89, 30.05],
  ["Jali", "GASABO", "جالي", -1.88, 30.0],
  ["Kacyiru", "GASABO", "كاتشيرو", -1.938, 30.083, ["kaciyiru"], true],
  ["Kimihurura", "GASABO", "كيميهورورا", -1.95, 30.09, ["rugando"], true],
  ["Kimironko", "GASABO", "كيميرونكو", -1.935, 30.127, [], true],
  ["Kinyinya", "GASABO", "كينيينيا", -1.905, 30.1, [], true],
  ["Ndera", "GASABO", "نديرا", -1.93, 30.17],
  ["Nduba", "GASABO", "ندوبا", -1.87, 30.1],
  ["Remera", "GASABO", "ريميرا", -1.955, 30.11, ["giporoso"], true],
  ["Rusororo", "GASABO", "روسورورو", -1.95, 30.18],
  ["Rutunga", "GASABO", "روتونغا", -1.82, 30.13],
  ["Gahanga", "KICUKIRO", "غاهانغا", -2.03, 30.1],
  ["Gatenga", "KICUKIRO", "غاتينغا", -1.99, 30.085],
  ["Gikondo", "KICUKIRO", "غيكوندو", -1.975, 30.075, [], true],
  ["Kagarama", "KICUKIRO", "كاغاراما", -1.995, 30.11, [], true],
  ["Kanombe", "KICUKIRO", "كانومبي", -1.97, 30.145, [], true],
  // "Kicukiro" alone means the district; the sector is "Kicukiro centre".
  ["Kicukiro", "KICUKIRO", "كيتشوكيرو", -1.975, 30.103, ["kicukiro centre", "kicukiro center", "centre kicukiro", "kicukiro sector"], true],
  ["Kigarama", "KICUKIRO", "كيغاراما", -1.988, 30.095],
  ["Masaka", "KICUKIRO", "ماساكا", -1.995, 30.19],
  ["Niboye", "KICUKIRO", "نيبويي", -1.98, 30.115, ["niboyi"], true],
  ["Nyarugunga", "KICUKIRO", "نياروغونغا", -1.965, 30.13],
];

/** [name, sector, ar, lat, lng, aliases, popular] — cells and estates people name. */
type N = [string, string, string, number, number, string[]?, boolean?];
const NEIGHBOURHOOD_ROWS: N[] = [
  ["Nyarutarama", "Remera", "نياروتاراما", -1.935, 30.103, [], true],
  ["Gishushu", "Remera", "غيشوشو", -1.948, 30.1],
  ["Kisimenti", "Remera", "كيسيمينتي", -1.954, 30.105],
  ["Kibagabaga", "Kimironko", "كيباغاباغا", -1.925, 30.115, [], true],
  ["Zindiro", "Kimironko", "زينديرو", -1.92, 30.135],
  ["Gacuriro", "Kinyinya", "غاتشوريرو", -1.912, 30.095, ["vision city"], true],
  ["Kagugu", "Kinyinya", "كاغوغو", -1.905, 30.085],
  ["Batsinda", "Kinyinya", "باتسيندا", -1.9, 30.07],
  ["Kabuga", "Rusororo", "كابوغا", -1.97, 30.22],
  ["Kiyovu", "Nyarugenge", "كيوفو", -1.95, 30.065, [], true],
  ["Biryogo", "Nyarugenge", "بيريوغو", -1.97, 30.052],
  ["Norvège", "Kigali", "نورفيج", -1.965, 30.03, ["norvege", "norway"]],
  ["Kabeza", "Kanombe", "كابيزا", -1.965, 30.135],
  ["Busanza", "Kanombe", "بوسانزا", -1.985, 30.14],
  ["Sonatubes", "Niboye", "سوناتوبس", -1.97, 30.105, ["sonatube"]],
  // Rebero hill spans Kigarama and Nyarugenge; renters mean the Kicukiro side.
  ["Rebero", "Kigarama", "ريبيرو", -1.995, 30.075, [], true],
];

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function build(): KigaliZone[] {
  const out: KigaliZone[] = [];
  for (const [code, en, ar, lat, lng] of DISTRICT_ROWS) {
    out.push({ slug: slugify(en), level: "district", district: code, parent: null, nameEn: en, nameAr: ar, nameRw: en, lat, lng, radiusKm: 8, aliases: [] });
  }
  const sectorSlug = new Map<string, string>();
  for (const [en, district, ar, lat, lng, aliases = [], popular] of SECTOR_ROWS) {
    const parent = slugify(DISTRICT_ROWS.find((d) => d[0] === district)![1]);
    const slug = `${parent}/${slugify(en)}`;
    sectorSlug.set(en, slug);
    out.push({ slug, level: "sector", district, parent, nameEn: en, nameAr: ar, nameRw: en, lat, lng, radiusKm: 1.8, aliases, popular });
  }
  for (const [en, sector, ar, lat, lng, aliases = [], popular] of NEIGHBOURHOOD_ROWS) {
    const parent = sectorSlug.get(sector)!;
    const district = SECTOR_ROWS.find((s) => s[0] === sector)![1];
    out.push({ slug: `${parent}/${slugify(en)}`, level: "neighbourhood", district, parent, nameEn: en, nameAr: ar, nameRw: en, lat, lng, radiusKm: 1.2, aliases, popular });
  }
  return out;
}

export const KIGALI_ZONES: KigaliZone[] = build();
export const KIGALI_ZONE_BY_SLUG = new Map(KIGALI_ZONES.map((z) => [z.slug, z]));

export const zonesAt = (level: ZoneLevel) => KIGALI_ZONES.filter((z) => z.level === level);
export const districtZone = (code: KigaliDistrict) => KIGALI_ZONES.find((z) => z.level === "district" && z.district === code)!;

/** A sector or district name that is also a broader place: matched by alias only. */
const ALIAS_ONLY = new Set(["nyarugenge/kigali", "nyarugenge/nyarugenge", "kicukiro/kicukiro"]);

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const named = (text: string, name: string) => new RegExp(`(^|[^a-z])${fold(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`).test(text);

function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** The most specific zone a piece of text names, or undefined. Neighbourhood beats sector beats district. */
export function zoneNamed(text: string | null | undefined): KigaliZone | undefined {
  if (!text) return undefined;
  const s = fold(text);
  for (const level of ["neighbourhood", "sector", "district"] as const) {
    const hit = KIGALI_ZONES.find(
      (z) => z.level === level && ((!ALIAS_ONLY.has(z.slug) && named(s, z.nameEn)) || z.aliases.some((a) => named(s, a)) || (z.nameAr && text.includes(z.nameAr))),
    );
    if (hit) return hit;
  }
  return undefined;
}

/** The zone a real pin falls in: a neighbourhood within its radius, else the nearest sector. */
export function zoneAt(lat: number, lng: number): KigaliZone {
  let hood: KigaliZone | undefined;
  let hoodKm = Infinity;
  let sector = KIGALI_ZONES.find((z) => z.level === "sector")!;
  let sectorKm = Infinity;
  for (const z of KIGALI_ZONES) {
    if (z.level === "district") continue;
    const km = haversineKm(lat, lng, z.lat, z.lng);
    if (z.level === "neighbourhood" && km <= z.radiusKm && km < hoodKm) [hood, hoodKm] = [z, km];
    if (z.level === "sector" && km < sectorKm) [sector, sectorKm] = [z, km];
  }
  return hood ?? sector;
}

export interface ResolvedZone {
  district: KigaliDistrict;
  /** Sector slug, when known. */
  sector: string | null;
  /** Neighbourhood slug, when known. */
  neighbourhood: string | null;
  /** The most specific zone found. */
  zone: KigaliZone;
}

const resolved = (z: KigaliZone): ResolvedZone => ({
  district: z.district,
  sector: z.level === "sector" ? z.slug : z.level === "neighbourhood" ? z.parent : null,
  neighbourhood: z.level === "neighbourhood" ? z.slug : null,
  zone: z,
});

/**
 * Text first (a caption naming "Kibagabaga" is better than a district-centre
 * pin), then the pin when it is real — and a real pin beats text that names
 * only the district it lies in. Null when neither places it in Kigali.
 */
export function resolveZone(at: { text?: string | null; lat?: number | null; lng?: number | null; pinIsReal?: boolean }): ResolvedZone | null {
  const byName = zoneNamed(at.text);
  const real = at.pinIsReal !== false && at.lat != null && at.lng != null && Number.isFinite(at.lat) && Number.isFinite(at.lng);
  const byPin = real ? zoneAt(at.lat!, at.lng!) : undefined;
  // "Kicukiro, Kigali" names only a district: a real pin inside it says more.
  if (byName && !(byName.level === "district" && byPin?.district === byName.district)) return resolved(byName);
  return byPin ? resolved(byPin) : null;
}

export function zoneLabel(slug: string | null | undefined, lang: "en" | "ar" | "rw" = "en"): string | null {
  const z = slug ? KIGALI_ZONE_BY_SLUG.get(slug) : undefined;
  if (!z) return null;
  return lang === "ar" ? z.nameAr : lang === "rw" ? z.nameRw : z.nameEn;
}

/** Every zone slug at or under `slug` (a district holds its sectors and their neighbourhoods). */
export function zoneWithin(slug: string, candidate: string | null | undefined): boolean {
  return !!candidate && (candidate === slug || candidate.startsWith(`${slug}/`));
}
