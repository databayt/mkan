import { describe, expect, it } from "vitest";
import { longStayCost, type CostEstimate } from "@/components/agent/cost";
import {
  askTimeMessage,
  confirmedTermsLine,
  dealSheetMessage,
  parseTermFlags,
  readViewingTime,
  termsToAsk,
  viewingConfirmedMessage,
  viewingLabel,
  viewingReminderMessage,
  kigaliDayWord,
} from "@/components/agent/deal-pure";

const cost: CostEstimate = {
  headline: 350_000,
  period: "month",
  total: 1_230_000,
  totalHigh: 1_265_000,
  lines: [
    { key: "rentInAdvance", amount: 1_050_000, qty: 3, source: "typical" },
    { key: "deposit", amount: 175_000, qty: 0.5, source: "typical" },
    { key: "commission", amount: 87_500, amountHigh: 105_000, qty: 25, qtyHigh: 30, source: "typical" },
    { key: "viewingFee", amount: 5_000, source: "typical" },
    { key: "water", amount: 0, status: "unknown" },
    { key: "electricity", amount: 0, status: "separate", source: "ad" },
  ],
};
const facts = { title: "2-bed in Kibagabaga", ref: "K5808", cost, rep: "Osman", link: "https://mkan.sd/en/find?c=t" };

describe("the deal sheet", () => {
  it("says it is available, what moving in costs, what Mkan covers and what happens next", () => {
    const t = dealSheetMessage(facts, "en");
    expect(t).toMatch(/^Good news: the broker says "2-bed in Kibagabaga" \(K5808\) is still available\./);
    expect(t).toContain("Rent: RWF 350,000 a month.");
    // The viewing fee is Mkan's: it is not in what the tenant pays to move in.
    expect(t).toContain("To move in: about RWF 1,225,000–RWF 1,260,000 — 3 months up front + half a month deposit (what's usual in Kigali, confirmed at the viewing).");
    expect(t).toContain("Broker's commission: 25–30% of a month's rent (usual, confirmed at the viewing).");
    expect(t).toContain("Viewing: free for you. Mkan covers it.");
    expect(t).toContain("Water: not in the ad, we'll ask. Electricity: paid by you.");
    expect(t).toMatch(/you, the broker and Osman from Mkan\. If you like it, we write and sign the lease the same day\./);
    expect(t).toMatch(/When can you come to see it\?/);
  });

  it("never carries a broker's number or a link to them", () => {
    for (const lang of ["en", "ar", "rw"] as const) {
      const t = dealSheetMessage(facts, lang);
      expect(t, lang).not.toMatch(/\+?250\d|wa\.me|07\d{8}/);
      expect(t, lang).toContain("K5808");
    }
  });

  it("says so when the owner posted it and there is no commission", () => {
    const owner = { ...cost, lines: cost.lines.filter((l) => l.key !== "commission") };
    expect(dealSheetMessage({ ...facts, cost: owner }, "en")).toContain("No broker's commission.");
  });

  it("promises no commission it does not know about when the home has no cost at all", () => {
    for (const lang of ["en", "ar", "rw"] as const) {
      const t = dealSheetMessage({ ...facts, cost: null }, lang);
      expect(t, lang).not.toMatch(/No broker's commission|لا عمولة وسيط|Nta komisiyo/);
    }
  });
});

describe("viewing times in a tenant's words", () => {
  // Sunday 1 Nov 2026, 12:00 in Kigali.
  const now = new Date("2026-11-01T10:00:00Z");
  const at = (text: string) => {
    const r = readViewingTime(text, now);
    return r && "at" in r ? viewingLabel(r.at, "en") : r ? "needs a time" : null;
  };

  it("reads days and times in English", () => {
    expect(at("tomorrow 10am")).toBe("Mon 2 Nov, 10:00");
    expect(at("Tomorrow at 3")).toBe("Mon 2 Nov, 15:00");
    expect(at("today at 4pm")).toBe("Sun 1 Nov, 16:00");
    expect(at("Tuesday 2:30pm")).toBe("Tue 3 Nov, 14:30");
    expect(at("wednesday morning")).toBe("Wed 4 Nov, 10:00");
    expect(at("at 9")).toBe("Mon 2 Nov, 09:00");
  });

  it("reads Kinyarwanda and Arabic", () => {
    expect(at("ejo saa yine")).toBe("Mon 2 Nov, 10:00");
    expect(at("ejo saa 8")).toBe("Mon 2 Nov, 14:00");
    expect(at("غداً 10 صباحاً")).toBe("Mon 2 Nov, 10:00");
  });

  it("asks for the time when only a day is given, and ignores what is not a time", () => {
    expect(at("tomorrow")).toBe("needs a time");
    expect(at("1")).toBeNull();
    expect(at("2 bedroom please")).toBeNull();
    expect(at("tomorrow 11pm")).toBeNull();
    expect(askTimeMessage("en")).toMatch(/What time/);
  });
});

describe("the viewing messages", () => {
  it("confirm, remind and never leave out who comes from Mkan", () => {
    const label = "Mon 2 Nov, 10:00";
    expect(viewingConfirmedMessage("en", { title: "Flat", label, place: "Kibagabaga, near the market", rep: "Osman" })).toMatch(/You'll meet the broker and Osman from Mkan there/);
    expect(viewingReminderMessage("en", { title: "Flat", label, rep: "Osman" }, "24h")).toMatch(/tomorrow/);
    expect(viewingReminderMessage("rw", { title: "Flat", label, rep: "Osman" }, "2h")).toMatch(/uyu munsi/);
  });

  it("the day before says tomorrow, the same day says today — by Kigali's own day (2026-11-08)", () => {
    const label = "Sun 8 Nov, 16:00";
    const morning = new Date("2026-11-08T07:00:00Z"); // 09:00 in Kigali
    expect(kigaliDayWord(new Date("2026-11-08T14:00:00Z"), morning)).toBe("today");
    expect(kigaliDayWord(new Date("2026-11-09T08:00:00Z"), morning)).toBe("tomorrow");
    // 23:30 and 00:30 in Kigali share a UTC date but not a Kigali one.
    expect(kigaliDayWord(new Date("2026-11-08T22:30:00Z"), new Date("2026-11-08T21:30:00Z"))).toBe("tomorrow");
    expect(kigaliDayWord(new Date("2026-11-10T08:00:00Z"), morning)).toBeNull();
    const v = { title: "Flat", label, rep: "Osman" };
    expect(viewingReminderMessage("en", v, "24h", "today")).toMatch(/is today, Sun 8 Nov/);
    expect(viewingReminderMessage("en", v, "24h", null)).toMatch(/is on Sun 8 Nov/);
    expect(viewingReminderMessage("ar", v, "24h", "today")).toMatch(/اليوم/);
    expect(viewingReminderMessage("ar", v, "24h", "today")).not.toMatch(/غداً/);
    expect(viewingReminderMessage("rw", v, "24h", "today")).toMatch(/uyu munsi/);
  });
});

describe("the terms the person from Mkan confirms", () => {
  it("lists what the tenant was shown as usual or unstated, and what no ad says", () => {
    expect(termsToAsk(cost)).toEqual([
      "months up front (we said 3 months, the usual)",
      "deposit (we said half a month, the usual)",
      "commission (we said 25–30%, the usual)",
      "water in the rent?",
      "lease length",
      "move-in date",
      "viewing fee (Mkan pays it)",
    ]);
    // Electricity was stated by the ad; nothing to ask.
    expect(termsToAsk(cost).join(" ")).not.toMatch(/electricity/);
    expect(termsToAsk(null)).toEqual(["rent", "months up front", "deposit", "commission", "water", "electricity", "lease length", "move-in date"]);
  });

  it("reads the deal:book flags, and refuses a typo before anything is booked", () => {
    const flags: Record<string, string> = { rent: "350,000", advance: "3", deposit: "half", commission: "10%", fee: "5000", water: "yes", power: "no", lease: "12", "move-in": "2026-11-15" };
    expect(parseTermFlags((n) => flags[n])).toEqual({
      rent: 350_000,
      monthsInAdvance: 3,
      depositMonths: 0.5,
      commissionPct: 0.1,
      viewingFee: 5_000,
      waterIncluded: true,
      electricityIncluded: false,
      leaseMonths: 12,
      moveIn: "2026-11-15",
    });
    expect(parseTermFlags(() => undefined)).toEqual({});
    expect(parseTermFlags((n) => (n === "commission" ? "none" : undefined))).toEqual({ noCommission: true, commissionPct: 0 });
    expect(parseTermFlags((n) => (n === "commission" ? "0" : undefined))).toEqual({ noCommission: true, commissionPct: 0 });
    expect(parseTermFlags((n) => (n === "deposit" ? "0" : undefined))).toEqual({ depositMonths: 0 });
    expect(() => parseTermFlags((n) => (n === "water" ? "maybe" : undefined))).toThrow(/--water=maybe/);
    expect(() => parseTermFlags((n) => (n === "advance" ? "20" : undefined))).toThrow(/--advance=20/);
    expect(() => parseTermFlags((n) => (n === "move-in" ? "15/11" : undefined))).toThrow(/YYYY-MM-DD/);
  });

  it("restates only what the broker said, in the tenant's language", () => {
    const said = { monthsInAdvance: 3, depositMonths: 1, commissionPct: 0.1, waterIncluded: true, electricityIncluded: false, leaseMonths: 12, moveIn: "2026-11-15" };
    expect(confirmedTermsLine("en", said, [1_435_000, 1_435_000])).toBe(
      "Confirmed with the broker: 3 months up front, 1 month deposit, broker's commission 10% of a month's rent, water included, electricity paid by you, 12-month lease, move in from 15 Nov. To move in: RWF 1,435,000.",
    );
    expect(confirmedTermsLine("en", { noCommission: true, commissionPct: 0 }, null)).toBe("Confirmed with the broker: no broker's commission.");
    expect(confirmedTermsLine("ar", said, null)).toBe("أكّد الوسيط: 3 أشهر مقدماً، شهر تأميناً، عمولة الوسيط 10% من إيجار شهر، الماء ضمن الإيجار، الكهرباء على المستأجر، عقد لمدة 12 شهراً، الانتقال من 15 Nov.");
    expect(confirmedTermsLine("rw", said, [1_435_000, 1_435_000])).toMatch(/^Byemejwe na komisiyoneri: amezi 3 mbere, ukwezi kumwe y'ingwate, .* amasezerano y'amezi 12, .*Kwimukira: RWF 1,435,000\.$/);
    expect(confirmedTermsLine("en", {}, [1, 1])).toBeNull();
  });

  it("puts the confirmed terms under the viewing confirmation", () => {
    const t = viewingConfirmedMessage("en", { title: "Flat", label: "Mon 2 Nov, 10:00", place: null, rep: "Osman", terms: "Confirmed with the broker: no deposit." });
    expect(t.split("\n")).toHaveLength(2);
    expect(t.split("\n")[1]).toBe("Confirmed with the broker: no deposit.");
  });

  it("prices the move-in on the broker's months up front", () => {
    const c = longStayCost({ rentPeriod: "MONTHLY", priceMonth: 300_000, pricePerNight: null, monthlyDiscount: null, cleaningFee: null, terms: { monthsInAdvance: 1, depositMonths: 1, noCommission: true } })!;
    expect(c.lines.find((l) => l.key === "rentInAdvance")).toMatchObject({ amount: 300_000, qty: 1, source: "ad" });
    // Out of range falls back to Kigali's usual 3 months, said as such.
    const usual = longStayCost({ rentPeriod: "MONTHLY", priceMonth: 300_000, pricePerNight: null, monthlyDiscount: null, cleaningFee: null, terms: { monthsInAdvance: 40 } })!;
    expect(usual.lines.find((l) => l.key === "rentInAdvance")).toMatchObject({ qty: 3, source: "typical" });
  });
});

describe("after the viewing — the reply to 'how did it go?'", () => {
  it("reads want and not in en / rw / fr / ar, and digits", async () => {
    const { readAfterViewing } = await import("@/components/agent/deal-pure");
    for (const t of ["1", "yes", "I want it", "We'll take it", "yego", "ndayishaka", "oui", "نعم", "١"]) expect(readAfterViewing(t)).toBe("want");
    for (const t of ["2", "no", "not for me", "I didn't like it", "oya", "non", "لا", "٢"]) expect(readAfterViewing(t)).toBe("not");
  });

  it("leaves anything else to a person", async () => {
    const { readAfterViewing } = await import("@/components/agent/deal-pure");
    expect(readAfterViewing("the kitchen was small, can the price go down?")).toBeNull();
    expect(readAfterViewing("12")).toBeNull();
  });

  it("answers in the tenant's language", async () => {
    const { afterViewingWantText, afterViewingNotText } = await import("@/components/agent/deal-pure");
    expect(afterViewingWantText("en", "2-bed in Remera")).toContain("2-bed in Remera");
    expect(afterViewingWantText("ar", "x")).toMatch(/[؀-ۿ]/);
    expect(afterViewingNotText("rw")).toMatch(/Murakoze/);
  });
});

describe("Mkan's share — how the business gets paid", () => {
  it("reads the share flags, and refuses mixed or broken ones", async () => {
    const { parseShareFlags } = await import("@/components/agent/deal-pure");
    const flags = (pairs: Record<string, string>, set: string[] = []) => parseShareFlags((n) => pairs[n], (f) => set.includes(f));
    expect(flags({})).toBeNull();
    expect(flags({ "share-pct": "50" })).toEqual({ pct: 0.5 });
    expect(flags({ "share-pct": "37.5%" })).toEqual({ pct: 0.375 });
    expect(flags({ "share-rwf": "30,000" })).toEqual({ flatRwf: 30_000 });
    expect(flags({}, ["no-share"])).toEqual({ none: true });
    expect(() => flags({ "share-pct": "50", "share-rwf": "1000" })).toThrow(/not both/);
    expect(() => flags({ "share-pct": "50" }, ["no-share"])).toThrow(/pick one/);
    expect(() => flags({ "share-pct": "0" })).toThrow(/above 0/);
    expect(() => flags({ "share-pct": "150" })).toThrow();
    expect(() => flags({ "share-rwf": "abc" })).toThrow();
  });

  it("works out the share: flat wins, else part of the commission, else nothing", async () => {
    const { expectedShare } = await import("@/components/agent/deal-pure");
    expect(expectedShare(175_000, { pct: 0.5 })).toBe(87_500);
    expect(expectedShare(175_000, { flatRwf: 30_000, pct: 0.5 })).toBe(30_000);
    expect(expectedShare(null, { pct: 0.5 })).toBeNull();
    expect(expectedShare(0, { pct: 0.5 })).toBeNull();
    expect(expectedShare(175_000, null)).toBeNull();
  });

  it("says what a deal earns net of the viewing fee, and warns when it earns nothing", async () => {
    const { unitEconomicsLine } = await import("@/components/agent/deal-pure");
    const ok = unitEconomicsLine({ share: 87_500, commission: 175_000, agreement: { pct: 0.5 }, viewingFee: 5_000 });
    expect(ok).toContain("RWF 87,500");
    expect(ok).toContain("50% of the commission of RWF 175,000");
    expect(ok).toContain("= ≈ RWF 82,500");
    expect(ok).not.toContain("⚠");
    const thin = unitEconomicsLine({ share: 2_000, commission: 4_000, agreement: { pct: 0.5 }, viewingFee: 5_000 });
    expect(thin).toContain("⚠ the viewing fee is more than Mkan's share");
    const none = unitEconomicsLine({ share: null, commission: 175_000, agreement: null, viewingFee: 5_000 });
    expect(none).toMatch(/No share for Mkan/);
    expect(none).toContain("costs Mkan RWF 5,000");
    expect(unitEconomicsLine({ share: 30_000, commission: null, agreement: { flatRwf: 30_000 }, viewingFee: null })).toBe("💵 If it signs: Mkan ≈ RWF 30,000 (flat, as agreed)");
    // A share agreed on the commission, with the commission not known yet: ask for it, don't say "none".
    const unpriced = unitEconomicsLine({ share: null, commission: null, agreement: { pct: 0.5 }, viewingFee: 5_000 });
    expect(unpriced).toContain("50% of the commission");
    expect(unpriced).toContain("--commission=");
    expect(unpriced).not.toMatch(/No share/);
  });

  it("prints a deal:status command that parses back, and still reads the old short form", async () => {
    const { dealCommand, parseStatusArgs } = await import("@/components/agent/deal-pure");
    const printed = dealCommand("cmdeal1", "signed");
    expect(printed).toBe("pnpm deal:status --deal=cmdeal1 --status=signed");
    // What the CLI sees after `pnpm deal:status` (the command word is removed).
    expect(parseStatusArgs(printed.split(" ").slice(2))).toEqual({ id: "cmdeal1", status: "SIGNED", share: null, noShare: false, note: null });
    expect(parseStatusArgs(["cmdeal1", "SIGNED"])).toMatchObject({ id: "cmdeal1", status: "SIGNED" });
    expect(parseStatusArgs(["--deal=d", "--status=paid", "--share=12,500", "--note=cash"])).toEqual({ id: "d", status: "PAID", share: 12_500, noShare: false, note: "cash" });
    expect(parseStatusArgs(["--deal=d", "--status=signed", "--no-share"]).noShare).toBe(true);
    expect(() => parseStatusArgs(["--deal=d", "--status=paid", "--share=-1"])).toThrow();
  });

  it("refuses to sign or pay a deal with no share unless --no-share says so", async () => {
    const { shareForStatus } = await import("@/components/agent/deal-pure");
    const none = { given: null, booked: null, commission: 175_000, agreement: null, noShare: false };
    expect(() => shareForStatus("SIGNED", none)).toThrow(/no share for Mkan/);
    expect(() => shareForStatus("PAID", none)).toThrow(/no share for Mkan/);
    expect(shareForStatus("SIGNED", { ...none, noShare: true })).toBeNull();
    expect(shareForStatus("VIEWED", none)).toBeNull();
    expect(shareForStatus("LOST", none)).toBeNull();
    // Given now beats booked beats the broker's agreement.
    expect(shareForStatus("PAID", { ...none, given: 40_000, booked: 30_000, agreement: { pct: 0.5 } })).toBe(40_000);
    expect(shareForStatus("PAID", { ...none, booked: 30_000, agreement: { pct: 0.5 } })).toBe(30_000);
    expect(shareForStatus("SIGNED", { ...none, agreement: { pct: 0.5 } })).toBe(87_500);
  });

  it("drafts the invoice a person sends the broker, with the payout line when set", async () => {
    const { invoiceDraft } = await import("@/components/agent/deal-pure");
    const d = invoiceDraft({ broker: "Jean", amount: 87_500, ref: "K5882", title: "2-bed in Remera", payout: "MoMo 0780000001 (Mkan)" });
    expect(d).toContain("Hello Jean");
    expect(d).toContain("K5882");
    expect(d).toContain("RWF 87,500");
    expect(d).toContain("Please send it to MoMo 0780000001 (Mkan).");
    expect(invoiceDraft({ broker: null, amount: 1_000, ref: "K1", title: "x", payout: null })).not.toContain("Please send");
  });
});
