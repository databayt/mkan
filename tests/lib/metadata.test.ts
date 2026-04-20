import { describe, it, expect } from "vitest";
import { createMetadata } from "@/lib/metadata";

describe("createMetadata", () => {
  it("generates title with site name suffix", () => {
    const meta = createMetadata({ title: "Home", description: "Welcome" });
    expect(meta.title).toBe("Home | Mkan");
  });

  it("sets description", () => {
    const meta = createMetadata({ title: "X", description: "Desc text" });
    expect(meta.description).toBe("Desc text");
  });

  it("defaults locale to en and builds correct URL", () => {
    const meta = createMetadata({ title: "T", description: "D", path: "/search" });
    const og = meta.openGraph as Record<string, unknown>;
    // default locale is "en"
    expect(og.url).toContain("/en/search");
    expect(og.locale).toBe("en_US");
  });

  it("uses ar locale with ar_SA OG locale", () => {
    const meta = createMetadata({ title: "T", description: "D", locale: "ar" });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.url).toContain("/ar");
    expect(og.locale).toBe("ar_SA");
  });

  it("builds openGraph with site name and type", () => {
    const meta = createMetadata({ title: "T", description: "D" });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.siteName).toBe("Mkan");
    expect(og.type).toBe("website");
  });

  it("uses default OG image when none provided", () => {
    const meta = createMetadata({ title: "T", description: "D" });
    const og = meta.openGraph as Record<string, unknown>;
    const images = og.images as Array<{ url: string }>;
    expect(images[0].url).toContain("/og-default.png");
  });

  it("uses custom image when provided", () => {
    const meta = createMetadata({
      title: "T",
      description: "D",
      image: "https://cdn.example.com/img.jpg",
    });
    const og = meta.openGraph as Record<string, unknown>;
    const images = og.images as Array<{ url: string }>;
    expect(images[0].url).toBe("https://cdn.example.com/img.jpg");
  });

  it("sets twitter card as summary_large_image", () => {
    const meta = createMetadata({ title: "T", description: "D" });
    const tw = meta.twitter as Record<string, unknown>;
    expect(tw.card).toBe("summary_large_image");
    expect(tw.title).toBe("T | Mkan");
  });

  it("sets alternates for en and ar", () => {
    const meta = createMetadata({ title: "T", description: "D", path: "/about" });
    const langs = (meta.alternates as Record<string, unknown>).languages as Record<string, string>;
    expect(langs.en).toContain("/en/about");
    expect(langs.ar).toContain("/ar/about");
  });

  it("handles empty path", () => {
    const meta = createMetadata({ title: "T", description: "D" });
    const og = meta.openGraph as Record<string, unknown>;
    // path defaults to ""
    expect((og.url as string).endsWith("/en")).toBe(true);
  });
});
