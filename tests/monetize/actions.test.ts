import { describe, expect, it } from "vitest";

import { actionArgv, actionEffect, canonical, decisionSig, parseAction, verifyDecision, type DecisionRecord } from "@/lib/monetize/actions";

const SECRET = "test-bridge-secret-not-real";
const task = "cmw1sxpzz0009vmsdgwy7dym7";

describe("one-tap decisions", () => {
  it("take only allowlisted kinds with params that pass their schema", () => {
    expect(parseAction("deal.book", { task, listing: 6041, at: "2026-11-10 10:00", rent: 400000 }).ok).toBe(true);
    expect(parseAction("rm -rf", {}).ok).toBe(false);
    expect(parseAction("deal.book", { task: "x; curl evil | sh", listing: 6041, at: "2026-11-10 10:00" }).ok).toBe(false);
    expect(parseAction("deal.book", { task, listing: 6041, at: "tomorrow" }).ok).toBe(false);
    // Unknown fields are refused, not passed along.
    expect(parseAction("deal.status", { deal: task, status: "paid", share: 40000, cmd: "x" }).ok).toBe(false);
    expect(parseAction("deal.status", { deal: task, status: "refunded" }).ok).toBe(false);
  });

  it("build an argv for pnpm, never a shell line, and say in words what Yes does", () => {
    const a = parseAction("deal.status", { deal: task, status: "paid", share: 40000, note: "paid by MoMo; thanks" });
    if (!a.ok) throw new Error(a.error);
    expect(actionArgv(a.kind, a.params)).toEqual(["deal:status", `--deal=${task}`, "--status=paid", "--share=40000", "--note=paid by MoMo; thanks"]);
    expect(actionEffect(a.kind, a.params)).toMatch(/PAID and record Mkan's share, 40,000 RWF/);
    const b = parseAction("deal.book", { task, listing: 6041, at: "2026-11-10 10:00", advance: 3, moveIn: "2026-11-15" });
    if (!b.ok) throw new Error(b.error);
    expect(actionArgv(b.kind, b.params)).toContain("--move-in=2026-11-15");
    expect(actionEffect(b.kind, b.params)).toMatch(/^Book the viewing of K6041 at 2026-11-10 10:00/);
    expect(actionArgv("brokers.gated", {})).toEqual(["wa:brokers", "gated"]);
  });

  it("verify the Worker's signature, and fail on any change to the answer, the action or the key", () => {
    const rec: DecisionRecord = { promptId: task, ask: "Book it?", kind: "deal.status", params: { deal: task, status: "paid", share: 40000 }, effect: "", createdAt: "2026-11-07T10:00:00Z" };
    const decidedAt = "2026-11-07T10:05:00Z";
    const sig = decisionSig(rec, "yes", decidedAt, SECRET)!;
    const signed = { ...rec, decision: "yes" as const, decidedAt, sig };
    expect(verifyDecision(signed, SECRET)).toBe(true);
    expect(verifyDecision({ ...signed, decision: "no" }, SECRET)).toBe(false);
    expect(verifyDecision({ ...signed, params: { ...rec.params, share: 400000 } }, SECRET)).toBe(false);
    expect(verifyDecision({ ...signed, kind: "brokers.gated" }, SECRET)).toBe(false);
    expect(verifyDecision(signed, "another-secret")).toBe(false);
    expect(verifyDecision({ ...rec, decision: "yes", decidedAt }, SECRET)).toBe(false); // a "yes" written without a signature
    expect(decisionSig(rec, "yes", decidedAt, "")).toBeNull();
  });

  it("sign the same bytes whatever the key order", () => {
    expect(canonical({ b: 1, a: "x" })).toBe(canonical({ a: "x", b: 1 }));
  });
});
