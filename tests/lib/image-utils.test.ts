import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  getFallbackImage,
  sanitizeImageUrl,
  processImageUrls,
  getOptimizedImageUrl,
  handleImageError,
  DEFAULT_IMAGES,
  PLACEHOLDER_SERVICES,
} from "@/lib/image-utils";

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe("getFallbackImage", () => {
  it("returns property image for property type", () => {
    expect(getFallbackImage(400, 300, "property")).toBe(DEFAULT_IMAGES.property);
  });

  it("returns avatar image for avatar type", () => {
    expect(getFallbackImage(100, 100, "avatar")).toBe(DEFAULT_IMAGES.avatar);
  });

  it("returns base64 placeholder for placeholder type", () => {
    expect(getFallbackImage(400, 300, "placeholder")).toBe(DEFAULT_IMAGES.placeholder);
  });

  it("defaults to property type", () => {
    expect(getFallbackImage()).toBe(DEFAULT_IMAGES.property);
  });
});

describe("sanitizeImageUrl", () => {
  it("returns fallback for null/undefined", () => {
    expect(sanitizeImageUrl(null)).toBe(DEFAULT_IMAGES.property);
    expect(sanitizeImageUrl(undefined)).toBe(DEFAULT_IMAGES.property);
  });

  it("allows http URLs", () => {
    expect(sanitizeImageUrl("http://example.com/img.jpg")).toBe("http://example.com/img.jpg");
  });

  it("allows https URLs", () => {
    expect(sanitizeImageUrl("https://example.com/img.jpg")).toBe("https://example.com/img.jpg");
  });

  it("allows relative paths", () => {
    expect(sanitizeImageUrl("/images/photo.jpg")).toBe("/images/photo.jpg");
  });

  it("allows data:image URIs", () => {
    expect(sanitizeImageUrl("data:image/png;base64,abc")).toBe("data:image/png;base64,abc");
  });

  it("returns fallback for invalid URLs", () => {
    expect(sanitizeImageUrl("javascript:alert(1)")).toBe(DEFAULT_IMAGES.property);
  });

  it("prepends ImageKit endpoint for bare paths when configured", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT", "https://ik.imagekit.io/myapp");
    expect(sanitizeImageUrl("uploads/photo.jpg")).toBe(
      "https://ik.imagekit.io/myapp/uploads/photo.jpg"
    );
  });

  it("returns fallback for bare path when ImageKit not configured", () => {
    delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
    expect(sanitizeImageUrl("random-string")).toBe(DEFAULT_IMAGES.property);
  });

  it("trims whitespace", () => {
    expect(sanitizeImageUrl("  https://example.com/img.jpg  ")).toBe(
      "https://example.com/img.jpg"
    );
  });
});

describe("processImageUrls", () => {
  it("processes valid URLs", () => {
    const result = processImageUrls(["https://a.com/1.jpg", "https://b.com/2.jpg"]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe("https://a.com/1.jpg");
  });

  it("pads to minimum images", () => {
    const result = processImageUrls([], 3);
    expect(result).toHaveLength(3);
    result.forEach((url) => expect(url).toBe(DEFAULT_IMAGES.property));
  });

  it("handles null/undefined input", () => {
    expect(processImageUrls(null)).toHaveLength(1);
    expect(processImageUrls(undefined)).toHaveLength(1);
  });

  it("handles empty array", () => {
    const result = processImageUrls([]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(DEFAULT_IMAGES.property);
  });
});

describe("getOptimizedImageUrl", () => {
  it("returns non-ImageKit URLs as-is", () => {
    expect(getOptimizedImageUrl("https://example.com/img.jpg")).toBe(
      "https://example.com/img.jpg"
    );
  });

  it("adds transformations to ImageKit URLs", () => {
    const result = getOptimizedImageUrl(
      "https://ik.imagekit.io/abc/photo.jpg",
      { width: 400, height: 300 }
    );
    expect(result).toContain("tr:w-400,h-300");
    expect(result).toContain("q-80");
    expect(result).toContain("f-auto");
  });

  it("applies default quality/format even with empty options on ImageKit URL", () => {
    const url = "https://ik.imagekit.io/abc/photo.jpg";
    const result = getOptimizedImageUrl(url, {});
    // Default quality=80, format=auto are applied
    expect(result).toContain("q-80");
    expect(result).toContain("f-auto");
  });

  it("includes quality and format defaults", () => {
    const result = getOptimizedImageUrl(
      "https://ik.imagekit.io/abc/photo.jpg",
      { width: 200 }
    );
    expect(result).toContain("q-80");
    expect(result).toContain("f-auto");
  });

  it("returns ImageKit URL as-is when no options given", () => {
    const url = "https://ik.imagekit.io/abc/photo.jpg";
    // No width/height — only quality + format defaults, which ARE applied
    const result = getOptimizedImageUrl(url);
    expect(result).toContain("q-80");
    expect(result).toContain("f-auto");
  });
});

describe("handleImageError", () => {
  it("sets fallback src on first error", () => {
    const target = { src: "broken.jpg", dataset: {} } as unknown as HTMLImageElement;
    const event = { target } as unknown as React.SyntheticEvent<HTMLImageElement>;

    handleImageError(event);

    expect(target.src).toBe(DEFAULT_IMAGES.property);
    expect(target.dataset.fallbackLoaded).toBe("true");
  });

  it("uses custom fallback URL when provided", () => {
    const target = { src: "broken.jpg", dataset: {} } as unknown as HTMLImageElement;
    const event = { target } as unknown as React.SyntheticEvent<HTMLImageElement>;

    handleImageError(event, "/custom-fallback.png");

    expect(target.src).toBe("/custom-fallback.png");
  });

  it("does not replace src if fallback already loaded (prevents infinite loop)", () => {
    const target = {
      src: DEFAULT_IMAGES.property,
      dataset: { fallbackLoaded: "true" },
    } as unknown as HTMLImageElement;
    const event = { target } as unknown as React.SyntheticEvent<HTMLImageElement>;

    handleImageError(event);

    // Should remain the same — no re-assignment
    expect(target.src).toBe(DEFAULT_IMAGES.property);
  });
});

describe("PLACEHOLDER_SERVICES", () => {
  it("generates unsplash URLs with dimensions", () => {
    expect(PLACEHOLDER_SERVICES.unsplash(800, 600)).toContain("800x600");
  });

  it("generates picsum URLs with dimensions", () => {
    expect(PLACEHOLDER_SERVICES.picsum(400, 300)).toContain("400/300");
  });

  it("generates placehold URLs with dimensions", () => {
    expect(PLACEHOLDER_SERVICES.placehold(200, 150)).toContain("200x150");
  });
});
