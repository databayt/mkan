import type { CostEstimate } from "./cost";
import type { ReasonKey } from "./rank";
import type { HardField, Requirements } from "./requirements";

export type AgentStatus = "RUNNING" | "WAITING" | "DONE" | "FAILED";

/** done · running · waiting on a person · failed · result not certain. */
export type StepStatus = "done" | "running" | "waiting_person" | "failed" | "uncertain";

export type EventKind =
  | "requirements_extracted"
  | "asked"
  | "search_done"
  | "dedup_grouped"
  | "filtered"
  | "ranked"
  | "needs_confirmation"
  | "shortlist_ready"
  | "broker_contact_started"
  | "broker_replied"
  | "viewing_proposed"
  | "viewing_confirmed"
  | "outcome_recorded"
  | "failed";

export interface AgentEventView {
  seq: number;
  kind: EventKind;
  status: StepStatus;
  payload: Record<string, unknown>;
  at: string;
}

export type AgentMessage =
  | { role: "user"; text: string; at: string }
  | { role: "agent"; kind: "ask"; field: HardField; at: string }
  | { role: "agent"; kind: "shortlist"; count: number; at: string }
  | { role: "agent"; kind: "none"; stay?: "short" | "long"; at: string }
  | { role: "agent"; kind: "error"; at: string };

export interface ShortlistItem {
  id: number;
  path: string;
  title: string;
  photo: string | null;
  district: string | null;
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
}
