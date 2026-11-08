// @vitest-environment node
/**
 * A Claude timeout cools the agent's Claude down for 30 s (2026-11-08): with no cooldown, every turn
 * waited out the reader's 3 s and the writer's 2.5 s again while the API was slow. Fake key, no network.
 */
import Anthropic from "@anthropic-ai/sdk";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: { apiSpend: { findMany: vi.fn(async () => []) }, $executeRaw: vi.fn(async () => 1) } }));

const saved = process.env.AGENT_ANTHROPIC_API_KEY;
beforeAll(() => {
  process.env.AGENT_ANTHROPIC_API_KEY = "sk-ant-test-not-a-real-key";
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-08T10:00:00Z"));
});
afterAll(() => {
  vi.useRealTimers();
  if (saved === undefined) delete process.env.AGENT_ANTHROPIC_API_KEY;
  else process.env.AGENT_ANTHROPIC_API_KEY = saved;
});

describe("noteFailure", () => {
  it("a timeout stops Claude for 30 s, then it may spend again", async () => {
    const { canSpend, noteFailure } = await import("@/components/agent/claude");
    expect(await canSpend()).toBe(true);
    await noteFailure(new Anthropic.APIConnectionTimeoutError());
    expect(await canSpend()).toBe(false);
    vi.advanceTimersByTime(31_000);
    expect(await canSpend()).toBe(true);
  });

  it("an error that is not the API being slow or down (a bad request, a parse error) is no reason to stop", async () => {
    const { canSpend, noteFailure } = await import("@/components/agent/claude");
    await noteFailure(new Error("Failed to parse structured output"));
    expect(await canSpend()).toBe(true);
  });
});
