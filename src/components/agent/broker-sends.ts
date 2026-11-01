import "server-only";

/**
 * Whether the line may message brokers at all, and which numbers are the
 * team's own. Both live in WaState, so a person flips them without a deploy:
 * `pnpm wa:brokers off|gated|status`, `pnpm wa:brokers test add <number>`.
 *
 *   off   — nothing reaches a broker. A tenant's pick becomes a #mkan card a
 *           person acts on; broker replies are still read and recorded, and the
 *           line answers none of them.
 *   gated — the line asks a broker only for a real WhatsApp tenant who picked
 *           that home (broker-gate.ts), within each broker's weekly budget
 *           (scripts/wa/outbox-pure.ts brokerRest).
 *
 * A missing or unreadable row reads as `off`: a fresh database, a typo or a
 * failed read never starts messaging brokers. Set to `off` on 2026-11-01 after
 * 129 asks in a week reached 26 brokers, nearly all of them from test searches.
 */
import { db } from "@/lib/db";
import { tenantGate, type GateVerdict } from "./broker-gate";

export type BrokerSendMode = "off" | "gated";
export const BROKER_SENDS_KEY = "broker-sends";
export const TEST_PHONES_KEY = "test-phones";

export const asMode = (value: unknown): BrokerSendMode => ((value as { mode?: unknown } | null)?.mode === "gated" ? "gated" : "off");

export async function brokerSendMode(): Promise<BrokerSendMode> {
  const row = await db.waState.findUnique({ where: { key: BROKER_SENDS_KEY }, select: { value: true } }).catch(() => null);
  return asMode(row?.value);
}

export async function setBrokerSendMode(mode: BrokerSendMode, by: string, note?: string): Promise<void> {
  const value = { mode, by, at: new Date().toISOString(), ...(note ? { note } : {}) };
  await db.waState.upsert({ where: { key: BROKER_SENDS_KEY }, create: { key: BROKER_SENDS_KEY, value }, update: { value } });
}

/** The team's own numbers, digits only: their chats run, but never reach a broker (a #mkan TEST card instead). */
export async function testPhones(): Promise<Set<string>> {
  const row = await db.waState.findUnique({ where: { key: TEST_PHONES_KEY }, select: { value: true } }).catch(() => null);
  const list: unknown[] = Array.isArray(row?.value) ? (row.value as unknown[]) : [];
  return new Set(list.filter((p): p is string => typeof p === "string").map((p) => p.replace(/\D/g, "")).filter(Boolean));
}

export async function setTestPhones(phones: string[]): Promise<void> {
  const value = [...new Set(phones.map((p) => p.replace(/\D/g, "")).filter(Boolean))];
  await db.waState.upsert({ where: { key: TEST_PHONES_KEY }, create: { key: TEST_PHONES_KEY, value }, update: { value } });
}

/** May the line ask a broker on this task's behalf now? Reads the mode, the task's tenant and the team list. */
export async function gateForTask(taskId: string): Promise<GateVerdict & { waPhone: string | null }> {
  const [mode, tests, task] = await Promise.all([
    brokerSendMode(),
    testPhones(),
    db.agentTask.findUnique({ where: { id: taskId }, select: { profile: { select: { waPhone: true } } } }),
  ]);
  const waPhone = task?.profile?.waPhone ?? null;
  return { ...tenantGate({ mode, waPhone, testPhones: tests }), waPhone };
}
