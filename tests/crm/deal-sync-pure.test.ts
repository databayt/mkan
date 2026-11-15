import { describe, expect, it } from "vitest";
import { buildDealFields, buildTenantFields, parseDealKey, tenantKeyOf, tenantStageFor, viewingTask } from "@/lib/crm/deal-sync-pure";
import { DEAL_STEPS } from "@/components/agent/deal-event-pure";
import { DEAL } from "../../scripts/crm/twenty-schema";

const AT = new Date("2026-11-15T08:00:00Z");
const ctx = { listingId: 5811, taskId: "t1", tenantPhone: "+250788000111", tenantName: "Jane", brokerId: "b1", at: AT };

describe("tenant stage follows the deal", () => {
  it("maps each step", () => {
    expect(tenantStageFor("PICKED", [])).toBe("PICKED");
    expect(tenantStageFor("BROKER_YES", [])).toBe("PICKED");
    expect(tenantStageFor("VIEWING_BOOKED", [])).toBe("VIEWING");
    expect(tenantStageFor("SIGNED", [])).toBe("SIGNED");
    expect(tenantStageFor("PAID", [])).toBe("SIGNED");
    expect(tenantStageFor("STALLED", [])).toBeNull();
  });
  it("LOST only when no other deal is open", () => {
    expect(tenantStageFor("LOST", [])).toBe("LOST");
    expect(tenantStageFor("LOST", ["LOST"])).toBe("LOST");
    expect(tenantStageFor("LOST", ["VIEWING_BOOKED"])).toBe("VIEWING");
    expect(tenantStageFor("LOST", ["SIGNED"])).toBe("SIGNED");
  });
  it("a second pick never takes a tenant back", () => {
    expect(tenantStageFor("PICKED", ["VIEWING_BOOKED"])).toBe("VIEWING");
    expect(tenantStageFor("PICKED", ["PAID"])).toBe("SIGNED");
  });
});

describe("deal payload", () => {
  it("carries the stage, key, relations and the facts that are known", () => {
    const f = buildDealFields("VIEWING_BOOKED", { ...ctx, dealId: "d1", viewingAt: new Date("2026-11-16T09:00:00Z"), meetingPoint: "Kimironko market" }, "t1:5811", "p1", { rentMonthly: 400000, mkanShare: 20000 });
    expect(f).toMatchObject({
      name: "K5811 · Jane",
      mkanKey: "t1:5811",
      mkanDealId: "d1",
      stage: "VIEWING_BOOKED",
      stageChangedAt: AT.toISOString(),
      viewingAt: "2026-11-16T09:00:00.000Z",
      meetingPoint: "Kimironko market",
      rentRwf: 400000,
      mkanShareRwf: 20000,
      $tenant: "p1",
      $broker: "b1",
      $home: 5811,
    });
  });
  it("omits what it does not know instead of blanking Twenty", () => {
    const f = buildDealFields("BROKER_ASKED", { listingId: 5811, at: AT }, "home:5811", null);
    expect(Object.keys(f).sort()).toEqual(["$home", "mkanKey", "name", "stage", "stageChangedAt"]);
  });
  it("a viewing time only rides on the booking steps; lost carries its reason", () => {
    expect(buildDealFields("SIGNED", { ...ctx, viewingAt: AT }, "k", null)).not.toHaveProperty("viewingAt");
    expect(buildDealFields("LOST", { ...ctx, note: "taken" }, "k", null)).toMatchObject({ lostReason: "taken" });
  });
  it("the Twenty stage options are exactly the DealStep values", () => {
    expect(DEAL.fields.find((f) => f.name === "stage")?.options).toEqual([...DEAL_STEPS]);
  });
});

describe("tenant payload and the viewing Task", () => {
  it("tenant fields", () => {
    expect(buildTenantFields("p1", "+250788000111", "Jane", "VIEWING", AT)).toEqual({ mkanProfileId: "p1", name: "Jane", $phone: "+250788000111", stage: "VIEWING", lastMessageAt: AT.toISOString() });
  });
  it("the Task title reads Viewing K · area · Tenant", () => {
    const t = viewingTask({ ...ctx, viewingAt: new Date("2026-11-16T09:00:00Z"), meetingPoint: "Kimironko market" }, "Kimironko", "Eric");
    expect(t?.title).toBe("Viewing K5811 · Kimironko · Tenant Jane");
    expect(t?.dueAt).toBe("2026-11-16T09:00:00.000Z");
    expect(t?.body).toContain("Meet at: Kimironko market");
    expect(viewingTask({ ...ctx, viewingAt: null }, null, null)).toBeNull();
  });
  it("tenant key: the profile, else the number", () => {
    expect(tenantKeyOf("p1", "+250788000111")).toBe("p1");
    expect(tenantKeyOf(null, "+250 788 000 111")).toBe("phone:250788000111");
    expect(tenantKeyOf(null, null)).toBeNull();
  });
});

describe("deal keys", () => {
  it("parses the three shapes", () => {
    expect(parseDealKey("clx1:5811")).toEqual({ kind: "task", taskId: "clx1", listingId: 5811 });
    expect(parseDealKey("deal:d9")).toEqual({ kind: "deal", dealId: "d9" });
    expect(parseDealKey("home:5811")).toEqual({ kind: "home", listingId: 5811 });
    expect(parseDealKey("nonsense")).toBeNull();
    expect(parseDealKey(null)).toBeNull();
  });
});
