/**
 * Where to work next — deterministic, no model.
 *
 * Walks the business funnel hand-off by hand-off and names the step that
 * converts worst, among steps with enough volume to mean anything. The banner
 * prints the observed rate beside the floor it missed, so a reader can argue
 * with the rule instead of trusting it.
 */
export interface Stage {
  key: string;
  block: string;
  count: number;
}

export interface Bottleneck {
  kind: "step" | "insufficient";
  from?: string;
  to?: string;
  block?: string;
  rate?: number;
  /** The floor this step is held to. */
  floor?: number;
}

/** Floors per hand-off (to-stage key). Below the floor = a bottleneck candidate. */
export const FLOORS: Record<string, number> = {
  homes: 0.05, // posts read → homes saved
  ready: 0.1, // homes saved → ready to post
  posted: 0.5, // ready → posted
  chats: 0.002, // views → chats
  shortlisted: 0.6, // chats → shortlist
  asked: 0.2, // shortlist → broker asked
  available: 0.3, // asked → broker said available
  viewings: 0.3, // available → viewing booked
  paid: 0.2, // viewing → paid deal
};

export const MIN_SAMPLE = 5;

export function bottleneck(stages: Stage[]): Bottleneck {
  let worst: Bottleneck | null = null;
  let worstScore = Infinity;
  for (let i = 1; i < stages.length; i++) {
    const a = stages[i - 1]!;
    const b = stages[i]!;
    if (a.count < MIN_SAMPLE) continue;
    const rate = b.count / a.count;
    const floor = FLOORS[b.key] ?? 0.1;
    const score = rate / floor; // < 1 means under the floor
    if (score < worstScore) {
      worstScore = score;
      worst = { kind: "step", from: a.key, to: b.key, block: b.block, rate, floor };
    }
  }
  if (!worst) return { kind: "insufficient" };
  return worst;
}
