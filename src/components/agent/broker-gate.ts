/**
 * Who the line may ask a broker for. Pure, so the rule is tested.
 *
 * A broker is asked about a home only for a tenant who has a WhatsApp number
 * and picked that home — a digit, or "yes" to "want me to check it?" on
 * WhatsApp, or a number typed into /find's card beside "Ask the broker"
 * (2026-11-08: the number is the consent, and where the answer goes). A browser
 * that left no number never reaches a broker: its card still offers the same
 * chat on WhatsApp. The team's own numbers run the whole chat, but their picks
 * become TEST cards in #mkan.
 *
 * Until 2026-11-01 every monthly search on /find asked the broker of each home
 * it showed, and the hourly cron asked again every day: 257 asks from 17
 * searches, most of them tests, reached 26 brokers in a week.
 */

export type SendMode = "off" | "gated";
export type GateReason = "sends-off" | "not-whatsapp" | "test-phone";
export type GateVerdict = { ok: true } | { ok: false; why: GateReason };

export function tenantGate(input: { mode: SendMode; waPhone: string | null; testPhones: ReadonlySet<string> }): GateVerdict {
  if (!input.waPhone) return { ok: false, why: "not-whatsapp" };
  if (input.testPhones.has(input.waPhone.replace(/\D/g, ""))) return { ok: false, why: "test-phone" };
  if (input.mode !== "gated") return { ok: false, why: "sends-off" };
  return { ok: true };
}

/**
 * Where a task's tenant can be reached on WhatsApp: the number of the WhatsApp chat itself, else the
 * number a web tenant left on the chat's request (`TenantRequest.phone`, set with `optInAt`).
 */
export function tenantNumber(task: { profile?: { waPhone: string | null } | null; demand?: { phone: string | null; optInAt: Date | null } | null } | null | undefined): string | null {
  if (task?.profile?.waPhone) return task.profile.waPhone;
  return task?.demand?.phone && task.demand.optInAt ? task.demand.phone : null;
}

/**
 * What every task read that may need to reach the tenant selects: both numbers. Four reads after the
 * broker's first answer took only the WhatsApp one, so a web tenant who left a number got the answer and
 * then nothing — no hand-on, no deal sheet after the terms wait, no viewing confirmation (2026-11-08).
 */
export const TENANT_REACH = { profile: { select: { waPhone: true } }, demand: { select: { phone: true, optInAt: true } } } as const;

/** A task row with the number that reaches its tenant in `profile.waPhone` — the shape the deal and intro code read. */
export function reachedAt<T extends { profile?: { waPhone: string | null } | null; demand?: { phone: string | null; optInAt: Date | null } | null }>(
  row: T,
): Omit<T, "profile" | "demand"> & { profile: { waPhone: string | null } } {
  const { profile, demand, ...rest } = row;
  return { ...rest, profile: { waPhone: tenantNumber({ profile, demand }) } };
}

/** A broker who was asked about a home is not asked about it again for this long — by any search. */
export const REASK_GAP_DAYS = 14;
/** A search whose tenant wrote nothing for this long stops asking brokers. */
export const TENANT_QUIET_HOURS = 72;

/** The newest tenant message in a task's messages, or null. */
export function lastTenantAt(messages: unknown): Date | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: unknown; at?: unknown } | null;
    if (m?.role === "user" && typeof m.at === "string") {
      const at = new Date(m.at);
      return Number.isNaN(at.getTime()) ? null : at;
    }
  }
  return null;
}

/** Is the tenant still in this search: wrote within TENANT_QUIET_HOURS. */
export const tenantActive = (messages: unknown, now: Date) => {
  const at = lastTenantAt(messages);
  return !!at && now.getTime() - at.getTime() < TENANT_QUIET_HOURS * 3_600_000;
};
