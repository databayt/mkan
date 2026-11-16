/**
 * The numbers with what each means (2026-11-15), worded over the funnel code /monetize already uses.
 */
import { describe, expect, it } from "vitest";
import type { ChannelInbound, InboundOverview, InboundUpstream } from "@/lib/monetize/inbound-pure";
import type { ChatFacts, ChatStage } from "@/lib/monetize/chat-funnel-pure";
import { inboundBlock, inboundMoved, numbersLines, numbersMessage, numbersShort, type NumbersInput } from "@/components/agent/loop-numbers-pure";

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

// ── Inbound (2026-11-16) ──
const up = (reach: number, intent = 0, tiktokViews: number | null = null): InboundUpstream => ({ reach, intent, tiktokViews });
function chan(channel: "web" | "wa", week: number, lastWeek: number, w: InboundUpstream, l: InboundUpstream, sources: { source: string; n: number }[] = [], movedToWa = 0): ChannelInbound {
  return { channel, today: 0, week, lastWeek, days30: week, series: [], sources, movedToWa, upstream: { week: w, lastWeek: l } };
}
function overview(over: { web?: Partial<ChannelInbound>; wa?: Partial<ChannelInbound> } = {}): InboundOverview {
  const web = { ...chan("web", 3, 2, up(100, 20), up(100, 20), [{ source: "fb-mkan1", n: 2 }, { source: "organic", n: 1 }], 1), ...over.web };
  const wa = { ...chan("wa", 2, 1, up(10, 10, 5000), up(10, 10, 5000), [{ source: "tiktok", n: 2 }]), ...over.wa };
  return { generatedAt: "2026-11-22T10:00:00Z", day: "2026-11-22", web, wa, total: { today: 0, week: web.week + wa.week, lastWeek: web.lastWeek + wa.lastWeek, target: 7 }, people: [], bottleneck: { now: "pick", next: "asked", nextRate: 0.32 } };
}

describe("the inbound block", () => {
  it("opens the Sunday message with the numbers, the sources and the bottleneck", () => {
    const text = numbersMessage(numbersLines(input([])), undefined, overview());
    expect(text.startsWith("People reaching us this week: 5 of 7 (last week 3)\n")).toBe(true);
    expect(text).toContain("Web: 3 (last week 2) · → WhatsApp 1");
    expect(text).toContain("WhatsApp: 2 (last week 1)");
    expect(text).toContain("Bottleneck: pick · next: asked 32%");
    expect(text).toContain("Sources this week:\n• Web: fb-mkan1 2, organic 1\n• WhatsApp: tiktok 2");
    // the existing lines stay, after it
    expect(text.indexOf("Numbers — the last 7 days")).toBeGreaterThan(text.indexOf("Bottleneck"));
    expect(text).toContain("Real WhatsApp tenants: 0");
  });
  it("says so when the numbers are not ready, and leaves the old message alone when asked for none", () => {
    expect(numbersMessage([], undefined, null)).toContain("inbound numbers not ready");
    expect(inboundBlock(null)).toEqual(["Inbound: inbound numbers not ready."]);
    expect(numbersMessage([])).toBe("Numbers — the last 7 days");
  });
  it("names counting's start when every upstream number is zero", () => {
    const z = overview({ web: { upstream: { week: up(0), lastWeek: up(0) } }, wa: { upstream: { week: up(0, 0, null), lastWeek: up(0, 0, null) } } });
    expect(inboundMoved(z)).toEqual(["Upstream counting started 16 Nov: nothing to compare yet."]);
  });
  it("reach fell: the problem is reach, not the chat", () => {
    const m = inboundMoved(overview({ web: { upstream: { week: up(60, 12), lastWeek: up(100, 20) } } }));
    expect(m[0]).toBe("Web visitors fell 40% → fewer people saw us: the problem is reach, not the chat.");
  });
  it("reach held but intent fell: the call to action", () => {
    const m = inboundMoved(overview({ web: { upstream: { week: up(100, 10), lastWeek: up(100, 20) } } }));
    expect(m[0]).toContain("people came but didn't open the chat: the pages' call to action");
  });
  it("taps held but WhatsApp arrivals fell: the WhatsApp door", () => {
    const m = inboundMoved(overview({ wa: { week: 1, lastWeek: 4 } }));
    expect(m[1]).toContain("people tapped but didn't write: the WhatsApp door");
  });
  it("all held but web people fell: the first screen", () => {
    const m = inboundMoved(overview({ web: { week: 1, lastWeek: 4 } }));
    expect(m[0]).toContain("they opened the chat but didn't write: the first screen");
  });
  it("TikTok views and taps falling both read as reach on WhatsApp", () => {
    expect(inboundMoved(overview({ wa: { upstream: { week: up(10, 10, 2000), lastWeek: up(10, 10, 5000) } } }))[1]).toBe("TikTok views fell 60% → fewer people saw us: the problem is reach, not the chat.");
    expect(inboundMoved(overview({ wa: { upstream: { week: up(5, 5, 5000), lastWeek: up(10, 10, 5000) } } }))[1]).toContain("WhatsApp taps fell 50%");
  });
  it("a fall under 30% is not named", () => {
    expect(inboundMoved(overview({ web: { upstream: { week: up(80, 20), lastWeek: up(100, 20) } } }))[0]).toBe("Web: nothing fell by 30% or more.");
  });
  it("shows no sources as none, and reads a percent rate as it is", () => {
    const o = overview({ web: { sources: [] } });
    o.bottleneck = { now: "first_reply", next: null, nextRate: null };
    const text = inboundBlock(o).join("\n");
    expect(text).toContain("• Web: none");
    expect(text).toContain("Bottleneck: first reply");
  });
});
