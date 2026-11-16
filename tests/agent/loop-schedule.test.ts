/**
 * The schedule to Mkan's person (2026-11-15): twice a day, with everything he needs for each viewing.
 */
import { describe, expect, it } from "vitest";
import { calendarLink, inboundCardKey, isMondayMorning, dayLine, repAfterMessage, repReminderMessage, scheduleLabel, scheduleMessage, scheduleSlot, viewingBlock, type ScheduleViewing } from "@/components/agent/loop-schedule-pure";

const kigali = (s: string) => new Date(`${s}:00+02:00`);
const viewing: ScheduleViewing = {
  at: kigali("2026-11-17T10:00"),
  listingId: 5811,
  title: "3-bedroom apartment",
  area: "Rebero",
  rent: 350_000,
  meetingPoint: "Rebero Heights gate",
  tenantName: "Aline",
  tenantPhone: "+250788123456",
  tenantLang: "en",
  brokerName: "Eric",
  brokerPhone: "+250722000111",
  terms: ["months up front (we said 3, the usual)", "water in the rent?"],
  commission: 350_000,
};

describe("the slot", () => {
  it("is today's at 07:00 and tomorrow's at 20:00 Kigali", () => {
    const am = scheduleSlot(kigali("2026-11-16T07:00"));
    expect(am).toMatchObject({ part: "am", sentDay: "2026-11-16", forDay: "2026-11-16", weekly: false });
    const pm = scheduleSlot(kigali("2026-11-16T20:00"));
    expect(pm).toMatchObject({ part: "pm", sentDay: "2026-11-16", forDay: "2026-11-17", weekly: false });
    expect(pm.to.getTime() - pm.from.getTime()).toBe(86_400_000);
  });
  it("adds the week's numbers on Sunday evening only", () => {
    // 22 Nov 2026 is a Sunday.
    expect(scheduleSlot(kigali("2026-11-22T20:00")).weekly).toBe(true);
    expect(scheduleSlot(kigali("2026-11-22T07:00")).weekly).toBe(false);
    expect(scheduleSlot(kigali("2026-11-21T20:00")).weekly).toBe(false);
  });
  it("labels each slot once", () => {
    expect(scheduleLabel(scheduleSlot(kigali("2026-11-16T20:00")))).toBe("loop:schedule:2026-11-16:pm");
    expect(scheduleLabel(scheduleSlot(kigali("2026-11-16T07:00")))).toBe("loop:schedule:2026-11-16:am");
  });
});

describe("one viewing", () => {
  const block = viewingBlock(viewing);
  it("carries when, where, who, what to confirm and the share", () => {
    expect(block).toContain("Tue 17 Nov, 10:00");
    expect(block).toContain("K5811 · 3-bedroom apartment · Rebero · 350k a month");
    expect(block).toContain("Meet: Rebero Heights gate");
    expect(block).toContain("Tenant: Aline · +250788123456 · EN");
    expect(block).toContain("Broker: Eric · +250722000111");
    expect(block).toContain("Confirm: months up front (we said 3, the usual) · water in the rent?");
    expect(block).toContain("Agree Mkan's share: 10% of the broker's commission — about 35k on a commission of 350k");
  });
  it("carries the three questions and the closing words", () => {
    expect(block).toContain("1) How did you find your last home?");
    expect(block).toContain("2) What did a broker charge you?");
    expect(block).toContain("3) What almost stopped you");
    expect(block).toContain("write: note K5811 <what they said>");
    expect(block).toContain("viewed K5811 · signed K5811 share <RWF> · lost K5811 <why>");
  });
  it("says so when the meeting point or the commission is not known", () => {
    const b = viewingBlock({ ...viewing, meetingPoint: null, commission: null, brokerPhone: null, brokerName: null });
    expect(b).toContain("Meet: meeting point not set yet");
    expect(b).toContain("Agree Mkan's share: 10% of the broker's commission\n");
    expect(b).toContain("Broker: no broker number on file");
  });
});

describe("the calendar link", () => {
  it("is a one-hour Google Calendar event in UTC", () => {
    const url = new URL(calendarLink(viewing));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("dates")).toBe("20261117T080000Z/20261117T090000Z");
    expect(url.searchParams.get("text")).toContain("K5811");
    expect(url.searchParams.get("location")).toBe("Rebero Heights gate");
    expect(url.searchParams.get("details")).toContain("Aline");
  });
});

describe("the message", () => {
  it("lists the day's viewings in order", () => {
    const later = { ...viewing, listingId: 6000, at: kigali("2026-11-17T14:00") };
    const text = scheduleMessage({ part: "pm", forDay: "2026-11-17" }, [later, viewing]);
    expect(text.startsWith("2 viewings tomorrow — Tuesday 17/11")).toBe(true);
    expect(text.indexOf("K5811")).toBeLessThan(text.indexOf("K6000"));
  });
  it("still writes on an empty day", () => {
    const text = scheduleMessage({ part: "pm", forDay: "2026-11-17" }, [], "Today: no deal moved");
    expect(text).toBe("No viewings tomorrow (Tuesday 17/11).\n\nToday: no deal moved");
    expect(scheduleMessage({ part: "am", forDay: "2026-11-17" }, [])).toContain("No viewings today");
  });
  it("sums the day in one line", () => {
    expect(dayLine({ picked: 3, yes: 1, booked: 0, viewed: 0, signed: 1, paid: 0, lost: 0 })).toBe("Today: 3 picked · 1 broker yes · 1 signed");
    expect(dayLine({ picked: 0, yes: 0, booked: 0, viewed: 0, signed: 0, paid: 0, lost: 0 })).toBe("Today: no deal moved");
  });
});

describe("the rep's own reminders", () => {
  it("says what is in 2 h, and asks how it went", () => {
    expect(repReminderMessage({ listingId: 5811, title: "3-bedroom", at: viewing.at, meetingPoint: null, tenantPhone: "+250788123456" })).toBe(
      "In 2 h: K5811 · 3-bedroom · Tue 17 Nov, 10:00\nMeet: meeting point not set yet\nTenant: +250788123456",
    );
    expect(repAfterMessage("K5811")).toBe("How did K5811 go? reply: viewed K5811 · signed K5811 share 9000 · lost K5811 <why>");
  });
});

describe("the Monday inbound card", () => {
  const kigali = (iso: string) => new Date(`${iso}:00+02:00`);
  it("goes on Monday 07:00 only, keyed by the Monday", () => {
    const mon = scheduleSlot(kigali("2026-11-16T07:00"));
    expect(isMondayMorning(mon)).toBe(true);
    expect(inboundCardKey(mon)).toBe("inbound-card:2026-11-16");
    expect(isMondayMorning(scheduleSlot(kigali("2026-11-16T20:00")))).toBe(false);
    expect(isMondayMorning(scheduleSlot(kigali("2026-11-17T07:00")))).toBe(false);
    expect(isMondayMorning(scheduleSlot(kigali("2026-11-22T20:00")))).toBe(false);
  });
});
