import { describe, expect, it } from "vitest";
import { lastTenantAt, reachedAt, tenantActive, tenantGate, tenantNumber } from "@/components/agent/broker-gate";

describe("reachedAt — the number every later step reaches the tenant at (2026-11-08)", () => {
  it("the WhatsApp chat's own number first, else a web tenant's left one, never one without consent", () => {
    expect(reachedAt({ id: "t", profile: { waPhone: "+250720000011" }, demand: { phone: "+250720000012", optInAt: new Date() } }).profile.waPhone).toBe("+250720000011");
    expect(reachedAt({ id: "t", profile: null, demand: { phone: "+250720000012", optInAt: new Date() } }).profile.waPhone).toBe("+250720000012");
    expect(reachedAt({ id: "t", profile: null, demand: { phone: "+250720000012", optInAt: null } }).profile.waPhone).toBeNull();
    expect(reachedAt({ id: "t", profile: null, demand: null })).toEqual({ id: "t", profile: { waPhone: null } });
  });
});

const tests = new Set(["249900000001"]);

describe("who the line may ask a broker for", () => {
  it("only a real WhatsApp tenant, only while broker sends are on", () => {
    expect(tenantGate({ mode: "gated", waPhone: "+250700000001", testPhones: tests })).toEqual({ ok: true });
    // A browser on /find (the test searches of 10-22..11-01) never reaches a broker.
    expect(tenantGate({ mode: "gated", waPhone: null, testPhones: tests })).toEqual({ ok: false, why: "not-whatsapp" });
    expect(tenantGate({ mode: "off", waPhone: "+250700000001", testPhones: tests })).toEqual({ ok: false, why: "sends-off" });
    expect(tenantGate({ mode: "gated", waPhone: "+249 900 000 001", testPhones: tests })).toEqual({ ok: false, why: "test-phone" });
  });

  it("knows whether the tenant is still in the search", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const msgs = [
      { role: "user", text: "2 bedroom", at: "2026-10-30T10:00:00Z" },
      { role: "agent", kind: "shortlist", at: "2026-10-30T10:00:02Z" },
    ];
    expect(lastTenantAt(msgs)?.toISOString()).toBe("2026-10-30T10:00:00.000Z");
    expect(tenantActive(msgs, now)).toBe(true);
    expect(tenantActive(msgs, new Date("2026-11-03T12:00:00Z"))).toBe(false);
    expect(tenantActive([], now)).toBe(false);
    expect(tenantActive(null, now)).toBe(false);
  });

  it("a web tenant's typed number is reachable only once they opted in (2026-11-08)", () => {
    const optInAt = new Date("2026-11-08T10:00:00Z");
    expect(tenantNumber({ profile: { waPhone: "+250700000001" }, demand: { phone: "+250700000009", optInAt } })).toBe("+250700000001");
    expect(tenantNumber({ profile: { waPhone: null }, demand: { phone: "+250700000009", optInAt } })).toBe("+250700000009");
    // A number with no opt-in time was never consented to.
    expect(tenantNumber({ profile: null, demand: { phone: "+250700000009", optInAt: null } })).toBeNull();
    expect(tenantNumber({ profile: null, demand: null })).toBeNull();
    expect(tenantNumber(null)).toBeNull();
    // ...and a number left on the card passes the gate, a team number still does not.
    expect(tenantGate({ mode: "gated", waPhone: tenantNumber({ demand: { phone: "+250700000009", optInAt } }), testPhones: tests })).toEqual({ ok: true });
    expect(tenantGate({ mode: "gated", waPhone: tenantNumber({ demand: { phone: "+249900000001", optInAt } }), testPhones: tests })).toEqual({ ok: false, why: "test-phone" });
  });
});
