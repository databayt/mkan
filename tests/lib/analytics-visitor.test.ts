import { describe, it, expect, beforeEach, afterEach } from "vitest";

import {
  dayKey,
  dayDate,
  dailySalt,
  visitorHash,
  isBot,
} from "@/lib/analytics/visitor";

const ORIGINAL = process.env.ANALYTICS_SALT_SECRET;

beforeEach(() => {
  process.env.ANALYTICS_SALT_SECRET = "test-secret";
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ANALYTICS_SALT_SECRET;
  else process.env.ANALYTICS_SALT_SECRET = ORIGINAL;
});

describe("dayKey / dayDate", () => {
  it("buckets by UTC calendar day", () => {
    expect(dayKey(new Date("2026-08-14T00:00:00.000Z"))).toBe("2026-08-14");
    expect(dayKey(new Date("2026-08-14T23:59:59.999Z"))).toBe("2026-08-14");
    expect(dayKey(new Date("2026-08-15T00:00:00.000Z"))).toBe("2026-08-15");
  });

  it("maps a day key back to midnight UTC for the DATE column", () => {
    expect(dayDate("2026-08-14").toISOString()).toBe("2026-08-14T00:00:00.000Z");
  });
});

describe("dailySalt", () => {
  // The bug this guards against: a randomly generated salt looks fine locally
  // and silently breaks deduplication in production, because each serverless
  // instance would hold a different one and the same visitor would hash
  // differently depending on which lambda served the request.
  it("is deterministic for the same day and secret", () => {
    expect(dailySalt("2026-08-14")).toBe(dailySalt("2026-08-14"));
  });

  it("differs across days", () => {
    expect(dailySalt("2026-08-14")).not.toBe(dailySalt("2026-08-15"));
  });

  it("differs across secrets", () => {
    const a = dailySalt("2026-08-14");
    process.env.ANALYTICS_SALT_SECRET = "another-secret";
    expect(dailySalt("2026-08-14")).not.toBe(a);
  });
});

describe("visitorHash", () => {
  const visitor = { ip: "41.223.10.5", userAgent: "Mozilla/5.0 (iPhone)" };

  it("is stable within a day, so a refresh is the same visitor", () => {
    expect(visitorHash({ ...visitor, day: "2026-08-14" })).toBe(
      visitorHash({ ...visitor, day: "2026-08-14" }),
    );
  });

  it("rotates across days, so visitors are not linkable over time", () => {
    expect(visitorHash({ ...visitor, day: "2026-08-14" })).not.toBe(
      visitorHash({ ...visitor, day: "2026-08-15" }),
    );
  });

  it("separates different IPs and different user agents", () => {
    const base = visitorHash({ ...visitor, day: "2026-08-14" });
    expect(visitorHash({ ...visitor, ip: "41.223.10.6", day: "2026-08-14" })).not.toBe(base);
    expect(visitorHash({ ...visitor, userAgent: "Mozilla/5.0 (Android)", day: "2026-08-14" })).not.toBe(base);
  });

  it("does not leak the raw IP", () => {
    expect(visitorHash({ ...visitor, day: "2026-08-14" })).not.toContain("41.223");
  });
});

describe("isBot", () => {
  it("rejects crawlers that would otherwise dominate view counts", () => {
    for (const ua of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (compatible; bingbot/2.0)",
      "facebookexternalhit/1.1",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Mozilla/5.0 HeadlessChrome/120.0.0.0",
      "ClaudeBot/1.0",
      "Mozilla/5.0 (compatible; AhrefsBot/7.0)",
    ]) {
      expect(isBot(ua), ua).toBe(true);
    }
  });

  it("treats a missing or empty user agent as a bot", () => {
    expect(isBot(null)).toBe(true);
    expect(isBot(undefined)).toBe(true);
    expect(isBot("   ")).toBe(true);
  });

  it("accepts real browsers", () => {
    for (const ua of [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      "Mozilla/5.0 (Linux; Android 13; SM-A536E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    ]) {
      expect(isBot(ua), ua).toBe(false);
    }
  });
});
