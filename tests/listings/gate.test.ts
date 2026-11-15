import { describe, expect, it } from "vitest";

import { gateMove, gateOf, photosAreClean, type GateHome } from "@/lib/listing-gate-pure";

const broker: GateHome = {
  rentPeriod: "MONTHLY",
  priceMonth: 400_000,
  pricePerNight: null,
  photoUrls: ["a", "b", "c"],
  lostAt: null,
  claimedAt: null,
  hostPhone: null,
  contacts: [{ phones: ["+250700000001"] }],
  hasPlace: true,
  photosShowPhone: false,
};

describe("gateOf", () => {
  it("passes a broker home with a reachable broker, a price, a place and clean photos", () => {
    expect(gateOf(broker)).toEqual({ ok: true, reasons: [] });
  });

  it("fails an Airbnb home with nobody to ask", () => {
    const airbnb: GateHome = { ...broker, rentPeriod: "NIGHTLY", priceMonth: null, pricePerNight: 50_000, contacts: [] };
    expect(gateOf(airbnb).reasons).toEqual(["no-contact"]);
  });

  it("counts a host phone or a claimed home as contact", () => {
    expect(gateOf({ ...broker, contacts: [], hostPhone: "+250700000002" }).ok).toBe(true);
    expect(gateOf({ ...broker, contacts: [], claimedAt: new Date() }).ok).toBe(true);
  });

  it("does not count an opted-out, merged or number-less broker", () => {
    for (const c of [{ phones: ["+250700000001"], optOut: true }, { phones: ["+250700000001"], mergedIntoId: "x" }, { phones: [" "] }]) {
      expect(gateOf({ ...broker, contacts: [c] }).reasons).toContain("no-contact");
    }
    expect(gateOf({ ...broker, contacts: [{ phones: [], whatsapp: "+250700000003" }] }).ok).toBe(true);
  });

  it("names every other reason", () => {
    expect(gateOf({ ...broker, lostAt: new Date() }).reasons).toEqual(["lost"]);
    expect(gateOf({ ...broker, priceMonth: null }).reasons).toEqual(["no-price"]);
    expect(gateOf({ ...broker, priceMonth: 20_000_000 }).reasons).toEqual(["for-sale"]);
    expect(gateOf({ ...broker, hasPlace: false }).reasons).toEqual(["no-place"]);
    expect(gateOf({ ...broker, photoUrls: ["a", ""] }).reasons).toEqual(["few-photos"]);
    expect(gateOf({ ...broker, photosShowPhone: true }).reasons).toEqual(["photo-phone"]);
  });

  it("prices a nightly stay by the night", () => {
    expect(gateOf({ ...broker, rentPeriod: "NIGHTLY", priceMonth: 400_000, pricePerNight: null }).reasons).toEqual(["no-price"]);
  });
});

describe("photosAreClean", () => {
  it("is true only when every photo was re-made from the cleaned video", () => {
    expect(photosAreClean(["https://cdn/x/listing-photo/K1-1.jpg", "https://cdn/x/listing-photo/K1-2.jpg"])).toBe(true);
    expect(photosAreClean(["https://cdn/x/listing-photo/K1-1.jpg", "https://cdn/x/tiktok/1.jpg"])).toBe(false);
    expect(photosAreClean([])).toBe(false);
  });
});

describe("gateMove", () => {
  it("publishes a hidden home that passes and hides a public one that fails", () => {
    expect(gateMove(false, true, true)).toBe("publish");
    expect(gateMove(true, true, true)).toBe("publish");
    expect(gateMove(true, false, false)).toBe("hide");
    expect(gateMove(true, false, true)).toBeNull();
    expect(gateMove(false, true, false)).toBeNull();
  });
});
