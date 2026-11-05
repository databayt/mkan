/**
 * The broker's answer must reach a web tenant (2026-11-05). A web chat has no phone, so 4 of 4
 * "available" answers in a week reached nobody. /find's card (and the /k page) now open WhatsApp
 * with "Check K1234 for me" + the chat's ref; that message, sent from the tenant's own phone, is the
 * pick: the turn asks the broker at once and the answer comes back on that chat. Under the homes, a
 * "check" that names its home hands that home over, not just the chat. A price complaint lowers the
 * budget whoever reads it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import en from "@/components/internationalization/en.json";
import ar from "@/components/internationalization/ar.json";
import rw from "@/components/internationalization/rw.json";
import type { Candidate } from "@/components/agent/rank";
import type { AgentMessage, AgentTaskView, ShortlistItem } from "@/components/agent/types";

const search = vi.fn();
vi.mock("@/components/agent/search", () => ({
  searchKigali: (...a: unknown[]) => search(...a),
  toShortlist: vi.fn(async () => []),
}));
vi.mock("@/components/agent/llm", () => ({ readRequirementsWithGroq: vi.fn(async () => null) }));
vi.mock("@/components/agent/reader", () => ({ readRequirements: vi.fn(async () => null) }));
vi.mock("@/components/agent/broker", () => ({ requestConfirmations: vi.fn(async () => []) }));
const askBroker = vi.fn();
vi.mock("@/components/agent/availability", () => ({ askBroker: (...a: unknown[]) => askBroker(...a) }));
const update = vi.fn(async () => ({}));
vi.mock("@/lib/db", () => ({
  db: {
    $executeRaw: vi.fn(async () => 1),
    agentTask: { findUnique: vi.fn(async () => null), update },
    agentEvent: {
      create: vi.fn(async () => ({ id: 1 })),
      update: vi.fn(async () => ({})),
      createMany: vi.fn(async () => ({})),
      findFirst: vi.fn(async () => null),
    },
  },
}));

const { asksToCheck, formatWhatsApp, readHomeRef, refSourceOf } = await import("@/components/agent/whatsapp-format");
const { checkTarget } = await import("@/components/agent/follow-up");
const { fill } = await import("@/components/agent/format");

const at = "2026-11-05T10:00:00Z";
const item = (id: number, over: Partial<ShortlistItem> = {}): ShortlistItem => ({
  id,
  path: `/en/k/K${id}`,
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
const lead = (id: number, over: Partial<ShortlistItem> = {}) => item(id, { lead: { handle: "b", sourceUrl: "https://www.tiktok.com/@b/video/1" }, ...over });

describe("asksToCheck (the card's words are the pick)", () => {
  it("reads the words /find and the /k page prefill, in every language", () => {
    for (const d of [en, ar, rw]) {
      const words = fill(d.agent.card.checkWords, { ref: "K1234" });
      expect(asksToCheck(words), words).toBe(true);
      expect(readHomeRef(words), words).toBe(1234);
      // The /k page adds its mark; a web chat adds its ref (stripped before this runs).
      expect(refSourceOf(`${words} mkan.sd`, null)).toBe("k_page");
      expect(refSourceOf(words, "cmabc")).toBe("web");
    }
  });
  it("and a tenant's own ask about a code", () => {
    for (const t of ["is K5808 still available?", "K5808 available?", "تأكد من K5808", "Inzu K5808 irahari?"]) expect(asksToCheck(t), t).toBe(true);
  });
  it("but not a bare code (a TikTok caption's): that one still asks first", () => {
    for (const t of ["K5808", "K5808 mkan.sd", "5808", "2 bedroom in Kicukiro", "is it still available?"]) expect(asksToCheck(t), t).toBe(false);
  });
  it("keeps the Kinyarwanda words Kinyarwanda, so the reply is too", async () => {
    const { waLang } = await import("@/components/agent/whatsapp-format");
    expect(waLang(fill(rw.agent.card.checkWords, { ref: "K1234" }))).toBe("rw");
    expect(waLang(fill(ar.agent.card.checkWords, { ref: "K1234" }))).toBe("ar");
  });
});

describe("formatWhatsApp under a checked home", () => {
  const view = (agent: AgentMessage, shortlist: ShortlistItem[]): AgentTaskView => ({
    id: "task1",
    status: "WAITING",
    locale: "en",
    messages: [{ role: "user", text: "Check K5808 for me", at }, agent],
    requirements: null,
    shortlist,
    events: [],
    startedAt: at,
    version: "v",
    demand: null,
  });
  const d = en.agent as never;
  it("says the broker was asked instead of asking to reply 1", () => {
    const out = formatWhatsApp(view({ role: "agent", kind: "shortlist", count: 2, pin: { id: 5808, found: true }, checked: "asked", at }, [lead(5808, { availability: "asked" }), lead(2)]), d, "en", "c", "https://mkan.sd");
    expect(out).toContain('I\'ve asked the broker about "Home 5808". I\'ll send their answer here.');
    expect(out).not.toContain("Reply *1*");
  });
  it("says a person checks it when broker sends are paused", () => {
    const out = formatWhatsApp(view({ role: "agent", kind: "shortlist", count: 1, pin: { id: 5808, found: true }, checked: "handed", at }, [lead(5808)]), d, "en", "c", "https://mkan.sd");
    expect(out).toContain("I'm checking \"Home 5808\" with the broker now");
    expect(out).not.toContain("Reply *1*");
  });
  it("still asks first without a check", () => {
    const out = formatWhatsApp(view({ role: "agent", kind: "shortlist", count: 1, pin: { id: 5808, found: true }, at }, [lead(5808)]), d, "en", "c", "https://mkan.sd");
    expect(out).toContain("Reply *1*");
  });
});

describe("checkTarget (/find, a check under the homes)", () => {
  it("names the home a number picks, when its broker has not been asked", () => {
    const shown = [lead(11), item(12), lead(13, { availability: "asked" }), lead(14)];
    expect(checkTarget("1", shown)).toBe(11);
    expect(checkTarget("٤", shown)).toBe(14);
    expect(checkTarget("2", shown)).toBeUndefined(); // a host's home: no broker to ask
    expect(checkTarget("3", shown)).toBeUndefined(); // already asked
    expect(checkTarget("yes", shown)).toBeUndefined(); // which one?
  });
  it("is the only home when one is shown", () => {
    expect(checkTarget("is it still available?", [lead(11)])).toBe(11);
  });
});

// The turn, database mocked.
const home = (over: Partial<Candidate>): Candidate =>
  ({ id: 1, hostId: "h", rentPeriod: "MONTHLY", priceMonth: 380_000, pricePerNight: null, monthlyDiscount: null, cleaningFee: null, bedrooms: 2, guestCount: 4, district: "Kicukiro", bathrooms: 1, averageRating: 4.5, numberOfReviews: 3, confirmedAt: null, ...over }) as Candidate;
const writes = () => update.mock.calls.map((c) => (c as unknown as [{ data: { messages?: Record<string, unknown>[]; shortlist?: Record<string, unknown>[]; status?: string } }])[0].data);
const replies = () => writes().map((d) => d.messages?.at(-1)).filter(Boolean);

const turn = async (messages: Record<string, unknown>[], opts: { shortlist?: ShortlistItem[]; cards?: ShortlistItem[]; requirements?: Record<string, unknown> } = {}) => {
  const { db } = await import("@/lib/db");
  vi.mocked(db.agentTask.findUnique).mockResolvedValueOnce({
    id: "t1",
    locale: "en",
    messages,
    requirements: opts.requirements ?? null,
    shortlist: opts.shortlist ?? [],
    events: [],
  } as never);
  const s = await import("@/components/agent/search");
  vi.mocked(s.toShortlist).mockResolvedValueOnce((opts.cards ?? [lead(5808), lead(2)]) as never);
  search.mockResolvedValue({ candidates: [home({ id: 5808 }), home({ id: 2 })], truncated: false });
  const { runTurn } = await import("@/components/agent/run");
  await runTurn("t1");
};

beforeEach(() => {
  search.mockReset();
  update.mockClear();
  askBroker.mockReset();
});

describe("the WhatsApp turn a /find card opened", () => {
  const checkMsg = { role: "user", text: "Check K5808 for me", wa: "wamid.1", pin: 5808, filters: { stay: "long", district: "KICUKIRO", bedrooms: 2 }, at };

  it("asks the broker of the pinned home at once, and marks it asked", async () => {
    askBroker.mockResolvedValueOnce({ ok: true, asked: true });
    await turn([checkMsg]);
    expect(askBroker).toHaveBeenCalledTimes(1);
    expect(askBroker.mock.calls[0]![0]).toBe("t1");
    expect(askBroker.mock.calls[0]![1]).toMatchObject({ id: 5808 });
    expect(replies().at(-1)).toMatchObject({ kind: "shortlist", pin: { id: 5808, found: true }, checked: "asked" });
    const last = writes().at(-1)!;
    expect(last.status).toBe("WAITING");
    expect(last.shortlist?.find((s) => s.id === 5808)).toMatchObject({ availability: "asked" });
  });

  it("says a person checks it when the line may not message the broker", async () => {
    askBroker.mockResolvedValueOnce({ ok: true, asked: false, why: "handed" });
    await turn([checkMsg]);
    expect(replies().at(-1)).toMatchObject({ checked: "handed" });
    expect(writes().at(-1)?.status).toBe("DONE");
  });

  it("does not ask for a bare code, a browser, or a home already asked about", async () => {
    await turn([{ ...checkMsg, text: "K5808" }]);
    await turn([{ ...checkMsg, wa: undefined }]);
    await turn([checkMsg], { cards: [lead(5808, { availability: "asked" }), lead(2)] });
    await turn([checkMsg], { cards: [item(5808), lead(2)] });
    expect(askBroker).not.toHaveBeenCalled();
  });
});

describe("/find under the homes", () => {
  const said = [
    { role: "user", text: "2 bedroom in Kicukiro", at: "1" },
    { role: "agent", kind: "shortlist", count: 2, at: "2" },
  ];

  it("hands the home a number picked to WhatsApp, and asks no broker from the browser", async () => {
    await turn([...said, { role: "user", text: "1", at: "3" }], { shortlist: [lead(31), lead(32)] });
    expect(search).not.toHaveBeenCalled();
    expect(replies()).toEqual([expect.objectContaining({ kind: "followUp", say: "check", listingId: 31 })]);
    expect(askBroker).not.toHaveBeenCalled();
  });

  it("keeps the chat hand-off when it cannot tell which home", async () => {
    await turn([...said, { role: "user", text: "Are you still available?", at: "3" }], { shortlist: [lead(31), lead(32)] });
    const r = replies()[0]!;
    expect(r).toMatchObject({ kind: "followUp", say: "check" });
    expect(r).not.toHaveProperty("listingId");
  });

  it("lowers the budget on a price complaint, even when Claude reads it as talk", async () => {
    const { readRequirements } = await import("@/components/agent/reader");
    vi.mocked(readRequirements).mockResolvedValueOnce({ by: "claude", set: {}, clear: [], intent: "other", remember: [], forget: [] } as never);
    await turn([...said, { role: "user", text: "It's a lot of money", at: "3" }], {
      shortlist: [lead(31), lead(32)],
      requirements: { stay: "long", district: "KICUKIRO", bedrooms: 2, maxPrice: 400_000, pricePeriod: "month" },
    });
    expect(search).toHaveBeenCalled();
    expect(search.mock.calls[0]![0]).toMatchObject({ maxPrice: 320_000, cheap: true });
    expect(replies().some((r) => r!.kind === "answer")).toBe(false);
  });

  it("leaves Claude's own cheaper alone", async () => {
    const { readRequirements } = await import("@/components/agent/reader");
    vi.mocked(readRequirements).mockResolvedValueOnce({ by: "claude", set: { maxPrice: 350_000, pricePeriod: "month" }, clear: [], intent: "search", remember: [], forget: [] } as never);
    await turn([...said, { role: "user", text: "too expensive", at: "3" }], {
      shortlist: [lead(31), lead(32)],
      requirements: { stay: "long", district: "KICUKIRO", bedrooms: 2, maxPrice: 400_000, pricePeriod: "month" },
    });
    expect(search.mock.calls[0]![0]).toMatchObject({ maxPrice: 350_000 });
  });
});
