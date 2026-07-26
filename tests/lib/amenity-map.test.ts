import { describe, it, expect } from "vitest";
import { mapAmenities, unmappedAmenities, AMENITY_RULES } from "../../scripts/crm/amenity-map";

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

describe("unmappedAmenities", () => {
  it("surfaces labels no rule matched, so gaps are visible rather than dropped", () => {
    // An unmapped label is either a missing rule or a missing enum member.
    // Silently discarding it hides both.
    const unmapped = unmappedAmenities(["Wifi", "Private rooftop terrace", "شرفة"]);
    expect(unmapped).toContain("Private rooftop terrace");
    expect(unmapped).toContain("شرفة");
    expect(unmapped).not.toContain("Wifi");
  });
});

describe("rule table", () => {
  it("only ever produces values in the Prisma Amenity enum", () => {
    // Drift here writes an invalid enum member into the app DB.
    const valid = new Set([
      "WasherDryer", "AirConditioning", "Dishwasher", "HighSpeedInternet",
      "HardwoodFloors", "WalkInClosets", "Microwave", "Refrigerator",
      "Pool", "Gym", "Parking", "PetsAllowed", "WiFi",
    ]);
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
