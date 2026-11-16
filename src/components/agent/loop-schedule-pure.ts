/**
 * Abdout's viewing schedule, in words (2026-11-15). He goes to EVERY viewing with the tenant, so twice a day
 * the line writes him what is coming: at 07:00 Kigali today's viewings, at 20:00 tomorrow's — each with
 * everything he needs in his pocket: where, who, what to confirm, Mkan's share, a calendar tap, the three
 * questions to ask the tenant, and the words that close the deal. An empty day still gets a line: he wants
 * to know it is empty. Pure: the reading and the sending are loop-schedule.ts.
 */
import { kigaliDay, kigaliHour, startOfKigaliDay } from "../../../scripts/wa/outbox-pure";
import { MKAN_TERMS } from "./intro-pure";
import { kigaliLabel, shortRwf } from "./loop-feed-pure";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

/** `am` (07:00: today) or `pm` (20:00: tomorrow). Any hour before noon is the morning one, so a manual call behaves. */
export type SchedulePart = "am" | "pm";

export interface ScheduleSlot {
  part: SchedulePart;
  /** Kigali YYYY-MM-DD of the day the message is sent. */
  sentDay: string;
  /** Kigali YYYY-MM-DD of the day it lists. */
  forDay: string;
  /** [start, end) of that day. */
  from: Date;
  to: Date;
  /** Sunday evening also carries the week's numbers. */
  weekly: boolean;
}

export function scheduleSlot(now: Date): ScheduleSlot {
  const part: SchedulePart = kigaliHour(now) < 12 ? "am" : "pm";
  const today = startOfKigaliDay(now);
  const from = part === "am" ? today : new Date(today.getTime() + DAY_MS);
  const sunday = new Date(now.getTime() + 2 * HOUR_MS).getUTCDay() === 0;
  return { part, sentDay: kigaliDay(now), forDay: kigaliDay(from), from, to: new Date(from.getTime() + DAY_MS), weekly: part === "pm" && sunday };
}

/** Once per slot: the outbox never sends a label twice. */
export const scheduleLabel = (slot: Pick<ScheduleSlot, "sentDay" | "part">) => `loop:schedule:${slot.sentDay}:${slot.part}`;
export const numbersLabel = (slot: Pick<ScheduleSlot, "sentDay">) => `loop:numbers:${slot.sentDay}`;

/** The Monday #mkan inbound card goes once per Monday: the WaState key that records it (2026-11-16). */
export const inboundCardKey = (slot: Pick<ScheduleSlot, "sentDay">) => `inbound-card:${slot.sentDay}`;
/** Monday's 07:00 slot — the only one that posts the card. */
export const isMondayMorning = (slot: Pick<ScheduleSlot, "part" | "sentDay">) => slot.part === "am" && new Date(`${slot.sentDay}T00:00:00Z`).getUTCDay() === 1;

/** A viewing as the schedule needs it. */
export interface ScheduleViewing {
  at: Date;
  listingId: number;
  title: string;
  area: string | null;
  rent: number | null;
  meetingPoint: string | null;
  tenantName: string | null;
  tenantPhone: string | null;
  tenantLang: string | null;
  brokerName: string | null;
  brokerPhone: string | null;
  /** The terms to confirm with the broker (deal-pure.ts termsToAsk). */
  terms: string[];
  /** The broker's commission in RWF, when it is on record. */
  commission: number | null;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/** A Google Calendar "add event" link: one hour from the viewing's start. */
export function calendarLink(v: Pick<ScheduleViewing, "at" | "listingId" | "title" | "meetingPoint" | "tenantName" | "tenantPhone" | "brokerName" | "brokerPhone">): string {
  const end = new Date(v.at.getTime() + HOUR_MS);
  const details = [`Viewing K${v.listingId}`, v.tenantName || v.tenantPhone ? `Tenant: ${[v.tenantName, v.tenantPhone].filter(Boolean).join(" ")}` : null, v.brokerName || v.brokerPhone ? `Broker: ${[v.brokerName, v.brokerPhone].filter(Boolean).join(" ")}` : null]
    .filter(Boolean)
    .join("\n");
  const q = new URLSearchParams({ action: "TEMPLATE", text: `Viewing K${v.listingId} — ${v.title}`, dates: `${stamp(v.at)}/${stamp(end)}`, details, location: v.meetingPoint ?? "" });
  // URLSearchParams writes spaces as "+", which Calendar reads right; the slash in `dates` is kept as is.
  return `https://calendar.google.com/calendar/render?${q.toString().replace(/%2F/g, "/")}`;
}

/** The three questions to ask the tenant (what Mkan wants to learn from every viewing). */
export const TENANT_QUESTIONS = ["How did you find your last home?", "What did a broker charge you?", "What almost stopped you from taking a home?"] as const;

/** The words that close the deal. */
const closeWords = (ref: string) => `After: viewed ${ref} · signed ${ref} share <RWF> · lost ${ref} <why>`;

export function viewingBlock(v: ScheduleViewing): string {
  const ref = `K${v.listingId}`;
  const share = Math.round(MKAN_TERMS.pct * 100);
  const amount = v.commission && v.commission > 0 ? ` — about ${shortRwf(v.commission * MKAN_TERMS.pct)} on a commission of ${shortRwf(v.commission)}` : "";
  const who = [v.tenantName, v.tenantPhone, v.tenantLang ? v.tenantLang.toUpperCase() : null].filter(Boolean).join(" · ") || "no tenant number on file";
  const broker = [v.brokerName, v.brokerPhone].filter(Boolean).join(" · ") || "no broker number on file";
  return [
    `🕘 ${kigaliLabel(v.at)}`,
    `${ref} · ${[v.title, v.area].filter(Boolean).join(" · ")}${v.rent ? ` · ${shortRwf(v.rent)} a month` : ""}`,
    `Meet: ${v.meetingPoint ?? "meeting point not set yet"}`,
    `Tenant: ${who}`,
    `Broker: ${broker}`,
    `Confirm: ${v.terms.join(" · ") || "nothing left to confirm"}`,
    `Agree Mkan's share: ${share}% of the broker's commission${amount}`,
    `Calendar: ${calendarLink(v)}`,
    `Ask the tenant: 1) ${TENANT_QUESTIONS[0]} 2) ${TENANT_QUESTIONS[1]} 3) ${TENANT_QUESTIONS[2]} — write: note ${ref} <what they said>`,
    closeWords(ref),
  ].join("\n");
}

/** What happened today, in one line — the digest's day summary and the empty day's line. */
export interface DayCounts {
  picked: number;
  yes: number;
  booked: number;
  viewed: number;
  signed: number;
  paid: number;
  lost: number;
}
export function dayLine(c: DayCounts): string {
  const parts: [number, string][] = [[c.picked, "picked"], [c.yes, "broker yes"], [c.booked, "booked"], [c.viewed, "viewed"], [c.signed, "signed"], [c.paid, "paid"], [c.lost, "lost"]];
  const shown = parts.filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`);
  return shown.length ? `Today: ${shown.join(" · ")}` : "Today: no deal moved";
}

const WEEKDAY = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const dayName = (ymd: string) => `${WEEKDAY[new Date(`${ymd}T12:00:00Z`).getUTCDay()]} ${ymd.slice(8)}/${ymd.slice(5, 7)}`;

/** The message: every viewing of the day, or one short line saying there are none, plus the day's line. */
export function scheduleMessage(slot: Pick<ScheduleSlot, "part" | "forDay">, viewings: ScheduleViewing[], extra: string | null = null): string {
  const when = slot.part === "am" ? "today" : "tomorrow";
  const sorted = [...viewings].sort((a, b) => a.at.getTime() - b.at.getTime());
  const head = sorted.length === 0 ? `No viewings ${when} (${dayName(slot.forDay)}).` : `${sorted.length} ${sorted.length === 1 ? "viewing" : "viewings"} ${when} — ${dayName(slot.forDay)}`;
  return [head, ...sorted.map(viewingBlock), extra].filter(Boolean).join("\n\n");
}

/** Two hours before: the rep's own nudge (the tenant has theirs). */
export function repReminderMessage(v: { listingId: number; title: string; at: Date; meetingPoint: string | null; tenantPhone: string | null }): string {
  return `In 2 h: K${v.listingId} · ${v.title} · ${kigaliLabel(v.at)}\nMeet: ${v.meetingPoint ?? "meeting point not set yet"}${v.tenantPhone ? `\nTenant: ${v.tenantPhone}` : ""}`;
}

/** Three hours after: close the deal in his own words. */
export function repAfterMessage(ref: string): string {
  return `How did ${ref} go? reply: viewed ${ref} · signed ${ref} share 9000 · lost ${ref} <why>`;
}
