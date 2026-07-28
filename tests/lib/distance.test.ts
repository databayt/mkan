import { describe, it, expect } from "vitest";

import {
  boundingBox,
  haversineKm,
  isValidCoords,
  nearestBy,
  parseCoords,
  roundCoord,
  DEFAULT_NEARBY_RADIUS_KM,
  type Coords,
} from "@/lib/distance";

// Real places, so the expected distances are checkable against any map.
const PORT_SUDAN: Coords = { lat: 19.5856, lng: 37.2159 };
const KHARTOUM: Coords = { lat: 15.5007, lng: 32.5599 };
const SUAKIN: Coords = { lat: 19.1059, lng: 37.3321 };

describe("haversineKm", () => {
  it("is zero for a point against itself", () => {
    expect(haversineKm(PORT_SUDAN, PORT_SUDAN)).toBe(0);
  });

  it("matches the known Port Sudan → Khartoum great-circle distance", () => {
    // ~671 km on a 6371 km sphere, cross-checked against an independent
    // implementation of the same formula.
    expect(haversineKm(PORT_SUDAN, KHARTOUM)).toBeCloseTo(670.7, 1);
  });

  it("is symmetric", () => {
    expect(haversineKm(PORT_SUDAN, KHARTOUM)).toBeCloseTo(
      haversineKm(KHARTOUM, PORT_SUDAN),
      9
    );
  });

  it("resolves short intra-region distances", () => {
    // Suakin sits ~55 km south of Port Sudan — just outside the default radius,
    // which is exactly the kind of call the search depends on getting right.
    const d = haversineKm(PORT_SUDAN, SUAKIN);
    expect(d).toBeGreaterThan(50);
    expect(d).toBeLessThan(60);
  });

  it("handles antipodal points without NaN from floating-point drift", () => {
    // sqrt(h) can exceed 1 by ~1e-16 here; without the clamp asin returns NaN.
    const d = haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 });
    expect(Number.isNaN(d)).toBe(false);
    expect(d).toBeCloseTo(Math.PI * 6371, 0);
  });
});

describe("boundingBox", () => {
  it("fully contains the circle it approximates", () => {
    const box = boundingBox(PORT_SUDAN, DEFAULT_NEARBY_RADIUS_KM);

    // Every point exactly `radius` away in each cardinal direction must fall
    // inside the box — otherwise the prefilter would drop real matches.
    const north = { lat: PORT_SUDAN.lat + DEFAULT_NEARBY_RADIUS_KM / 111, lng: PORT_SUDAN.lng };
    const south = { lat: PORT_SUDAN.lat - DEFAULT_NEARBY_RADIUS_KM / 111, lng: PORT_SUDAN.lng };
    for (const p of [north, south]) {
      expect(p.lat).toBeGreaterThanOrEqual(box.minLat);
      expect(p.lat).toBeLessThanOrEqual(box.maxLat);
    }
    expect(box.minLng).toBeLessThan(PORT_SUDAN.lng);
    expect(box.maxLng).toBeGreaterThan(PORT_SUDAN.lng);
  });

  it("widens longitude relative to latitude away from the equator", () => {
    // Meridians converge with latitude, so a fixed km radius spans more degrees
    // of longitude the further from the equator you are.
    const box = boundingBox(PORT_SUDAN, DEFAULT_NEARBY_RADIUS_KM);
    const latSpan = box.maxLat - box.minLat;
    const lngSpan = box.maxLng - box.minLng;
    expect(lngSpan).toBeGreaterThan(latSpan);
  });

  it("clamps at the poles instead of producing an infinite longitude span", () => {
    const box = boundingBox({ lat: 90, lng: 0 }, DEFAULT_NEARBY_RADIUS_KM);
    expect(Number.isFinite(box.minLng)).toBe(true);
    expect(Number.isFinite(box.maxLng)).toBe(true);
    expect(box.maxLat).toBeLessThanOrEqual(90);
    expect(box.minLng).toBeGreaterThanOrEqual(-180);
    expect(box.maxLng).toBeLessThanOrEqual(180);
  });

  it("keeps every edge inside WGS-84 range for a very large radius", () => {
    const box = boundingBox(PORT_SUDAN, 20_000);
    expect(box.minLat).toBeGreaterThanOrEqual(-90);
    expect(box.maxLat).toBeLessThanOrEqual(90);
    expect(box.minLng).toBeGreaterThanOrEqual(-180);
    expect(box.maxLng).toBeLessThanOrEqual(180);
  });
});

describe("isValidCoords", () => {
  it("accepts an in-range pair", () => {
    expect(isValidCoords(PORT_SUDAN)).toBe(true);
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["missing lng", { lat: 10 }],
    ["missing lat", { lng: 10 }],
    ["NaN", { lat: Number.NaN, lng: 0 }],
    ["Infinity", { lat: 0, lng: Number.POSITIVE_INFINITY }],
    ["lat out of range", { lat: 91, lng: 0 }],
    ["lng out of range", { lat: 0, lng: 181 }],
  ])("rejects %s", (_label, value) => {
    expect(isValidCoords(value as Partial<Coords> | null | undefined)).toBe(false);
  });
});

describe("parseCoords", () => {
  it("parses a valid string pair", () => {
    expect(parseCoords("19.5856", "37.2159")).toEqual({ lat: 19.5856, lng: 37.2159 });
  });

  it("returns null when only one half is present", () => {
    // A half-pair is a malformed link. Honouring it would search a band around
    // a latitude, which is not what anyone asked for.
    expect(parseCoords("19.5856", undefined)).toBeNull();
    expect(parseCoords(undefined, "37.2159")).toBeNull();
  });

  it("returns null for empty strings and junk", () => {
    expect(parseCoords("", "")).toBeNull();
    expect(parseCoords("abc", "37.2")).toBeNull();
  });

  it("returns null for out-of-range values", () => {
    expect(parseCoords("999", "37.2")).toBeNull();
  });

  it("accepts zero, which is a real coordinate and must not read as absent", () => {
    expect(parseCoords("0", "0")).toEqual({ lat: 0, lng: 0 });
  });
});

describe("roundCoord", () => {
  it("trims to 4 decimal places (~11 m)", () => {
    expect(roundCoord(19.585612345)).toBe(19.5856);
    expect(roundCoord(-37.21594999)).toBe(-37.2159);
  });
});

describe("nearestBy", () => {
  const cities = [
    { name: "Khartoum", coords: KHARTOUM },
    { name: "Port Sudan", coords: PORT_SUDAN },
    { name: "Suakin", coords: SUAKIN },
  ];

  it("picks the closest entry", () => {
    const result = nearestBy(PORT_SUDAN, cities, (c) => c.coords);
    expect(result?.item.name).toBe("Port Sudan");
    expect(result?.distanceKm).toBeCloseTo(0, 6);
  });

  it("picks the closest when the origin is between candidates", () => {
    // Just north of Suakin — closer to Suakin than to Port Sudan.
    const result = nearestBy({ lat: 19.2, lng: 37.3 }, cities, (c) => c.coords);
    expect(result?.item.name).toBe("Suakin");
  });

  it("returns null for an empty list", () => {
    expect(nearestBy(PORT_SUDAN, [], () => null)).toBeNull();
  });

  it("skips entries with no coordinates", () => {
    const withGap = [{ name: "Unknown", coords: null }, ...cities];
    const result = nearestBy(KHARTOUM, withGap, (c) => c.coords);
    expect(result?.item.name).toBe("Khartoum");
  });
});
