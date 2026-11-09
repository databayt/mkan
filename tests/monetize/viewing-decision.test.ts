import { describe, expect, it } from "vitest";

import { actionArgv, actionEffect, parseAction } from "@/lib/monetize/actions";
import { buildViewingDecision, kigaliStamp, viewingMarker } from "@/components/agent/viewing-decision";

const task = "cmw1sxpzz0009vmsdgwy7dym7";
const at = new Date("2026-11-10T08:00:00Z"); // 10:00 Kigali

describe("deal.book share choice", () => {
  const base = { task, listing: 6041, at: "2026-11-10 10:00" };
  it("takes one share choice and refuses two", () => {
    expect(parseAction("deal.book", { ...base, sharePct: 50 }).ok).toBe(true);
    expect(parseAction("deal.book", { ...base, shareRwf: 30000 }).ok).toBe(true);
    expect(parseAction("deal.book", { ...base, noShare: true }).ok).toBe(true);
    expect(parseAction("deal.book", { ...base, sharePct: 50, noShare: true }).ok).toBe(false);
    expect(parseAction("deal.book", { ...base, sharePct: 0 }).ok).toBe(false);
    expect(parseAction("deal.book", { ...base, sharePct: 150 }).ok).toBe(false);
    expect(parseAction("deal.book", { ...base, noShare: false }).ok).toBe(false);
  });
  it("turns it into deal:book flags and says it in words", () => {
    const a = parseAction("deal.book", { ...base, sharePct: 50 });
    const b = parseAction("deal.book", { ...base, noShare: true });
    const c = parseAction("deal.book", { ...base, shareRwf: 30000 });
    if (!a.ok || !b.ok || !c.ok) throw new Error("parse");
    expect(actionArgv(a.kind, a.params)).toContain("--share-pct=50");
    expect(actionArgv(b.kind, b.params)).toContain("--no-share");
    expect(actionArgv(b.kind, b.params).join(" ")).not.toMatch(/share-pct|share-rwf/);
    expect(actionArgv(c.kind, c.params)).toContain("--share-rwf=30000");
    expect(actionEffect(a.kind, a.params)).toMatch(/Mkan's share 50% of the broker's commission/);
    expect(actionEffect(b.kind, b.params)).toMatch(/no share for this deal/);
    expect(actionEffect(c.kind, c.params)).toMatch(/30,000 RWF a lease/);
  });
});

describe("buildViewingDecision", () => {
  it("reads the slot in Kigali time", () => {
    expect(kigaliStamp(at)).toBe("2026-11-10 10:00");
    expect(kigaliStamp(new Date("2026-11-10T23:30:00Z"))).toBe("2026-11-11 01:30");
  });
  it("carries the agreed percent, a flat share, or no share", () => {
    const pct = buildViewingDecision({ taskId: task, listingId: 6041, at, agreed: { pct: 0.5, flatRwf: null }, rent: 400000 })!;
    expect(pct.params).toMatchObject({ task, listing: 6041, at: "2026-11-10 10:00", rent: 400000, sharePct: 50 });
    expect(pct.params.noShare).toBeUndefined();
    const flat = buildViewingDecision({ taskId: task, listingId: 6041, at, agreed: { pct: null, flatRwf: 30000 } })!;
    expect(flat.params.shareRwf).toBe(30000);
    const none = buildViewingDecision({ taskId: task, listingId: 6041, at, agreed: null })!;
    expect(none.params.noShare).toBe(true);
    expect(none.ask).toMatch(/no share for Mkan/);
  });
  it("builds only valid actions, from ids and numbers, with a marker per chat and home", () => {
    expect(buildViewingDecision({ taskId: "x; rm -rf /", listingId: 6041, at, agreed: null })).toBeNull();
    const d = buildViewingDecision({ taskId: task, listingId: 6041, at, agreed: null })!;
    expect(d.text.startsWith(viewingMarker(task, 6041))).toBe(true);
    expect(parseAction("deal.book", d.params).ok).toBe(true);
  });
});
