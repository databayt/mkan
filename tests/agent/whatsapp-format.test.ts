import { describe, expect, it } from "vitest";
import en from "@/components/internationalization/en.json";
import ar from "@/components/internationalization/ar.json";
import { formatWhatsApp, isFresh, readPick, readRef, waLang, type WaDict } from "@/components/agent/whatsapp-format";
import type { AgentMessage, AgentTaskView, ShortlistItem } from "@/components/agent/types";

const dict = (d: typeof en): WaDict => d.agent as unknown as WaDict;
const APP = "https://mkan.sd";
const CHAT = "https://mkan.sd/en/find?c=task1";
const at = "2026-10-24T10:00:00Z";

const home = (id: number, over: Partial<ShortlistItem> = {}): ShortlistItem => ({
  id,
  path: `/en/listings/k${id}`,
  title: `Home ${id}`,
  photo: null,
  district: "KICUKIRO",
  zone: null,
  bedrooms: 2,
  bathrooms: 1,
  rating: null,
  reviews: null,
  currency: "RWF",
  rentPeriod: "MONTHLY",
  score: 1,
  reasons: [],
  cost: { headline: 400_000, period: "month", lines: [], total: 0, totalHigh: 0 },
  duplicates: 0,
  availability: "unconfirmed",
  ...over,
});

const view = (agent: AgentMessage, shortlist: ShortlistItem[] = []): AgentTaskView => ({
  id: "task1",
  status: "DONE",
  locale: "en",
  messages: [{ role: "user", text: "2 bedroom in Kicukiro", at }, agent],
  requirements: null,
  shortlist,
  events: [],
  startedAt: at,
  version: "v",
  demand: null,
});

describe("formatWhatsApp", () => {
  it("lists at most three homes with price, place and an absolute link, then the chat link", () => {
    const v = view({ role: "agent", kind: "shortlist", count: 5, at }, [1, 2, 3, 4, 5].map((i) => home(i)));
    const out = formatWhatsApp(v, dict(en), "en", CHAT, APP);
    expect(out).toContain("I found 5 homes");
    expect(out).toContain("*1. Home 1* · RWF 400,000/month");
    expect(out).toContain("https://mkan.sd/en/listings/k1");
    expect(out).not.toContain("Home 4");
    expect(out.endsWith(CHAT)).toBe(true);
  });

  it("prefers the reply the writer wrote, and offers the broker check only for unconfirmed leads", () => {
    const lead = home(7, { path: "https://www.tiktok.com/@b/video/1", lead: { handle: "b", sourceUrl: "https://www.tiktok.com/@b/video/1" } });
    const out = formatWhatsApp(view({ role: "agent", kind: "shortlist", count: 1, text: "Here is one in Niboye.", at }, [lead]), dict(en), "en", CHAT, APP);
    expect(out.startsWith("Here is one in Niboye.")).toBe(true);
    expect(out).toContain("https://www.tiktok.com/@b/video/1");
    expect(out).toContain("Reply with a home's number");
    const plain = formatWhatsApp(view({ role: "agent", kind: "shortlist", count: 1, at }, [home(1)]), dict(en), "en", CHAT, APP);
    expect(plain).not.toContain("Reply with a home's number");
  });

  it("turns the clarify stepper into one numbered question", () => {
    const out = formatWhatsApp(view({ role: "agent", kind: "clarify", fields: ["homeType", "furnished"], at }), dict(en), "en", CHAT, APP);
    expect(out).toContain("What kind of home?");
    expect(out).toContain("1. Apartment");
    expect(out).toContain("4. Studio");
    expect(out).not.toContain("Furnished or unfurnished?");
  });

  it("writes Arabic from the Arabic dictionary", () => {
    const out = formatWhatsApp(view({ role: "agent", kind: "error", at }), dict(ar as typeof en), "ar", CHAT, APP);
    expect(out).toMatch(/[؀-ۿ]/);
  });
});

describe("readPick", () => {
  it("maps a digit to a clarify option label, a home check, or nothing", () => {
    const clarify = view({ role: "agent", kind: "clarify", fields: ["homeType"], at });
    expect(readPick("3", clarify, dict(en))).toEqual({ kind: "text", text: "Room" });
    expect(readPick("٢", clarify, dict(en))).toEqual({ kind: "text", text: "House with its own gate" });
    const list = view({ role: "agent", kind: "shortlist", count: 2, at }, [home(11), home(12)]);
    expect(readPick("2", list, dict(en))).toEqual({ kind: "check", listingId: 12 });
    expect(readPick("3", list, dict(en))).toBeNull();
    expect(readPick("2 bedrooms", list, dict(en))).toBeNull();
    expect(readPick("1", null, dict(en))).toBeNull();
  });
});

describe("message reading", () => {
  it("detects the language, the ref and a fresh start", () => {
    expect(waLang("أبحث عن شقة")).toBe("ar");
    expect(waLang("Muraho, ndashaka inzu")).toBe("rw");
    expect(waLang("2 bedroom Kicukiro")).toBe("en");
    expect(readRef("Continue my Mkan search ref:cmh2abcdefghijklmnopqrst")).toEqual({ ref: "cmh2abcdefghijklmnopqrst", rest: "Continue my Mkan search" });
    expect(isFresh("New search")).toBe(true);
    expect(isFresh("new apartment in Remera")).toBe(false);
  });
});
