import "server-only";

/**
 * Claude Haiku reads a broker's reply when the rules cannot settle it (broker-read-pure.ts needsClassifier).
 * Spend lane "agent-broker": counted under the agent cap with the reader and the media lane (claude.ts), so
 * the same switches stop it — AGENT_CLAUDE=off, a spent month, a cooldown. A hard timeout; it never throws.
 * Null means "use today's rules": the caller then acts exactly as it did before this file existed.
 */
import { AGENT_MODEL, canSpend, claudeClient, noteFailure, recordSpend } from "./claude";
import { BROKER_READ_SYSTEM, brokerReadPrompt, parseBrokerRead, type BrokerRead, type BrokerReadContext } from "./broker-read-pure";

/** A broker is not waiting on the screen, but the outbox pass is: one short call. */
export const BROKER_READ_TIMEOUT_MS = 6_000;

export type BrokerReadDeps = {
  /** The model's raw reply, or null. Replaced in tests. */
  call: (system: string, user: string, timeoutMs: number) => Promise<string | null>;
};

async function callClaude(system: string, user: string, timeoutMs: number): Promise<string | null> {
  const client = claudeClient();
  if (!client || !(await canSpend())) return null;
  try {
    const res = await client.messages.create(
      { model: AGENT_MODEL, max_tokens: 300, system, thinking: { type: "disabled" }, messages: [{ role: "user", content: user }] },
      { timeout: timeoutMs },
    );
    void recordSpend("agent-broker", res.usage, AGENT_MODEL);
    if (res.stop_reason === "refusal") return null;
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  } catch (err) {
    await noteFailure(err);
    console.warn(`[broker-read] failed: ${(err as Error).message.slice(0, 120)}`);
    return null;
  }
}

/** The classifier's read of one broker message, or null (no client, capped, timed out, not JSON): fall back to the rules. */
export async function readBrokerMessage(ctx: BrokerReadContext, deps: Partial<BrokerReadDeps> = {}): Promise<BrokerRead | null> {
  const started = Date.now();
  try {
    // A second guard on top of the SDK's own timeout: the pass never waits longer than this.
    const call = deps.call ?? callClaude;
    const raw = await Promise.race([call(BROKER_READ_SYSTEM, brokerReadPrompt(ctx), BROKER_READ_TIMEOUT_MS), new Promise<null>((resolve) => setTimeout(() => resolve(null), BROKER_READ_TIMEOUT_MS + 500))]);
    const read = parseBrokerRead(raw, ctx.now);
    console.log(`[broker-read] ${read ? read.answer : raw == null ? "none" : "unparsed"} ${Date.now() - started}ms`);
    return read;
  } catch (err) {
    console.warn(`[broker-read] threw: ${(err as Error).message.slice(0, 120)}`);
    return null;
  }
}
