import { describe, expect, it } from "vitest";
import en from "@/components/internationalization/en.json";
import ar from "@/components/internationalization/ar.json";
import { aboutHomes, askAroundText, botText, checkText, firstMessageKind, formatWhatsApp, isBareYes, isFresh, isThanks, onlyGreetedSoFar, readHomeRef, readPick, readRef, saysYes, shownHomes, thanksText, waLang, wantsPerson, whichOneText, type WaDict } from "@/components/agent/whatsapp-format";
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

describe("home refs from TikTok posts", () => {
  const lead = (id: number) => home(id, { path: `https://www.tiktok.com/@b/video/${id}`, lead: { handle: "b", sourceUrl: `https://www.tiktok.com/@b/video/${id}` } });

  it("reads K5808 anywhere, a bare 4–6 digit message, and never a phone number", () => {
    expect(readHomeRef("K5808")).toBe(5808);
    expect(readHomeRef("hi, is k-5808 still there?")).toBe(5808);
    expect(readHomeRef("5808")).toBe(5808);
    expect(readHomeRef("0786485237")).toBeNull();
    expect(readHomeRef("2 bedroom 400k")).toBeNull();
    expect(readHomeRef("1")).toBeNull();
  });

  it("leads with the ref's home and asks whether to check it", () => {
    const out = formatWhatsApp(view({ role: "agent", kind: "shortlist", count: 3, pin: { id: 5808, found: true }, at }, [lead(5808), lead(2), lead(3)]), dict(en), "en", CHAT, APP);
    expect(out.startsWith("Here's K5808:")).toBe(true);
    expect(out).toContain("*1. Home 5808*");
    expect(out).toContain("Reply *1*");
    expect(out).not.toContain("budget");
  });

  it("says plainly when the ref's home is gone", () => {
    const out = formatWhatsApp(view({ role: "agent", kind: "shortlist", count: 1, pin: { id: 5808, found: false }, at }, [lead(2)]), dict(en), "en", CHAT, APP);
    expect(out.startsWith("K5808 isn't available any more, sorry. Here are homes like it:")).toBe(true);
    const none = formatWhatsApp(view({ role: "agent", kind: "none", demand: true, asked: 0, pin: { id: 5808, found: false }, at }), dict(en), "en", CHAT, APP);
    expect(none.startsWith("K5808 isn't available any more, sorry.")).toBe(true);
  });

  it("turns yes into a check of the ref's home, and into asking around when nothing fit", () => {
    const pinned = view({ role: "agent", kind: "shortlist", count: 2, pin: { id: 5808, found: true }, at }, [lead(5808), lead(2)]);
    expect(readPick("yes", pinned, dict(en))).toEqual({ kind: "check", listingId: 5808 });
    expect(readPick("2", pinned, dict(en))).toEqual({ kind: "check", listingId: 2 });
    const none = view({ role: "agent", kind: "none", demand: true, asked: 0, at });
    expect(readPick("yes", none, dict(en))).toEqual({ kind: "askAround" });
    expect(readPick("ndiyo", none, dict(en))).toEqual({ kind: "askAround" });
    expect(readPick("no thanks", none, dict(en))).toBeNull();
    expect(formatWhatsApp(none, dict(en), "en", CHAT, APP)).toContain("Reply *yes*");
  });
});

describe("honest answers", () => {
  it("says what happened to a check: asked, handed to a person, or nothing to ask", () => {
    expect(checkText("en", "asked", "Flat")).toMatch(/I've asked the broker/);
    expect(checkText("en", "handed", "Flat")).toMatch(/checking "Flat" with the broker now/);
    expect(checkText("en", "none", "Flat")).toMatch(/can't get an answer/);
    expect(askAroundText("en", { asked: 3, handed: false })).toMatch(/asking brokers/);
    expect(askAroundText("en", { asked: 0, handed: false })).toMatch(/couldn't find a broker/);
  });

  it("never claims to be a person, and finds one when asked", () => {
    const t = botText("en", "Osman");
    expect(t).toMatch(/Mkan's assistant/);
    expect(t).not.toMatch(/I'm (a )?(real )?(person|human)/i);
    expect(wantsPerson("person")).toBe(true);
    expect(wantsPerson("a real person")).toBe(true);
    expect(wantsPerson("person with 2 kids")).toBe(false);
    expect(saysYes("Yes!")).toBe(true);
    expect(saysYes("yes but cheaper")).toBe(false);
  });
});

describe("who a first message is from", () => {
  it("answers someone looking for a home, or saying hello", () => {
    for (const t of ["K5808", "5808", "I need a 2 bedroom in Kicukiro", "house for rent?", "budget 400k", "Ndashaka inzu i Remera", "شقة في كيغالي", "Is it still available?"]) expect(firstMessageKind(t), t).toBe("rental");
    for (const t of ["Hello", "hi 👋", "Good morning", "Muraho", "What is this?", "who is this"]) expect(firstMessageKind(t), t).toBe("greeting");
  });

  it("leaves to a person the friends who knew the number before it was Mkan's", () => {
    // Real first messages to the line, 10-27..11-01.
    for (const t of ["Babe", "You sleeping", "Can we meet now", "0786485237"]) expect(firstMessageKind(t), t).toBe("other");
  });
});

describe("after a hello", () => {
  const hello = [
    { role: "user", text: "Hello", at: "2026-11-01T11:42:52Z" },
    { role: "agent", kind: "clarify", fields: ["homeType", "furnished", "purpose"], at: "2026-11-01T11:42:53Z" },
  ] as never;

  it("leaves to a person a next message that is not about a home", () => {
    // The real one, 11-01 13:43: the agent answered it with six homes.
    expect(onlyGreetedSoFar(hello)).toBe(true);
    expect(aboutHomes("Muherereyehe ngo tubazanire ibintu")).toBe(false);
    for (const t of ["How are you?", "Thank you", "Can I call you"]) expect(aboutHomes(t), t).toBe(false);
  });

  it("never silences a tenant answering the opening question", () => {
    for (const t of ["for my family", "to live with my kids", "I'm a student", "I need something near town", "apartment", "furnished", "ndashaka inzu", "pour ma famille", "2 bedrooms"])
      expect(aboutHomes(t), t).toBe(true);
  });

  it("is over once they asked for a home or saw homes", () => {
    expect(onlyGreetedSoFar([{ role: "user", text: "I need a house in Remera", at: "x" }] as never)).toBe(false);
    expect(onlyGreetedSoFar([...(hello as unknown[]), { role: "agent", kind: "shortlist", count: 6, at: "y" }] as never)).toBe(false);
    expect(onlyGreetedSoFar([] as never)).toBe(false);
  });
});

describe("a thank-you", () => {
  it("is thanks, in the line's languages, and nothing that answers a question", () => {
    for (const t of ["Thank you", "thanks!", "Thank you so much 🙏", "Murakoze cyane", "merci", "شكرا", "thx"]) expect(isThanks(t), t).toBe(true);
    for (const t of ["ok", "yes", "thanks, but cheaper", "thank you, the second one", "2"]) expect(isThanks(t), t).toBe(false);
  });

  it("gets a line back once homes went out, in the tenant's language", () => {
    expect(shownHomes([{ role: "agent", kind: "shortlist", count: 6, at: "x" }] as never)).toBe(true);
    expect(shownHomes([{ role: "agent", kind: "clarify", fields: [], at: "x" }] as never)).toBe(false);
    expect(thanksText("en")).toMatch(/^You're welcome!/);
    expect(thanksText("rw")).toMatch(/^Ntacyo!/);
    expect(thanksText("ar")).toMatch(/^العفو!/);
  });
});

describe("a bare yes under homes", () => {
  it("asks which one, like a person would", () => {
    for (const t of ["ok", "Yes", "yego", "👍", "sawa", "تمام"]) expect(isBareYes(t), t).toBe(true);
    for (const t of ["2", "yes the second one", "cheaper please", "thank you"]) expect(isBareYes(t), t).toBe(false);
    expect(whichOneText("en", 3)).toBe("Which one? Send its number, 1 to 3, and I'll check it's still free.");
    expect(whichOneText("en", 1)).toBe("Send 1 and I'll check it's still free.");
    expect(whichOneText("rw", 2)).toMatch(/^Iyihe\?.*kugeza kuri 2/);
  });
});
