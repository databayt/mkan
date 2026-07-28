import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  mapAmenities,
  unmappedAmenities,
  smokingFromAmenities,
  AMENITY_RULES,
} from "../../scripts/crm/amenity-map";

/**
 * This table used to exist twice — once in mkan-import.ts as Prisma enum
 * members, once in twenty-upsert.ts as bare strings. These tests exist so the
 * single copy stays honest as Arabic rules get added to it.
 */
describe("mapAmenities", () => {
  it("maps the English labels Airbnb actually returns", () => {
    expect(mapAmenities(["Wifi", "Air conditioning", "Free parking on premises"])).toEqual(
      expect.arrayContaining(["WiFi", "AirConditioning", "Parking"]),
    );
  });

  it("maps Arabic labels, which are the only ones some listings have", () => {
    // A listing whose English PDP fetch failed still yields Arabic amenity
    // labels from the AR pass — those must map to the same enum values.
    expect(mapAmenities(["واي فاي", "تكييف", "مسبح", "موقف سيارات", "ثلاجة"])).toEqual(
      expect.arrayContaining(["WiFi", "AirConditioning", "Pool", "Parking", "Refrigerator"]),
    );
  });

  it("merges several capture passes without duplicating", () => {
    const merged = mapAmenities(["Wifi", "Pool"], ["واي فاي", "مسبح", "ثلاجة"]);
    expect(merged.filter((a) => a === "WiFi")).toHaveLength(1);
    expect(merged).toEqual(expect.arrayContaining(["WiFi", "Pool", "Refrigerator"]));
  });

  it("recognises high-speed internet as well as plain wifi", () => {
    const fast = mapAmenities(["Fast wifi – 100 Mbps"]);
    expect(fast).toContain("HighSpeedInternet");
    expect(fast).toContain("WiFi");
  });

  it("tolerates empty and missing input", () => {
    expect(mapAmenities([])).toEqual([]);
    expect(mapAmenities(null, undefined)).toEqual([]);
  });
});

describe("the four facts that used to have nowhere to go", () => {
  // Kitchen, TV, smoke alarm and CO alarm are the most common amenities in the
  // Sudan dataset — 111, 110, 110 and 91 of 121 homes — and every one of them
  // was discarded on import because the enum could not name it.
  it("maps them in both languages", () => {
    expect(mapAmenities(["Kitchen", "TV", "Smoke alarm", "Carbon monoxide alarm"])).toEqual(
      expect.arrayContaining(["Kitchen", "TV", "SmokeAlarm", "CarbonMonoxideAlarm"]),
    );
    expect(
      mapAmenities(["مطبخ", "تلفزيون", "جهاز الكشف عن الدخان", "جهاز الكشف عن أول أكسيد الكربون"]),
    ).toEqual(expect.arrayContaining(["Kitchen", "TV", "SmokeAlarm", "CarbonMonoxideAlarm"]));
  });

  it("reads a TV through Airbnb's verbose spelling", () => {
    expect(mapAmenities(["42 inch HDTV with standard cable"])).toContain("TV");
  });
});

describe("rules that overlap", () => {
  // Each of these produced a false amenity before the patterns excluded each
  // other. They are the reason the table cannot rely on ordering: every rule
  // is tested against every string and the result is a set.
  it("does not read a hair dryer as a washer/dryer", () => {
    expect(mapAmenities(["Hair dryer"])).toEqual(["HairDryer"]);
    expect(mapAmenities(["مجفف شعر"])).toEqual(["HairDryer"]);
    // The real thing still maps.
    expect(mapAmenities(["Dryer"])).toEqual(["WasherDryer"]);
  });

  it("does not read a pool table as a swimming pool", () => {
    expect(mapAmenities(["Pool table"])).toEqual(["PoolTable"]);
    expect(mapAmenities(["Pool"])).toEqual(["Pool"]);
  });

  it("distinguishes a hot tub from a bathtub in Arabic, where one is a prefix of the other", () => {
    expect(mapAmenities(["حوض استحمام ساخن"])).toEqual(["HotTub"]);
    expect(mapAmenities(["حوض استحمام"])).toEqual(["Bathtub"]);
  });

  it("does not read a courtyard view as a patio", () => {
    expect(mapAmenities(["إطلالة على فناء"])).toEqual([]);
    expect(mapAmenities(["فناء أو شرفة"])).toEqual(["PatioOrBalcony"]);
  });

  it("keeps a shared backyard out of the patio bucket", () => {
    expect(mapAmenities(["فناء خلفي مشترك"])).toEqual(["Backyard"]);
  });
});

describe("smokingFromAmenities", () => {
  // Airbnb files smoking under amenities; mkan owns it in houseRules. Keeping
  // it in one place is what stops a listing saying "No smoking" in its rules
  // and "Smoking allowed" in its amenities on the same page.
  it("is not an Amenity value", () => {
    expect(mapAmenities(["Smoking allowed"])).toEqual([]);
  });

  it("reads the permission out in both languages", () => {
    expect(smokingFromAmenities(["Smoking allowed"])).toBe(true);
    expect(smokingFromAmenities(["التدخين مسموح"])).toBe(true);
    expect(smokingFromAmenities(["No smoking"])).toBe(false);
  });

  it("returns null when Airbnb said nothing — silence is not a no", () => {
    expect(smokingFromAmenities(["Wifi", "Kitchen"])).toBeNull();
    expect(smokingFromAmenities(null, undefined)).toBeNull();
  });
});

describe("unmappedAmenities", () => {
  it("surfaces labels no rule matched, so gaps are visible rather than dropped", () => {
    // An unmapped label is either a missing rule or a missing enum member.
    // Silently discarding it hides both.
    const unmapped = unmappedAmenities(["Wifi", "Private rooftop terrace", "إطلالة على النهر"]);
    expect(unmapped).toContain("Private rooftop terrace");
    expect(unmapped).toContain("إطلالة على النهر");
    expect(unmapped).not.toContain("Wifi");
  });
});

describe("rule table", () => {
  it("only ever produces values in the Prisma Amenity enum", () => {
    // Read from the schema rather than a hand-kept list: a copy here would
    // drift, and drift writes an invalid enum member into the app DB.
    const schema = readFileSync(resolve(__dirname, "../../prisma/schema.prisma"), "utf8");
    const block = schema.match(/enum\s+Amenity\s*\{([^}]*)\}/);
    const valid = new Set(
      (block?.[1] ?? "")
        .split("\n")
        .map((l) => l.replace(/\/\/.*$/, "").trim())
        .filter(Boolean),
    );
    expect(valid.size).toBeGreaterThan(13);
    for (const [, name] of AMENITY_RULES) expect(valid.has(name), `${name} is not an Amenity`).toBe(true);
  });

  it("has an Arabic alternative for every rule", () => {
    // Arabic-first is the product default; a rule that only matches English
    // means Arabic listings silently lose that amenity.
    for (const [re, name] of AMENITY_RULES) {
      expect(/[؀-ۿ]/.test(re.source), `${name} has no Arabic pattern`).toBe(true);
    }
  });
});
