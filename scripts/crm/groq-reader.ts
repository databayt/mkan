/**
 * One Groq call — the TikTok lane's reader on the free tier, off the Max pool.
 *
 * `claude -p` read every video with Sonnet and eight frames, and the 2026-10-16
 * sweep died on the weekly limit 40 times in a row. Groq's free tier carries a
 * vision model (`qwen/qwen3.8-27b`, ~800 prompt tokens per 720px frame), so the
 * frames travel inline as data URLs and no tool or working directory is needed.
 *
 * The same key serves the /find agent on mkan.sd, so this reader is polite: it
 * honours `retry-after`, and a limit that will not clear inside a minute ends
 * the stage with `GroqLimit` instead of failing every video behind it.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const GROQ_VISION_MODEL = (process.env.TIKTOK_GROQ_MODEL ?? '').trim() || 'qwen/qwen3.8-27b';
const URL = 'https://api.groq.com/openai/v1/chat/completions';

/** The limit is spent for now — stop asking, the ledger resumes next run. */
export class GroqLimit extends Error {}

let key: string | null = null;
export function groqKey(): string {
  if (key) return key;
  key = (process.env.GROQ_API_KEY ?? '').trim();
  if (!key) {
    try {
      // launchd has no shell profile; the Keychain copy is the one cf-secrets.sh pushes.
      key = execSync('security find-generic-password -s cf-mkan-GROQ_API_KEY -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      /* reported below */
    }
  }
  if (!key) throw new Error('needs GROQ_API_KEY — in .env, or the Keychain item cf-mkan-GROQ_API_KEY');
  return key;
}

export interface GroqCall {
  prompt: string;
  /** JPEG paths sent inline, in order, after the prompt. */
  images?: string[];
  model?: string;
  maxTokens?: number;
  timeoutMs?: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Seconds Groq asks us to wait: the header, else the "try again in 12.3s" in the body. */
export function retryAfterSeconds(header: string | null, body: string): number | null {
  const h = header ? Number(header) : NaN;
  if (Number.isFinite(h)) return h;
  const m = /try again in\s+(?:(\d+)m)?([\d.]+)s/i.exec(body);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2]) : null;
}

/** Runs the reader and returns the model's text. Throws `GroqLimit` when the tier is spent. */
export async function runGroq(call: GroqCall, attempt = 0): Promise<string> {
  const content: unknown[] = [{ type: 'text', text: call.prompt }];
  for (const p of call.images ?? []) {
    content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${readFileSync(p).toString('base64')}` } });
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), call.timeoutMs ?? 90_000);
  let res: Response;
  try {
    res = await fetch(URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${groqKey()}`, 'Content-Type': 'application/json', 'User-Agent': 'mkan-tiktok/2' },
      body: JSON.stringify({
        model: call.model ?? GROQ_VISION_MODEL,
        messages: [{ role: 'user', content }],
        temperature: 0,
        max_tokens: call.maxTokens ?? 900,
      }),
    });
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (res.status === 429) {
    const wait = retryAfterSeconds(res.headers.get('retry-after'), text);
    // Minute windows clear on their own; a daily one does not, so stop.
    if (wait == null || wait > 60 || attempt >= 3) throw new GroqLimit(`groq limit: ${text.slice(0, 200)}`);
    await sleep((wait + 1) * 1000);
    return runGroq(call, attempt + 1);
  }
  if (!res.ok) throw new Error(`groq ${res.status}: ${text.slice(0, 400)}`);
  const json = JSON.parse(text) as { choices?: { message?: { content?: string } }[] };
  // Qwen may think out loud first; the JSON extractor takes the object after it.
  return (json.choices?.[0]?.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
