import { describe, it, expect } from "vitest";
import { createMetadata } from "@/lib/metadata";

describe("createMetadata", () => {
  it("passes title through without suffix (root layout applies title.template)", () => {
    const meta = createMetadata({ title: "Home", description: "Welcome" });
    expect(meta.title).toBe("Home");
    // OpenGraph title carries the site-name suffix since OG doesn't use template
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.title).toBe("Home | Mkan");
  });

  it("sets description", () => {
    const meta = createMetadata({ title: "X", description: "Desc text" });
    expect(meta.description).toBe("Desc text");
  });

  it("defaults locale to ar and builds correct URL", () => {
    const meta = createMetadata({ title: "T", description: "D", path: "/search" });
    const og = meta.openGraph as Record<string, unknown>;
    // default locale is "ar"
    expect(og.url).toContain("/ar/search");
    // Sudan product → ar_SD (not ar_SA / Saudi Arabia)
    expect(og.locale).toBe("ar_SD");
  });

  it("uses ar locale with ar_SD OG locale", () => {
    const meta = createMetadata({ title: "T", description: "D", locale: "ar" });
    const og = meta.openGraph as Record<string, unknown>;
    expect(og.url).toContain("/ar");
    expect(og.locale).toBe("ar_SD");
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
    // path defaults to "", locale defaults to "ar"
    expect((og.url as string).endsWith("/ar")).toBe(true);
  });
});
