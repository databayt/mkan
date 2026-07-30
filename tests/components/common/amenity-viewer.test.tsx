// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The real dictionaries, not a stub — the whole question is whether a listing
// carrying the widened `Amenity` enum renders human labels or leaks raw enum
// names like "CarbonMonoxideAlarm" onto the page.
const en = JSON.parse(
  readFileSync(resolve(__dirname, "../../../src/components/internationalization/en.json"), "utf8")
);
const ar = JSON.parse(
  readFileSync(resolve(__dirname, "../../../src/components/internationalization/ar.json"), "utf8")
);

let dict: unknown = en;
vi.mock("@/components/internationalization/dictionary-context", () => ({
  useDictionary: () => dict,
}));
let locale = "en";
vi.mock("@/components/internationalization/use-locale", () => ({
  useLocale: () => ({ locale, isRTL: locale === "ar" }),
}));

import AmenityViewer from "@/components/listings/amenity-viewer";
import MobileAmenities from "@/components/listings/mobile-amenities";

/** Every value in the Prisma enum, read from the schema so this can't drift. */
const ALL_AMENITIES = (() => {
  const schema = readFileSync(resolve(__dirname, "../../../prisma/schema.prisma"), "utf8");
  const block = schema.match(/enum\s+Amenity\s*\{([^}]*)\}/)![1];
  return block
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter(Boolean);
})();

const renderAt = (lang: "en" | "ar", Comp: React.ComponentType<{ amenities?: string[] }>, amenities: string[]) => {
  locale = lang;
  dict = lang === "ar" ? ar : en;
  return render(<Comp amenities={amenities} />);
};

describe("the enum is fully renderable", () => {
  it("covers all 41 values, so the schema and this test agree on scope", () => {
    expect(ALL_AMENITIES).toHaveLength(41);
    expect(ALL_AMENITIES).toContain("Kitchen");
    expect(ALL_AMENITIES).toContain("CarbonMonoxideAlarm");
  });

  for (const lang of ["en", "ar"] as const) {
    it(`renders every value with a real label and an icon in ${lang}`, () => {
      const { container } = renderAt(lang, AmenityViewer, ALL_AMENITIES);
      const labels = (lang === "ar" ? ar : en).rental.property.amenities as Record<string, string>;

      for (const value of ALL_AMENITIES) {
        const label = labels[value];
        expect(label, `${value} has no ${lang} label`).toBeTruthy();
        // The label is on screen…
        expect(screen.getAllByText(label).length, `${label} not rendered`).toBeGreaterThan(0);
        // …and it is not the enum name leaking through featureLabel's
        // raw-value fallback, which is what a missing dictionary key produces.
        // Only checkable where the two differ — plenty of labels legitimately
        // equal their enum name ("Kitchen", "TV", "Dishwasher", "Piano").
        if (label !== value) {
          expect(screen.queryByText(value), `${value} rendered as a raw enum name`).toBeNull();
        }
      }

      // One icon per row — a missing icon-map entry falls back to a check
      // glyph rather than nothing, so count rather than assume.
      expect(container.querySelectorAll("svg")).toHaveLength(ALL_AMENITIES.length);
    });
  }

  it("renders Arabic labels that are actually Arabic", () => {
    // A copy-paste slip leaving English in ar.json would still pass the
    // "has a label" check above.
    const labels = ar.rental.property.amenities as Record<string, string>;
    for (const value of ALL_AMENITIES) {
      expect(/[؀-ۿ]/.test(labels[value]), `${value}: "${labels[value]}" is not Arabic`).toBe(true);
    }
  });
});

describe("AmenityViewer (desktop)", () => {
  it("renders the amenities a real Sudan listing carries", () => {
    // Listing #1062's actual stored set.
    renderAt("en", AmenityViewer, [
      "Kitchen", "WiFi", "DedicatedWorkspace", "Parking", "PetsAllowed", "TV",
      "WasherDryer", "AirConditioning", "PatioOrBalcony", "CarbonMonoxideAlarm", "BedroomLock",
    ]);
    expect(screen.getByText("What this place offers")).toBeInTheDocument();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
    expect(screen.getByText("TV")).toBeInTheDocument();
    expect(screen.getByText("Carbon monoxide alarm")).toBeInTheDocument();
    expect(screen.getByText("Lock on bedroom door")).toBeInTheDocument();
  });

  it("renders nothing at all when the listing has no amenities", () => {
    // Honest-info rule: an empty block would imply "this place offers nothing".
    const { container } = renderAt("en", AmenityViewer, []);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("MobileAmenities", () => {
  it("caps the list at 10 and offers the real total", () => {
    renderAt("en", MobileAmenities, ALL_AMENITIES);
    expect(screen.getByText(`Show all ${ALL_AMENITIES.length} amenities`)).toBeInTheDocument();
    // Only the first 10 rows are visible before expanding.
    expect(screen.getByText("Washer/Dryer")).toBeInTheDocument();
    expect(screen.queryByText("Exterior security cameras on property")).toBeNull();
  });

  it("does not cap a listing that fits", () => {
    renderAt("en", MobileAmenities, ["Kitchen", "WiFi", "TV"]);
    expect(screen.queryByText(/Show all/)).toBeNull();
    expect(screen.getByText("Kitchen")).toBeInTheDocument();
  });

  it("says 'show all' in Arabic", () => {
    renderAt("ar", MobileAmenities, ALL_AMENITIES);
    expect(
      screen.getByText(`عرض جميع وسائل الراحة (${ALL_AMENITIES.length})`)
    ).toBeInTheDocument();
    // First row of the capped list, in Arabic — "مطبخ" is the 14th enum value
    // and correctly sits behind the cap.
    expect(screen.getByText("غسالة/مجفف")).toBeInTheDocument();
    expect(screen.queryByText("مطبخ")).toBeNull();
  });
});
