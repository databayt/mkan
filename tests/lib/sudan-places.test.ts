import { describe, it, expect } from "vitest";
import {
  checkPlace,
  classifyPoint,
  isInSudan,
  deriveCityFromTitle,
  stateOfCity,
  kmToBorder,
  PLACES,
  STATES,
  CITY_OPTIONS,
} from "../../scripts/crm/sudan-places";

/**
 * The map crawler works in rectangles and no rectangle is Sudan — the bounding
 * box also contains parts of Ethiopia, Eritrea, Chad, CAR, South Sudan and
 * Egypt. `isInSudan` is what keeps foreign listings out of a Sudan-only
 * dataset, so it is worth pinning down with real coordinates on both sides of
 * every land border.
 */
describe("isInSudan", () => {
  const inside: Array<[string, number, number]> = [
    ["Khartoum", 15.5007, 32.5599],
    ["Omdurman", 15.6445, 32.4777],
    ["Port Sudan", 19.6158, 37.2164],
    ["Nyala", 12.0489, 24.8807],
    ["El Geneina", 13.4526, 22.445],
    ["El Fasher", 13.6279, 25.3494],
    ["Wadi Halfa", 21.8, 31.35],
    ["Dongola", 19.168, 30.475],
    ["Kadugli", 11.0111, 29.7176],
    ["Ed Damazin", 11.7891, 34.3592],
    ["Kassala", 15.451, 36.4],
    ["Gedaref", 14.0354, 35.3837],
    ["Atbara", 17.7022, 33.9865],
    ["El Obeid", 13.1839, 30.2176],
  ];

  // One per neighbour, chosen well clear of the line so the simplified polygon
  // is not being asked for precision it does not have.
  const outside: Array<[string, number, number]> = [
    ["Addis Ababa, Ethiopia", 9.03, 38.74],
    ["Gondar, Ethiopia", 12.61, 37.47],
    ["Bahir Dar, Ethiopia", 11.59, 37.39],
    ["Asmara, Eritrea", 15.34, 38.93],
    ["Juba, South Sudan", 4.85, 31.58],
    ["Malakal, South Sudan", 9.53, 31.66],
    ["Aswan, Egypt", 24.09, 32.9],
    ["N'Djamena, Chad", 12.11, 15.04],
    ["Abéché, Chad", 13.83, 20.83],
    ["Birao, CAR", 10.28, 22.79],
  ];

  it.each(inside)("puts %s inside", (_name, lat, lng) => {
    expect(isInSudan(lat, lng)).toBe(true);
  });

  it.each(outside)("keeps %s out", (_name, lat, lng) => {
    expect(isInSudan(lat, lng)).toBe(false);
  });

  it("treats a point just past the Ethiopian border as borderline, not a clean drop", () => {
    // Errors here are asymmetric: a stray foreign listing costs one review,
    // a dropped Sudanese one disappears silently. Near the line we keep it.
    const nearGallabat = classifyPoint(12.42, 36.16);
    expect(["IN_SUDAN", "BORDERLINE"]).toContain(nearGallabat.verdict);
  });

  it("rejects missing or non-finite coordinates rather than guessing", () => {
    expect(classifyPoint(null, null).verdict).toBe("OUTSIDE");
    expect(classifyPoint(15.5, undefined).verdict).toBe("OUTSIDE");
    expect(classifyPoint(NaN, 32.5).verdict).toBe("OUTSIDE");
  });
});

describe("classifyPoint", () => {
  it("resolves the tri-city by the rivers, not by centroid distance", () => {
    // Khartoum / Omdurman / Bahri sit within ~15km and their radii overlap, so
    // nearest-centroid gets the middle wrong. The rivers are the real boundary.
    expect(classifyPoint(15.5007, 32.5599).city).toBe("KHARTOUM");
    expect(classifyPoint(15.6445, 32.4777).city).toBe("OMDURMAN");
    expect(classifyPoint(15.6394, 32.5497).city).toBe("BAHRI");
  });

  it("keeps Khartoum's northern districts in Khartoum", () => {
    // These sit between the two rivers but are nearer Bahri's centroid than
    // Khartoum's — the case that made the centroid model unusable.
    expect(classifyPoint(15.573, 32.564).city).toBe("KHARTOUM"); // Riyadh
    expect(classifyPoint(15.588, 32.548).city).toBe("KHARTOUM"); // Amarat / Burri
  });

  it("puts the west bank in Omdurman regardless of how far north", () => {
    expect(classifyPoint(15.66, 32.46).city).toBe("OMDURMAN");
    expect(classifyPoint(15.52, 32.47).city).toBe("OMDURMAN");
  });

  it("separates East Nile from Bahri by longitude east of the Blue Nile", () => {
    expect(classifyPoint(15.66, 32.66).city).toBe("EAST_NILE");
    expect(classifyPoint(15.66, 32.54).city).toBe("BAHRI");
  });

  it("names the state even when no town matches, so nothing lands unlabelled", () => {
    // Empty desert in the Northern state, far from any town centroid.
    const desert = classifyPoint(20.5, 29.0);
    expect(desert.verdict).toBe("IN_SUDAN");
    expect(desert.city).toBe("OTHER");
    expect(desert.state).not.toBe("UNKNOWN");
  });

  it("reports distance to the border so borderline rows can be triaged", () => {
    expect(kmToBorder(15.5007, 32.5599)).toBeGreaterThan(300);
    expect(kmToBorder(19.6158, 37.2164)).toBeLessThan(100);
  });
});

describe("deriveCityFromTitle", () => {
  it("prefers the longest alias so a substring cannot win", () => {
    // "khartoum north" contains "khartoum"; the longer alias must take it.
    expect(deriveCityFromTitle("Rental unit in Khartoum North")).toBe("BAHRI");
    expect(deriveCityFromTitle("Rental unit in Khartoum")).toBe("KHARTOUM");
  });

  it("maps neighbourhoods onto their parent city", () => {
    expect(deriveCityFromTitle("Apartment in Kafouri")).toBe("BAHRI");
    expect(deriveCityFromTitle("Place in Arkaweet")).toBe("KHARTOUM");
  });

  it("handles the spellings Airbnb actually uses", () => {
    expect(deriveCityFromTitle("Hotel in Port Sudan")).toBe("PORT_SUDAN");
    expect(deriveCityFromTitle("Guesthouse in Wad Medani")).toBe("WAD_MADANI");
    expect(deriveCityFromTitle("Room in Al Qadarif")).toBe("GEDAREF");
  });

  it("returns OTHER rather than guessing", () => {
    expect(deriveCityFromTitle("Cabin in the mountains")).toBe("OTHER");
    expect(deriveCityFromTitle(null)).toBe("OTHER");
  });
});

describe("checkPlace", () => {
  it("rejects the foreign listings that carry Sudanese-looking placeholder coordinates", () => {
    // Both are real rows in the current scrape. Their coordinates sit ~200m
    // apart in North Kordofan, 360km from any border; their descriptions name
    // Hikkaduwa Beach and downtown Sioux Falls. A coordinates-only filter keeps
    // both, which is exactly the failure this guards against.
    const sriLanka = checkPlace(12.863710649766604, 30.21644441353182, "Apartment in Hikkaduwa");
    const usa = checkPlace(12.8653, 30.2173, "Home in Sioux Falls");
    expect(sriLanka.agreement).toBe("SUSPECT_FOREIGN");
    expect(usa.agreement).toBe("SUSPECT_FOREIGN");
  });

  it("keeps a real Sudanese listing whose village is not in the gazetteer", () => {
    // Arous, the Red Sea coast resort strip ~42km north of Port Sudan. No town
    // centroid matches, but the title names Port Sudan — that is corroboration.
    const arous = checkPlace(19.998, 37.192, "Rooms in Port Sudan");
    expect(arous.agreement).toBe("CONFIRMED");
    expect(arous.verdict).toBe("IN_SUDAN");
  });

  it("flags a title/coordinate disagreement instead of silently picking one", () => {
    const conflict = checkPlace(15.5007, 32.5599, "Hotel in Port Sudan");
    expect(conflict.agreement).toBe("CONFLICT");
    expect(conflict.note).toMatch(/PORT_SUDAN/);
  });

  it("accepts coordinates alone when the title names no place at all", () => {
    expect(checkPlace(15.5007, 32.5599, "Lovely flat").agreement).toBe("COORDS_ONLY");
  });

  it("rejects anything whose coordinates fall outside the border", () => {
    expect(checkPlace(9.03, 38.74, "Home in Addis Ababa").agreement).toBe("SUSPECT_FOREIGN");
  });

  it("lets Airbnb's own geocoded subtitle overrule everything else", () => {
    // LOCATION_DEFAULT.subtitle is "City, State, Country" straight from Airbnb.
    // It settles the Hikkaduwa case outright, without needing the coordinates.
    const sriLanka = checkPlace(12.8637, 30.2164, "Apartment in Hikkaduwa", "Hikkaduwa, Southern Province, Sri Lanka");
    expect(sriLanka.agreement).toBe("SUSPECT_FOREIGN");
    expect(sriLanka.note).toMatch(/Sri Lanka/);

    const portSudan = checkPlace(19.6014, 37.20647, "Hotel in Port Sudan", "Port Sudan, Red Sea, Sudan");
    expect(portSudan.agreement).toBe("CONFIRMED");
    expect(portSudan.city).toBe("PORT_SUDAN");
  });

  it("trusts the subtitle over coordinates the polygon would reject", () => {
    // A real Sudanese listing whose placeholder coordinates land abroad should
    // survive — Airbnb naming Sudan is better evidence than our simplified border.
    const hit = checkPlace(9.03, 38.74, "Room", "Kassala, Kassala, Sudan");
    expect(hit.agreement).toBe("CONFIRMED");
    expect(hit.city).toBe("KASSALA");
  });
});

describe("gazetteer integrity", () => {
  it("has a unique code per place and per state", () => {
    expect(new Set(PLACES.map((p) => p.code)).size).toBe(PLACES.length);
    expect(new Set(STATES.map((s) => s.code)).size).toBe(STATES.length);
  });

  it("covers all 18 states", () => {
    expect(STATES).toHaveLength(18);
  });

  it("gives every place an Arabic name — the CRM and outreach copy both need it", () => {
    for (const p of PLACES) {
      expect(p.nameAr, `${p.code} is missing nameAr`).toMatch(/[؀-ۿ]/);
    }
    for (const s of STATES) {
      expect(s.nameAr, `${s.code} is missing nameAr`).toMatch(/[؀-ۿ]/);
    }
  });

  it("places every town inside the border it belongs to", () => {
    for (const p of PLACES) {
      expect(isInSudan(p.lat, p.lng), `${p.code} falls outside the polygon`).toBe(true);
    }
  });

  it("assigns every place to a real state", () => {
    const codes = new Set(STATES.map((s) => s.code));
    for (const p of PLACES) expect(codes.has(p.state), `${p.code} → ${p.state}`).toBe(true);
    expect(stateOfCity("PORT_SUDAN")).toBe("RED_SEA");
    expect(stateOfCity("OTHER")).toBe("UNKNOWN");
  });

  it("keeps the six original city codes so existing CRM records stay valid", () => {
    // Twenty stores the option *value* on each record; dropping one orphans
    // every home that holds it.
    const values = new Set(CITY_OPTIONS.map((o) => o.value));
    for (const legacy of ["KHARTOUM", "OMDURMAN", "BAHRI", "EAST_NILE", "PORT_SUDAN", "OTHER"]) {
      expect(values.has(legacy), `legacy option ${legacy} was dropped`).toBe(true);
    }
  });
});

describe("checkPlace with an Arabic locationSubtitle", () => {
  // The AR PDP pass overwrites locationSubtitle with Airbnb's Arabic string,
  // which uses the Arabic comma U+060C and the Arabic country name. Splitting
  // on the ASCII comma alone left the whole string as the "country" and every
  // genuine Khartoum listing came back SUSPECT_FOREIGN.
  it("accepts Airbnb's Arabic rendering of a Sudanese place", () => {
    const r = checkPlace(15.55, 32.53, "Apartment", "الخرطوم، Khartoum، السودان");
    expect(r.agreement).toBe("CONFIRMED");
    expect(r.note).toBeNull();
  });

  it("accepts the Arabic subtitle for Port Sudan too", () => {
    const r = checkPlace(19.617, 37.216, "Apartment", "بورتسودان، البحر الاحمر، السودان");
    expect(r.agreement).toBe("CONFIRMED");
  });

  it("still rejects a genuinely foreign place written in Arabic", () => {
    const r = checkPlace(15.55, 32.53, "Apartment", "القاهرة، مصر");
    expect(r.agreement).toBe("SUSPECT_FOREIGN");
  });

  it("still rejects a foreign place written in English", () => {
    const r = checkPlace(15.55, 32.53, "Apartment", "Hikkaduwa, Southern Province, Sri Lanka");
    expect(r.agreement).toBe("SUSPECT_FOREIGN");
  });
});

describe("the tri-city survives Airbnb's coarse geocoding", () => {
  // Airbnb labels every address in greater Khartoum "Khartoum, Khartoum, Sudan",
  // including ones across the Nile. Letting that subtitle win collapsed Bahri,
  // Omdurman and East Nile into Khartoum — which is exactly the distinction
  // classifyGreaterKhartoum exists to make, and which locals do observe.
  it("keeps Bahri when the coordinates are north of the Blue Nile", () => {
    const r = checkPlace(15.65, 32.53, "Apartment", "الخرطوم، Khartoum، السودان");
    expect(r.city).toBe("BAHRI");
    expect(r.agreement).toBe("CONFIRMED");
  });

  it("keeps Omdurman when the coordinates are west of the Nile", () => {
    const r = checkPlace(15.64, 32.45, "Apartment", "Khartoum, Khartoum, Sudan");
    expect(r.city).toBe("OMDURMAN");
  });

  it("still says Khartoum when the coordinates actually are Khartoum", () => {
    expect(checkPlace(15.55, 32.55, "Apartment", "Khartoum, Khartoum, Sudan").city).toBe("KHARTOUM");
  });

  it("falls back to the subtitle when there are no coordinates at all", () => {
    const r = checkPlace(null, null, "Apartment", "Kassala, Kassala, Sudan");
    expect(r.city).toBe("KASSALA");
  });

  it("trusts coordinates over a subtitle that names a town 1000km away", () => {
    // 21km from El Fasher. Airbnb saying "Kassala" does not move a building.
    expect(checkPlace(13.5, 25.5, "Apartment", "Kassala, Kassala, Sudan").city).toBe("EL_FASHER");
  });
});

describe("Airbnb's Arabic locale claims Sudan for places that are not", () => {
  // Measured 2026-07-27: in the ar locale Airbnb renders the country field of
  // these two real listings as السودان. Both carry near-identical placeholder
  // coordinates 200m apart in empty North Kordofan. Trusting the country claim
  // alone would import a Sri Lankan beach villa and a South Dakota house as
  // Sudanese homes.
  it("rejects Hikkaduwa even when Airbnb writes السودان", () => {
    const r = checkPlace(12.8637, 30.2164, "Villa", "Hikkaduwa، Southern Province، السودان");
    expect(r.agreement).toBe("SUSPECT_FOREIGN");
  });

  it("rejects Sioux Falls even when Airbnb writes السودان", () => {
    const r = checkPlace(12.8653, 30.2173, "Home", "Sioux Falls، South Dakota، السودان");
    expect(r.agreement).toBe("SUSPECT_FOREIGN");
  });

  it("still accepts a real Sudanese place in the same Arabic form", () => {
    // Corroborated twice over: the subtitle names Port Sudan and the
    // coordinates are in it.
    expect(checkPlace(19.617, 37.216, "Apartment", "بورتسودان، البحر الاحمر، السودان").agreement).toBe("CONFIRMED");
  });

  it("accepts a real Sudanese place whose coordinates match no town", () => {
    // Corroboration from the subtitle alone is enough — this is a genuine
    // Sudanese town, just outside any centroid radius.
    expect(checkPlace(null, null, "Apartment", "Dongola، Northern، السودان").agreement).toBe("CONFIRMED");
  });
});

describe("deriveCityFromTitle reads Arabic place names", () => {
  // Every PLACES entry carried a nameAr that was never searched — only the
  // English aliases were. So the ar PDP pass, whose subtitles are entirely
  // Arabic, matched nothing, and two genuine Red Sea listings were rejected as
  // foreign for naming Port Sudan in Arabic.
  it("matches the Arabic name", () => {
    expect(deriveCityFromTitle("بورتسودان، البحر الاحمر، السودان")).toBe("PORT_SUDAN");
    expect(deriveCityFromTitle("الخرطوم")).toBe("KHARTOUM");
    expect(deriveCityFromTitle("أم درمان")).toBe("OMDURMAN");
  });

  it("tolerates the spelling variation Arabic actually arrives in", () => {
    // hamza forms, ta-marbuta written as ha, and stray spaces
    expect(deriveCityFromTitle("بور سودان")).toBe("PORT_SUDAN");
    expect(deriveCityFromTitle("ام درمان")).toBe("OMDURMAN");
  });

  it("still matches English names and aliases", () => {
    expect(deriveCityFromTitle("Apartment in Port Sudan")).toBe("PORT_SUDAN");
    expect(deriveCityFromTitle("Kassala, Kassala, Sudan")).toBe("KASSALA");
  });

  it("does not match a foreign place", () => {
    expect(deriveCityFromTitle("Hikkaduwa, Southern Province, Sri Lanka")).toBe("OTHER");
  });
});
