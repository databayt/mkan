import { describe, it, expect } from "vitest";
import {
  PORT_SUDAN_ZONES,
  PORT_SUDAN_ZONE_BY_SLUG,
  getPortSudanZone,
  getPortSudanZoneLabel,
  searchPortSudanZones,
  classifyPortSudanPoint,
  matchPortSudanZoneByText,
  resolvePortSudanZone,
  isPortSudanCoords,
} from "@/lib/geo/portsudan-zones";
import { zoneKeyFor, zoneLabel } from "@/lib/geo/zone";

describe("Port Sudan Zones Gazetteer", () => {
  it("should have all 44 named canonical zones defined", () => {
    // 44 named zones + 1 unknown fallback
    const validZones = PORT_SUDAN_ZONES.filter((z) => z.slug !== "unknown");
    expect(validZones.length).toBe(44);
    expect(PORT_SUDAN_ZONE_BY_SLUG.size).toBe(45); // 44 + unknown
  });

  it("should resolve zone label in Arabic and English", () => {
    expect(getPortSudanZoneLabel("digna", "ar")).toBe("حي دقنة");
    expect(getPortSudanZoneLabel("digna", "en")).toBe("Digna District");
    expect(getPortSudanZoneLabel("city-centre", "ar")).toBe("وسط المدينة");
    expect(getPortSudanZoneLabel("city-centre", "en")).toBe("City Centre");
    expect(getPortSudanZoneLabel("arous", "ar")).toBe("عروس");
    expect(getPortSudanZoneLabel("arous", "en")).toBe("Arous");
  });

  it("should detect Port Sudan coordinates correctly", () => {
    expect(isPortSudanCoords(19.6158, 37.2164)).toBe(true); // Port Sudan centre
    expect(isPortSudanCoords(19.86, 37.26)).toBe(true); // Arous coast
    expect(isPortSudanCoords(15.5007, 32.5599)).toBe(false); // Khartoum
    expect(isPortSudanCoords(15.6445, 32.4777)).toBe(false); // Omdurman
  });

  it("should classify coordinates into the correct Port Sudan zone", () => {
    // Daqna coordinates
    const daqnaHit = classifyPortSudanPoint(19.6089, 37.2213);
    expect(daqnaHit?.slug).toBe("digna");

    // Arous coordinates
    const arousHit = classifyPortSudanPoint(19.863, 37.265);
    expect(arousHit?.slug).toBe("arous");

    // City centre coordinates
    const centreHit = classifyPortSudanPoint(19.6213889, 37.2102778);
    expect(centreHit?.slug).toBe("city-centre");
  });

  it("should match text against Port Sudan zones with Arabic and English aliases", () => {
    expect(matchPortSudanZoneByText("حي دقنة")?.slug).toBe("digna");
    expect(matchPortSudanZoneByText("Digna")?.slug).toBe("digna");
    expect(matchPortSudanZoneByText("وسط المدينة")?.slug).toBe("city-centre");
    expect(matchPortSudanZoneByText("Greek Quarter")?.slug).toBe("hayy-al-aghareeq");
    expect(matchPortSudanZoneByText("حي الإغريق")?.slug).toBe("hayy-al-aghareeq");
    expect(matchPortSudanZoneByText("عروس")?.slug).toBe("arous");
    expect(matchPortSudanZoneByText("Arous Resort")?.slug).toBe("arous");
    expect(matchPortSudanZoneByText("حي المطار")?.slug).toBe("airport-district");
    expect(matchPortSudanZoneByText("Airport District")?.slug).toBe("airport-district");
  });

  it("should resolve zoneKeyFor accurately for both Port Sudan and national cities", () => {
    // Port Sudan listings
    expect(zoneKeyFor(19.6089, 37.2213, "حي دقنة، بورتسودان")).toBe("digna");
    expect(zoneKeyFor(19.6158, 37.2164, "بورتسودان")).toBe("hayy-al-aghareeq");
    expect(zoneKeyFor(19.863, 37.265, "Arous Red Sea")).toBe("arous");

    // National cities (outside Port Sudan)
    expect(zoneKeyFor(15.5007, 32.5599, "Khartoum")).toBe("KHARTOUM");
    expect(zoneKeyFor(15.6445, 32.4777, "Omdurman")).toBe("OMDURMAN");
    expect(zoneKeyFor(15.6394, 32.5497, "Khartoum North")).toBe("BAHRI");
  });

  it("should search zones by user query", () => {
    const resDigna = searchPortSudanZones("دقنة", "ar", 5);
    expect(resDigna.some((z) => z.slug === "digna")).toBe(true);

    const resArous = searchPortSudanZones("arous", "en", 5);
    expect(resArous.some((z) => z.slug === "arous")).toBe(true);

    const resHadal = searchPortSudanZones("هدل", "ar", 5);
    expect(resHadal.some((z) => z.slug === "hadal")).toBe(true);
  });
});
