/**
 * A chat the wa:e2e script wrote into (its made-up sender ids start `wae2e-`) is ours, not a tenant's.
 * The 2026-11-08 run from the Mac outlasted the 15 s turn deadline and left a chat FAILED, which read as a
 * tenant failure (failRate / noFailures). Fixture chats are out of tasks and failed alike.
 */
export const E2E_SENDER_PREFIX = "wae2e-";

export const isE2eFixture = (messages: unknown): boolean =>
  Array.isArray(messages) && messages.some((m) => typeof (m as { wa?: unknown })?.wa === "string" && (m as { wa: string }).wa.startsWith(E2E_SENDER_PREFIX));
