import { SILENT_EVENTS, type AgentEventView, type AgentTaskView, type EventKind } from "./types";

/**
 * What the agent's work looks like on screen, in the Claude iOS app's shape
 * (2026-11-07): the finished steps of a turn fold into one row ("Read your
 * message, searched 120 homes, ranked 8 · +8 −112"), the step running now gets
 * a live row, and the brokers still being asked are counted. Pure: the rows are
 * read from `AgentEvent` rows only — a step with no row did not happen.
 */

/** The events of the latest turn: everything from its last `requirements_extracted` on. */
export function latestTurn(events: AgentEventView[]): AgentEventView[] {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i]?.kind === "requirements_extracted") return events.slice(i);
  }
  return events;
}

/** The work a live row can name — only steps that write a "running" row first (run.ts `trace.start`), and the writer. */
export type LiveStep = "read" | "search" | "widen" | "write";

/** One piece of the folded row's sentence, in the order it happened. */
export type DonePart =
  | { key: "read" | "memory" | "none" | "write" | "viewing" | "failed" }
  | { key: "search" | "group" | "widen" | "rank" | "asked" | "brokers" | "replied"; count: number };

export interface TurnActivity {
  /** The latest turn's drawn rows (the tenant's own taps left out), oldest first. */
  events: AgentEventView[];
  /** The folded row's sentence, piece by piece. */
  parts: DonePart[];
  /** The step running now — only when a row says so. */
  live: LiveStep | null;
  /** `+kept` homes on the list · `−ruledOut` searched homes that did not fit. */
  badge: { kept: number; ruledOut: number } | null;
  /** Homes a broker was asked about and has not answered yet. */
  brokersPending: number;
  /** A step failed (a search that could not widen, or a broker's "taken", is not a failure). */
  failed: boolean;
}

const LIVE: Partial<Record<EventKind, LiveStep>> = { requirements_extracted: "read", search_done: "search", relaxed: "widen" };

const count = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/**
 * The latest turn as rows. A message sent after the turn's first row began has
 * not written anything yet: its turn shows no rows (the status line carries it)
 * rather than the previous turn's.
 */
export function turnActivity(task: Pick<AgentTaskView, "events" | "messages" | "status" | "shortlist">): TurnActivity {
  const running = task.status === "RUNNING";
  let events = latestTurn(task.events.filter((e) => !SILENT_EVENTS.includes(e.kind)));
  const lastUser = task.messages.findLast((m) => m.role === "user");
  if (running && lastUser && events[0] && Date.parse(events[0].at) < Date.parse(lastUser.at)) events = [];

  const parts: DonePart[] = [];
  const add = (part: DonePart) => {
    const at = parts.findIndex((p) => p.key === part.key);
    // A step seen twice keeps its first place and its latest numbers.
    if (at >= 0) parts[at] = part;
    else parts.push(part);
  };
  const brokers = new Set<string>();
  let replies = 0;
  for (const e of events) {
    if (e.status === "running") continue;
    switch (e.kind) {
      case "requirements_extracted":
        add({ key: "read" });
        break;
      case "memory_used":
        add({ key: "memory" });
        break;
      case "search_done":
        add({ key: "search", count: count(e.payload.candidates) });
        break;
      case "dedup_grouped":
        if (count(e.payload.removed)) add({ key: "group", count: count(e.payload.removed) });
        break;
      case "relaxed":
        if (e.status === "done" && count(e.payload.count)) add({ key: "widen", count: count(e.payload.count) });
        break;
      case "ranked":
        add(count(e.payload.top) ? { key: "rank", count: count(e.payload.top) } : { key: "none" });
        break;
      case "asked":
        add({ key: "asked", count: String(e.payload.fields ?? "").split(",").filter((f) => f.trim()).length });
        break;
      case "reply_written":
        add({ key: "write" });
        break;
      case "broker_contact_started":
      case "availability_asked":
        brokers.add(String(e.payload.broker ?? e.payload.listingId ?? e.seq));
        add({ key: "brokers", count: brokers.size });
        break;
      case "broker_replied":
        replies += 1;
        add({ key: "replied", count: replies });
        break;
      case "viewing_proposed":
      case "viewing_confirmed":
        add({ key: "viewing" });
        break;
      case "failed":
        add({ key: "failed" });
        break;
      default:
        break;
    }
  }

  // The row running now. While the cards are up and Claude writes the reply, the writer is the work.
  const runningRow = running ? events.findLast((e) => e.status === "running") : undefined;
  let live: LiveStep | null = runningRow ? (LIVE[runningRow.kind] ?? null) : null;
  const lastMessage = task.messages.at(-1);
  if (!live && running && events.length > 0 && lastMessage?.role === "agent" && lastMessage.kind === "shortlist" && lastMessage.pendingText && !lastMessage.text) {
    live = "write";
  }

  const last = (kind: EventKind) => events.findLast((e) => e.kind === kind && e.status !== "running");
  const ranked = last("ranked");
  const searched = last("search_done");
  let badge: TurnActivity["badge"] = null;
  if (ranked && searched) {
    const kept = count(ranked.payload.top);
    const candidates = count(searched.payload.candidates);
    // Widened: none of the homes first searched fitted every detail.
    const widened = last("relaxed")?.status === "done";
    const matching = widened ? 0 : count(last("filtered")?.payload.matching ?? kept);
    const ruledOut = Math.max(0, candidates - matching);
    if (kept || ruledOut) badge = { kept, ruledOut };
  }

  return {
    events,
    parts,
    live,
    badge,
    brokersPending: task.shortlist.filter((s) => s.availability === "asked").length,
    failed: events.some((e) => e.status === "failed" && e.kind !== "relaxed" && e.kind !== "broker_replied"),
  };
}

/**
 * The orange line's word: a few claim-free words (thinking, weighing…) that
 * change every few seconds — never an action the agent is not taking. Each
 * turn starts on its own word.
 */
export function playfulWord(words: readonly string[], seed: string, tick: number): string {
  if (words.length === 0) return "";
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return words[(hash + Math.max(0, tick)) % words.length] ?? "";
}
