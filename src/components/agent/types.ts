import type { CostEstimate } from "./cost";
import type { AgentMemory } from "./memory";
import type { ClarifyField } from "./fields";
import type { AskKey, ReasonKey } from "./rank";
import type { HardField, MustHave, Requirements } from "./requirements";
import type { Relaxed } from "./relax";

export type AgentStatus = "RUNNING" | "WAITING" | "DONE" | "FAILED";

/** done · running · waiting on a person · failed · result not certain. */
export type StepStatus = "done" | "running" | "waiting_person" | "failed" | "uncertain";

export type EventKind =
  | "requirements_extracted"
  | "asked"
  | "search_done"
  | "dedup_grouped"
  | "filtered"
  | "relaxed"
  | "ranked"
  | "needs_confirmation"
  | "shortlist_ready"
  | "broker_contact_started"
  | "broker_replied"
  | "viewing_proposed"
  | "viewing_confirmed"
  | "outcome_recorded"
  | "memory_used"
  | "memory_updated"
  | "reply_written"
  | "availability_asked"
  | "failed"
  // Silent: what the tenant did, kept for counting — never drawn as a step.
  | "feedback"
  | "card_opened"
  | "home_saved"
  | "home_dismissed";

/** Rows the steps panel never shows: the tenant's own taps, not the agent's work. */
export const SILENT_EVENTS: readonly EventKind[] = ["feedback", "card_opened", "home_saved", "home_dismissed"];

export interface AgentEventView {
  seq: number;
  kind: EventKind;
  status: StepStatus;
  payload: Record<string, unknown>;
  at: string;
}

export type AgentMessage =
  /** `filters` are the badges the tenant picked; they win over the text. `clear` empties fields (a refine chip). */
  | { role: "user"; text: string; at: string; filters?: Record<string, unknown>; clear?: string[] }
  | { role: "agent"; kind: "ask"; field: HardField; at: string }
  /**
   * A vague first message missing several things at once: one stepper card asks
   * them all (`fields`, most result-changing first); its Submit sends one message.
   */
  | { role: "agent"; kind: "clarify"; fields: ClarifyField[]; at: string }
  /**
   * `relaxed`: details widened to find these; `refine`: a field offered as a follow-up question.
   * `text`: the reply Claude wrote (guarded) — else the template; `pendingText` while it is being written.
   */
  | { role: "agent"; kind: "shortlist"; count: number; relaxed?: Relaxed[]; refine?: HardField; text?: string; pendingText?: boolean; demand?: boolean; asked?: number; at: string }
  /** A question about renting, answered from knowledge.ts, or a greeting; no search ran. */
  | { role: "agent"; kind: "answer"; topic: "question" | "other"; text?: string; at: string }
  /** `demand`: the search was kept as a TenantRequest; `asked`: brokers messaged for it now. */
  | { role: "agent"; kind: "none"; stay?: "short" | "long"; demand?: boolean; asked?: number; at: string }
  | { role: "agent"; kind: "error"; at: string };

export interface ShortlistItem {
  id: number;
  path: string;
  title: string;
  photo: string | null;
  district: string | null;
  /** Kigali zone slug (neighbourhood, else sector) — the card names it in the reader's language. */
  zone?: string | null;
  /** The listing's type in the tenant's words; null when the ad does not say. */
  homeType?: "apartment" | "house" | "room" | null;
  /** Known furnishing; null when the ad does not say. */
  furnished?: boolean | null;
  bedrooms: number | null;
  bathrooms: number | null;
  rating: number | null;
  reviews: number | null;
  currency: string;
  rentPeriod: "NIGHTLY" | "MONTHLY";
  score: number;
  reasons: ReasonKey[];
  cost: CostEstimate;
  duplicates: number;
  /** unconfirmed → asked (a broker was messaged) → confirmed | rented | no_reply. */
  availability: "unconfirmed" | "asked" | "confirmed" | "rented" | "no_reply";
  /** Set for a broker lead (an unpublished TikTok home): where the ad lives. */
  lead?: { handle: string | null; sourceUrl: string | null };
  /** Phase 3 — the viewing being arranged for this home. */
  viewing?: ViewingView;
  /** The tenant's must-haves this home has, and the ones only the broker can answer. */
  mustHaves?: { matched: MustHave[]; unknown: MustHave[] };
  /** Details the tenant asked for that the ad does not state — "ask the broker". */
  ask?: AskKey[];
  /** Distance from the place the tenant wants to be near. */
  place?: { name: string; km: number };
  /** One line, written by Claude from this card's facts: why it fits. */
  why?: string;
}

export interface ViewingView {
  requestId: string;
  slots: string[];
  chosen: string | null;
  confirmed: boolean;
  scheduledFor: string | null;
  outcome: string | null;
}

export interface AgentTaskView {
  id: string;
  status: AgentStatus;
  locale: string;
  messages: AgentMessage[];
  requirements: Requirements | null;
  shortlist: ShortlistItem[];
  events: AgentEventView[];
  startedAt: string;
  /** Status, updatedAt and last event seq — the poll answers 204 while it holds. */
  version: string;
  /** The unmet demand kept for this chat, if any: whether the tenant left a number. */
  demand: { optedIn: boolean; status: string } | null;
}

/** One row of the ☰ chat list (`GET /api/agent/chats`). */
export interface AgentChatRow {
  id: string;
  /** The tenant's first words; the row prefers a title built from `requirements`. */
  title: string | null;
  requirements: Requirements | null;
  updatedAt: string;
  status: AgentStatus;
  homes: number;
  /** A broker confirmed one of its homes is available. */
  confirmed: boolean;
}

export interface AgentChatsView {
  chats: AgentChatRow[];
  /** Pass as `?before=` for the next page; null at the end. */
  next: string | null;
  signedIn: boolean;
  memory: AgentMemory | null;
}

/** The empty /find for a returning tenant (`GET /api/agent/welcome`). */
export interface AgentWelcomeView {
  /** The remembered search, as requirements — what "Continue" sends. Null for a first visit. */
  search: Partial<Requirements> | null;
  /** Homes listed since the last search that fit it, best first. */
  homes: ShortlistItem[];
  since: string | null;
}
