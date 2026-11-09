/**
 * The 48-hour rule (2026-11-09): a broker's "available" is a warm lead for two days, not for a week.
 * Last week 4 of 4 "available" answers reached nobody and the tenants went cold. So, once Abdout turns
 * it on, the line itself does two things and nothing else:
 *
 *   at the next sweep after the yes → the tenant gets the deal sheet ("when can you come?")
 *   24 h after the yes         → one nudge, if the tenant has not named a time yet
 *
 * After 48 h the lead is a person's. Pure, so the test reads every branch; the sweep is deal-48h.ts.
 * The switch is WaState `deal-48h` and reads as OFF when the row is missing or unreadable.
 */
export const DEAL_48H_KEY = "deal-48h";
export const NUDGE_AFTER_MS = 24 * 3_600_000;
export const RULE_WINDOW_MS = 48 * 3_600_000;

export const asOn = (value: unknown): boolean => (value as { mode?: unknown } | null)?.mode === "on";

export type Plan48 = { do: "sheet" | "nudge" } | { do: "none"; why: "off" | "window" | "stale" | "too-early" | "done" | "tenant-acted" };

export function plan48h(i: {
  on: boolean;
  /** When the broker said the home is free. */
  answeredAt: Date;
  now: Date;
  /** The deal sheet reached (or is queued for) the tenant. */
  sheetSent: boolean;
  nudged: boolean;
  /** The tenant named a time, a viewing is booked or an intro started: nothing to chase. */
  tenantActed: boolean;
  /** The send window (outbox-pure inSendWindow). */
  inWindow: boolean;
}): Plan48 {
  if (!i.on) return { do: "none", why: "off" };
  if (i.tenantActed) return { do: "none", why: "tenant-acted" };
  const age = i.now.getTime() - i.answeredAt.getTime();
  if (age < 0) return { do: "none", why: "too-early" };
  if (age >= RULE_WINDOW_MS) return { do: "none", why: "stale" };
  if (!i.inWindow) return { do: "none", why: "window" };
  // Late is better than never: a sheet the first sweeps missed still goes inside the 48 hours.
  if (!i.sheetSent) return { do: "sheet" };
  if (age >= NUDGE_AFTER_MS && !i.nudged) return { do: "nudge" };
  return { do: "none", why: i.nudged ? "done" : "too-early" };
}

/** A BrokerRequest, as far as the 48-hour sweep reads it. */
export type AskRow = {
  id: string;
  listingId: number;
  taskId: string | null;
  status: string;
  respondedAt: Date | null;
};

/** One tenant's chance at the rule: the request to key its state on, and when the broker said yes. */
export type Candidate = { row: AskRow; answeredAt: Date };

/**
 * Which requests the sweep looks at. A request counts when it is AVAILABLE and the broker's yes fell inside
 * the window. No consentAt is asked for: an ask handed on to a second broker is created without one
 * (broker.ts askNext), and a request only ever exists after the tenant said yes to asking. A tenant who
 * joined someone else's ask has no respondedAt of their own: the yes on the same home answers them. A tenant whose
 * broker still has a terms ask open (`openTerms` = "taskId:listingId") is left to the intro. One per
 * tenant and home; the earliest yes wins.
 */
export function selectAsks(rows: AskRow[], openTerms: ReadonlySet<string>, now: Date): Candidate[] {
  const cutoff = now.getTime() - RULE_WINDOW_MS;
  const yes = new Map<number, Date>();
  for (const r of rows) {
    if (r.status !== "AVAILABLE" || !r.respondedAt || r.respondedAt.getTime() < cutoff) continue;
    const seen = yes.get(r.listingId);
    if (!seen || r.respondedAt < seen) yes.set(r.listingId, r.respondedAt);
  }
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const r of [...rows].sort((a, b) => a.id.localeCompare(b.id))) {
    if (r.status !== "AVAILABLE" || !r.taskId) continue;
    const answeredAt = r.respondedAt ?? yes.get(r.listingId);
    if (!answeredAt || answeredAt.getTime() < cutoff) continue;
    const pair = `${r.taskId}:${r.listingId}`;
    if (openTerms.has(pair) || seen.has(pair)) continue;
    seen.add(pair);
    out.push({ row: r, answeredAt });
  }
  return out.sort((a, b) => a.answeredAt.getTime() - b.answeredAt.getTime());
}
