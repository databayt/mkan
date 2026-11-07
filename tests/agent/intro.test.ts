/**
 * Direct intros until 10 deals are paid (Abdout, 2026-11-07): the switch, the words that go out,
 * and how the answers are read. Numbers are made up (+250 700 000 0xx) — the repo is public.
 */
import { describe, expect, it } from "vitest";

import { dealSheetMessage } from "@/components/agent/deal-pure";
import {
  connectionMode,
  dueFollowUps,
  followUpBrokerMessage,
  followUpTenantMessage,
  INTRO_CAP,
  introBrokerMessage,
  introPendingMessage,
  introTenantMessage,
  MKAN_TERMS,
  readBrokerFollowUp,
  readRating,
  readTenantFollowUp,
  readTermsReply,
  termsAskMessage,
} from "@/components/agent/intro-pure";

const PHONE = /\+?250\s?7\d{2}\s?\d{3}\s?\d{3}|\+\d{9,}/;
const HOUR = 3_600_000;

describe("direct intros", () => {
  it("introduce until 10 deals are paid, then Mkan stays in the middle", () => {
    expect(INTRO_CAP).toBe(10);
    expect(connectionMode(0)).toBe("intro");
    expect(connectionMode(9)).toBe("intro");
    expect(connectionMode(10)).toBe("relay");
    expect(connectionMode(42)).toBe("relay");
  });

  it("ask the broker for 10% of the commission and a free viewing before any number goes", () => {
    expect(MKAN_TERMS).toEqual({ pct: 0.1, freeViewing: true });
    const ask = termsAskMessage({ ref: "K6041", title: "2-bed in Kimihurura", tenants: 1 });
    expect(ask).toMatch(/10% of your commission/);
    expect(ask).toMatch(/viewing is free/);
    expect(ask).toMatch(/Reply YES/);
    expect(ask).not.toMatch(PHONE);
    for (const lang of ["en", "ar", "rw"] as const) expect(introPendingMessage(lang, "K6041")).not.toMatch(PHONE);
  });

  it("give each side the other's number only in the intro itself", () => {
    for (const lang of ["en", "ar", "rw"] as const) {
      const t = introTenantMessage(lang, { title: "2-bed", ref: "K6041", broker: "Jean", phone: "+250700000011" });
      expect(t).toContain("+250700000011");
      expect(t).toContain("K6041");
    }
    expect(introBrokerMessage({ ref: "K6041", title: "2-bed", tenants: ["+250700000012"] })).toContain("+250700000012");
    // After the 10th paid deal the tenant gets the deal sheet: never a number.
    const sheet = dealSheetMessage({ title: "2-bed", ref: "K6041", cost: null, rep: "Abdout", link: "https://mkan.sd/c/x" }, "en");
    expect(sheet).not.toMatch(PHONE);
  });

  it("follow up at 24 h and 7 days, each once", () => {
    const at = new Date("2026-11-07T10:00:00Z");
    const later = (h: number) => new Date(at.getTime() + h * HOUR);
    expect(dueFollowUps(at, [], later(2))).toEqual([]);
    expect(dueFollowUps(at, [], later(25))).toEqual(["tenant-24h"]);
    expect(dueFollowUps(at, ["tenant-24h"], later(30))).toEqual([]);
    expect(dueFollowUps(at, ["tenant-24h", "tenant-24h:answered"], later(24 * 7 + 1))).toEqual(["tenant-7d", "broker-7d"]);
    expect(dueFollowUps(at, ["tenant-24h", "tenant-7d", "broker-7d"], later(24 * 8))).toEqual([]);
    // Three weeks on, nobody is asked any more.
    expect(dueFollowUps(at, [], later(24 * 22))).toEqual([]);
  });

  it("read the broker's answer to the terms", () => {
    expect(readTermsReply("Yes")).toBe("yes");
    expect(readTermsReply("ok agreed")).toBe("yes");
    expect(readTermsReply("Yego")).toBe("yes");
    expect(readTermsReply("👍")).toBe("yes");
    expect(readTermsReply("No, 10% is too much")).toBe("no");
    expect(readTermsReply("Oya")).toBe("no");
    expect(readTermsReply("what is Mkan?")).toBeNull();
  });

  it("read the tenant's follow-up answers and the 1–5 rating", () => {
    expect(readTenantFollowUp("1", "tenant-24h")).toBe("viewed");
    expect(readTenantFollowUp("2", "tenant-24h")).toBe("wait");
    expect(readTenantFollowUp("3", "tenant-24h")).toBe("lost");
    expect(readTenantFollowUp("not yet, tomorrow", "tenant-24h")).toBe("wait");
    expect(readTenantFollowUp("Yes I took it! 5", "tenant-7d")).toBe("signed");
    expect(readTenantFollowUp("no", "tenant-7d")).toBe("lost");
    expect(readRating("Yes I took it! 5")).toBe(5);
    expect(readRating("4/5")).toBe(4);
    expect(readRating("⭐⭐⭐")).toBe(3);
    expect(readRating("yes")).toBeNull();
    expect(readRating("it was 250000")).toBeNull();
  });

  it("read the broker's 'did they sign?'", () => {
    expect(readBrokerFollowUp("SIGNED")).toBe("signed");
    expect(readBrokerFollowUp("Yes they signed yesterday, 5")).toBe("signed");
    expect(readBrokerFollowUp("not yet")).toBe("wait");
    expect(readBrokerFollowUp("No, they cancelled")).toBe("lost");
    expect(followUpBrokerMessage({ ref: "K6041", title: "2-bed", tenant: "+250700000012" })).toMatch(/SIGNED, NOT YET or NO/);
    for (const lang of ["en", "ar", "rw"] as const) expect(followUpTenantMessage(lang, "tenant-7d", "2-bed")).toMatch(/5/);
  });
});
