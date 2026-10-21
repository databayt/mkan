import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";

/**
 * The rental agent's Claude client, behind a hard monthly cap.
 *
 * Spend comes only from the Max plan's included API credits
 * (D-20261021-included-api-credits-for-find): every response's `usage` is
 * priced into the `ApiSpend` ledger, and a call is refused once the month
 * reaches AGENT_API_CAP_USD ($15), once today has used twice its share of the
 * month (so one spike cannot drain it), during a cooldown after a 429 / 5xx,
 * or when a `capped` row exists — written when the API says the credits are
 * gone (402 / "credit balance"), and the instant kill switch by hand. A
 * refused call is never an error: the turn reads with Groq, then the rules.
 *
 * The key is AGENT_ANTHROPIC_API_KEY, not ANTHROPIC_API_KEY: that name would
 * also switch on the report triage (src/lib/report/triage.ts), which has no cap.
 */

export const AGENT_MODEL = process.env.AGENT_CLAUDE_MODEL?.trim() || "claude-haiku-5-5";
const CAP_USD = Number(process.env.AGENT_API_CAP_USD) > 0 ? Number(process.env.AGENT_API_CAP_USD) : 15;

/** Claude Haiku 5.5 per million tokens, prompts up to 100k tokens (ours are ~3k). */
const PRICE_PER_MTOK = { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 };

export type SpendLane = "agent-read" | "agent-write" | "agent-eval";
const CAPPED_LANE = "capped";
const LEDGER_TTL_MS = 60_000;

let client: Anthropic | null | undefined;
let cooldownUntil = 0;
let ledger: { at: number; month: number; today: number; capped: boolean } | null = null;

export function claudeClient(): Anthropic | null {
  if (client === undefined) {
    const apiKey = process.env.AGENT_ANTHROPIC_API_KEY?.trim();
    // Retries would stack on a turn the tenant is waiting for; the fallback is the retry.
    client = apiKey ? new Anthropic({ apiKey, maxRetries: 0 }) : null;
  }
  return client;
}

const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

async function readLedger() {
  if (ledger && Date.now() - ledger.at < LEDGER_TTL_MS) return ledger;
  const now = new Date();
  const rows = await db.apiSpend.findMany({ where: { day: { startsWith: now.toISOString().slice(0, 7) } }, select: { day: true, lane: true, usd: true } });
  const agent = rows.filter((r) => r.lane.startsWith("agent-"));
  ledger = {
    at: Date.now(),
    month: agent.reduce((sum, r) => sum + Number(r.usd), 0),
    today: agent.filter((r) => r.day === utcDay(now)).reduce((sum, r) => sum + Number(r.usd), 0),
    capped: rows.some((r) => r.lane === CAPPED_LANE),
  };
  return ledger;
}

/** Whether this call may spend. A ledger that cannot be read refuses — the cap is the point. */
export async function canSpend(): Promise<boolean> {
  if (process.env.AGENT_CLAUDE === "off" || !claudeClient() || Date.now() < cooldownUntil) return false;
  const state = await readLedger().catch(() => null);
  if (!state || state.capped || state.month >= CAP_USD) return false;
  const now = new Date();
  const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getDate();
  return state.today < (2 * CAP_USD) / daysInMonth;
}

/** Dollars for one response, at the rates above. */
export function priceOf(usage: Pick<Anthropic.Usage, "input_tokens" | "output_tokens" | "cache_read_input_tokens" | "cache_creation_input_tokens">): number {
  return (
    (usage.input_tokens * PRICE_PER_MTOK.input +
      usage.output_tokens * PRICE_PER_MTOK.output +
      (usage.cache_read_input_tokens ?? 0) * PRICE_PER_MTOK.cacheRead +
      (usage.cache_creation_input_tokens ?? 0) * PRICE_PER_MTOK.cacheWrite) /
    1_000_000
  );
}

/** Add one response to the ledger (one upsert); the cached totals move with it. */
export async function recordSpend(lane: SpendLane, usage: Anthropic.Usage): Promise<void> {
  const usd = priceOf(usage);
  if (ledger) {
    ledger.month += usd;
    ledger.today += usd;
  }
  await db.$executeRaw`
    INSERT INTO "ApiSpend" ("day", "lane", "usd", "calls", "inputTokens", "outputTokens", "cacheReadTokens", "cacheWriteTokens", "updatedAt")
    VALUES (${utcDay()}, ${lane}, ${usd}, 1, ${usage.input_tokens}, ${usage.output_tokens}, ${usage.cache_read_input_tokens ?? 0}, ${usage.cache_creation_input_tokens ?? 0}, now())
    ON CONFLICT ("day", "lane") DO UPDATE SET
      "usd" = "ApiSpend"."usd" + EXCLUDED."usd",
      "calls" = "ApiSpend"."calls" + 1,
      "inputTokens" = "ApiSpend"."inputTokens" + EXCLUDED."inputTokens",
      "outputTokens" = "ApiSpend"."outputTokens" + EXCLUDED."outputTokens",
      "cacheReadTokens" = "ApiSpend"."cacheReadTokens" + EXCLUDED."cacheReadTokens",
      "cacheWriteTokens" = "ApiSpend"."cacheWriteTokens" + EXCLUDED."cacheWriteTokens",
      "updatedAt" = now()`.catch((err) => console.warn(`[agent] spend not recorded: ${(err as Error).message}`));
}

/** True when the API says the included credits are spent — never fall through to paid overage. */
export function isCreditError(err: unknown): boolean {
  return err instanceof Anthropic.APIError && (err.status === 402 || /credit balance|billing/i.test(err.message));
}

/** Learn from a failed call: out of credits stops the month, a 429 or 5xx cools down. */
export async function noteFailure(err: unknown): Promise<void> {
  if (isCreditError(err)) {
    const now = new Date();
    cooldownUntil = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
    if (ledger) ledger.capped = true;
    await db.$executeRaw`
      INSERT INTO "ApiSpend" ("day", "lane", "calls", "updatedAt") VALUES (${utcDay(now)}, ${CAPPED_LANE}, 1, now())
      ON CONFLICT ("day", "lane") DO UPDATE SET "calls" = "ApiSpend"."calls" + 1, "updatedAt" = now()`.catch(() => {});
    console.warn("[agent] Claude credits spent — Groq and the rules read until the month turns");
    return;
  }
  if (err instanceof Anthropic.RateLimitError) cooldownUntil = Date.now() + 60_000;
  else if (err instanceof Anthropic.InternalServerError || (err instanceof Anthropic.APIError && (err.status ?? 0) >= 500)) cooldownUntil = Date.now() + 30_000;
}
