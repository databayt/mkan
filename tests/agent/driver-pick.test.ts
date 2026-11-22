// @vitest-environment node
/**
 * 2026-11-22, the driver's four faults on a real chat (…866): "No. 1 — the 2 bed stand-alone house in Kabeza for
 * 350k" got six other homes; nearly every pick died "taken" after more homes were shown; Abdout's own words in the
 * chat were invisible to the bot; a listing's rent became the tenant's "budget". Pure: no database, no network.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

const pure = await import("@/components/agent/driver-pure");
const { listingDerivedBudget, withoutListingBudget } = await import("@/components/agent/ref-budget-pure");

const shown: Parameters<typeof pure.resolvePick>[1] = [
  { number: 1, id: 6823, title: "2 bedroom stand alone house in Kabeza", places: ["Kabeza", "KICUKIRO"], rentRwf: 350_000 },
  { number: 2, id: 6603, title: "Furnished 1 bedroom apartment in Remera", places: ["Remera", "GASABO"], rentRwf: 250_000 },
];

describe("a pick is by meaning", () => {
  it("reads the evidence line: No. 1 with the home's own words", () => {
    const r = pure.resolvePick("No. 1 — the 2 bed stand-alone house in Kabeza for 350k", shown);
    expect(r).toMatchObject({ number: 1, id: 6823, sure: true });
  });
  it("reads numbers, ordinals and a bare digit", () => {
    for (const t of ["1", "number 2", "No 2", "the second one", "I like 2", "home 2", "iya kabiri"]) {
      expect(pure.resolvePick(t, shown)?.number, t).toBe(t === "1" ? 1 : 2);
    }
    expect(pure.resolvePick("the first", shown)?.id).toBe(6823);
  });
  it("reads a K-code, and a screenshot's reading of one", () => {
    expect(pure.resolvePick("K6603", shown)).toMatchObject({ id: 6603, how: "code", sure: true });
    expect(pure.resolvePick('[photo: screenshot of a TikTok ad, K6823, 350k a month, Kicukiro]', shown)).toMatchObject({ id: 6823, number: 1, how: "code" });
  });
  it("a code that is not on the list is not a pick (the code's own path handles it)", () => {
    expect(pure.resolvePick("K9999", shown)).toBeNull();
  });
  it("reads a home by two of its title, rent and place — likely, not sure", () => {
    expect(pure.resolvePick("the Kabeza one for 350k", shown)).toMatchObject({ id: 6823, how: "details", sure: false });
    expect(pure.resolvePick("the Remera apartment, 250k", shown)).toMatchObject({ id: 6603 });
  });
  it("a budget or a search is not a pick of the home that costs the same", () => {
    expect(pure.resolvePick("my budget is 350k", shown)).toBeNull();
    expect(pure.resolvePick("I need a 2 bed house in Kabeza, max 350k", shown)).toBeNull();
    expect(pure.resolvePick("looking for a house in Kabeza for 350k", shown)).toBeNull();
    expect(pure.resolvePick("350k", shown)).toBeNull();
  });
  it("two numbers, or a number past the list, is no pick", () => {
    expect(pure.resolvePick("1 and 2", shown)).toBeNull();
    expect(pure.resolvePick("No. 5", shown)).toBeNull();
    expect(pure.resolvePick("a 2 bedroom please", shown)).toBeNull();
    expect(pure.resolvePick("No. 1", [])).toBeNull();
  });
  it("the system prompt sends a pick straight to the check, never to a search", () => {
    expect(pure.DRIVER_SYSTEM).toMatch(/PICK IS BY MEANING/);
    expect(pure.DRIVER_SYSTEM).toMatch(/Never search again/);
  });
});

describe("before showing: the best few are asked, confirmed-free first", () => {
  const items = [
    { id: 1, availability: "unconfirmed" },
    { id: 2, availability: "confirmed" },
    { id: 3, availability: "unconfirmed" },
    { id: 4, availability: "confirmed" },
  ];
  it("puts brokers' yeses first, each group in its order", () => {
    expect(pure.confirmedFirst(items).map((x) => x.id)).toEqual([2, 4, 1, 3]);
  });
  it("asks the top three", () => {
    expect(pure.PREVERIFY).toBe(3);
  });
  it("tells the model the truth about each home", () => {
    expect(pure.brokerCheckOf("confirmed", "unconfirmed")).toBe("confirmed_free");
    expect(pure.brokerCheckOf("asked", "unconfirmed")).toBe("asking_now");
    expect(pure.brokerCheckOf("slow", "unconfirmed")).toBe("asking_now");
    expect(pure.brokerCheckOf("already", "asked")).toBe("already_asked");
    expect(pure.brokerCheckOf("taken", "unconfirmed")).toBe("taken");
    expect(pure.brokerCheckOf(undefined, "unconfirmed")).toBe("not_asked");
  });
  it("the prompt never lets 'free' be said without a broker's yes, and shows confirmed first", () => {
    expect(pure.DRIVER_SYSTEM).toMatch(/show a confirmed_free home first/);
    expect(pure.DRIVER_SYSTEM).toMatch(/never that it is free/);
  });
});

describe("a person at Mkan typed in the chat", () => {
  const at = (s: number) => 1_700_000_000 + s;
  const rec = (id: string, fromMe: boolean, s: number, text: string, jid = "250788111222@s.whatsapp.net") => ({ key: { id, fromMe, remoteJid: jid }, message: { conversation: text }, messageTimestamp: at(s) });
  const o = {
    addrs: ["250788111222", "9988@lid"],
    sentIds: new Set(["BOT1"]),
    sent: [{ at: at(50) * 1000, h: "echo" }],
    textOf: (m: Record<string, unknown> | null | undefined) => ((m as { conversation?: string } | null)?.conversation ?? ""),
    hash: (t: string) => (t === "the bot's echo" ? "echo" : t),
    since: 0,
  };
  it("keeps his words, drops the bot's own (by id, and by an echo's text) and other chats", () => {
    const got = pure.pickHumanTurns(
      [
        rec("H1", true, 10, "I will come with you on Thursday, 10am"),
        rec("BOT1", true, 20, "the bot's reply by id"),
        rec("E1", true, 50, "the bot's echo"),
        rec("T1", false, 30, "tenant words"),
        rec("H2", true, 40, "somebody else's chat", "250799000000@s.whatsapp.net"),
        rec("H3", true, 60, "via lid", "9988@lid"),
        rec("H4", true, 70, "   "),
      ],
      o,
    );
    expect(got.map((x) => x.text)).toEqual(["I will come with you on Thursday, 10am", "via lid"]);
  });
  it("puts his words where they were typed, and shows them as Mkan (Osman)", () => {
    const lines = [
      { who: "tenant" as const, text: "Can I see it?", at: 1000 },
      { who: "mkan" as const, text: "Thursday 10:00 or 15:00?", at: 2000 },
      { who: "tenant" as const, text: "ok", at: 5000 },
    ];
    const merged = pure.mergeHumanLines(lines, [{ at: 3000, text: "Thursday 15:00 works, I am there" }]);
    expect(merged.map((l) => l.who)).toEqual(["tenant", "mkan", "human", "tenant"]);
    expect(pure.renderChat(merged)).toContain("Mkan (Osman): Thursday 15:00 works, I am there");
  });
  it("a person's line after the last bot line is last", () => {
    const merged = pure.mergeHumanLines([{ who: "mkan", text: "hi", at: 1 }], [{ at: 9, text: "hello from me" }]);
    expect(merged.at(-1)).toMatchObject({ who: "human", text: "hello from me" });
  });
  it("the prompt makes the bot carry on from him, never contradict", () => {
    expect(pure.DRIVER_SYSTEM).toMatch(/Mkan \(Osman\)/);
    expect(pure.DRIVER_SYSTEM).toMatch(/never contradict/);
  });
});

describe("a budget is the tenant's, never a listing's", () => {
  it("a code's search ceiling (rent + 15%) is dropped from the brief", () => {
    expect(withoutListingBudget({ stay: "long", district: "KICUKIRO", bedrooms: 2, maxPrice: 402_500, pricePeriod: "month" })).toEqual({ stay: "long", district: "KICUKIRO", bedrooms: 2 });
  });
  it("tells a listing's rent, or its +15%, from a stated budget", () => {
    expect(listingDerivedBudget(402_500, [350_000])).toBe(true);
    expect(listingDerivedBudget(350_000, [350_000])).toBe(true);
    expect(listingDerivedBudget(300_000, [350_000, 250_000])).toBe(false);
    expect(listingDerivedBudget(null, [350_000])).toBe(false);
  });
});
