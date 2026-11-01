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
