import "server-only";
/**
 * A number that is ours — a team or test phone (`pnpm wa:brokers test`) or one of Abdout's personal
 * contacts — never becomes a tenant in Twenty (2026-11-15). REAL_PERSON reads only a profile's own
 * WhatsApp number, so a team number typed into a web chat slipped past it: two e2e rehearsals left
 * tenants with +250720000019 queued for the CRM. Checked on the tenant's number itself, wherever it is.
 */
import { testPhones } from "@/components/agent/broker-sends";
import { isPersonal } from "@/components/agent/personal";

export async function isOurPhone(phone: string | null | undefined, tests?: Set<string>): Promise<boolean> {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return false;
  const team = tests ?? (await testPhones().catch(() => new Set<string>()));
  if (team.has(digits)) return true;
  return isPersonal(digits).catch(() => false);
}
