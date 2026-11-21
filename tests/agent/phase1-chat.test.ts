/**
 * Phase 1, items 2 and 3 — the chat is not a search box, and the list reads like WhatsApp
 * (chat-funnel.md, 2026-11-21). Real chats: …077 the same six homes seven times · …612 "Happy to help…" four
 * times · "I found 1 homes" · "Each card shows why it fits" · a Kinyarwanda chat answered in English.
 */
import { describe, expect, it } from "vitest";
import en from "@/components/internationalization/en.json";
import rw from "@/components/internationalization/rw.json";
import ar from "@/components/internationalization/ar.json";
import { asksForMore, askedBudget, earlierList, formatWhatsApp, homeMedia, sameHomesText, waLang, type WaDict } from "@/components/agent/whatsapp-format";
import { EMPTY_REQUIREMENTS, sameBrief, parseRequirements, mergeRequirements } from "@/components/agent/requirements";
import { homesListed, mediaEnabled, repeatsLast, saidJustNow, textHash, type Sent } from "../../scripts/wa/tenant-pure";
import type { AgentMessage, AgentTaskView, ShortlistItem } from "@/components/agent/types";

const dict = (d: typeof en): WaDict => d.agent as unknown as WaDict;
const APP = "https://mkan.sd";
const CHAT = "https://mkan.sd/en/find?c=task1";
const at = "2026-11-19T10:00:00Z";

const home = (id: number, over: Partial<ShortlistItem> = {}): ShortlistItem => ({
  id,
  path: `/en/k/K${id}`,
  title: `Single room in Gikondo ${id}`,
  photo: `https://cdn.mkan.sd/homes/${id}.jpg`,
  district: "KICUKIRO",
  zone: "kicukiro/gikondo",
  bedrooms: 1,
  bathrooms: 1,
  rating: null,
  reviews: null,
  currency: "RWF",
  rentPeriod: "MONTHLY",
  score: 1,
  reasons: ["inBudget"],
  cost: { headline: 130_000, period: "month", lines: [], total: 0, totalHigh: 0 },
  duplicates: 0,
  availability: "unconfirmed",
  lead: { handle: null, sourceUrl: "https://tiktok.com/x" },
  ...over,
});

const view = (messages: AgentMessage[], shortlist: ShortlistItem[], requirements = null as AgentTaskView["requirements"]): AgentTaskView => ({
  id: "task1", status: "DONE", locale: "en", messages, requirements, shortlist, events: [], startedAt: at, version: "v", demand: null,
});
const list = (extra: Partial<Extract<AgentMessage, { kind: "shortlist" }>> = {}): AgentMessage => ({ role: "agent", kind: "shortlist", count: 6, at, ...extra });
const said = (text: string): AgentMessage => ({ role: "user", text, at });

describe("the list reads like WhatsApp (item 3)", () => {
  const six = [1, 2, 3, 4, 5, 6].map((i) => home(i));

  it("shows two homes, not three, and never talks about cards", () => {
    const out = formatWhatsApp(view([said("1 bedroom 150k"), list()], six), dict(en), "en", CHAT, APP);
    expect(out).toContain("*2. Single room in Gikondo 2*");
    expect(out).not.toContain("Gikondo 3");
    expect(out).not.toMatch(/card|each|I found|homes that match/i);
    expect(out.startsWith("Here are the homes that fit:")).toBe(true);
  });

  it('never says "1 homes": one home opens with its own line', () => {
    const out = formatWhatsApp(view([said("K6442"), list({ count: 1 })], [home(9)]), dict(en), "en", CHAT, APP);
    expect(out).toMatch(/^Here's the home that fits:/);
    expect(out).not.toMatch(/\b1 homes\b/);
  });

  it("the /find link closes the message, once", () => {
    const out = formatWhatsApp(view([said("x"), list()], six), dict(en), "en", CHAT, APP);
    expect(out.endsWith(CHAT)).toBe(true);
    expect(out.split(CHAT)).toHaveLength(2);
  });

  it("the long tail goes out once: a second list in the chat gets the short one", () => {
    const first = view([said("a"), list()], six);
    const second = view([said("a"), list(), said("cheaper"), list()], six);
    const t1 = formatWhatsApp(first, dict(en), "en", CHAT, APP);
    const t2 = formatWhatsApp(second, dict(en), "en", CHAT, APP);
    expect(earlierList(first)).toBe(false);
    expect(earlierList(second)).toBe(true);
    expect(t1).toContain("Reply with a number and I'll check it's still free, then set up a viewing");
    expect(t2).not.toContain("set up a viewing");
    expect(t2).toContain("Which one? Reply with its number.");
  });

  it("is honest when nothing fit the budget: the closest, a little above it", () => {
    const out = formatWhatsApp(view([said("max 150k"), list({ relaxed: [{ key: "budget", to: 200_000 }] })], six, { ...EMPTY_REQUIREMENTS, maxPrice: 150_000 }), dict(en), "en", CHAT, APP);
    expect(out.startsWith("Nothing at or under RWF 150,000 a month. The closest are a little above it:")).toBe(true);
    expect(out).not.toMatch(/that match/);
  });

  it("is honest when a detail was widened", () => {
    const out = formatWhatsApp(view([said("x"), list({ relaxed: [{ key: "furnished" }] })], six), dict(en), "en", CHAT, APP);
    expect(out.startsWith("Nothing matched every detail, so these are the closest:")).toBe(true);
  });

  it("does not offer a budget to a tenant who gave one, or was asked already", () => {
    const withRefine = list({ refine: "maxPrice" });
    const gave = formatWhatsApp(view([said("x"), withRefine], six, { ...EMPTY_REQUIREMENTS, maxPrice: 150_000 }), dict(en), "en", CHAT, APP);
    expect(gave).not.toMatch(/within a budget/i);
    const asked = formatWhatsApp(view([said("one bedroom"), { role: "agent", kind: "ask", field: "maxPrice", at }, said("no idea"), withRefine], six), dict(en), "en", CHAT, APP);
    expect(asked).not.toMatch(/within a budget/i);
    expect(askedBudget(view([{ role: "agent", kind: "ask", field: "maxPrice", at }], []).messages)).toBe(true);
    const fresh = formatWhatsApp(view([said("one bedroom"), withRefine], six), dict(en), "en", CHAT, APP);
    expect(fresh).toMatch(/budget/i);
  });

  it("asks for the budget in the tenant's language, monthly only", () => {
    const ask: AgentMessage = { role: "agent", kind: "ask", field: "maxPrice", at };
    expect(formatWhatsApp(view([said("one bedroom"), ask], []), dict(en), "en", CHAT, APP)).toBe("What's the most you can pay a month, in RWF?");
    expect(formatWhatsApp(view([said("x"), ask], []), dict(ar), "ar", CHAT, APP)).toMatch(/ما أقصى مبلغ/);
    expect(formatWhatsApp(view([said("x"), ask], []), dict(rw), "rw", CHAT, APP)).toMatch(/Ni angahe menshi/);
  });

  it("one language per message: a list in Kinyarwanda is all Kinyarwanda", () => {
    const out = formatWhatsApp(view([said("nkeneye inzu"), list()], six), dict(rw), "rw", "https://mkan.sd/rw/find?c=t", APP);
    expect(out.startsWith("Dore amazu aguhuye:")).toBe(true);
    expect(out).toContain("/ukwezi");
    expect(out).not.toMatch(/Reply with|homes|month\b/);
  });
});

describe("a chat keeps its language (…505)", () => {
  it('"kimironko, remera" after Kinyarwanda is still Kinyarwanda, not an English list', () => {
    expect(waLang("bite")).toBe("rw");
    expect(waLang("Amakuru?")).toBe("rw");
    expect(waLang("a bite to eat")).toBe("en");
    expect(waLang("nkeneye inzu yo gukodesha 100k / month")).toBe("rw");
    expect(waLang("kimironko, remera", "rw")).toBe("rw");
    expect(waLang("hey Ai, stop sending me messages", "rw")).toBe("en");
    expect(waLang("kimironko, remera", "en")).toBe("en");
    expect(waLang("kimironko, remera")).toBe("en");
  });
  it("French is answered in English, not in a mix", () => {
    expect(waLang("Il n'y a rien de meublé à ce niveau ?", "en")).toBe("en");
  });
});

describe("native photos beside the list (item 3)", () => {
  const six = [1, 2, 3].map((i) => home(i));
  it("one photo per listed home, captioned with rent, area and a reason", () => {
    const media = homeMedia(view([said("x"), list()], six), "en", APP);
    expect(media).toHaveLength(2);
    expect(media[0]).toEqual({ id: 1, url: "https://cdn.mkan.sd/homes/1.jpg", caption: "*Single room in Gikondo 1*\nRWF 130,000/month · Gikondo\nWithin your budget" });
  });
  it("prefers Claude's own line for the reason", () => {
    const media = homeMedia(view([said("x"), list()], [home(1, { why: "Ten minutes from your office" })]), "en", APP);
    expect(media[0]!.caption.endsWith("Ten minutes from your office")).toBe(true);
  });
  it("skips a home with no public photo, and never sends a repeat list's photos", () => {
    expect(homeMedia(view([said("x"), list()], [home(1, { photo: null }), home(2, { photo: "http://insecure/x.jpg" }), home(3)]), "en", APP)).toEqual([]);
    expect(homeMedia(view([said("x"), list({ same: true })], six), "en", APP)).toEqual([]);
    expect(homeMedia(view([said("x"), { role: "agent", kind: "answer", topic: "other", at }], six), "en", APP)).toEqual([]);
  });
  it("is on by default and off when the flag says so", () => {
    expect(mediaEnabled(undefined)).toBe(true);
    expect(mediaEnabled("1")).toBe(true);
    expect(mediaEnabled("off")).toBe(false);
    expect(mediaEnabled("0")).toBe(false);
  });
});

describe("no re-search on small talk (item 2)", () => {
  const phone = "250788100000";
  const listText = "Here are the homes that fit:\n\n*1. Room A* · RWF 130,000/month\nhttps://mkan.sd/en/k/K1\n\n*2. Room B* · RWF 130,000/month\nhttps://mkan.sd/en/k/K2";
  const sent = (text: string, ago: number, extra: Partial<Sent[number]> = {}): Sent[number] => ({ id: "x" + ago, phone, at: new Date(Date.now() - ago).toISOString(), h: textHash(text), ...extra });

  it("the same list as the last message is never sent again, minutes or hours later (…077)", () => {
    expect(repeatsLast([sent(listText, 3_600_000)], phone, listText, Date.now())).toBe(true);
    expect(repeatsLast([sent(listText, 3_600_000)], phone, listText + " ", Date.now())).toBe(true);
    expect(repeatsLast([sent(listText, 3_600_000)], phone, "Something else", Date.now())).toBe(false);
  });
  it("a line sent four times in a row stops at the second (…612)", () => {
    const hello = "Happy to help. Tell me the area, the size and your budget, and I'll find homes.";
    expect(repeatsLast([sent(hello, 60_000)], phone, hello, Date.now())).toBe(true);
  });
  it("only the last message counts: a different line in between lets it through; photos do not count", () => {
    expect(repeatsLast([sent(listText, 600_000), sent("Thanks!", 300_000)], phone, listText, Date.now())).toBe(false);
    expect(repeatsLast([sent(listText, 600_000), sent("caption", 300_000, { m: true })], phone, listText, Date.now())).toBe(true);
    expect(repeatsLast([sent(listText, 30 * 3_600_000)], phone, listText, Date.now())).toBe(false);
    expect(repeatsLast([{ ...sent(listText, 1000), phone: "250788999999" }], phone, listText, Date.now())).toBe(false);
  });
  it("counts the homes a list carries, to answer it with the one-line 'same homes'", () => {
    expect(homesListed(listText)).toBe(2);
    expect(homesListed("Happy to help.")).toBe(0);
    expect(sameHomesText("en", 2)).toMatch(/still the best homes/);
  });
  it("still holds the old three-minute guard", () => {
    expect(saidJustNow([sent("x", 1_000)], phone, "x", Date.now())).toBe(true);
  });

  it("restating the brief changes nothing; a new detail, or 'more', does", () => {
    const stored = mergeRequirements(EMPTY_REQUIREMENTS, parseRequirements("1 bedroom, max budget 150k, Remera"));
    const again = mergeRequirements(stored, parseRequirements("Am looking for 1 bedroom, my budget is 150k, around Remera"));
    expect(sameBrief(stored, again)).toBe(true);
    expect(sameBrief(stored, mergeRequirements(stored, parseRequirements("furnished")))).toBe(false);
    expect(sameBrief(stored, mergeRequirements(stored, parseRequirements("max 120k")))).toBe(false);
    expect(asksForMore("show me more")).toBe(true);
    expect(asksForMore("How are you")).toBe(false);
  });
});
