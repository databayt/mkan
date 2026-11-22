/**
 * The live feed to Mkan's person (2026-11-15): one short line per deal step, live until 10 deals are paid,
 * 🧪 for a rehearsal, nothing for the booking (it reaches him as its own message), never twice.
 */
import { describe, expect, it } from "vitest";
import { feedLabel, feedLine, feedMode, kigaliLabel, shortRwf } from "@/components/agent/loop-feed-pure";

const facts = { title: "2-bed", area: "Kimironko", rent: 350_000 };

describe("the feed mode", () => {
  it("is live until 10 deals are paid, then a digest", () => {
    expect(feedMode(0, undefined)).toBe("live");
    expect(feedMode(9, undefined)).toBe("live");
    expect(feedMode(10, undefined)).toBe("digest");
  });
  it("is overridden by MKAN_LOOP_FEED and silent with no number to write to", () => {
    expect(feedMode(0, "digest")).toBe("digest");
    expect(feedMode(50, "live")).toBe("live");
    expect(feedMode(0, "off")).toBe("off");
    expect(feedMode(0, "nonsense")).toBe("live");
    expect(feedMode(0, "live", false)).toBe("off");
  });
});

describe("a feed line", () => {
  it("says the code, what happened, the home, the tenant and what comes next", () => {
    const line = feedLine("BROKER_YES", { listingId: 5811, hours: 6, tenantPhone: "+250788123456" }, facts)!;
    expect(line).toBe("K5811 · broker said yes after 6 h · Kimironko 2-bed 350k · tenant +250788123456 · next: the line asks the tenant for a time");
  });

  it("marks a team number as a rehearsal", () => {
    expect(feedLine("PICKED", { listingId: 5811 }, { ...facts, test: true })).toMatch(/^🧪 TEST · K5811 · tenant picked it/);
  });

  it("leaves out the booking, which the rep already gets in viewing-loop.ts", () => {
    expect(feedLine("VIEWING_BOOKED", { listingId: 5811 }, facts)).toBeNull();
  });

  it("gives the time, the share and the reason where the step has them", () => {
    const at = new Date("2026-11-17T08:00:00Z");
    expect(feedLine("TIME_PROPOSED", { listingId: 5811, viewingAt: at }, facts)).toContain("Tue 17 Nov, 10:00");
    expect(feedLine("SIGNED", { listingId: 5811, share: 9000 }, facts)).toContain("Mkan's share 9k");
    expect(feedLine("SIGNED", { listingId: 5811, share: 9000 }, facts)).toContain("paid K5811");
    expect(feedLine("LOST", { listingId: 5811, note: "taken" }, facts)).toContain("lost: taken");
    // A stall is an FYI of what the line did — never a task for Abdout (2026-11-22).
    const stalled = feedLine("STALLED", { listingId: 5811, note: "first follow-up sent: 2 new Kabeza homes (K6711, K6720), no reply yet", n: 1 }, facts)!;
    expect(stalled).toContain("quiet — first follow-up sent: 2 new Kabeza homes");
    expect(stalled).toContain("nothing to do, the line is on it");
    expect(stalled).not.toMatch(/your call/);
    expect(feedLine("STALLED", { listingId: 5811, note: "the agent could not answer (timeout)" }, facts)).not.toMatch(/your call/);
  });

  it("works with nothing known about the home", () => {
    expect(feedLine("PICKED", { listingId: 12 }, {})).toBe("K12 · tenant picked it · next: the line asks the broker if it is free");
  });
});

describe("the label that stops a second send", () => {
  it("is one per deal and step, and a new time is a new step", () => {
    expect(feedLabel("t1:5811", "PICKED")).toBe("loop:t1:5811:PICKED");
    // Two follow-ups to one quiet tenant are two lines, not one swallowed as a repeat.
    expect(feedLabel("t1:5811", "STALLED", null, 1)).toBe("loop:t1:5811:STALLED");
    expect(feedLabel("t1:5811", "STALLED", null, 2)).toBe("loop:t1:5811:STALLED:2");
    const a = feedLabel("t1:5811", "TIME_PROPOSED", new Date("2026-11-17T08:00:00Z"));
    const b = feedLabel("t1:5811", "TIME_PROPOSED", new Date("2026-11-17T09:00:00Z"));
    expect(a).not.toBe(b);
    expect(a).toBe(feedLabel("t1:5811", "TIME_PROPOSED", new Date("2026-11-17T08:00:00Z")));
  });
});

describe("small formats", () => {
  it("shortens rent and prints Kigali time", () => {
    expect(shortRwf(350_000)).toBe("350k");
    expect(shortRwf(1_200_000)).toBe("1.2M");
    expect(kigaliLabel(new Date("2026-11-17T08:00:00Z"))).toBe("Tue 17 Nov, 10:00");
  });
});
