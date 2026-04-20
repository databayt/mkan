import { describe, it, expect } from "vitest";
import { formatRangeDate, formatGuests, formatPrice } from "@/lib/row-utils";

// ---------- formatRangeDate ----------
describe("formatRangeDate", () => {
  it("formats a date range with month and day", () => {
    const start = new Date("2025-03-10");
    const end = new Date("2025-03-15");
    const result = formatRangeDate(start, end);
    // en-US short month format: "Mar 10 - Mar 15"
    expect(result).toContain("Mar");
    expect(result).toContain("10");
    expect(result).toContain("15");
    expect(result).toContain(" - ");
  });

  it("returns empty string when startDate is null", () => {
    expect(formatRangeDate(null, new Date())).toBe("");
  });

  it("returns empty string when endDate is null", () => {
    expect(formatRangeDate(new Date(), null)).toBe("");
  });

  it("returns empty string when both dates are null", () => {
    expect(formatRangeDate(null, null)).toBe("");
  });
});

// ---------- formatGuests ----------
describe("formatGuests", () => {
  describe("number input", () => {
    it("returns empty string for 0 guests", () => {
      expect(formatGuests(0)).toBe("");
    });

    it("returns empty string for negative number", () => {
      expect(formatGuests(-1)).toBe("");
    });

    it("returns singular for 1 guest", () => {
      expect(formatGuests(1)).toBe("1 guest");
    });

    it("returns plural for multiple guests", () => {
      expect(formatGuests(3)).toBe("3 guests");
    });
  });

  describe("object input (GuestsState)", () => {
    it("returns empty string when total is 0", () => {
      expect(
        formatGuests({ adults: 0, children: 0, infants: 0, pets: 0 })
      ).toBe("");
    });

    it("returns singular when total adults+children is 1", () => {
      expect(
        formatGuests({ adults: 1, children: 0, infants: 0, pets: 0 })
      ).toBe("1 guest");
    });

    it("returns plural guests with sum of adults and children", () => {
      expect(
        formatGuests({ adults: 2, children: 1, infants: 0, pets: 0 })
      ).toBe("3 guests");
    });

    it("appends singular infant", () => {
      expect(
        formatGuests({ adults: 2, children: 0, infants: 1, pets: 0 })
      ).toBe("2 guests, 1 infant");
    });

    it("appends plural infants", () => {
      expect(
        formatGuests({ adults: 1, children: 0, infants: 3, pets: 0 })
      ).toBe("1 guest, 3 infants");
    });

    it("appends singular pet", () => {
      expect(
        formatGuests({ adults: 2, children: 0, infants: 0, pets: 1 })
      ).toBe("2 guests, 1 pet");
    });

    it("appends plural pets", () => {
      expect(
        formatGuests({ adults: 2, children: 0, infants: 0, pets: 2 })
      ).toBe("2 guests, 2 pets");
    });

    it("appends both infants and pets", () => {
      expect(
        formatGuests({ adults: 2, children: 1, infants: 1, pets: 2 })
      ).toBe("3 guests, 1 infant, 2 pets");
    });
  });
});

// ---------- formatPrice ----------
describe("formatPrice", () => {
  it("formats as USD currency with no decimals", () => {
    expect(formatPrice(100)).toBe("$100");
  });

  it("formats thousands with commas", () => {
    expect(formatPrice(1500)).toBe("$1,500");
  });

  it("formats zero", () => {
    expect(formatPrice(0)).toBe("$0");
  });

  it("formats large numbers", () => {
    expect(formatPrice(1000000)).toBe("$1,000,000");
  });
});
