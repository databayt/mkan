/**
 * The live feed to Mkan's person, in words (2026-11-15). Abdout is the human in the loop for the first 10
 * PAID deals: nothing waits for his yes — the line does every step by itself — but he reads each one as it
 * happens, so that he goes to every viewing knowing the whole story. One short English line per deal step:
 *
 *   K5811 · broker said yes after 6 h · Kimironko 2-bed 350k · tenant +250… · next: the line asks for a time
 *
 * Pure: the sending and the lookups are loop-feed.ts.
 */
import type { DealEventCtx, DealStep } from "./deal-event-pure";

/** `live` one line per step · `digest` nothing per step (the 20:00 schedule carries a day line) · `off` nothing. */
export type FeedMode = "live" | "digest" | "off";

/** Live while fewer than this many deals are PAID (Abdout, 2026-11-15); then the digest. */
export const FEED_LIVE_UNTIL_PAID = 10;

/** MKAN_LOOP_FEED=live|digest|off wins; else live until 10 deals are paid. No number to write to: off. */
export function feedMode(paid: number, env: string | undefined = process.env.MKAN_LOOP_FEED, repSet = true): FeedMode {
  if (!repSet) return "off";
  const e = env?.trim().toLowerCase();
  if (e === "live" || e === "digest" || e === "off") return e;
  return paid < FEED_LIVE_UNTIL_PAID ? "live" : "digest";
}

/** Steps the feed leaves out: the booking already reaches the rep as its own message (viewing-loop.ts, `rep-viewing`). */
export const FEED_SKIPS: readonly DealStep[] = ["VIEWING_BOOKED"];

/** The outbox label of a feed line: one per deal and step (a new proposed time is a new step). Never sent twice. */
export function feedLabel(key: string, step: DealStep, viewingAt?: Date | null, n?: number | null): string {
  return `loop:${key}:${step}${step === "TIME_PROPOSED" && viewingAt ? `:${Math.round(viewingAt.getTime() / 60_000)}` : ""}${step === "STALLED" && n && n > 1 ? `:${n}` : ""}`;
}

/** What the line knows about the home and the tenant, looked up by loop-feed.ts. */
export interface FeedFacts {
  /** The home's title, already scrubbed. */
  title?: string | null;
  area?: string | null;
  rent?: number | null;
  /** A team number: the chat is a rehearsal, not a real person. */
  test?: boolean;
  /** The tenant's number, "+250…" (the ctx's, else the chat's). */
  tenantPhone?: string | null;
}

const KIGALI_MS = 2 * 3_600_000;
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MO = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "Tue 17 Nov, 10:00" in Kigali. */
export function kigaliLabel(at: Date): string {
  const k = new Date(at.getTime() + KIGALI_MS);
  return `${WD[k.getUTCDay()]} ${k.getUTCDate()} ${MO[k.getUTCMonth()]}, ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 350000 → "350k", 1200000 → "1.2M". */
export function shortRwf(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(Math.round(n));
}

const hoursText = (h: number) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 10 ? `${Math.round(h * 10) / 10} h` : `${Math.round(h)} h`);

/** What happened, and what comes next — per step. */
function describe(step: DealStep, ctx: DealEventCtx, ref: string): { what: string; next: string } {
  const note = ctx.note?.trim() ? ` (${ctx.note.trim().slice(0, 120)})` : "";
  switch (step) {
    case "PICKED":
      return { what: "tenant picked it", next: "the line asks the broker if it is free" };
    case "BROKER_ASKED":
      return { what: "the broker was asked if it is free", next: "waiting for their answer" };
    case "BROKER_YES":
      return { what: `broker said yes${ctx.hours != null ? ` after ${hoursText(ctx.hours)}` : ""}`, next: "the line asks the tenant for a time" };
    case "TIME_PROPOSED":
      return { what: `a viewing time is on the table${ctx.viewingAt ? `: ${kigaliLabel(ctx.viewingAt)}` : ""}${note}`, next: "the other side says yes, then it is booked and you get the booking" };
    case "VIEWING_BOOKED":
      return { what: "viewing booked", next: "you go with the tenant" };
    case "VIEWED":
      return { what: `viewing done${note}`, next: `the tenant decides — then send: signed ${ref} share <RWF>` };
    case "SIGNED":
      return { what: `lease signed${ctx.share ? `, Mkan's share ${shortRwf(ctx.share)}` : ""}${note}`, next: `the share request goes to the broker — when it is paid send: paid ${ref}` };
    case "PAID":
      return { what: `PAID${ctx.share ? ` — Mkan's share ${shortRwf(ctx.share)} is in` : ""}`, next: "nothing: the deal is done" };
    case "LOST":
      return { what: `lost${ctx.note?.trim() ? `: ${ctx.note.trim().slice(0, 120)}` : ""}`, next: "the tenant is offered another home" };
    case "STALLED": {
      // An FYI of what the line did, never a task (2026-11-22): a quiet tenant is followed up by the line itself, twice at most.
      const own = ctx.note?.trim() ? ctx.note.trim().slice(0, 140) : null;
      if (ctx.n) return { what: `quiet${own ? ` — ${own}` : ""}`, next: `nothing to do, the line is on it (write to them yourself any time; ${ref} taken pauses the line in that chat)` };
      return { what: `stalled${note}`, next: `the line picks it up on their next message (write to them yourself any time; ${ref} taken pauses the line in that chat)` };
    }
  }
}

/**
 * One line for a step. Null for a step the feed does not send. `facts` may be empty (the line still says
 * the code and the step). A team number is marked 🧪 TEST so a rehearsal is never read as a deal.
 */
export function feedLine(step: DealStep, ctx: DealEventCtx, facts: FeedFacts = {}): string | null {
  if (FEED_SKIPS.includes(step)) return null;
  const ref = `K${ctx.listingId}`;
  const { what, next } = describe(step, ctx, ref);
  const home = [facts.area, facts.title].filter(Boolean).join(" ").trim();
  const homeText = [home || null, facts.rent ? shortRwf(facts.rent) : null].filter(Boolean).join(" ");
  const phone = ctx.tenantPhone ?? facts.tenantPhone ?? null;
  const parts = [ref, what, homeText || null, phone ? `tenant ${phone}` : null, `next: ${next}`].filter(Boolean);
  return `${facts.test ? "🧪 TEST · " : ""}${parts.join(" · ")}`;
}
