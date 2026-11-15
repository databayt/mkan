import { describe, expect, it } from "vitest";
import en from "@/components/internationalization/en.json";
import ar from "@/components/internationalization/ar.json";
import rw from "@/components/internationalization/rw.json";
import { asksForToday } from "@/components/agent/today-pure";
import { afterHomesKind, firstMessageKind, formatWhatsApp, isFresh, readPick, refSourceOf, TODAY_MARK, waLang, type WaDict } from "@/components/agent/whatsapp-format";
import { followUpKind } from "@/components/agent/follow-up";
import type { AgentTaskView, ShortlistItem } from "@/components/agent/types";
import { noteFacts, noteNumbers, sameHomes, templateNote } from "@/components/today/note-pure";
import { allowedNumbers, guardText } from "@/components/agent/writer";

describe("asksForToday — the whole message is the ask", () => {
  it.each([
    "today", "Today's homes", "today’s homes?", "what's new", "What is new today", "new homes", "latest", "show me the latest homes",
    "اليوم", "بيوت اليوم", "الجديد", "جديد", "ما الجديد؟", "uyu munsi", "ibishya", "Amazu y'uyu munsi", "aujourd'hui", "nouveautés", "quoi de neuf",
  ])("%s", (t) => expect(asksForToday(t)).toBe(true));
  it.each(["new", "New", "today I need 2 bedrooms in Remera", "I need a house", "latest news about the president", "K5808", "thanks", ""])("%s is not", (t) =>
    expect(asksForToday(t)).toBe(false),
  );
  it("the bare word new stays the new-chat command on WhatsApp", () => {
    expect(isFresh("new")).toBe(true);
    expect(asksForToday("new")).toBe(false);
  });
});

describe("the chats let the ask through to the turn", () => {
  it("a first message is a tenant's, not a stranger's", () => {
    for (const t of ["today", "what's new", "uyu munsi", "اليوم"]) expect(firstMessageKind(t)).toBe("rental");
  });
  it("under the homes it runs the turn (WhatsApp), and /find does not take it for a follow-up line", () => {
    for (const t of ["today", "ibishya", "بيوت اليوم"]) {
      expect(afterHomesKind(t)).toBe("search");
      expect(followUpKind(t)).toBe("search");
    }
  });
  it("Kinyarwanda words set the chat's language", () => {
    expect(waLang("uyu munsi")).toBe("rw");
    expect(waLang("ibishya")).toBe("rw");
  });
  it("the /today button's message counts as the today source", () => {
    expect(refSourceOf(`Check K5811 for me ${TODAY_MARK}`, null)).toBe("today");
    expect(refSourceOf("Check K5811 for me tiktok_bio", null)).toBe("tiktok_bio");
  });
});

const at = "2026-11-15T10:00:00Z";
const home = (id: number): ShortlistItem => ({
  id, path: `/en/k/K${id}`, title: `Home ${id}`, photo: null, district: "KICUKIRO", zone: null, bedrooms: 2, bathrooms: 1, rating: null, reviews: null,
  currency: "RWF", rentPeriod: "MONTHLY", score: 1, reasons: [], cost: { headline: 300_000, period: "month", lines: [], total: 0, totalHigh: 0 },
  duplicates: 0, availability: "unconfirmed", lead: { handle: null, sourceUrl: "https://tiktok.com/x" },
});
const view = (n: number, earlier = false): AgentTaskView => ({
  id: "t1", status: "DONE", locale: "en",
  messages: [{ role: "user", text: "today", at }, { role: "agent", kind: "shortlist", count: n, text: "Posted today on Mkan's TikTok: homes", today: { day: "2026-11-15", ...(earlier ? { earlier: true } : {}) }, at }],
  requirements: null, shortlist: Array.from({ length: n }, (_, i) => home(i + 1)), events: [], startedAt: at, version: "v", demand: null,
});
const dict = (d: typeof en): WaDict => d.agent as unknown as WaDict;

describe("WhatsApp renders today's homes", () => {
  it("numbered 1-3, how many more, and the /today link instead of the chat link", () => {
    const out = formatWhatsApp(view(5), dict(en), "en", "https://mkan.sd/en/find?c=t1", "https://mkan.sd");
    expect(out.startsWith("Posted today")).toBe(true);
    expect(out).toContain("*1. Home 1*");
    expect(out).toContain("*3. Home 3*");
    expect(out).not.toContain("Home 4");
    expect(out).toContain("2 more posted today");
    expect(out.endsWith("https://mkan.sd/en/today")).toBe(true);
    expect(out).not.toContain("/find?c=");
  });
  it("three or fewer: no count", () => {
    const out = formatWhatsApp(view(2), dict(en), "en", "x", "https://mkan.sd");
    expect(out).toContain("All of today's homes");
    expect(out).not.toMatch(/\d more/);
  });
  it("speaks Arabic and Kinyarwanda", () => {
    expect(formatWhatsApp(view(4), dict(ar as typeof en), "ar", "x", "https://mkan.sd")).toContain("https://mkan.sd/ar/today");
    expect(formatWhatsApp(view(4), dict(rw as typeof en), "rw", "x", "https://mkan.sd")).toContain("https://mkan.sd/rw/today");
  });
  it("a digit picks a home like on any shortlist", () => {
    expect(readPick("2", view(3), dict(en))).toEqual({ kind: "check", listingId: 2 });
  });
});

const homes = [
  { id: 1, priceMonth: 150_000, currency: "RWF", bedrooms: 1, place: { en: "Kimironko", ar: "كيميرونكو", rw: "Kimironko" } },
  { id: 2, priceMonth: 400_000, currency: "RWF", bedrooms: 3, place: { en: "Remera", ar: "ريميرا", rw: "Remera" } },
  { id: 3, priceMonth: 250_000, currency: "RWF", bedrooms: 2, place: { en: "Kimironko", ar: "كيميرونكو", rw: "Kimironko" } },
];

describe("the day's note", () => {
  const f = noteFacts("2026-11-15", homes)!;
  it("facts: count, distinct areas, rent range, bedrooms", () => {
    expect(f).toMatchObject({ count: 3, rentMin: 150_000, rentMax: 400_000, bedsMin: 1, bedsMax: 3, ids: [1, 2, 3] });
    expect(f.areas.en).toEqual(["Kimironko", "Remera"]);
  });
  it("no homes, no facts", () => expect(noteFacts("2026-11-15", [])).toBeNull());
  it.each(["en", "ar"] as const)("the %s template passes the writer's own guard", (lang) => {
    const t = templateNote(f, lang);
    expect(guardText(t, { allowed: allowedNumbers(noteNumbers(f)), maxLen: 260, lang, anyConfirmed: false, allowMoney: true })).toBe(t);
  });
  it("the template states only the facts", () => {
    const t = templateNote(f, "en");
    expect(t).toContain("3 homes");
    expect(t).toContain("RWF 150,000 – RWF 400,000");
    expect(t).not.toMatch(/availab/i);
  });
  it("the guard refuses a price outside the facts, 300k, and 'available'", () => {
    const g = (s: string) => guardText(s, { allowed: allowedNumbers(noteNumbers(f)), maxLen: 260, lang: "en", anyConfirmed: false, allowMoney: true });
    expect(g("3 homes, from RWF 150,000.")).not.toBeNull();
    expect(g("3 homes from RWF 120,000.")).toBeNull();
    expect(g("3 homes around 300k.")).toBeNull();
    expect(g("3 homes, all available.")).toBeNull();
    expect(g("5 homes today.")).toBeNull();
  });
  it("rewrites only when the homes change", () => {
    expect(sameHomes([1, 2, 3], f.ids)).toBe(true);
    expect(sameHomes([1, 2], f.ids)).toBe(false);
  });
});
