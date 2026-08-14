import { describe, it, expect } from "vitest";

import {
  FUNNEL_THRESHOLDS as T,
  computeRates,
  diagnose,
  type FunnelCounts,
} from "@/lib/analytics/diagnose";

/** A funnel healthy enough that each test can break exactly one stage. */
const healthy: FunnelCounts = {
  listings: 200,
  views: 4000, // 20 per listing
  inquiries: 200, // 5%
  visits: 100, // 50%
  rentals: 40, // 40%
};

describe("computeRates", () => {
  it("computes every ratio the dashboard shows", () => {
    const r = computeRates(healthy);
    expect(r.viewsPerListing).toBe(20);
    expect(r.viewToInquiry).toBe(5);
    expect(r.inquiryToVisit).toBe(50);
    expect(r.visitToRental).toBe(40);
    expect(r.inquiryToRental).toBe(20);
  });

  // The distinction that keeps an empty dashboard from looking like a failing
  // one: "no data" must not render as "0%".
  it("returns null, not zero, when the denominator is zero", () => {
    const r = computeRates({ listings: 0, views: 0, inquiries: 0, visits: 0, rentals: 0 });
    expect(r.viewsPerListing).toBeNull();
    expect(r.viewToInquiry).toBeNull();
    expect(r.inquiryToVisit).toBeNull();
    expect(r.visitToRental).toBeNull();
    expect(r.inquiryToRental).toBeNull();
  });

  it("reports a real zero rate when there IS a denominator", () => {
    const r = computeRates({ ...healthy, inquiries: 0, visits: 0, rentals: 0 });
    expect(r.viewToInquiry).toBe(0);
    expect(r.inquiryToVisit).toBeNull(); // no inquiries to convert
  });
});

describe("diagnose", () => {
  it("says healthy when no stage starves the next", () => {
    expect(diagnose(healthy).stage).toBe("healthy");
  });

  it("blames supply when the catalogue is thin", () => {
    const d = diagnose({ ...healthy, listings: 12 });
    expect(d.stage).toBe("supply");
    expect(d.observed).toBe(12);
    expect(d.threshold).toBe(T.minListings);
  });

  // The ordering guarantee. A thin catalogue with a terrible conversion rate is
  // a supply problem wearing a disguise — diagnosing "fix your photos" there
  // would waste the week on 12 listings nobody can find.
  it("blames supply BEFORE conversion, even when conversion also looks bad", () => {
    const d = diagnose({ listings: 5, views: 5000, inquiries: 1, visits: 0, rentals: 0 });
    expect(d.stage).toBe("supply");
  });

  it("blames demand when listings exist but nobody sees them", () => {
    const d = diagnose({ ...healthy, views: 200 }); // 1 view per listing
    expect(d.stage).toBe("demand");
    expect(d.threshold).toBe(T.minViewsPerListing);
  });

  it("blames listing quality when people look and leave", () => {
    const d = diagnose({ ...healthy, inquiries: 20 }); // 0.5%
    expect(d.stage).toBe("listing-quality");
    expect(d.threshold).toBe(T.minViewToInquiryPct);
  });

  it("blames response when inquiries never become viewings", () => {
    const d = diagnose({ ...healthy, visits: 10 }); // 5%
    expect(d.stage).toBe("response");
    expect(d.threshold).toBe(T.minInquiryToVisitPct);
  });

  it("blames closing when viewings never become rentals", () => {
    const d = diagnose({ ...healthy, rentals: 5 }); // 5%
    expect(d.stage).toBe("closing");
    expect(d.threshold).toBe(T.minVisitToRentalPct);
  });

  // Sample floors. A 0% conversion on 3 views is not a finding, and a dashboard
  // that presents it as one teaches people to ignore the dashboard.
  it("diagnoses conversion once the view sample is large enough", () => {
    const d = diagnose({ listings: 200, views: 1200, inquiries: 0, visits: 0, rentals: 0 });
    expect(d.stage).toBe("listing-quality");
  });

  it("reports insufficient data rather than inventing a finding", () => {
    // Clears supply and demand (200 listings, 1000 views = 5/listing) but the
    // absolute view count is under the sample floor.
    const d = diagnose({ listings: 10, views: 50, inquiries: 0, visits: 0, rentals: 0 }, {
      ...T,
      minListings: 5,
      minViewsPerListing: 1,
    });
    expect(d.stage).toBe("insufficient-data");
    expect(d.threshold).toBe(T.minSampleViews);
  });

  it("stops at insufficient-data for visits before claiming a closing problem", () => {
    const d = diagnose({ listings: 200, views: 4000, inquiries: 200, visits: 2, rentals: 0 });
    // 2 visits off 200 inquiries is a response problem, caught before the
    // visit sample floor is reached.
    expect(d.stage).toBe("response");

    const enoughVisits = diagnose({
      listings: 200,
      views: 4000,
      inquiries: 200,
      visits: 80,
      rentals: 0,
    });
    expect(enoughVisits.stage).toBe("closing");
  });

  it("honours overridden thresholds", () => {
    const strict = diagnose(healthy, { ...T, minListings: 500 });
    expect(strict.stage).toBe("supply");
  });
});
