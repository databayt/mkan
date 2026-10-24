/**
 * Listing-photo variant ladder (src/lib/image-variants.ts).
 *
 * The Worker turns every /_next/image request for a CDN photo into one of
 * these URLs, and the offline generator writes exactly these files — so a
 * drift between the two is a 403 that silently sends a photo back to the slow
 * optimizer. These pin which sources qualify, which width maps to which file,
 * and that the completion marker stays the last file written.
 */
import { describe, expect, it } from "vitest";
import {
  coverBlurOf,
  hasVariants,
  pickVariantSuffix,
  variantFiles,
  variantUrl,
} from "@/lib/image-variants";

const PHOTO =
  "https://cdn.databayt.org/mkan/uploads/894782420239606632/b989dcfa-f4f8-4f47-b076-98161096385c.jpg";
const BASE =
  "https://cdn.databayt.org/mkan/uploads/894782420239606632/b989dcfa-f4f8-4f47-b076-98161096385c";

describe("pickVariantSuffix", () => {
  it("maps every next.config width onto the three-file ladder", () => {
    const widths = [16, 32, 48, 64, 96, 128, 256, 360, 640, 750, 828, 1080, 1200, 1920];
    expect(widths.map(pickVariantSuffix)).toEqual([
      "sm", "sm", "sm", "sm", "sm", "sm", "sm", "sm",
      "md", "md", "md",
      "lg", "lg", "lg",
    ]);
  });

  it("allows a 5% undershoot before jumping a slot", () => {
    expect(pickVariantSuffix(840)).toBe("md");
    expect(pickVariantSuffix(841)).toBe("lg");
  });
});

describe("variantUrl", () => {
  it("points a CDN photo at its pre-made file in the asked format", () => {
    expect(variantUrl(PHOTO, 750, "avif")).toBe(`${BASE}-md.avif`);
    expect(variantUrl(PHOTO, 1080, "webp")).toBe(`${BASE}-lg.webp`);
    expect(variantUrl(PHOTO.replace(".jpg", ".webp"), 256, "avif")).toBe(`${BASE}-sm.avif`);
  });

  it("covers mkan's own art outside uploads (hero, destinations)", () => {
    expect(variantUrl("https://cdn.databayt.org/mkan/hero.png", 1920, "webp")).toBe(
      "https://cdn.databayt.org/mkan/hero-lg.webp",
    );
  });

  it("returns null for anything without variants", () => {
    expect(variantUrl(null, 640, "avif")).toBeNull();
    expect(variantUrl("/assets/sudan-travel-banner.jpg", 640, "avif")).toBeNull();
    expect(variantUrl("https://cdn.databayt.org/airbnb/glyph.png", 640, "avif")).toBeNull();
    expect(variantUrl("https://cdn.databayt.org/mkan/assets/Islands.svg", 640, "avif")).toBeNull();
    expect(variantUrl(`${PHOTO}?v=2`, 640, "avif")).toBeNull();
    expect(variantUrl("https://a0.muscache.com/im/pictures/x.jpeg", 640, "avif")).toBeNull();
    expect(variantUrl(`${BASE}-md.webp`, 640, "avif")).toBeNull();
    expect(variantUrl(PHOTO, Number.NaN, "avif")).toBeNull();
    expect(variantUrl(PHOTO, 0, "avif")).toBeNull();
  });

  it("only trusts the configured host", () => {
    expect(hasVariants(PHOTO.replace("cdn.databayt.org", "evil.example"))).toBe(false);
    expect(variantUrl(PHOTO.replace("https://", "http://"), 640, "avif")).toBeNull();
  });
});

describe("variantFiles", () => {
  it("writes all six files with lg.avif — the done marker — last", () => {
    const files = variantFiles();
    expect(files).toHaveLength(6);
    expect(files.at(-1)).toMatchObject({ suffix: "lg", format: "avif" });
    expect(new Set(files.map((f) => `${f.suffix}.${f.format}`)).size).toBe(6);
  });
});

describe("coverBlurOf", () => {
  const blur = "data:image/webp;base64,UklGRg==";

  it("returns the stored blur while it belongs to the current cover", () => {
    expect(coverBlurOf({ photoUrls: [PHOTO, "b.jpg"], coverBlur: blur, coverBlurUrl: PHOTO })).toBe(blur);
  });

  it("drops a blur made from an older cover", () => {
    expect(coverBlurOf({ photoUrls: ["new-cover.jpg", PHOTO], coverBlur: blur, coverBlurUrl: PHOTO })).toBeUndefined();
  });

  it("is undefined with no photos, no blur, or no source recorded", () => {
    expect(coverBlurOf({ photoUrls: [], coverBlur: blur, coverBlurUrl: PHOTO })).toBeUndefined();
    expect(coverBlurOf({ photoUrls: [PHOTO], coverBlur: null, coverBlurUrl: PHOTO })).toBeUndefined();
    expect(coverBlurOf({ photoUrls: [PHOTO], coverBlur: blur })).toBeUndefined();
    expect(coverBlurOf({})).toBeUndefined();
  });
});
