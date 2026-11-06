/**
 * The locks every production e2e takes before any src module reads the environment: nothing it runs
 * reaches a person (2026-11-06; the same as scripts/agent/deal-e2e.ts).
 *   - MKAN_WA_OUTBOX=0 → every WhatsApp send is written SKIPPED (the outbox only sends QUEUED rows)
 *   - SLACK_BOT_TOKEN unset → postSlackCard only logs
 *   - a fetch guard refuses Slack, WhatsApp and Evolution hosts outright
 * Import it first: `import "./e2e-locks";`.
 */
import { config } from "dotenv";
config({ override: true, quiet: true } as never);

process.env.MKAN_WA_OUTBOX = "0";
delete process.env.SLACK_BOT_TOKEN;
process.env.PRISMA_QUIET ??= "1";

export const blockedSends: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (/slack\.com|graph\.facebook\.com|whatsapp|evolution|__wa/i.test(url)) {
    blockedSends.push(url);
    throw new Error(`e2e refused a send to ${new URL(url).host}`);
  }
  return realFetch(input as never, init);
}) as typeof fetch;
