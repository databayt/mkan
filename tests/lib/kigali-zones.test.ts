import { describe, expect, it } from "vitest";
import { KIGALI_ZONES, KIGALI_ZONE_BY_SLUG, resolveZone, zoneAt, zoneNamed, zoneWithin } from "@/lib/geo/kigali-zones";
import { districtForPlace } from "@/lib/geo/rwanda-places";
import { NEIGHBOURHOODS } from "@/components/agent/areas";

describe("kigali zone tree", () => {
  it("has 3 districts, 35 sectors and unique slugs whose parents exist", () => {
    expect(KIGALI_ZONES.filter((z) => z.level === "district")).toHaveLength(3);
    expect(KIGALI_ZONES.filter((z) => z.level === "sector")).toHaveLength(35);
    expect(KIGALI_ZONE_BY_SLUG.size).toBe(KIGALI_ZONES.length);
    for (const z of KIGALI_ZONES) if (z.parent) expect(KIGALI_ZONE_BY_SLUG.get(z.parent)?.district).toBe(z.district);
  });

  it("names the most specific zone in text", () => {
    expect(zoneNamed("2 bedroom house in Kibagabaga")?.slug).toBe("gasabo/kimironko/kibagabaga");
    expect(zoneNamed("apartment for rent Nyamirambo")?.slug).toBe("nyarugenge/nyamirambo");
    expect(zoneNamed("near Norvege")?.slug).toBe("nyarugenge/kigali/norvege");
    expect(zoneNamed("شقة في كيميرونكو")?.slug).toBe("gasabo/kimironko");
  });

  it("reads Kicukiro and Nyarugenge alone as districts, and Kigali as no zone", () => {
    expect(zoneNamed("Kicukiro")?.slug).toBe("kicukiro");
    expect(zoneNamed("Kicukiro centre")?.slug).toBe("kicukiro/kicukiro");
    expect(zoneNamed("Nyarugenge")?.slug).toBe("nyarugenge");
    expect(zoneNamed("Kigali, Rwanda")).toBeUndefined();
    expect(zoneNamed("a townhouse")).toBeUndefined();
  });

  it("places a pin in a neighbourhood when close, else the nearest sector", () => {
    expect(zoneAt(-1.935, 30.103).slug).toBe("gasabo/remera/nyarutarama");
    expect(zoneAt(-1.89, 30.151).slug).toBe("gasabo/bumbogo");
  });

  it("resolves text before the pin, and ignores a pin that is only a district centre", () => {
    expect(resolveZone({ text: "Kabeza", lat: -1.95, lng: 30.18 })).toMatchObject({ district: "KICUKIRO", sector: "kicukiro/kanombe", neighbourhood: "kicukiro/kanombe/kabeza" });
    expect(resolveZone({ text: "Kigali", lat: -1.896, lng: 30.112, pinIsReal: false })).toBeNull();
    expect(resolveZone({ text: "Kicukiro, Kigali", lat: -1.97, lng: 30.145 })?.sector).toBe("kicukiro/kanombe");
    expect(resolveZone({ text: "Kicukiro, Kigali", lat: -1.935, lng: 30.127 })?.zone.slug).toBe("kicukiro");
  });

  it("keeps the gazetteer and the agent on the same names", () => {
    expect(districtForPlace("Gishushu")).toBe("GASABO");
    expect(districtForPlace("Rebero")).toBe("KICUKIRO");
    expect(districtForPlace("Kabeza")).toBe("KICUKIRO");
    expect(NEIGHBOURHOODS.map((n) => n.name)).toEqual(expect.arrayContaining(["Kimironko", "Nyarutarama", "Kicukiro", "Rebero", "Kiyovu"]));
  });

  it("knows what lies within a zone", () => {
    expect(zoneWithin("gasabo", "gasabo/remera/nyarutarama")).toBe(true);
    expect(zoneWithin("gasabo/remera", "gasabo/remera")).toBe(true);
    expect(zoneWithin("gasabo/remera", "gasabo/kimironko")).toBe(false);
  });
});
