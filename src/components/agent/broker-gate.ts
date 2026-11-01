/**
 * Who the line may ask a broker for. Pure, so the rule is tested.
 *
 * A broker is asked about a home only for a tenant who reached Mkan on
 * WhatsApp (a real number that wrote to us first) and picked that home — a
 * digit, or "yes" to "want me to check it?". A browser on /find never reaches a
 * broker: its "Check" opens the same chat on WhatsApp. The team's own numbers
 * run the whole chat, but their picks become TEST cards in #mkan.
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
