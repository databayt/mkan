import { describe, expect, it } from "vitest";
import { afterHomesKind, chatText, isBareYes, sameHomesText, visitText } from "@/components/agent/whatsapp-format";
import { EMPTY_REQUIREMENTS, parseAdjustments } from "@/components/agent/requirements";

// What real tenants wrote under the homes (10-26..11-01). Every one of these got the same six homes
// again; each now gets what it asked for.
describe("afterHomesKind", () => {
  it("runs the search when the message states or changes something about a home", () => {
    for (const t of ["2 bedroom in Kicukiro", "Cheaper", "unfurnished", "Give me more options", "Something near Kigali Heights", "Kimironko 300k", "with parking", "another one", "K5808"]) {
      expect(afterHomesKind(t), t).toBe("search");
    }
  });
  it("reads a price complaint as cheaper", () => {
    expect(afterHomesKind("It's a lot of money")).toBe("search");
    expect(parseAdjustments("It's a lot of money", EMPTY_REQUIREMENTS).set.cheap).toBe(true);
    expect(parseAdjustments("too expensive", EMPTY_REQUIREMENTS).set.cheap).toBe(true);
    expect(parseAdjustments("Birahenze cyane", EMPTY_REQUIREMENTS).set.cheap).toBe(true);
    expect(parseAdjustments("an expensive villa in Nyarutarama", EMPTY_REQUIREMENTS).set.cheap).toBeUndefined();
  });
  it("asks which one when they ask if it is still available", () => {
    expect(afterHomesKind("Are you still available?")).toBe("check");
    expect(afterHomesKind("is it still available")).toBe("check");
  });
  it("asks which home and a time when they want to meet or see it", () => {
    expect(afterHomesKind("Can we meet now")).toBe("visit");
    expect(afterHomesKind("I want to see it")).toBe("visit");
    expect(afterHomesKind("Turebe inzu ejo")).toBe("visit");
  });
  it("says what Mkan's assistant is", () => {
    for (const t of ["What is this", "?", "who are you", "ما هذا؟"]) expect(afterHomesKind(t), t).toBe("about");
  });
  it("answers small talk with a line, not homes", () => {
    for (const t of ["How are you", "Hello", "You sleeping", "Good Evening", "So how is it today?", "Muraho", "كيف حالك"]) expect(afterHomesKind(t), t).toBe("chat");
  });
  it("hands anything else to a person", () => {
    for (const t of ["Why you can't ask?", "Babe", "Muherereyehe ngo tubazanire ibintu", "0786000001"]) expect(afterHomesKind(t), t).toBe("person");
  });
});

describe("a bare yes under the homes", () => {
  it("counts emoji-only and 'all good' acknowledgements", () => {
    for (const t of ["All 👍👍😁", "👍👍", "all good", "perfect", "ok"]) expect(isBareYes(t), t).toBe(true);
    for (const t of ["2 bedroom", "How are you", "Babe"]) expect(isBareYes(t), t).toBe(false);
  });
});

describe("the lines", () => {
  it("name the range and never list homes", () => {
    expect(sameHomesText("en", 3)).toContain("1 to 3");
    expect(sameHomesText("ar", 3)).toContain("من 1 إلى 3");
    expect(visitText("rw", 2)).toContain("kuva kuri 1 kugeza kuri 2");
    expect(visitText("en", 1)).toContain(", 1:");
    expect(chatText("en")).toMatch(/assistant/);
  });
});
