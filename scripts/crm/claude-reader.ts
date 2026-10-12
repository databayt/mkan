/**
 * One `claude -p` call on the Max plan — the reader every intake lane shares.
 *
 * The Slack home lane (home-intake.ts) and the TikTok lane (tiktok.ts) both turn
 * messy human text into JSON with the same spawn: no session persisted, no API
 * key, JSON envelope out. Kept in one place so a CLI flag change lands once.
 *
 * Tools are deny-by-default: a lane that needs one (TikTok reads its video
 * frames) names it in `allowTools` and points `cwd` at the only directory it
 * should see.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const ALL_TOOLS = ['Bash', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Agent', 'NotebookEdit'];

/** The claude CLI, wherever this process was started from (launchd and the Hermes gateway carry a bare PATH). */
export function claudeBin(): string {
  const candidates = [(process.env.CLAUDE_BIN ?? '').trim(), join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude'];
  for (const c of candidates) if (c && existsSync(c)) return c;
  return 'claude';
}

export interface ClaudeCall {
  prompt: string;
  model: string;
  /** Tools the reader may use, e.g. ['Read']. Everything else is disallowed. */
  allowTools?: string[];
  /** Working directory — with `allowTools: ['Read']`, the files the reader may open. */
  cwd?: string;
  timeoutMs?: number;
}

/** Runs the reader and returns the model's final text. Throws on a CLI or model error. */
export function runClaude(call: ClaudeCall): string {
  const allow = call.allowTools ?? [];
  const deny = ALL_TOOLS.filter((t) => !allow.includes(t));
  // `--disallowedTools` is variadic: the prompt goes on stdin, never after it.
  const args = ['-p', '--no-session-persistence', '--model', call.model, '--output-format', 'json'];
  if (allow.length) args.push('--allowedTools', ...allow);
  args.push('--disallowedTools', ...deny);
  const proc = spawnSync(claudeBin(), args, {
    input: call.prompt,
    cwd: call.cwd,
    encoding: 'utf8',
    timeout: call.timeoutMs ?? 150_000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      PATH: `${join(homedir(), '.local/bin')}:/opt/homebrew/bin:/usr/local/bin:${process.env.PATH ?? '/usr/bin:/bin'}`,
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    },
  });
  if (proc.error) throw new Error(`reader could not start (is the claude CLI installed?): ${proc.error.message}`);
  let envelope: { is_error?: boolean; result?: string; subtype?: string } = {};
  try {
    envelope = JSON.parse(proc.stdout || '{}');
  } catch {
    throw new Error(`reader returned non-JSON: ${(proc.stdout || proc.stderr).slice(0, 200)}`);
  }
  if (envelope.is_error) throw new Error(`reader error: ${envelope.result ?? envelope.subtype ?? 'unknown'}`);
  return envelope.result ?? '';
}
