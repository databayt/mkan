/**
 * The viewing, agreed by the line (2026-11-14). A tenant's "tomorrow 10am" used to become a #mkan card for a
 * person to phone the broker and type `pnpm deal:book`; not one viewing was ever booked. These are the rules
 * the line now follows by itself: when Mkan's person can be there, and what a broker's answer means.
 */
import { describe, expect, it } from "vitest";
import { viewingProposedMessage, dealNudgeMessage, afterViewingUnsureText } from "@/components/agent/deal-pure";
import {
  bookingNowMessage,
  brokerCannotMessage,
  CHASE_AWAKE_HOURS,
  counterOfferMessage,
  MIN_LEAD_MS,
  nextSlot,
  noSlotMessage,
  readBrokerViewingReply,
  repBusyMessage,
  repHours,
  slotVerdict,
  sweepPlan,
  TELL_TENANT_AWAKE_HOURS,
  VIEWING_ASK_TTL_MS,
  viewingBookedBrokerMessage,
  viewingChaseMessage,
  viewingRepMessage,
  viewingTimeAskMessage,
  viewingTimeKey,
  viewingWaitMessage,
} from "@/components/agent/viewing-loop-pure";

/** Kigali is UTC+2: "2026-11-17T10:00" Kigali is 08:00Z. */
const kigali = (s: string) => new Date(`${s}:00+02:00`);
// Monday 16 Nov 2026, 10:00 in Kigali.
const now = kigali("2026-11-16T10:00");
const hours = repHours(undefined, undefined);

describe("when Mkan's person can be there", () => {
  it("defaults to Monday–Saturday, 09:00–18:00, and reads other hours from the env", () => {
    expect(hours).toEqual({ start: 9, end: 18, days: [1, 2, 3, 4, 5, 6] });
    expect(repHours("8-17", "0-6")).toEqual({ start: 8, end: 17, days: [0, 1, 2, 3, 4, 5, 6] });
    expect(repHours("6-6", "x")).toEqual(hours);
    // A week that wraps: Saturday to Thursday.
    expect(repHours("9-18", "6-4").days).toEqual([6, 0, 1, 2, 3, 4]);
  });

  it("takes a weekday time in hours with enough notice", () => {
    expect(slotVerdict(kigali("2026-11-17T10:00"), now, [], hours)).toBe("ok");
    // The last start is an hour before the day ends.
    expect(slotVerdict(kigali("2026-11-17T17:00"), now, [], hours)).toBe("ok");
    expect(slotVerdict(kigali("2026-11-17T17:30"), now, [], hours)).toBe("hours");
  });

  it("refuses the past, too little notice, Sunday, early mornings and a clash with another viewing", () => {
    expect(slotVerdict(kigali("2026-11-16T09:00"), now, [], hours)).toBe("past");
    expect(slotVerdict(new Date(now.getTime() + MIN_LEAD_MS - 60_000), now, [], hours)).toBe("soon");
    expect(slotVerdict(kigali("2026-11-22T10:00"), now, [], hours)).toBe("hours");
    expect(slotVerdict(kigali("2026-11-17T08:00"), now, [], hours)).toBe("hours");
    expect(slotVerdict(kigali("2026-11-17T10:00"), now, [kigali("2026-11-17T11:00")], hours)).toBe("busy");
    expect(slotVerdict(kigali("2026-11-17T10:00"), now, [kigali("2026-11-17T11:30")], hours)).toBe("ok");
  });

  it("counts notice from when the broker can first be asked, not from the clock", () => {
    // 22:00 on Monday: the ask goes out at 08:00 on Tuesday, so 09:00 is too soon and 10:00 works.
    const askable = kigali("2026-11-17T08:00");
    expect(slotVerdict(kigali("2026-11-17T09:00"), askable, [], hours)).toBe("soon");
    expect(slotVerdict(kigali("2026-11-17T10:00"), askable, [], hours)).toBe("ok");
  });

  it("offers the nearest time that works", () => {
    // Sunday → Monday 09:00.
    expect(nextSlot(kigali("2026-11-22T10:00"), now, [], hours)).toEqual(kigali("2026-11-23T09:00"));
    // In ten minutes → once the notice is up.
    expect(nextSlot(kigali("2026-11-16T10:10"), now, [], hours)).toEqual(kigali("2026-11-16T12:00"));
    // A clash → after the gap.
    expect(nextSlot(kigali("2026-11-17T10:00"), now, [kigali("2026-11-17T10:00")], hours)).toEqual(kigali("2026-11-17T11:30"));
  });
});

describe("what a broker's answer to a time means", () => {
  const read = (t: string) => readBrokerViewingReply(t, now);

  it("a yes, in the languages Kigali brokers write", () => {
    for (const t of ["1", "Yego", "yes", "Ok", "Sawa", "oui", "👍", "no problem"]) expect(read(t), t).toEqual({ kind: "yes", place: null });
  });

  it("keeps where to meet when it comes with the yes", () => {
    expect(read("ok at Simba Kimironko, near the gate")).toEqual({ kind: "yes", place: "at Simba Kimironko, near the gate" });
    expect(read("Yego murakoze")).toEqual({ kind: "yes", place: null });
  });

  it("another day and time is a new time, even after a yes", () => {
    expect(read("tomorrow 3pm")).toEqual({ kind: "time", at: kigali("2026-11-17T15:00") });
    expect(read("yes but tomorrow 3pm is better")).toEqual({ kind: "time", at: kigali("2026-11-17T15:00") });
    expect(read("Ejo saa yine")).toEqual({ kind: "time", at: kigali("2026-11-17T10:00") });
    expect(read("Wednesday 14:00")).toEqual({ kind: "time", at: kigali("2026-11-18T14:00") });
    // The day they rule out is not the day they offer.
    expect(read("not today, maybe friday at 4")).toEqual({ kind: "time", at: kigali("2026-11-20T16:00") });
  });

  it("a day with no hour asks the hour", () => {
    expect(read("tomorrow is fine")).toEqual({ kind: "day" });
  });

  it("a no is about the time; taken is about the home", () => {
    for (const t of ["2", "no", "Oya", "not possible", "non"]) expect(read(t), t).toEqual({ kind: "no" });
    for (const t of ["taken", "yafashwe", "Yarafashwe", "it is already rented", "not available anymore"]) expect(read(t), t).toEqual({ kind: "taken" });
  });

  it("leaves what it cannot place to a person: a question, a hedge, 'are you a bot?', 'it's available'", () => {
    for (const t of ["are you a bot?", "how much is the budget?", "I am busy", "call me", "Iyo irahari", "yes but 5% only", ""]) expect(read(t), t).toBeNull();
  });
});

describe("the words", () => {
  const labels = { en: "Tue 17 Nov, 10:00", rw: "Kabiri 17 Nov, 10:00" };

  it("ask the broker in Kinyarwanda first with English under it, by their own ad, with one digit to answer", () => {
    const t = viewingTimeAskMessage({ name: "Eric", lang: "EN", title: "3-bedroom apartment in Rebero", link: "https://www.tiktok.com/@kigali.homes/video/7693392839253806344", ...labels, rep: "Osman" });
    expect(t).toMatch(/^Muraho Eric, ni Mkan\./);
    expect(t).toContain("\n\nHi Eric, Mkan here.");
    expect(t).toContain("https://www.tiktok.com/@kigali.homes/video/7693392839253806344");
    expect(t).toContain("Tue 17 Nov, 10:00");
    expect(t).toContain("Reply 1 = yes, or send another day and time");
    expect(t).toContain("Osman from Mkan will come with them");
    // Never the tenant's number, and no agency name used as a first name.
    expect(t.replace(/https?:\/\/\S+/g, "")).not.toMatch(/\+?\d{9,}/);
    expect(viewingTimeAskMessage({ name: "Kigali Real Estate Ltd", title: "Flat", ...labels, rep: "Osman" })).toMatch(/^Muraho, ni Mkan\./);
  });

  it("write to a French-speaking broker in French only", () => {
    const t = viewingTimeAskMessage({ name: "Aline", lang: "FR", title: "Flat", ...labels, rep: "Osman" });
    expect(t).toMatch(/^Bonjour Aline, ici Mkan\./);
    expect(t).not.toContain("Muraho");
    expect(viewingChaseMessage({ lang: "FR", ...labels })).toMatch(/^Bonjour, petit rappel de Mkan/);
  });

  it("tell the broker it is booked, and ask where to meet only when they did not say", () => {
    expect(viewingBookedBrokerMessage({ en: labels.en, rep: "Osman", askPlace: true })).toMatch(/Confirmed, thank you: Tue 17 Nov, 10:00\. Osman from Mkan will be there with the tenant\. Where should they meet you\?/);
    expect(viewingBookedBrokerMessage({ en: labels.en, rep: "Osman", askPlace: false })).not.toMatch(/Where should/);
  });

  it("tell Mkan's person everything they need, and say so when no share is agreed", () => {
    const t = viewingRepMessage({ rep: "Osman", title: "Flat in Rebero", ref: "K5811", en: labels.en, place: null, tenant: "+250720000019", broker: "+250720000011", share: null });
    expect(t).toMatch(/Osman, a viewing is booked: Flat in Rebero \(K5811\), Tue 17 Nov, 10:00\./);
    expect(t).toMatch(/No share agreed with this broker yet/);
    expect(viewingRepMessage({ rep: "Osman", title: "Flat", ref: "K1", en: labels.en, place: "Simba Kimironko", tenant: "+250720000019", broker: null, share: "10% of the commission" })).toMatch(/Simba Kimironko\.\n.*\nMkan's share: 10% of the commission \(agreed\)\./s);
  });

  it("never promise the tenant a person who will write to them", () => {
    const PROMISE = /will message you here, and|\b(?:Osman|someone|a person)\b[^.]{0,40}\bwill (?:message|reply|call|write|confirm)\b|سيراسلك|سيؤكد .{1,12} من مكان|arakwandikira|abyemeze na komisiyoneri/i;
    for (const lang of ["en", "ar", "rw"] as const) {
      const lines = [
        viewingProposedMessage(lang, "Tue 17 Nov, 10:00"),
        dealNudgeMessage(lang, "Flat", "Osman"),
        afterViewingUnsureText(lang, "Flat"),
        repBusyMessage(lang, { label: "Sun 22 Nov, 10:00", alt: "Mon 23 Nov, 09:00", rep: "Osman" }),
        noSlotMessage(lang),
        counterOfferMessage(lang, { title: "Flat", label: "Tue 17 Nov, 15:00" }),
        brokerCannotMessage(lang, { title: "Flat", label: "Tue 17 Nov, 10:00" }),
        viewingWaitMessage(lang, "Flat"),
        bookingNowMessage(lang, "Tue 17 Nov, 15:00"),
      ];
      for (const t of lines) expect(t, t).not.toMatch(PROMISE);
    }
    expect(viewingProposedMessage("en", "Tue 17 Nov, 10:00")).toBe("Got it: Tue 17 Nov, 10:00. I'm confirming it with the broker now, and I'll message you here as soon as they answer.");
    expect(afterViewingUnsureText("en", "Flat")).toMatch(/reply 1 if you want to take "Flat", or 2/);
  });

  it("key a broker's open time asks by their number", () => {
    expect(viewingTimeKey("+250 720 000 011")).toBe("viewing-time:250720000011");
  });
});

describe("a silent broker", () => {
  const h = 3_600_000;
  const base = { askedAt: now, chased: false, tenantTold: false, awakeMs: 0, ageMs: 0, inWindow: true, stage: "time" as const };

  it("gets one chase after three daytime hours, then the tenant is told, then the ask is dropped", () => {
    expect(sweepPlan({ ...base, awakeMs: (CHASE_AWAKE_HOURS - 1) * h, ageMs: 2 * h })).toBe("wait");
    expect(sweepPlan({ ...base, awakeMs: CHASE_AWAKE_HOURS * h, ageMs: 3 * h })).toBe("chase");
    expect(sweepPlan({ ...base, chased: true, awakeMs: (CHASE_AWAKE_HOURS + 1) * h, ageMs: 4 * h })).toBe("wait");
    expect(sweepPlan({ ...base, chased: true, awakeMs: TELL_TENANT_AWAKE_HOURS * h, ageMs: 22 * h })).toBe("tell-tenant");
    expect(sweepPlan({ ...base, chased: true, tenantTold: true, awakeMs: 20 * h, ageMs: 30 * h })).toBe("wait");
    expect(sweepPlan({ ...base, chased: true, tenantTold: true, awakeMs: 30 * h, ageMs: VIEWING_ASK_TTL_MS })).toBe("drop");
  });

  it("is never chased at night, nor for a time that is with the tenant", () => {
    expect(sweepPlan({ ...base, awakeMs: 5 * h, ageMs: 14 * h, inWindow: false })).toBe("wait");
    expect(sweepPlan({ ...base, awakeMs: 5 * h, ageMs: 5 * h, stage: "tenant" })).toBe("wait");
  });
});
