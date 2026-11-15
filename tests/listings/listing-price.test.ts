import { describe, it, expect } from "vitest";
import { cardPrice } from "@/lib/listing-price";

describe("cardPrice", () => {
  it("nightly home shows pricePerNight per night", () => {
    expect(cardPrice({ rentPeriod: "NIGHTLY", pricePerNight: 80, priceMonth: null })).toEqual({ amount: 80, per: "night" });
  });
  it("missing rentPeriod defaults to nightly", () => {
    expect(cardPrice({ pricePerNight: 50 })).toEqual({ amount: 50, per: "night" });
  });
  it("monthly home shows priceMonth per month", () => {
    expect(cardPrice({ rentPeriod: "MONTHLY", pricePerNight: null, priceMonth: 350000 })).toEqual({ amount: 350000, per: "month" });
  });
  it("monthly home ignores a stray nightly price", () => {
    expect(cardPrice({ rentPeriod: "MONTHLY", pricePerNight: 10, priceMonth: 200000 })?.per).toBe("month");
  });
  it("returns null instead of 0", () => {
    expect(cardPrice({ rentPeriod: "MONTHLY", pricePerNight: null, priceMonth: null })).toBeNull();
    expect(cardPrice({ rentPeriod: "NIGHTLY", pricePerNight: null, priceMonth: 5 })).toBeNull();
    expect(cardPrice({ rentPeriod: "NIGHTLY", pricePerNight: 0 })).toBeNull();
  });
});
