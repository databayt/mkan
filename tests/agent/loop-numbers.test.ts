/**
 * The numbers with what each means (2026-11-15), worded over the funnel code /monetize already uses.
 */
import { describe, expect, it } from "vitest";
import type { ChatFacts, ChatStage } from "@/lib/monetize/chat-funnel-pure";
import { numbersLines, numbersMessage, numbersShort, type NumbersInput } from "@/components/agent/loop-numbers-pure";

const now = new Date("2026-11-22T12:00:00Z");
const hoursAfter = (base: Date, h: number) => new Date(base.getTime() + h * 3_600_000);
const day = (d: number) => new Date(now.getTime() - d * 86_400_000);

/** A chat that reached `to`, with stamps `step` hours apart. */
function chat(id: string, to: ChatStage, stepHours = 1, startedDaysAgo = 2, channel: "wa" | "web" = "wa"): ChatFacts {
  const stages: ChatStage[] = ["chat", "homes", "pick", "asked", "yes", "time", "booked", "viewed", "signed", "paid"];
  const at: ChatFacts["at"] = {};
  const t0 = day(startedDaysAgo);
  stages.slice(0, stages.indexOf(to) + 1).forEach((s, i) => (at[s] = hoursAfter(t0, i * stepHours)));
  return { id, channel, source: "organic", lang: "en", rent: 400_000, at, lastTenantAt: t0 };
}
const input = (chats: ChatFacts[], over: Partial<NumbersInput> = {}): NumbersInput => ({ now, chats, paidDeals: [], quoting: 0, ...over });
const line = (lines: ReturnType<typeof numbersLines>, key: string) => lines.find((l) => l.key === key)!;

describe("the numbers", () => {
  it("counts real WhatsApp tenants of the week and each step's rate", () => {
    const chats = [chat("a", "chat"), chat("b", "homes"), chat("c", "pick"), chat("d", "booked"), chat("w", "paid", 1, 2, "web"), chat("old", "paid", 1, 20)];
    const lines = numbersLines(input(chats));
    expect(line(lines, "tenants").text).toBe("Real WhatsApp tenants: 4");
    // 3 reached the homes (b, c, d); 2 of them picked (c, d).
    expect(line(lines, "picked").text).toBe("Shown → picked: 2 of 3 (67%)");
    expect(line(lines, "picked").action).toBeNull();
  });

  it("says what to do when a number crosses its threshold", () => {
    const chats = [
      ...Array.from({ length: 10 }, (_, i) => chat(`h${i}`, "homes")),
      chat("p", "pick"),
      // a broker slower than a day, and a tenant who got a yes but no viewing
      chat("slow", "yes", 30),
    ];
    const lines = numbersLines(input(chats));
    expect(line(lines, "picked").action).toMatch(/Stock or price mismatch/);
    expect(line(lines, "yes").text).toMatch(/median 30 h/);
    expect(line(lines, "yes").action).toMatch(/next broker/);
    expect(line(lines, "booked").text).toBe("Yes → viewing booked: 0 of 1 (0%)");
    expect(line(lines, "booked").action).toMatch(/Call the tenant/);
  });

  it("flags a no-show rate and a slow payer", () => {
        const noShow = numbersLines(input([chat("b1", "booked"), chat("b2", "booked"), chat("b3", "viewed")]));
    expect(line(noShow, "viewed").text).toBe("Booked → viewed: 1 of 3 (33%)");
    expect(line(noShow, "viewed").action).toMatch(/day before/);
    // 200 h from signed to paid is over a week.
    const slow = numbersLines(input([chat("s", "paid", 200)]));
    expect(line(slow, "paid").action).toMatch(/Chase the share/);
  });

  it("nets the share against the trip and leans to bigger homes when it is negative", () => {
    const none = numbersLines(input([]));
    expect(line(none, "net").text).toBe("Net per deal: no paid deal yet");
    const win = numbersLines(input([], { paidDeals: [{ mkanShare: 35_000, tripCost: 5_000, paidAt: day(1) }] }));
    expect(line(win, "net").text).toBe("Net per deal: RWF 30,000 over 1 paid deal");
    expect(line(win, "net").action).toBeNull();
    const loss = numbersLines(input([], { paidDeals: [{ mkanShare: 9_000, tripCost: 12_000, paidAt: day(1) }] }));
    expect(line(loss, "net").text).toContain("-3,000");
    expect(line(loss, "net").action).toMatch(/700,000/);
    expect(line(loss, "paid-goal").text).toBe("Paid deals: 1/10");
  });

  it("tracks the pivot gate: 20 real tenants and a viewing by 29 Nov", () => {
    const few = numbersLines({ ...input([chat("a", "chat")]), now: new Date("2026-11-24T12:00:00Z") });
    expect(line(few, "pivot").text).toBe("Pivot gate: 1/20 tenants, 0 viewings (by 2026-11-29)");
    expect(line(few, "pivot").action).toMatch(/week left/);
    const met = numbersLines(input([chat("v", "booked"), ...Array.from({ length: 19 }, (_, i) => chat(`c${i}`, "chat"))]));
    expect(line(met, "pivot").meaning).toBe("The gate is met.");
    expect(line(met, "pivot").action).toBeNull();
    const late = numbersLines({ ...input([chat("a", "chat")]), now: new Date("2026-12-01T12:00:00Z") });
    expect(line(late, "pivot").action).toMatch(/^Pivot/);
  });

  it("counts chats quoting a K-code", () => {
    expect(line(numbersLines(input([], { quoting: 3 })), "quoting").text).toBe("Chats quoting a K-code: 3");
  });
});

describe("the words", () => {
  it("prints each line with its meaning and action", () => {
    const lines = numbersLines(input([...Array.from({ length: 6 }, (_, i) => chat(`h${i}`, "homes")), chat("p", "pick")]));
    const text = numbersMessage(lines);
    expect(text.startsWith("Numbers — the last 7 days\n• Real WhatsApp tenants: 7")).toBe(true);
    expect(text).toContain("  → Stock or price mismatch");
  });
  it("sums up in one line for an empty day", () => {
    const short = numbersShort(numbersLines(input([chat("a", "chat")])));
    expect(short).toContain("Real WhatsApp tenants: 1");
    expect(short).toContain("Paid deals: 0/10");
  });
});
