/**
 * One word from Mkan's person closes a step (2026-11-14): "signed K5811" on WhatsApp instead of
 * `pnpm deal:status` on the Mac — the last command in the path from a chat to a paid deal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readRepWord, repDigits, repHelpText } from "@/components/agent/rep-word-pure";

type Extras = { mkanShare?: number | null; noShare?: boolean; notes?: string | null };
const setDealStatus = vi.fn<(id: string, status: string, extras: Extras) => Promise<{ id: string; mkanShare: number | null }>>(async () => ({ id: "d1", mkanShare: 9000 }));
let open: { id: string; status: string } | null = { id: "d1", status: "VIEWED" };
let asked = true;
const findFirst = vi.fn<(q: { where: { listingId: number; status: { in: string[] } } }) => Promise<{ id: string; status: string } | null>>(async () => open);
vi.mock("@/lib/db", () => ({
  db: {
    deal: {
      findFirst: (q: { where: { listingId: number; status: { in: string[] } } }) => findFirst(q),
      findMany: vi.fn(async () => [{ status: "VIEWING_BOOKED", listingId: 5811, mkanShare: null, listing: { title: "3-bedroom apartment in Rebero" }, visit: { scheduledFor: new Date("2026-11-17T08:00:00Z") } }]),
    },
    waState: { findUnique: vi.fn(async () => (asked ? { key: "share-asked:d1" } : null)) },
  },
}));
vi.mock("@/components/agent/deal", () => ({ setDealStatus: (id: string, status: string, extras: Extras) => setDealStatus(id, status, extras) }));

const { applyRepWord } = await import("@/components/agent/rep-word");

beforeEach(() => {
  setDealStatus.mockReset();
  setDealStatus.mockResolvedValue({ id: "d1", mkanShare: 9000 });
  findFirst.mockClear();
  open = { id: "d1", status: "VIEWED" };
  asked = true;
});

describe("what Mkan's person wrote", () => {
  const status = (t: string) => {
    const w = readRepWord(t);
    return w?.kind === "status" ? w : null;
  };

  it("reads the four words with a home's code, either way round", () => {
    expect(status("signed K5811")).toEqual({ kind: "status", status: "SIGNED", listingId: 5811, share: null, noShare: false, note: null });
    expect(status("K5811 signed")?.status).toBe("SIGNED");
    expect(status("paid k 5811")?.status).toBe("PAID");
    expect(status("viewed K5811")?.status).toBe("VIEWED");
    expect(status("Lost K5811")?.status).toBe("LOST");
    expect(status("signed 5811")?.listingId).toBe(5811);
  });

  it("reads the share, never as a home's code, and 'no share'", () => {
    expect(status("signed K5811 share 9000")).toMatchObject({ listingId: 5811, share: 9000, noShare: false });
    expect(status("share 9000 K5811 signed")).toMatchObject({ listingId: 5811, share: 9000 });
    expect(status("signed 5811 share 9,000")).toMatchObject({ listingId: 5811, share: 9000 });
    expect(status("signed K5811 share 9k")).toMatchObject({ share: 9000 });
    expect(status("signed K5811 no share")).toMatchObject({ share: null, noShare: true });
  });

  it("keeps the reason a deal was lost", () => {
    expect(status("lost K5811 too expensive for them")).toMatchObject({ status: "LOST", note: "too expensive for them" });
    expect(status("lost K5811")?.note).toBeNull();
  });

  it("reads Arabic, and Arabic-Indic digits", () => {
    expect(status("تم التوقيع K5811")?.status).toBe("SIGNED");
    expect(status("تم الدفع K٥٨١١")).toMatchObject({ status: "PAID", listingId: 5811 });
    expect(status("K5811 خسرنا")?.status).toBe("LOST");
    expect(readRepWord("الصفقات")).toEqual({ kind: "list" });
  });

  it("asks for the list", () => {
    for (const t of ["deals", "Deals?", "status", "?"]) expect(readRepWord(t), t).toEqual({ kind: "list" });
  });

  it("is not a word without a status and a code: their message then goes the usual way", () => {
    for (const t of ["signed", "K5811", "2 bedroom in Kicukiro up to 300k", "hello", "the tenant signed yesterday", ""]) expect(readRepWord(t), t).toBeNull();
  });

  it("runs only for the number that is set", () => {
    expect(repDigits("+250 720 000 001")).toBe("250720000001");
    expect(repDigits("")).toBeNull();
    expect(repDigits(undefined)).toBeNull();
    expect(repHelpText()).toMatch(/signed K5811/);
  });
});

describe("what the line does with it", () => {
  const signed = { kind: "status" as const, status: "SIGNED" as const, listingId: 5811, share: null, noShare: false, note: null };

  it("signs the home's newest open deal and says where the share request went", async () => {
    const r = await applyRepWord(signed);
    expect(findFirst.mock.calls[0]![0].where).toEqual({ listingId: 5811, status: { in: ["VIEWING_BOOKED", "VIEWED"] } });
    expect(setDealStatus).toHaveBeenCalledWith("d1", "SIGNED", { mkanShare: null, noShare: false, notes: null });
    expect(r).toBe("Recorded: K5811 signed. Mkan's share RWF 9,000: the request went to the broker on WhatsApp. When the broker pays, send: paid K5811");
    asked = false;
    expect(await applyRepWord(signed)).toMatch(/the request is drafted in #mkan/);
  });

  it("asks for the share when none is on record, instead of closing the deal without one", async () => {
    setDealStatus.mockRejectedValueOnce(new Error("no share for Mkan on this deal — pass --share=<RWF the broker owes Mkan>, or --no-share to close it without one"));
    expect(await applyRepWord(signed)).toBe("K5811 has no share on record. Send: signed K5811 share <RWF> — or: signed K5811 no share");
    await applyRepWord({ ...signed, share: 9000 });
    expect(setDealStatus).toHaveBeenLastCalledWith("d1", "SIGNED", { mkanShare: 9000, noShare: false, notes: null });
  });

  it("records paid, viewed and lost, with the reason", async () => {
    expect(await applyRepWord({ ...signed, status: "PAID" })).toBe("Recorded: K5811 paid, RWF 9,000 received.");
    expect(findFirst.mock.calls.at(-1)![0].where.status.in).toEqual(["SIGNED", "VIEWED", "VIEWING_BOOKED"]);
    expect(await applyRepWord({ ...signed, status: "VIEWED" })).toMatch(/^Recorded: K5811 viewed\./);
    expect(await applyRepWord({ ...signed, status: "LOST", note: "too expensive" })).toBe("Recorded: K5811 lost (too expensive).");
    expect(setDealStatus).toHaveBeenLastCalledWith("d1", "LOST", { mkanShare: null, noShare: false, notes: "too expensive (WhatsApp, Mkan's person)" });
  });

  it("says so when the home has no open deal, and lists the open ones", async () => {
    open = null;
    const r = await applyRepWord(signed);
    expect(r).toMatch(/^No open deal for K5811 that can become signed\./);
    expect(r).toContain("K5811 · viewing booked · Tue 17 Nov, 10:00 · no share yet");
    expect(setDealStatus).not.toHaveBeenCalled();
  });

  it("lists the open deals on 'deals'", async () => {
    expect(await applyRepWord({ kind: "list" })).toContain("K5811 · viewing booked");
  });
});
