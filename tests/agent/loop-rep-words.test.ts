/**
 * The controls from Abdout's phone (2026-11-15): take / back / note / cost / off / numbers, English and Arabic,
 * and what each one writes.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOffDay, readRepWord, repHelpText } from "@/components/agent/rep-word-pure";

// Monday 16 Nov 2026, 10:00 Kigali.
const now = new Date("2026-11-16T08:00:00Z");

describe("reading the new words", () => {
  it("take and back name a home", () => {
    expect(readRepWord("take K5811", now)).toEqual({ kind: "take", listingId: 5811 });
    expect(readRepWord("TAKE k5811", now)).toEqual({ kind: "take", listingId: 5811 });
    expect(readRepWord("استلم K5811", now)).toEqual({ kind: "take", listingId: 5811 });
    expect(readRepWord("back K5811", now)).toEqual({ kind: "back", listingId: 5811 });
    expect(readRepWord("رجع K5811", now)).toEqual({ kind: "back", listingId: 5811 });
    // A word with no home is not a word.
    expect(readRepWord("take", now)).toBeNull();
    expect(readRepWord("take it easy", now)).toBeNull();
  });

  it("note keeps everything after the code, even a long story, and is not read as a status", () => {
    expect(readRepWord("note K5811 found it on Facebook; the broker charged one month, almost stopped by the deposit", now)).toEqual({
      kind: "note",
      listingId: 5811,
      text: "found it on Facebook; the broker charged one month, almost stopped by the deposit",
    });
    expect(readRepWord("note K5811 signed it in his head already", now)).toMatchObject({ kind: "note", text: "signed it in his head already" });
    expect(readRepWord("ملاحظة K5811 المستأجر يريد طابقا أعلى", now)).toMatchObject({ kind: "note", listingId: 5811 });
    expect(readRepWord("note K5811", now)).toBeNull();
  });

  it("cost reads an amount, with thousands or a k", () => {
    expect(readRepWord("cost K5811 3000", now)).toEqual({ kind: "cost", listingId: 5811, amount: 3000 });
    expect(readRepWord("cost K5811 3,500", now)).toEqual({ kind: "cost", listingId: 5811, amount: 3500 });
    expect(readRepWord("cost K5811 3k", now)).toEqual({ kind: "cost", listingId: 5811, amount: 3000 });
    expect(readRepWord("تكلفة K5811 2000", now)).toEqual({ kind: "cost", listingId: 5811, amount: 2000 });
    expect(readRepWord("cost K5811 lots", now)).toBeNull();
  });

  it("off takes a date, today or tomorrow", () => {
    expect(readRepWord("off 2026-11-20", now)).toEqual({ kind: "off", day: "2026-11-20" });
    expect(readRepWord("off tomorrow", now)).toEqual({ kind: "off", day: "2026-11-17" });
    expect(readRepWord("off today", now)).toEqual({ kind: "off", day: "2026-11-16" });
    expect(readRepWord("إجازة غدا", now)).toEqual({ kind: "off", day: "2026-11-17" });
    expect(readRepWord("off 2026-02-31", now)).toBeNull();
    expect(readRepWord("off", now)).toBeNull();
    expect(readOffDay("tomorrow", new Date("2026-11-16T23:30:00Z"))).toBe("2026-11-18");
  });

  it("numbers is a word of its own", () => {
    expect(readRepWord("numbers", now)).toEqual({ kind: "numbers" });
    expect(readRepWord("Numbers?", now)).toEqual({ kind: "numbers" });
    expect(readRepWord("الأرقام", now)).toEqual({ kind: "numbers" });
  });

  it("leaves the old words alone and lists the new ones in the help", () => {
    expect(readRepWord("signed K5811 share 9000", now)).toMatchObject({ kind: "status", status: "SIGNED", share: 9000 });
    expect(readRepWord("deals", now)).toEqual({ kind: "list" });
    const help = repHelpText();
    for (const w of ["take K5811", "back K5811", "note K5811", "cost K5811", "off 2026-11-20", "numbers"]) expect(help).toContain(w);
  });
});

// ── what they write ────────────────────────────────────────────────────────────────────────────

const store = new Map<string, unknown>();
const deal = { id: "d1", taskId: "t1", notes: "first note", tenantPhone: "+250788123456" };
let dealRow: typeof deal | null = deal;
const dealUpdate = vi.fn<(q: unknown) => Promise<object>>(async () => ({}));
const crmNote = vi.fn<(k: string, t: string) => Promise<void>>(async () => {});
const crmDealPatch = vi.fn<(k: string, f: unknown) => Promise<void>>(async () => {});
vi.mock("@/lib/db", () => ({
  db: {
    deal: { findFirst: vi.fn(async () => dealRow), update: (q: unknown) => dealUpdate(q), findMany: vi.fn(async () => []) },
    brokerRequest: { findFirst: vi.fn(async () => null) },
    listingVisit: { count: vi.fn(async () => 2) },
    waState: { findUnique: vi.fn(async () => null) },
  },
}));
vi.mock("@/lib/crm/deal-sync", () => ({ crmNote: (k: string, t: string) => crmNote(k, t), crmDealPatch: (k: string, f: unknown) => crmDealPatch(k, f), crmStep: vi.fn() }));
vi.mock("@/components/agent/deal", () => ({ setDealStatus: vi.fn() }));
vi.mock("@/components/agent/wa-state", () => ({
  writeState: vi.fn(async (k: string, v: unknown) => void store.set(k, v)),
  mutateState: vi.fn(async (k: string, empty: unknown, change: (v: unknown) => unknown) => {
    const next = change(store.get(k) ?? empty);
    store.set(k, next);
    return next;
  }),
}));
vi.mock("@/components/agent/loop-numbers", () => ({ numbersReport: vi.fn(async () => "Numbers — the last 7 days\n• Real WhatsApp tenants: 3") }));

const { applyRepWord } = await import("@/components/agent/rep-word");

beforeEach(() => {
  store.clear();
  dealRow = deal;
  dealUpdate.mockClear();
  crmNote.mockClear();
  crmDealPatch.mockClear();
});

describe("what the words write", () => {
  it("take pauses the line in the tenant's chat for 12 h, and back removes the hold", async () => {
    const reply = await applyRepWord({ kind: "take", listingId: 5811 });
    const human = store.get("tenant-human") as Record<string, string>;
    expect(Object.keys(human)).toEqual(["250788123456"]);
    expect(Date.now() - Date.parse(human["250788123456"]!)).toBeLessThan(5_000);
    expect(reply).toMatch(/paused in the \+250788123456 chat until \w{3} \d+ \w{3}, \d\d:\d\d/);
    expect(await applyRepWord({ kind: "back", listingId: 5811 })).toMatch(/answers in the \+250788123456 chat again/);
    expect(store.get("tenant-human")).toEqual({});
  });

  it("take with no deal and no chat says so", async () => {
    dealRow = null;
    expect(await applyRepWord({ kind: "take", listingId: 5811 })).toMatch(/No tenant found for K5811/);
  });

  it("note appends to the deal and goes to Twenty under the deal's key", async () => {
    expect(await applyRepWord({ kind: "note", listingId: 5811, text: "found it on Facebook" })).toBe("Noted on K5811.");
    const data = (dealUpdate.mock.calls[0]![0] as { data: { notes: string } }).data;
    expect(data.notes).toMatch(/^first note\n\[\d{4}-\d\d-\d\d\] found it on Facebook$/);
    expect(crmNote).toHaveBeenCalledWith("t1:5811", "found it on Facebook");
  });

  it("note and cost with no deal say there is none", async () => {
    dealRow = null;
    expect(await applyRepWord({ kind: "note", listingId: 5811, text: "x" })).toMatch(/no deal for K5811/);
    expect(await applyRepWord({ kind: "cost", listingId: 5811, amount: 3000 })).toMatch(/no deal for K5811/);
    expect(crmNote).not.toHaveBeenCalled();
  });

  it("cost sets the trip cost and patches Twenty", async () => {
    expect(await applyRepWord({ kind: "cost", listingId: 5811, amount: 3000 })).toBe("Recorded: the trip for K5811 cost RWF 3,000.");
    expect(dealUpdate).toHaveBeenCalledWith({ where: { id: "d1" }, data: { tripCost: 3000 } });
    expect(crmDealPatch).toHaveBeenCalledWith("t1:5811", { tripCostRwf: 3000 });
  });

  it("off writes the day and warns about viewings already booked on it", async () => {
    const reply = await applyRepWord({ kind: "off", day: "2026-11-20" });
    expect(store.has("rep-off:2026-11-20")).toBe(true);
    expect(reply).toBe("Marked off: Fri 20 Nov. The line offers no viewing that day. 2 already booked that day stay — move them yourself.");
  });

  it("numbers sends the report", async () => {
    expect(await applyRepWord({ kind: "numbers" })).toContain("Real WhatsApp tenants: 3");
  });
});
