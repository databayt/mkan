/**
 * Direct intros until 10 deals are paid (Abdout, 2026-11-07): the switch, the words that go out,
 * and how the answers are read. Numbers are made up (+250 700 000 0xx) — the repo is public.
 */
import { describe, expect, it } from "vitest";

import { brokerAnswerMessage } from "@/components/agent/broker-message";
import { askedOnLabel, dealSheetMessage } from "@/components/agent/deal-pure";
import {
  connectionMode,
  dueFollowUps,
  decideSend,
  followUpBrokerMessage,
  heldIntroCard,
  lastDigits,
  nextSweepTick,
  termsReplyApplies,
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
  TERMS_WAIT_AWAKE_HOURS,
  termsHandOffDue,
} from "@/components/agent/intro-pure";

const PHONE = /\+?250\s?7\d{2}\s?\d{3}\s?\d{3}|\+\d{9,}/;
const HOUR = 3_600_000;

describe("the terms wait: 2 daytime hours (Abdout, 2026-11-08)", () => {
  // Kigali is UTC+2; the daytime window is 08:00–20:00 Kigali (broker-rank.ts awakeMs).
  const kigali = (iso: string) => new Date(`${iso}+02:00`);

  it("hands off after 2 hours of Kigali daytime, not 24", () => {
    expect(TERMS_WAIT_AWAKE_HOURS).toBe(2);
    const yes = kigali("2026-11-09T10:00:00");
    expect(termsHandOffDue(yes, kigali("2026-11-09T11:59:00"))).toBe(false);
    expect(termsHandOffDue(yes, kigali("2026-11-09T12:00:00"))).toBe(true);
  });

  it("counts no night: a yes at 19:30 hands off at 09:30 the next morning", () => {
    const yes = kigali("2026-11-09T19:30:00");
    expect(termsHandOffDue(yes, kigali("2026-11-10T07:00:00"))).toBe(false);
    expect(termsHandOffDue(yes, kigali("2026-11-10T09:29:00"))).toBe(false);
    expect(termsHandOffDue(yes, kigali("2026-11-10T09:30:00"))).toBe(true);
  });
});

describe("a late yes names the day the tenant asked (2026-11-08)", () => {
  const now = new Date("2026-11-06T14:38:00Z");

  it("labels the Kigali day only when the tenant last wrote more than a day ago", () => {
    expect(askedOnLabel(new Date("2026-10-27T14:30:00Z"), now, "en")).toBe("27 Oct");
    expect(askedOnLabel(new Date("2026-10-27T14:30:00Z"), now, "rw")).toBe("27 Ukwakira");
    expect(askedOnLabel(new Date("2026-10-27T14:30:00Z"), now, "ar")).toBe("27 أكتوبر");
    // 23:30 UTC is already the next day in Kigali.
    expect(askedOnLabel(new Date("2026-10-31T23:30:00Z"), now, "en")).toBe("1 Nov");
    expect(askedOnLabel(new Date("2026-11-06T08:00:00Z"), now, "en")).toBeNull();
    expect(askedOnLabel(null, now, "en")).toBeNull();
  });

  it("says it in every message a yes sends: the intro's pending line, the deal sheet, the broker's answer", () => {
    expect(introPendingMessage("en", "2-bedroom in Kimironko", "27 Oct")).toMatch(/^You asked about 2-bedroom in Kimironko on 27 Oct: good news.*If you're still looking/);
    expect(introPendingMessage("en", "2-bedroom in Kimironko")).toMatch(/^Good news: 2-bedroom in Kimironko is still free!/);
    expect(introPendingMessage("rw", "Inzu", "27 Ukwakira")).toMatch(/^Wabajije ibya Inzu ku itariki ya 27 Ukwakira/);
    expect(introPendingMessage("ar", "شقة", "27 أكتوبر")).toMatch(/^سألت عن شقة يوم 27 أكتوبر/);

    const facts = { title: "2-bedroom in Kimironko", ref: "K6041", cost: null, rep: "Osman", link: "https://mkan.sd/en/find?c=t1" };
    const late = dealSheetMessage({ ...facts, askedOn: "27 Oct" }, "en");
    expect(late.split("\n")[0]).toBe(`You asked about "2-bedroom in Kimironko" (K6041) on 27 Oct. Good news: the broker says it's still available.`);
    expect(late).toMatch(/If you're still looking: when can you come to see it\?/);
    expect(dealSheetMessage(facts, "en").split("\n")[0]).toBe(`Good news: the broker says "2-bedroom in Kimironko" (K6041) is still available.`);
    expect(dealSheetMessage({ ...facts, askedOn: "27 Ukwakira" }, "rw")).toMatch(/Niba ugishaka inzu: ni ryari wayisura\?/);

    expect(brokerAnswerMessage("en", "2-bedroom in Kimironko", true, "L", false, "Osman", "27 Oct")).toMatch(/^Mkan: you asked about "2-bedroom in Kimironko" on 27 Oct\. Good news.*\nIf you're still looking, Osman from Mkan/);
    expect(brokerAnswerMessage("en", "2-bedroom in Kimironko", false, "L", false, "Osman", "27 Oct")).toBe(`Mkan: you asked about "2-bedroom in Kimironko" on 27 Oct. It's taken, sorry. Your other homes are here:\nL`);
    expect(brokerAnswerMessage("en", "2-bedroom in Kimironko", true, "L", false, "Osman")).toMatch(/^Mkan: good news, the broker says "2-bedroom in Kimironko" is still available\.\nOsman from Mkan/);
  });
});

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

describe("the terms reader leaves no honest yes null", () => {
  it("reads yes in English, Kinyarwanda, French, Arabic and Swahili", () => {
    for (const t of ["Yes", "yes please!", "Ndabyemera", "ndabyemera cyane", "Yego rwose", "nibyo", "Turabyemera", "ni byiza", "Oui d'accord", "ndiyo", "نعم", "موافق", "ok 👍", "No problem", "no worries", "Nta kibazo", "not a problem", "Sawa 10% ni byiza"])
      expect(readTermsReply(t), t).toBe("yes");
  });
  it("reads no, and leaves a counter-offer or a question to a person", () => {
    for (const t of ["No", "oya", "No, 10% is too much", "I refuse"]) expect(readTermsReply(t), t).toBe("no");
    for (const t of ["yes but 5%", "ok 7 percent", "yes, can you reduce it?", "what is the commission?", "who are you?"]) expect(readTermsReply(t), t).toBeNull();
  });
});

describe("a held intro", () => {
  const rows = (...status: Array<"QUEUED" | "SENT" | "FAILED" | "SKIPPED">) => status.map((s) => ({ status: s }));
  const base = { ageMs: 30 * 60_000, rows: rows(), sendsOn: true, inWindow: true, ride: true };

  it("is sent when nothing went out, and is never sent twice", () => {
    expect(decideSend(base)).toEqual({ do: "queue", retry: false });
    expect(decideSend({ ...base, rows: rows("SENT") })).toEqual({ do: "wait", why: "delivered" });
    expect(decideSend({ ...base, rows: rows("QUEUED") })).toEqual({ do: "wait", why: "in-flight" });
  });
  it("lets a reply ride on the broker's yes for ten minutes, but not a form answer", () => {
    expect(decideSend({ ...base, ageMs: 4 * 60_000 })).toEqual({ do: "wait", why: "grace" });
    expect(decideSend({ ...base, ageMs: 4 * 60_000, ride: false })).toEqual({ do: "queue", retry: false });
  });
  it("is held with a card while sends are off, and retried after a SKIPPED or FAILED row", () => {
    expect(decideSend({ ...base, sendsOn: false })).toEqual({ do: "hold", why: "sends-off" });
    expect(decideSend({ ...base, rows: rows("SKIPPED") })).toEqual({ do: "queue", retry: true });
    expect(decideSend({ ...base, rows: rows("SKIPPED", "FAILED", "SKIPPED") })).toEqual({ do: "hold", why: "tries-used" });
    expect(decideSend({ ...base, inWindow: false })).toEqual({ do: "wait", why: "window" });
  });
  it("names the tenants by their last three digits and says how to release it", () => {
    const card = heldIntroCard({ ref: "K6041", title: "2-bed", broker: "Test Homes", tenants: ["+250700000155"], why: "sends-off", text: "Thank you!" });
    expect(card).toContain("K6041");
    expect(card).toContain(lastDigits("+250700000155"));
    expect(card).not.toContain("250700000155");
    expect(card).toMatch(/Tap Yes on \/monetize/);
  });
  it("is not answered by a yes to a newer 'is this available?'", () => {
    const askAt = new Date("2026-11-07T08:00:00Z");
    const newer = new Date("2026-11-07T09:00:00Z");
    expect(termsReplyApplies({ askAt, newestAvailabilityAskAt: null, quotedTerms: false })).toBe(true);
    expect(termsReplyApplies({ askAt, newestAvailabilityAskAt: newer, quotedTerms: false })).toBe(false);
    expect(termsReplyApplies({ askAt, newestAvailabilityAskAt: newer, quotedTerms: true })).toBe(true);
  });
  it("runs on the cron ticks: :00 all night, :15 :30 :45 from 07:00 to 21:59 Kigali", () => {
    expect(nextSweepTick(new Date("2026-11-07T08:01:00Z")).toISOString()).toBe("2026-11-07T08:15:00.000Z");
    expect(nextSweepTick(new Date("2026-11-07T08:50:00Z")).toISOString()).toBe("2026-11-07T09:00:00.000Z");
    // 20:50 UTC (22:50 Kigali): only the hourly tick is left.
    expect(nextSweepTick(new Date("2026-11-07T20:20:00Z")).toISOString()).toBe("2026-11-07T21:00:00.000Z");
  });
  it("a yes at any minute is a terms ask within 15 minutes by day and the tenant's number within the hour", () => {
    for (let m = 0; m < 60; m++) {
      const yes = new Date(Date.UTC(2026, 10, 7, 9, m));
      // Ten-minute ride, then the next tick; the broker's YES is read by the outbox pass, which sends both numbers in that pass.
      const queued = nextSweepTick(new Date(yes.getTime() + 10 * 60_000));
      expect(queued.getTime() - yes.getTime(), `yes at :${m}`).toBeLessThanOrEqual(25 * 60_000);
    }
  });
});
