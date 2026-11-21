/**
 * The driver's bounded tool-use loop (driver.ts wires it to the database and to Claude). No I/O of its own: the
 * client, the tool executor and the guard come in, so tests script the model and read what it was told.
 *
 * Up to MAX_TOOL_ROUNDS model calls may use tools; the last call has none. A message the guard refuses goes back
 * to the model with the reason, at most MAX_REWRITES times. Everything stops at the deadline.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { DRIVER_MAX_TOKENS, DRIVER_TOOLS, EFFECT_TOOLS, MAX_REWRITES, MAX_TOOL_ROUNDS, type Guarded } from "./driver-pure";

export interface LoopDeps {
  client: { messages: { create: (params: any, opts?: any) => Promise<Anthropic.Message> } };
  model: string;
  system: string;
  /** Run one tool; the result is shown to the model as JSON. A throw becomes an error result. */
  exec: (name: string, input: Record<string, unknown>) => Promise<unknown>;
  guard: (raw: string) => Guarded;
  onUsage?: (usage: Anthropic.Usage) => void;
  /** Called for every tool call, after it ran. */
  onTool?: (name: string, input: Record<string, unknown>, result: unknown, ms: number) => void;
  /** Absolute time (ms) after which nothing more is started. */
  deadline: number;
  now?: () => number;
}

export type LoopResult =
  | { ok: true; raw: string; text: string; calls: number; tools: string[]; effects: boolean }
  | { ok: false; why: string; calls: number; tools: string[]; effects: boolean; error?: unknown };

const textOf = (m: Anthropic.Message) =>
  m.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

export async function converse(deps: LoopDeps, firstMessage: string): Promise<LoopResult> {
  const now = deps.now ?? Date.now;
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: firstMessage }];
  const tools: string[] = [];
  let calls = 0;
  let rounds = 0;
  let rewrites = 0;
  let effects = false;
  const fail = (why: string): LoopResult => ({ ok: false, why, calls, tools, effects });

  for (;;) {
    const left = deps.deadline - now();
    if (left < 1_500) return fail("deadline");
    const useTools = rounds < MAX_TOOL_ROUNDS;
    calls += 1;
    let res: Anthropic.Message;
    try {
      res = await deps.client.messages.create(
        {
          model: deps.model,
          max_tokens: DRIVER_MAX_TOKENS,
          system: [{ type: "text", text: deps.system, cache_control: { type: "ephemeral" } }],
          tools: DRIVER_TOOLS,
          ...(useTools ? {} : { tool_choice: { type: "none" } }),
          messages,
          // Sonnet 5.5 rejects "disabled": thinking off between tools is its own mode, and effort stays low.
          thinking: { type: "between_tools" },
          output_config: { effort: "low" },
        },
        { timeout: left },
      );
    } catch (err) {
      return { ok: false, why: `api: ${(err as Error).message}`, calls, tools, effects, error: err };
    }
    deps.onUsage?.(res.usage);
    if (res.stop_reason === "refusal") return fail("refusal");

    if (res.stop_reason === "tool_use" && useTools) {
      rounds += 1;
      const uses = res.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
      messages.push({ role: "assistant", content: res.content });
      const results = await Promise.all(
        uses.map(async (u) => {
          const t0 = now();
          const input = (u.input ?? {}) as Record<string, unknown>;
          tools.push(u.name);
          if (EFFECT_TOOLS.has(u.name)) effects = true;
          try {
            const out = await deps.exec(u.name, input);
            deps.onTool?.(u.name, input, out, now() - t0);
            return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(out) };
          } catch (err) {
            const out = { error: (err as Error).message };
            deps.onTool?.(u.name, input, out, now() - t0);
            return { type: "tool_result" as const, tool_use_id: u.id, content: JSON.stringify(out), is_error: true };
          }
        }),
      );
      messages.push({ role: "user", content: results });
      continue;
    }

    if (res.stop_reason === "max_tokens") return fail("max_tokens");
    const raw = textOf(res);
    const verdict = deps.guard(raw);
    if (verdict.ok) return { ok: true, raw, text: verdict.text, calls, tools, effects };
    if (rewrites >= MAX_REWRITES) return fail(`guard: ${verdict.reason}`);
    rewrites += 1;
    messages.push({ role: "assistant", content: res.content.length ? res.content : [{ type: "text", text: raw || "…" }] });
    messages.push({ role: "user", content: `That message cannot be sent: ${verdict.reason}. Write the message again, fixing only that. Reply with the message text only.` });
  }
}
