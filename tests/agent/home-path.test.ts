import { describe, expect, it } from "vitest";
import { forTenant, homeIdOfRef, homePath } from "@/components/agent/home-path";
import type { ShortlistItem } from "@/components/agent/types";

const item = (over: Partial<ShortlistItem>) => ({ id: 5808, title: "2-bed in Kibagabaga", path: "/en/listings/5808", ...over }) as ShortlistItem;

describe("Mkan's own page for a home", () => {
  it("is /<lang>/k/K<id>, and reads its code back", () => {
    expect(homePath("en", 5808)).toBe("/en/k/K5808");
    expect(homePath("rw", 12)).toBe("/rw/k/K12");
    for (const r of ["K5808", "k5808", "K-5808", "%4B5808"]) expect(homeIdOfRef(r), r).toBe(5808);
    for (const r of ["5808", "K", "K0", "Kabc", "K58080000"]) expect(homeIdOfRef(r), r).toBeNull();
  });

  it("is where a tenant's link to a broker home goes — never the broker's ad or handle (11-01)", () => {
    const lead = item({ path: "https://www.tiktok.com/@metissenoir237/video/7702082537702591762", lead: { handle: "metissenoir237", sourceUrl: "https://www.tiktok.com/@metissenoir237/video/7702082537702591762" } });
    const seen = forTenant(lead, "en");
    expect(seen.path).toBe("/en/k/K5808");
    expect(seen.lead).toEqual({ handle: null, sourceUrl: null });
    expect(JSON.stringify(seen)).not.toMatch(/tiktok|metissenoir/);
    // A published listing keeps its own page.
    const listing = item({});
    expect(forTenant(listing, "en")).toBe(listing);
  });
});
