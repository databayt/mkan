/**
 * The facts and the template words of a day's "Today on Mkan" note (2026-11-15). Pure, so the tests read
 * exactly what a visitor gets. The facts are the only source of any number or place in the note: Claude
 * may phrase them (note.ts) and every piece is guarded against them; this template stands in whenever
 * Claude is off, over its cap, or refused by the guard — and it is always the Kinyarwanda note, which
 * stays machine-written until a native speaker reads it (docs/i18n/rw-review-2026-11.csv).
 */
import type { TodayHome } from "@/lib/tt/homes";

export type NoteLang = "en" | "ar" | "rw";

export interface NoteFacts {
  day: string;
  count: number;
  /** Up to 3 areas, in post order, named per language. */
  areas: Record<NoteLang, string[]>;
  /** The monthly rent range in RWF, whole francs; null when no home is priced in RWF. */
  rentMin: number | null;
  rentMax: number | null;
  /** The smallest and largest bedroom count the ads state; null when none does. */
  bedsMin: number | null;
  bedsMax: number | null;
  /** The listing ids, in post order — a note is rewritten only when these change. */
  ids: number[];
}

const MAX_AREAS = 3;

/** Facts from the day's homes. Null for no homes: a day with no post has no note. */
export function noteFacts(day: string, homes: Pick<TodayHome, "id" | "priceMonth" | "currency" | "bedrooms" | "place">[]): NoteFacts | null {
  if (homes.length === 0) return null;
  const areas: NoteFacts["areas"] = { en: [], ar: [], rw: [] };
  for (const lang of ["en", "ar", "rw"] as const) {
    for (const h of homes) {
      const name = h.place[lang];
      if (name && !areas[lang].includes(name) && areas[lang].length < MAX_AREAS) areas[lang].push(name);
    }
  }
  const rents = homes.filter((h) => h.currency === "RWF" && h.priceMonth > 0).map((h) => Math.round(h.priceMonth));
  const beds = homes.map((h) => h.bedrooms).filter((n): n is number => n != null && n >= 0 && n <= 20);
  return {
    day,
    count: homes.length,
    areas,
    rentMin: rents.length ? Math.min(...rents) : null,
    rentMax: rents.length ? Math.max(...rents) : null,
    bedsMin: beds.length ? Math.min(...beds) : null,
    bedsMax: beds.length ? Math.max(...beds) : null,
    ids: homes.map((h) => h.id),
  };
}

const rwf = (n: number) => `RWF ${n.toLocaleString("en-US")}`;

/** "Kimironko, Remera and Kicukiro" in each language. */
function list(names: string[], lang: NoteLang): string {
  if (names.length <= 1) return names[0] ?? "";
  const and = lang === "ar" ? " و" : lang === "rw" ? " na " : " and ";
  return `${names.slice(0, -1).join(lang === "ar" ? "، " : ", ")}${and}${names.at(-1)}`;
}

function homesAr(n: number): string {
  if (n === 1) return "منزل واحد";
  if (n === 2) return "منزلان";
  return n <= 10 ? `${n} منازل` : `${n} منزلاً`;
}

/** The note when no model writes it: the count, the areas, the rent range and the bedrooms — nothing else. */
export function templateNote(f: NoteFacts, lang: NoteLang): string {
  const areas = list(f.areas[lang], lang);
  const range = f.rentMin != null && f.rentMax != null ? (f.rentMin === f.rentMax ? rwf(f.rentMin) : `${rwf(f.rentMin)} – ${rwf(f.rentMax)}`) : null;
  const beds = f.bedsMin != null && f.bedsMax != null ? (f.bedsMin === f.bedsMax ? `${f.bedsMin}` : `${f.bedsMin}–${f.bedsMax}`) : null;
  if (lang === "ar") {
    return [
      `نشرنا اليوم على مكان ${homesAr(f.count)}${areas ? ` في ${areas}` : ""}.`,
      range ? `الإيجار الشهري ${range}.` : null,
      beds ? `عدد الغرف: ${beds}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  if (lang === "rw") {
    return [
      `Uyu munsi twashyize kuri Mkan ${f.count === 1 ? "inzu 1" : `amazu ${f.count}`}${areas ? ` muri ${areas}` : ""}.`,
      range ? `Ubukode ni ${range} ku kwezi.` : null,
      beds ? `Ibyumba: ${beds}.` : null,
    ]
      .filter(Boolean)
      .join(" ");
  }
  return [
    `We posted ${f.count === 1 ? "1 home" : `${f.count} homes`} on Mkan today${areas ? `, in ${areas}` : ""}.`,
    range ? `Rent runs ${range} a month.` : null,
    beds ? `Bedrooms: ${beds}.` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/** Every number the note may contain — what the guard allows. */
export function noteNumbers(f: NoteFacts): (number | string)[] {
  return [f.count, f.rentMin, f.rentMax, f.bedsMin, f.bedsMax, ...Object.values(f.areas).flat()].filter((x): x is number | string => x != null);
}

/** True when stored facts still describe these homes: the same listings, in order. */
export const sameHomes = (a: number[] | undefined, b: number[]) => !!a && a.length === b.length && a.every((id, i) => id === b[i]);
