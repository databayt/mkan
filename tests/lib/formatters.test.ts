import { describe, it, expect } from "vitest";

// Mock the config module before importing formatters
vi.mock("@/components/internationalization/config", () => ({
  i18n: { defaultLocale: "en", locales: ["en", "ar"] },
  localeConfig: {
    en: {
      name: "English",
      nativeName: "English",
      dir: "ltr",
      flag: "",
      dateFormat: "MM/dd/yyyy",
      currency: "USD",
    },
    ar: {
      name: "Arabic",
      nativeName: "Arabic",
      dir: "rtl",
      flag: "",
      dateFormat: "dd/MM/yyyy",
      currency: "SAR",
    },
  },
  isRTL: (locale: string) => locale === "ar",
}));

import {
  formatCurrency,
  formatNumber,
  formatDate,
  formatDateTime,
  formatTime,
  formatRelativeTime,
  getDateFormatPattern,
  formatPriceRange,
  formatPercentage,
} from "@/lib/i18n/formatters";

// ---------- formatCurrency ----------
describe("formatCurrency", () => {
  it("formats USD for en locale", () => {
    const result = formatCurrency(1500, "en");
    expect(result).toContain("1,500");
    expect(result).toContain("$");
  });

  it("formats SAR for ar locale", () => {
    const result = formatCurrency(1500, "ar");
    // Should contain the Arabic SAR formatting
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats SDG manually for en locale", () => {
    const result = formatCurrency(500, "en", "SDG");
    expect(result).toBe("SDG 500");
  });

  it("formats SDG manually for ar locale", () => {
    const result = formatCurrency(500, "ar", "SDG");
    expect(result).toContain("ج.س");
  });

  it("uses override currency when provided", () => {
    const result = formatCurrency(100, "en", "EUR");
    // Should contain Euro formatting
    expect(result).toBeTruthy();
  });

  it("handles zero amount", () => {
    const result = formatCurrency(0, "en");
    expect(result).toContain("$");
    expect(result).toContain("0");
  });
});

// ---------- formatNumber ----------
describe("formatNumber", () => {
  it("formats number for en locale", () => {
    expect(formatNumber(1234567, "en")).toBe("1,234,567");
  });

  it("formats number for ar locale", () => {
    const result = formatNumber(1234, "ar");
    // Arabic locale uses Arabic-Indic numerals or standard digits
    expect(result).toBeTruthy();
  });

  it("passes options through to Intl.NumberFormat", () => {
    const result = formatNumber(0.5, "en", {
      style: "percent",
      minimumFractionDigits: 0,
    });
    expect(result).toBe("50%");
  });
});

// ---------- formatDate ----------
describe("formatDate", () => {
  it("formats a Date object for en locale", () => {
    // Use a fixed date to avoid timezone issues
    const date = new Date(2025, 0, 15); // Jan 15, 2025
    const result = formatDate(date, "en");
    expect(result).toContain("Jan");
    expect(result).toContain("15");
    expect(result).toContain("2025");
  });

  it("formats a date string for en locale", () => {
    const result = formatDate("2025-06-20T00:00:00", "en");
    expect(result).toContain("Jun");
    expect(result).toContain("2025");
  });

  it("formats for ar locale", () => {
    const date = new Date(2025, 0, 15);
    const result = formatDate(date, "ar");
    expect(result).toBeTruthy();
  });

  it("accepts custom DateTimeFormat options", () => {
    const date = new Date(2025, 0, 15);
    const result = formatDate(date, "en", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    expect(result).toContain("January");
  });
});

// ---------- formatDateTime ----------
describe("formatDateTime", () => {
  it("formats date with time for en locale", () => {
    const date = new Date(2025, 5, 15, 14, 30);
    const result = formatDateTime(date, "en");
    expect(result).toContain("Jun");
    expect(result).toContain("15");
    expect(result).toContain("2025");
    // 12-hour format: 2:30 PM
    expect(result).toContain("2:30");
  });

  it("accepts string dates", () => {
    const result = formatDateTime("2025-01-01T10:00:00", "en");
    expect(result).toContain("Jan");
  });

  it("formats for ar locale", () => {
    const date = new Date(2025, 5, 15, 14, 30);
    const result = formatDateTime(date, "ar");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------- formatTime ----------
describe("formatTime", () => {
  it("formats time in 12-hour format for en", () => {
    const date = new Date(2025, 0, 1, 14, 30);
    const result = formatTime(date, "en");
    expect(result).toContain("2:30");
    expect(result).toMatch(/PM/i);
  });

  it("accepts string dates", () => {
    const result = formatTime("2025-01-01T09:15:00", "en");
    expect(result).toContain("9:15");
    expect(result).toMatch(/AM/i);
  });

  it("formats for ar locale", () => {
    const date = new Date(2025, 0, 1, 14, 30);
    const result = formatTime(date, "ar");
    expect(result).toBeTruthy();
  });
});

// ---------- formatRelativeTime ----------
describe("formatRelativeTime", () => {
  it("returns relative time for days in the past", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
    const result = formatRelativeTime(threeDaysAgo, "en");
    expect(result).toContain("3");
    expect(result.toLowerCase()).toContain("day");
  });

  it("returns relative time for days in the future", () => {
    const threeDaysAhead = new Date(Date.now() + 3 * 86400 * 1000);
    const result = formatRelativeTime(threeDaysAhead, "en");
    expect(result).toContain("3");
    expect(result.toLowerCase()).toContain("day");
  });

  it("uses seconds for very recent times", () => {
    const fiveSecsAgo = new Date(Date.now() - 5 * 1000);
    const result = formatRelativeTime(fiveSecsAgo, "en");
    expect(result).toContain("second");
  });

  it("uses minutes for times within an hour", () => {
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const result = formatRelativeTime(tenMinsAgo, "en");
    expect(result).toContain("minute");
  });

  it("uses hours for times within a day", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    const result = formatRelativeTime(twoHoursAgo, "en");
    expect(result).toContain("hour");
  });

  it("uses months for times within a year", () => {
    const twoMonthsAgo = new Date(Date.now() - 60 * 86400 * 1000);
    const result = formatRelativeTime(twoMonthsAgo, "en");
    expect(result).toContain("month");
  });

  it("uses years for times beyond a year", () => {
    const twoYearsAgo = new Date(Date.now() - 730 * 86400 * 1000);
    const result = formatRelativeTime(twoYearsAgo, "en");
    expect(result).toContain("year");
  });

  it("works for ar locale", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
    const result = formatRelativeTime(threeDaysAgo, "ar");
    expect(result).toBeTruthy();
    expect(result.length).toBeGreaterThan(0);
  });

  it("accepts string dates", () => {
    const past = new Date(Date.now() - 86400 * 1000).toISOString();
    const result = formatRelativeTime(past, "en");
    expect(result).toBeTruthy();
  });
});

// ---------- getDateFormatPattern ----------
describe("getDateFormatPattern", () => {
  it("returns MM/dd/yyyy for en", () => {
    expect(getDateFormatPattern("en")).toBe("MM/dd/yyyy");
  });

  it("returns dd/MM/yyyy for ar", () => {
    expect(getDateFormatPattern("ar")).toBe("dd/MM/yyyy");
  });
});

// ---------- formatPriceRange ----------
describe("formatPriceRange", () => {
  it("formats a range with two different prices", () => {
    const result = formatPriceRange(100, 500, "en");
    expect(result).toContain("$100");
    expect(result).toContain("$500");
    expect(result).toContain(" - ");
  });

  it("returns single price when min equals max", () => {
    const result = formatPriceRange(200, 200, "en");
    expect(result).toContain("$200");
    expect(result).not.toContain(" - ");
  });

  it("works for ar locale", () => {
    const result = formatPriceRange(100, 500, "ar");
    expect(result).toContain(" - ");
  });

  it("accepts custom currency", () => {
    const result = formatPriceRange(10, 50, "en", "SDG");
    expect(result).toContain("SDG");
  });
});

// ---------- formatPercentage ----------
describe("formatPercentage", () => {
  it("formats decimal as percentage for en", () => {
    const result = formatPercentage(0.15, "en");
    expect(result).toBe("15%");
  });

  it("formats 1.0 as 100% for en", () => {
    const result = formatPercentage(1, "en");
    expect(result).toBe("100%");
  });

  it("formats 0 as 0%", () => {
    const result = formatPercentage(0, "en");
    expect(result).toBe("0%");
  });

  it("formats for ar locale", () => {
    const result = formatPercentage(0.5, "ar");
    expect(result).toBeTruthy();
  });

  it("rounds to 1 decimal max", () => {
    const result = formatPercentage(0.1234, "en");
    // 12.34% should round to 12.3%
    expect(result).toBe("12.3%");
  });
});
