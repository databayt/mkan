/**
 * The chatbot's quality tests leave their score where /monetize can read it:
 * scripts/crm/.data/agent/eval.json, carried to the page by the hourly
 * `monetize:snapshot` (chat block). One entry per test kind, newest wins.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const EVAL_FILE = join(__dirname, '..', 'crm', '.data', 'agent', 'eval.json');

export interface EvalEntry {
  at: string;
  /** Share of checks passed, 0–1. */
  pass: number;
  gate: boolean;
  p95Ms?: number;
}

export function recordEval(kind: 'reader' | 'writer', entry: Omit<EvalEntry, 'at'>): void {
  try {
    const all = existsSync(EVAL_FILE) ? (JSON.parse(readFileSync(EVAL_FILE, 'utf8')) as Record<string, EvalEntry>) : {};
    all[kind] = { at: new Date().toISOString(), ...entry };
    mkdirSync(join(EVAL_FILE, '..'), { recursive: true });
    writeFileSync(EVAL_FILE, `${JSON.stringify(all, null, 2)}\n`);
  } catch (err) {
    console.warn(`  ! eval score not saved: ${(err as Error).message}`);
  }
}
