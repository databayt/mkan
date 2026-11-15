import { describe, expect, it } from "vitest";
import { bySystem, dealDiff, dealEdits, dealKeyOf, dealStatusAction, digitsOf, isOptOutOn, termsOf, withTermsNote } from "@/lib/crm/inbound-pure";
import { twentyBrokerState } from "@/lib/crm/broker-edit-pure";
import { humanEdit } from "../../scripts/crm/brokers-pure";

describe("a stage moved in Twenty", () => {
  it("steps forward act", () => {
    expect(dealStatusAction("VIEWED", "VIEWING_BOOKED")).toBe("VIEWED");
    expect(dealStatusAction("SIGNED", "VIEWING_BOOKED")).toBe("SIGNED");
    expect(dealStatusAction("PAID", "SIGNED")).toBe("PAID");
    expect(dealStatusAction("LOST", "VIEWED")).toBe("LOST");
  });
  it("the same stage, a step back, a pre-booking stage or anything after LOST does nothing", () => {
    expect(dealStatusAction("SIGNED", "SIGNED")).toBeNull();
    expect(dealStatusAction("VIEWED", "PAID")).toBeNull();
    expect(dealStatusAction("BROKER_YES", "VIEWING_BOOKED")).toBeNull();
    expect(dealStatusAction("PAID", "LOST")).toBeNull();
    expect(dealStatusAction("LOST", "LOST")).toBeNull();
  });
  it("tolerates a spaced or lower-case label", () => {
    expect(dealStatusAction("signed", "VIEWED")).toBe("SIGNED");
  });
});

describe("deal field edits", () => {
  it("only fields listed in updatedFields count", () => {
    const rec = { viewingAt: "2026-11-16T09:00:00Z", mkanShareRwf: 25000, tripCostRwf: 3000, terms: " 2 months advance " };
    expect(dealEdits(rec, ["mkanShareRwf"])).toEqual({ mkanShare: 25000 });
    expect(dealEdits(rec, ["viewingAt", "terms", "tripCostRwf"])).toEqual({ viewingAt: new Date("2026-11-16T09:00:00Z"), terms: "2 months advance", tripCost: 3000 });
    expect(dealEdits(rec, ["stage"])).toEqual({});
  });
  it("a cleared number is null, a garbage date is ignored", () => {
    expect(dealEdits({ mkanShareRwf: null }, ["mkanShareRwf"])).toEqual({ mkanShare: null });
    expect(dealEdits({ viewingAt: "soon" }, ["viewingAt"])).toEqual({});
  });
  it("terms live on one line of Deal.notes", () => {
    expect(withTermsNote(null, "2 months advance")).toBe("terms: 2 months advance");
    expect(withTermsNote("terms: old\nbroker slow to answer", "3 months")).toBe("terms: 3 months\nbroker slow to answer");
    expect(withTermsNote("terms: old\nkeep this", null)).toBe("keep this");
    expect(termsOf("x\nterms: 2 months")).toBe("2 months");
  });
  it("the key comes from our link, else the record", () => {
    expect(dealKeyOf("deal:t1:5811", {})).toBe("t1:5811");
    expect(dealKeyOf(null, { mkanKey: "t1:5811" })).toBe("t1:5811");
    expect(dealKeyOf(null, {})).toBeNull();
  });
});

describe("reconcile diff", () => {
  const row = { status: "VIEWING_BOOKED", mkanShare: 20000, tripCost: null, notes: null, scheduledFor: new Date("2026-11-16T09:00:00Z") };
  it("lists what a person changed, ignores blanks", () => {
    expect(dealDiff({ stage: "SIGNED", mkanShareRwf: 25000, tripCostRwf: 3000, terms: "x", viewingAt: "2026-11-16T11:00:00Z" }, row).sort()).toEqual(["mkanShareRwf", "stage", "terms", "tripCostRwf", "viewingAt"]);
    expect(dealDiff({ stage: "VIEWING_BOOKED", mkanShareRwf: 20000, tripCostRwf: null, terms: "", viewingAt: "2026-11-16T09:00:30Z" }, row)).toEqual([]);
  });
});

describe("tenant opt-out", () => {
  it("acts only when optOut turned on", () => {
    expect(isOptOutOn({ optOut: true }, ["optOut"])).toBe(true);
    expect(isOptOutOn({ optOut: false }, ["optOut"])).toBe(false);
    expect(isOptOutOn({ optOut: true }, ["stage"])).toBe(false);
  });
  it("digits for the STOP list", () => {
    expect(digitsOf(["+250788000111", "+250 788 000 111", null, "12"])).toEqual(["250788000111"]);
  });
  it("a script's write is not a person's edit", () => {
    expect(bySystem({ updatedBy: { source: "API" } })).toBe(true);
    expect(bySystem({ updatedBy: { source: "MANUAL" } })).toBe(false);
    expect(bySystem({})).toBe(false);
  });
});

describe("broker.updated reuses the daily mapping", () => {
  const prisma = { id: "b1", kind: "BROKER" as const, name: "Eric", phones: ["+250788000222"], whatsapp: null, optOut: false, optOutAt: null, zoneSlugs: [], lockedFields: [], syncedAt: new Date("2026-11-15T07:00:00Z"), relationship: "NEW" as const, sharePct: null, shareFlatRwf: null, agreementNote: null, agreedAt: null };
  const event = { id: "tw1", kind: "BROKER", name: "Eric", phone: { primaryPhoneNumber: "788000222", primaryPhoneCallingCode: "+250", primaryPhoneCountryCode: "RW" }, optOut: false, relationship: "PARTNER", sharePct: 50, shareFlatRwf: 30000, agreementNote: "viewing fee ours", updatedAt: "2026-11-15T09:00:00Z", updatedBy: { source: "MANUAL" } };
  it("relationship, share (percent → fraction), flat share and agreement are copied", () => {
    const edit = humanEdit(twentyBrokerState(event, null, null), prisma, new Date("2026-11-15T09:00:00Z"));
    expect(edit.changed.sort()).toEqual(["agreementNote", "relationship", "shareFlatRwf", "sharePct"]);
    expect(edit.data).toMatchObject({ relationship: "PARTNER", sharePct: 0.5, shareFlatRwf: 30000, agreementNote: "viewing fee ours" });
  });
  it("DO_NOT_CONTACT opts the broker out", () => {
    const edit = humanEdit(twentyBrokerState({ ...event, relationship: "DO_NOT_CONTACT" }, null, null), prisma, new Date("2026-11-15T09:00:00Z"));
    expect(edit.data).toMatchObject({ relationship: "DO_NOT_CONTACT", optOut: true });
  });
});
