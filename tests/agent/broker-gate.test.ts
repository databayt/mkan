import { describe, expect, it } from "vitest";
import { lastTenantAt, tenantActive, tenantGate } from "@/components/agent/broker-gate";

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
});
