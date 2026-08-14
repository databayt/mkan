import { describe, it, expect } from "vitest";

import {
  ZONE_THRESHOLDS as T,
  acquisitionTargets,
  classifyZones,
  type ZoneMetrics,
} from "@/lib/analytics/zones";

/** Enough views everywhere that demand is readable, unless a test says otherwise. */
const base = (over: Partial<ZoneMetrics> & { key: string }): ZoneMetrics => ({
  listings: 20,
  views: 400,
  inquiries: 8,
  rentals: 1,
  ...over,
});

describe("classifyZones", () => {
  it("computes per-listing demand, not absolute views", () => {
    // Zone A: 4 homes, 40 views = 10/listing. Zone B: 60 homes, 120 = 2/listing.
    // A is in higher demand even though B has more total traffic.
    const { stats } = classifyZones([
      base({ key: "A", listings: 4, views: 40 }),
      base({ key: "B", listings: 60, views: 120 }),
    ]);
    const a = stats.find((z) => z.key === "A")!;
    const b = stats.find((z) => z.key === "B")!;
    expect(a.viewsPerListing).toBe(10);
    expect(b.viewsPerListing).toBe(2);
  });

  it("flags high-demand + low-supply as the acquire quadrant", () => {
    // One clearly-hot small zone against a big sleepy one to set the median.
    const { stats } = classifyZones([
      base({ key: "hot", listings: 6, views: 300 }), // 50/listing, 6 homes
      base({ key: "big", listings: 60, views: 300 }), // 5/listing, 60 homes
    ]);
    expect(stats.find((z) => z.key === "hot")!.quadrant).toBe("high-demand-low-supply");
  });

  it("flags high-demand + healthy-supply as hold/convert", () => {
    const { stats } = classifyZones([
      base({ key: "big-hot", listings: 40, views: 2000 }), // 50/listing, 40 homes
      base({ key: "sleepy", listings: 40, views: 200 }), // 5/listing
    ]);
    expect(stats.find((z) => z.key === "big-hot")!.quadrant).toBe("high-demand-healthy-supply");
  });

  it("flags low-demand + high-supply as do-not-acquire", () => {
    const { stats } = classifyZones([
      base({ key: "glut", listings: 60, views: 120 }), // 2/listing, over-supplied
      base({ key: "hot", listings: 5, views: 500 }), // 100/listing sets a high median
    ]);
    expect(stats.find((z) => z.key === "glut")!.quadrant).toBe("low-demand-high-supply");
  });

  it("flags low-demand + low-supply as monitor", () => {
    const { stats } = classifyZones([
      base({ key: "quiet", listings: 5, views: 25 }), // 5/listing, few homes
      base({ key: "hot", listings: 5, views: 500 }), // 100/listing sets the median high
    ]);
    expect(stats.find((z) => z.key === "quiet")!.quadrant).toBe("low-demand-low-supply");
  });

  it("reports insufficient-data rather than mislabelling a zone with no traffic", () => {
    const { stats } = classifyZones([
      base({ key: "new", listings: 3, views: 5 }), // under the view floor
      base({ key: "hot", listings: 5, views: 500 }),
    ]);
    expect(stats.find((z) => z.key === "new")!.quadrant).toBe("insufficient-data");
  });

  it("calls every zone insufficient-data when nobody has traffic yet", () => {
    // The launch-day state: real supply, zero demand. Nothing should be labelled
    // low-demand, because that's a claim we have no evidence for.
    const { stats, medianViewsPerListing } = classifyZones([
      base({ key: "a", listings: 40, views: 0 }),
      base({ key: "b", listings: 10, views: 0 }),
    ]);
    expect(medianViewsPerListing).toBeNull();
    expect(stats.every((z) => z.quadrant === "insufficient-data")).toBe(true);
  });
});

describe("acquisitionTargets", () => {
  it("returns only acquire-quadrant zones, ranked by unmet demand", () => {
    const { stats } = classifyZones([
      base({ key: "hot-tiny", listings: 3, views: 300 }), // 100/listing, big shortfall
      base({ key: "hot-mid", listings: 10, views: 300 }), // 30/listing, small shortfall
      base({ key: "big-hot", listings: 40, views: 2000 }), // healthy supply — excluded
      base({ key: "glut", listings: 60, views: 120 }), // low demand — excluded
    ]);
    const targets = acquisitionTargets(stats);

    expect(targets.every((z) => z.quadrant === "high-demand-low-supply")).toBe(true);
    expect(targets.map((z) => z.key)).not.toContain("big-hot");
    expect(targets.map((z) => z.key)).not.toContain("glut");
    // hot-tiny has both higher intensity and a bigger shortfall, so it ranks first.
    expect(targets[0]!.key).toBe("hot-tiny");
  });

  it("returns nothing when no zone is short on supply", () => {
    const { stats } = classifyZones([
      base({ key: "a", listings: 40, views: 2000 }),
      base({ key: "b", listings: 40, views: 400 }),
    ]);
    expect(acquisitionTargets(stats)).toHaveLength(0);
  });

  it("respects the limit", () => {
    const zones = Array.from({ length: 8 }, (_, i) =>
      base({ key: `z${i}`, listings: 2, views: 200 + i }),
    );
    // add a big healthy zone to anchor the median low so all the small ones qualify
    zones.push(base({ key: "anchor", listings: 50, views: 100 }));
    const { stats } = classifyZones(zones);
    expect(acquisitionTargets(stats, 5).length).toBeLessThanOrEqual(5);
  });

  it("uses the documented thresholds", () => {
    expect(T.healthySupply).toBe(15);
    expect(T.minViewsToClassify).toBe(20);
  });
});
