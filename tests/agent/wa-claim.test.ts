/**
 * One claim per tenant message (wa-state.ts claimMessage), with the database mocked (2026-11-08): a claim
 * another run holds is "held" — never null, which the poll read as "answered" and marked seen.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const rows = new Map<string, unknown>();
const createMany = vi.fn(async ({ data }: { data: { key: string; value: unknown }[] }) => {
  const d = data[0]!;
  if (rows.has(d.key)) return { count: 0 };
  rows.set(d.key, d.value);
  return { count: 1 };
});
const takeover = vi.fn(async () => 1);
vi.mock("@/lib/db", () => ({
  db: {
    waState: {
      createMany: (a: { data: { key: string; value: unknown }[] }) => createMany(a),
      findUnique: async ({ where }: { where: { key: string } }) => (rows.has(where.key) ? { value: rows.get(where.key) } : null),
    },
    $executeRaw: () => takeover(),
  },
}));

const { claimMessage, CLAIM_STALE_MS } = await import("@/components/agent/wa-state");

const NOW = new Date("2026-11-08T10:00:00Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

beforeEach(() => {
  rows.clear();
  takeover.mockClear();
  takeover.mockResolvedValue(1);
});

describe("claimMessage", () => {
  it("a new message is claimed fresh", async () => {
    expect(await claimMessage("m1", NOW)).toEqual({ mode: "fresh", tries: 1 });
  });
  it("one another run is answering right now is held, not null", async () => {
    rows.set("tmsg:m2", { s: "working", at: ago(10_000), tries: 1 });
    expect(await claimMessage("m2", NOW)).toEqual({ mode: "held" });
  });
  it("a run that died is taken over as a retry; losing that race is held too", async () => {
    rows.set("tmsg:m3", { s: "working", at: ago(CLAIM_STALE_MS + 1_000), tries: 1 });
    expect(await claimMessage("m3", NOW)).toEqual({ mode: "retry", tries: 2 });
    takeover.mockResolvedValue(0);
    expect(await claimMessage("m3", NOW)).toEqual({ mode: "held" });
  });
  it("a reply written but not sent is re-sent; a settled message is null", async () => {
    rows.set("tmsg:m4", { s: "reply", at: ago(5_000), tries: 1, text: "the reply" });
    expect(await claimMessage("m4", NOW)).toMatchObject({ mode: "resend", text: "the reply" });
    rows.set("tmsg:m5", { s: "done", at: ago(5_000), tries: 0 });
    expect(await claimMessage("m5", NOW)).toBeNull();
  });
});
