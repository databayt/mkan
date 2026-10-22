/**
 * Kigali places the badges and the parser can name: neighbourhoods tenants ask
 * for, and three "near…" areas (city centre, business district, universities).
 * Pure data + distance — rank.ts applies them, the badges list them.
 *
 * Coordinates are approximate (a sector or campus centre to ~300 m); the radii
 * are generous on purpose, since a listing pin is itself an approximation.
 */
import { KIGALI_ZONES } from "@/lib/geo/kigali-zones";
import { haversineKm } from "@/lib/geo/rwanda-places";

export type District = "GASABO" | "KICUKIRO" | "NYARUGENGE";

export interface Neighbourhood {
  name: string;
  /** The zone slug (`gasabo/remera/nyarutarama`). */
  slug: string;
  district: District;
  lat: number;
  lng: number;
}

/**
 * The names Kigali renters use — sectors plus a few well-known cells — from the
 * zone tree's popular zones (`kigali-zones.ts`), so the agent and the CRM name
 * places the same way.
 */
export const NEIGHBOURHOODS: Neighbourhood[] = KIGALI_ZONES.filter((z) => z.popular && z.level !== "district").map((z) => ({
  name: z.nameEn,
  slug: z.slug,
  district: z.district,
  lat: z.lat,
  lng: z.lng,
}));

/** How far from a neighbourhood's centre still counts as "in" it. */
export const NEIGHBOURHOOD_RADIUS_KM = 1.8;

export const AREA_KEYS = ["center", "business", "university"] as const;
export type AreaKey = (typeof AREA_KEYS)[number];

/** Each area is one or more points; a home within `radiusKm` of any of them is in it. */
export const AREAS: Record<AreaKey, { radiusKm: number; points: [number, number][] }> = {
  // The CBD around Nyarugenge's KN 4 Ave / Kigali City Tower.
  center: { radiusKm: 2.5, points: [[-1.9441, 30.0619]] },
  // Kimihurura–Kacyiru: Convention Centre, Kigali Heights, ministries, embassies.
  business: { radiusKm: 2.2, points: [[-1.9536, 30.0928], [-1.9405, 30.0835]] },
  // University of Rwanda (Nyarugenge, Gikondo, Remera), ULK Gisozi, Kigali Innovation City.
  university: {
    radiusKm: 2,
    points: [[-1.9586, 30.0636], [-1.977, 30.073], [-1.956, 30.116], [-1.921, 30.063], [-1.93, 30.153]],
  },
};

export interface Landmark {
  name: string;
  aliases: string[];
  lat: number;
  lng: number;
  /** Schools are also the pins for a bare "near a school" (`nearestSchool`). */
  kind?: "school" | "hospital" | "mall" | "office";
  district?: District;
}

/**
 * Places tenants name instead of a neighbourhood — a workplace, a campus, a
 * market, the airport. "Near Kigali Heights" ranks homes by distance to this
 * pin (rank.ts), softly: a pin off by a few hundred metres costs a home a few
 * points, never its place. Approximate like the rest of this file; a place
 * missing here can still be placed by the neighbourhood the reader names.
 */
export const LANDMARKS: Landmark[] = [
  { name: "Kigali Convention Centre", aliases: ["kcc", "convention centre", "convention center", "radisson blu"], lat: -1.9536, lng: 30.0928 },
  { name: "Kigali Heights", aliases: ["kigali heights mall"], lat: -1.9531, lng: 30.0936 },
  { name: "Kigali City Tower", aliases: ["kct", "city tower", "car free zone", "utc", "union trade centre", "union trade center"], lat: -1.9441, lng: 30.0619 },
  { name: "King Faisal Hospital", aliases: ["king faisal", "kfh"], lat: -1.9446, lng: 30.0928 },
  { name: "CHUK", aliases: ["chuk hospital", "university teaching hospital of kigali"], lat: -1.9566, lng: 30.0603 },
  { name: "University of Rwanda Nyarugenge", aliases: ["ur nyarugenge", "cst", "kist", "ur cst", "university of rwanda"], lat: -1.9586, lng: 30.0636 },
  { name: "University of Rwanda Gikondo", aliases: ["ur gikondo", "cbe", "ur cbe"], lat: -1.977, lng: 30.073 },
  { name: "University of Rwanda Remera", aliases: ["ur remera", "cmhs", "kie"], lat: -1.956, lng: 30.116 },
  { name: "ULK", aliases: ["kigali independent university", "ulk gisozi"], lat: -1.921, lng: 30.063 },
  { name: "Kigali Innovation City", aliases: ["kic", "cmu africa", "carnegie mellon", "carnegie mellon africa", "alu"], lat: -1.93, lng: 30.153 },
  { name: "Kigali International Airport", aliases: ["airport", "kanombe airport", "kgl", "المطار", "مطار كيغالي"], lat: -1.9686, lng: 30.1395 },
  { name: "Kimironko Market", aliases: ["kimironko market", "isoko rya kimironko"], lat: -1.9365, lng: 30.1271 },
  { name: "Nyabugogo", aliases: ["nyabugogo bus park", "nyabugogo taxi park", "nyabugogo bus station"], lat: -1.9375, lng: 30.0447 },
  { name: "Amahoro Stadium", aliases: ["amahoro"], lat: -1.955, lng: 30.1163 },
  { name: "BK Arena", aliases: ["kigali arena"], lat: -1.9536, lng: 30.1175 },
  { name: "Remera Giporoso", aliases: ["giporoso", "remera bus park", "remera taxi park"], lat: -1.9575, lng: 30.111 },
  { name: "Sonatubes", aliases: ["sonatube"], lat: -1.966, lng: 30.104 },
  { name: "Kicukiro Centre", aliases: ["kicukiro center", "centre kicukiro"], lat: -1.972, lng: 30.103 },
  { name: "Kigali Golf Course", aliases: ["golf course", "kigali golf", "golf resort"], lat: -1.937, lng: 30.103 },
  { name: "Kigali Marriott", aliases: ["marriott"], lat: -1.9535, lng: 30.0617 },
  { name: "Kigali Serena", aliases: ["serena", "serena hotel"], lat: -1.9545, lng: 30.0632 },
  { name: "Kigali Genocide Memorial", aliases: ["genocide memorial", "gisozi memorial"], lat: -1.9306, lng: 30.0605 },
  { name: "Kigali Special Economic Zone", aliases: ["sez", "ksez", "special economic zone", "free zone"], lat: -1.928, lng: 30.145 },
  { name: "Nyamirambo Stadium", aliases: ["pele stadium", "kigali pele stadium", "nyamirambo regional stadium"], lat: -1.9759, lng: 30.0452 },

  // Hospitals, malls and offices — OpenStreetMap pins (Nominatim, 2026-10-21).
  { name: "Rwanda Military Hospital", aliases: ["kanombe military hospital", "military hospital", "rmh"], lat: -1.9786, lng: 30.1679, kind: "hospital", district: "KICUKIRO" },
  { name: "Kacyiru Hospital", aliases: ["kacyiru district hospital", "police hospital"], lat: -1.9329, lng: 30.0745, kind: "hospital", district: "GASABO" },
  { name: "Kibagabaga Hospital", aliases: ["kibagabaga district hospital"], lat: -1.9306, lng: 30.1119, kind: "hospital", district: "GASABO" },
  { name: "Legacy Clinics", aliases: ["legacy clinic", "legacy hospital"], lat: -1.9678, lng: 30.1629, kind: "hospital", district: "KICUKIRO" },
  { name: "Masaka Hospital", aliases: ["masaka district hospital"], lat: -1.9918, lng: 30.212, kind: "hospital", district: "KICUKIRO" },
  { name: "Chic Mall", aliases: ["chic building", "chic kigali"], lat: -1.9417, lng: 30.0587, kind: "mall", district: "NYARUGENGE" },
  { name: "Makuza Peace Plaza", aliases: ["makuza plaza", "peace plaza"], lat: -1.9464, lng: 30.0597, kind: "mall", district: "NYARUGENGE" },
  // Approximate: Norrsken's KN 78 St block in Kiyovu, beside the École Belge pin.
  { name: "Norrsken House Kigali", aliases: ["norrsken", "norrsken house"], lat: -1.9512, lng: 30.0601, kind: "office", district: "NYARUGENGE" },

  // Schools — OpenStreetMap pins (Nominatim, 2026-10-21) unless marked.
  // Riviera High School and Wellspring Academy are left out: no pin we trust.
  { name: "Green Hills Academy", aliases: ["green hills", "greenhills", "gha"], lat: -1.9419, lng: 30.1054, kind: "school", district: "GASABO" },
  { name: "Kigali International Community School", aliases: ["kics", "kigali international community"], lat: -1.9271, lng: 30.0915, kind: "school", district: "GASABO" },
  { name: "International School of Kigali Rwanda", aliases: ["international school of kigali", "iskr", "isk"], lat: -1.9291, lng: 30.1089, kind: "school", district: "GASABO" },
  { name: "Mother Mary Complex School", aliases: ["mother mary", "mother mary complex", "mother mary school"], lat: -1.9374, lng: 30.1181, kind: "school", district: "GASABO" },
  { name: "Kigali Christian School", aliases: ["kcs"], lat: -1.9322, lng: 30.1167, kind: "school", district: "GASABO" },
  { name: "Saint Ignatius High School", aliases: ["saint ignatius", "st ignatius", "st. ignatius", "saint ignace", "st ignace"], lat: -1.938, lng: 30.1202, kind: "school", district: "GASABO" },
  { name: "Excella School", aliases: ["excella"], lat: -1.9472, lng: 30.1347, kind: "school", district: "GASABO" },
  { name: "FAWE Girls School", aliases: ["fawe", "fawe girls"], lat: -1.9139, lng: 30.0745, kind: "school", district: "GASABO" },
  { name: "Hope Haven", aliases: ["hope haven school", "hope haven christian school"], lat: -1.9646, lng: 30.2078, kind: "school", district: "GASABO" },
  { name: "Lycée de Kigali", aliases: ["lycee de kigali", "ldk"], lat: -1.9622, lng: 30.0684, kind: "school", district: "NYARUGENGE" },
  // Approximate: OSM's École Belge pin on KN 78 St, Kiyovu.
  { name: "École Belge de Kigali", aliases: ["ecole belge", "belgian school", "ebk"], lat: -1.9513, lng: 30.0598, kind: "school", district: "NYARUGENGE" },
  { name: "École Française Antoine de Saint-Exupéry", aliases: ["french school", "ecole francaise", "lycee francais", "saint exupery", "saint-exupery", "efase"], lat: -1.9604, lng: 30.0692, kind: "school", district: "NYARUGENGE" },
  { name: "Lycée Notre-Dame de Cîteaux", aliases: ["notre dame de citeaux", "citeaux", "lycee notre dame"], lat: -1.9545, lng: 30.0601, kind: "school", district: "NYARUGENGE" },
  { name: "APE Rugunga", aliases: ["groupe scolaire ape rugunga", "gs ape rugunga"], lat: -1.9572, lng: 30.0713, kind: "school", district: "NYARUGENGE" },
  { name: "Collège Saint-André", aliases: ["college saint andre", "college st andre", "saint andre", "st andre"], lat: -1.9788, lng: 30.0531, kind: "school", district: "NYARUGENGE" },
  { name: "Kigali Parents School", aliases: ["kigali parents", "kigali parent's school", "kps"], lat: -1.9564, lng: 30.1396, kind: "school", district: "KICUKIRO" },
  { name: "King David Academy", aliases: ["king david", "kda"], lat: -1.9681, lng: 30.1616, kind: "school", district: "KICUKIRO" },
  { name: "Lycée Kagarama", aliases: ["lycee kagarama", "kagarama secondary school"], lat: -1.9919, lng: 30.096, kind: "school", district: "KICUKIRO" },
  { name: "Groupe Scolaire Busanza", aliases: ["gs busanza", "busanza school"], lat: -1.9878, lng: 30.1486, kind: "school", district: "KICUKIRO" },
];

/** Latin letters lose their accents ("Lycée" → "lycee"); Arabic letters stay, harakat go. */
export const placeKey = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9\u0621-\u064a]+/g, " ").trim();

/** A landmark by its name or a common alias ("KCC", "the airport", "Green Hills"). */
export function landmarkNamed(name: string | null | undefined): Landmark | undefined {
  if (!name) return undefined;
  const key = placeKey(name).replace(/^the /, "");
  if (!key) return undefined;
  return LANDMARKS.find((l) => placeKey(l.name) === key || l.aliases.some((a) => placeKey(a) === key));
}

/**
 * The landmark a free-text message names, if any: whole-word matches of a
 * name or alias, the longest one winning ("kigali heights mall" over "kigali
 * heights"). The caller decides whether the message asks to be near it.
 */
export function landmarkIn(text: string): Landmark | undefined {
  const hay = ` ${placeKey(text)} `;
  let best: { l: Landmark; len: number } | undefined;
  for (const l of LANDMARKS) {
    for (const k of [l.name, ...l.aliases].map(placeKey)) {
      if (k.length >= 3 && hay.includes(` ${k} `) && k.length > (best?.len ?? 0)) best = { l, len: k.length };
    }
  }
  return best?.l;
}

export const SCHOOLS = LANDMARKS.filter((l) => l.kind === "school");

/**
 * The school pin for a bare "near a school": with a neighbourhood, the school
 * closest to its centre; with only a district, the school in it with the most
 * other schools within 2 km (the district's school cluster). No place, no pin —
 * every corner of Kigali has a school, so one picked at random would only
 * mislead the ranking.
 */
export function nearestSchool(at: { neighbourhood?: string | null; district?: string | null }): Landmark | undefined {
  const hood = neighbourhoodNamed(at.neighbourhood);
  if (hood) {
    return [...SCHOOLS].sort((a, b) => haversineKm(hood.lat, hood.lng, a.lat, a.lng) - haversineKm(hood.lat, hood.lng, b.lat, b.lng))[0];
  }
  const inDistrict = SCHOOLS.filter((s) => s.district === at.district);
  if (!inDistrict.length) return undefined;
  const crowd = (s: Landmark) => inDistrict.filter((o) => o !== s && haversineKm(s.lat, s.lng, o.lat, o.lng) <= 2).length;
  return [...inDistrict].sort((a, b) => crowd(b) - crowd(a))[0];
}

export const neighbourhoodNamed = (name: string | null | undefined): Neighbourhood | undefined =>
  name ? NEIGHBOURHOODS.find((n) => n.name.toLowerCase() === name.toLowerCase()) : undefined;

export function inNeighbourhood(lat: number, lng: number, name: string): boolean {
  const n = neighbourhoodNamed(name);
  return !!n && haversineKm(lat, lng, n.lat, n.lng) <= NEIGHBOURHOOD_RADIUS_KM;
}

export function inArea(lat: number, lng: number, area: AreaKey): boolean {
  const a = AREAS[area];
  return a.points.some(([pLat, pLng]) => haversineKm(lat, lng, pLat, pLng) <= a.radiusKm);
}

/** A lat/lng box that contains every point within `km` of the given points — a cheap SQL prefilter. */
export function boxAround(points: [number, number][], km: number) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((2 * Math.PI) / 180));
  const lats = points.map(([la]) => la);
  const lngs = points.map(([, lo]) => lo);
  return {
    latitude: { gte: Math.min(...lats) - dLat, lte: Math.max(...lats) + dLat },
    longitude: { gte: Math.min(...lngs) - dLng, lte: Math.max(...lngs) + dLng },
  };
}
