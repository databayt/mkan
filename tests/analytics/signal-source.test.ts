import { describe, expect, it } from "vitest";

import { classifyReferrer, cleanSource, readSourceCookie, sanitizeSource, sourceOfVisit, withSourceMarker } from "@/lib/analytics/source";

describe("sanitizeSource", () => {
  it("keeps a clean marker, lowercased", () => {
    expect(sanitizeSource("fb-kimironko")).toBe("fb-kimironko");
    expect(sanitizeSource(" WA_Status ")).toBe("wa_status");
  });
  it("refuses anything else", () => {
    for (const bad of ["", "a b", "x".repeat(33), "fb;drop", "<script>", "é", null, undefined, 5]) expect(sanitizeSource(bad)).toBeNull();
    expect(cleanSource("not clean!")).toBe("direct");
    expect(cleanSource("gbp")).toBe("gbp");
  });
});

describe("classifyReferrer", () => {
  const own = "mkan.sd";
  it("names the big platforms", () => {
    expect(classifyReferrer("https://www.tiktok.com/@mkan.rw", own)).toBe("tiktok");
    expect(classifyReferrer("https://l.facebook.com/l.php?u=x", own)).toBe("facebook");
    expect(classifyReferrer("https://m.facebook.com/", own)).toBe("facebook");
    expect(classifyReferrer("https://fb.com/x", own)).toBe("facebook");
    expect(classifyReferrer("https://l.instagram.com/", own)).toBe("instagram");
    expect(classifyReferrer("https://www.google.rw/", own)).toBe("google");
    expect(classifyReferrer("https://www.google.co.uk/", own)).toBe("google");
    expect(classifyReferrer("https://wa.me/250780984777", own)).toBe("whatsapp");
    expect(classifyReferrer("https://web.whatsapp.com/", own)).toBe("whatsapp");
    expect(classifyReferrer("https://t.co/abc", own)).toBe("x");
    expect(classifyReferrer("https://twitter.com/", own)).toBe("x");
    expect(classifyReferrer("android-app://com.facebook.katana", own)).toBe("facebook");
  });
  it("other for any other external host, direct for none or the same site", () => {
    expect(classifyReferrer("https://example.org/page", own)).toBe("other");
    expect(classifyReferrer("", own)).toBe("direct");
    expect(classifyReferrer(null, own)).toBe("direct");
    expect(classifyReferrer("not a url", own)).toBe("direct");
    expect(classifyReferrer("https://mkan.sd/en/find", own)).toBe("direct");
    expect(classifyReferrer("https://www.mkan.sd/en", own)).toBe("direct");
    expect(classifyReferrer("https://evil-google.com.example.org/", own)).toBe("other");
  });
});

describe("sourceOfVisit", () => {
  it("a ?s= marker wins over the referrer", () => {
    expect(sourceOfVisit({ search: "?s=fb-kimironko", referrer: "https://www.tiktok.com/", ownHost: "mkan.sd" })).toBe("fb-kimironko");
  });
  it("falls back to the referrer, then direct", () => {
    expect(sourceOfVisit({ search: "?x=1", referrer: "https://www.tiktok.com/", ownHost: "mkan.sd" })).toBe("tiktok");
    expect(sourceOfVisit({ search: "", referrer: "", ownHost: "mkan.sd" })).toBe("direct");
    expect(sourceOfVisit({ search: "?s=bad marker!", referrer: "", ownHost: "mkan.sd" })).toBe("direct");
  });
  it("the signed /find chat link's ?s= is not a marker", () => {
    expect(sourceOfVisit({ search: "?c=abc&s=Abcdef0123456789", referrer: "", ownHost: "mkan.sd" })).toBe("direct");
  });
});

describe("readSourceCookie", () => {
  it("reads mkan_src out of a cookie string", () => {
    expect(readSourceCookie("a=1; mkan_src=fb-kimironko; b=2")).toBe("fb-kimironko");
    expect(readSourceCookie("a=1")).toBeNull();
    expect(readSourceCookie("mkan_src=%3Cbad%3E")).toBeNull();
  });
});

describe("withSourceMarker", () => {
  const href = `https://wa.me/250780984777?text=${encodeURIComponent("Check K5808 for me mkan_today")}`;
  it("appends the marker to the prefilled text", () => {
    const out = withSourceMarker(href, "fb-kimironko");
    expect(decodeURIComponent(out.split("text=")[1]!)).toBe("Check K5808 for me mkan_today s:fb-kimironko");
  });
  it("leaves direct, a link with no text and an already-marked link alone", () => {
    expect(withSourceMarker(href, "direct")).toBe(href);
    expect(withSourceMarker("https://wa.me/250780984777", "tiktok")).toBe("https://wa.me/250780984777");
    const marked = withSourceMarker(href, "tiktok");
    expect(withSourceMarker(marked, "facebook")).toBe(marked);
  });
  it("keeps other query parts intact", () => {
    const out = withSourceMarker("https://wa.me/1?text=hi&x=1", "gbp");
    expect(out).toBe("https://wa.me/1?text=hi%20s%3Agbp&x=1");
  });
});
