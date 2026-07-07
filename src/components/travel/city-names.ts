/**
 * Arabic display labels for Sudan intercity destinations.
 *
 * Search params, DB rows and URL state keep the ENGLISH city string as the
 * canonical value — this map localizes display only. Mirrors the
 * `city`/`cityAr` pairs in `src/lib/constants/transport-data.ts` without
 * importing the full data file into the client bundle.
 */
export const CITY_AR: Record<string, string> = {
  Khartoum: "الخرطوم",
  Omdurman: "أم درمان",
  "Khartoum North (Bahri)": "بحري",
  "Khartoum North": "بحري",
  "Port Sudan": "بورتسودان",
  Kassala: "كسلا",
  "Wad Madani": "ود مدني",
  Atbara: "عطبرة",
  Shendi: "شندي",
  Dongola: "دنقلا",
  Gedaref: "القضارف",
  "El Obeid": "الأبيض",
  Sennar: "سنار",
  Kosti: "كوستي",
  Rabak: "ربك",
  Karima: "كريمة",
  "Ed Damazin": "الدمازين",
  Nyala: "نيالا",
  "El Fasher": "الفاشر",
  Kadugli: "كادقلي",
  "Wadi Halfa": "وادي حلفا",
  Berber: "بربر",
  Sinja: "سنجة",
  "Abu Hamed": "أبو حمد",
  "El Daein": "الضعين",
  "El Geneina": "الجنينة",
  "Al Manaqil": "المناقل",
  "Al Duwaym": "الدويم",
  Dilling: "الدلنج",
};

/** Locale-aware city label; falls back to the canonical English name. */
export function cityLabel(city: string, locale: string): string {
  return locale === "ar" ? (CITY_AR[city] ?? city) : city;
}
