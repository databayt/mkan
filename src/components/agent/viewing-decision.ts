/**
 * A tenant named a time (proposeViewing): the viewing becomes one Yes on /monetize instead of a command
 * typed in a terminal. Pure — the params, the question and the prompt text are built here from ids and
 * numbers only (never from a word a tenant or broker wrote), so the tests read exactly what Abdout is asked.
 */
import { parseAction, type ActionParams } from "@/lib/monetize/actions";
import type { ShareAgreement } from "./deal-pure";

const KIGALI_HOURS = 2;

/** "YYYY-MM-DD HH:MM" in Kigali time (UTC+2), the form `deal:book --at` and the action schema read. */
export function kigaliStamp(at: Date): string {
  const k = new Date(at.getTime() + KIGALI_HOURS * 3_600_000);
  return k.toISOString().slice(0, 16).replace("T", " ");
}

/** The marker that makes the same ask (chat + home) one decision, not one a message. */
export const viewingMarker = (taskId: string, listingId: number) => `viewing ask ${taskId} K${listingId}`;

export interface ViewingDecision {
  params: ActionParams;
  ask: string;
  /** What a session that is ever handed this prompt reads: nothing to run, the Yes does it. */
  text: string;
}

/**
 * `agreed` is the broker's recorded share. With none on record the card carries "no share for this deal",
 * said out loud in the question: Mkan books and pays the fee knowing it, and Abdout's Yes is that choice.
 * Null when the ask cannot be a valid action (a bad id), so the Slack card stays the only path.
 */
export function buildViewingDecision(i: { taskId: string; listingId: number; at: Date; agreed: ShareAgreement | null; rent?: number | null }): ViewingDecision | null {
  const raw: ActionParams = { task: i.taskId, listing: i.listingId, at: kigaliStamp(i.at) };
  if (i.rent != null && Number.isInteger(i.rent) && i.rent >= 0 && i.rent <= 100_000_000) raw.rent = i.rent;
  if (i.agreed?.pct) raw.sharePct = Math.round(i.agreed.pct * 10_000) / 100;
  else if (i.agreed?.flatRwf) raw.shareRwf = i.agreed.flatRwf;
  else raw.noShare = true;
  const parsed = parseAction("deal.book", raw);
  if (!parsed.ok) return null;
  const shareSaid = raw.noShare ? "with no share for Mkan on this deal (no agreement on record)" : "on the share the broker agreed";
  return {
    params: parsed.params,
    ask: `The tenant of chat …${i.taskId.slice(-6)} asked to see K${i.listingId} at ${raw.at} Kigali time: book it ${shareSaid}?`,
    text: `${viewingMarker(i.taskId, i.listingId)} — a one-tap decision on /monetize. Nothing to run in a session: Abdout's Yes books the viewing.`,
  };
}
