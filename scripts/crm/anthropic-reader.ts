/**
 * One Claude API call — the TikTok lane's vision reader on the Max plan's
 * included API credits (decided 2026-10-21: included credits only, a hard
 * monthly cap here, no paid overage).
 *
 * Groq's free tier shares one key with the /find agent and read 2–8 videos a
 * day once the frames were counted; Haiku 5.5 reads a 3-frame strip for about
 * a tenth of a cent, so the cap is the only limit that matters. The spend is
 * tallied from each response's own `usage` into .data/tiktok/spend.json, and a
 * month that reaches the cap ends the stage with `AnthropicCap` — the ledger
 * resumes next month, or on Groq.
 */
import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const ANTHROPIC_VISION_MODEL = (process.env.TIKTOK_ANTHROPIC_MODEL ?? '').trim() || 'claude-haiku-5-5';
/** USD per million tokens, input / output — prompts under 100K tokens (claude-api skill, cached 2026-10-06). */
const PRICE: Record<string, [number, number]> = { 'claude-haiku-5-5': [0.1, 0.5], 'claude-sonnet-5-5': [2, 10] };
/** The month's ceiling in USD. The included credits are $100; the lane gets a slice of them. */
export const MONTHLY_CAP_USD = Number(process.env.TIKTOK_API_CAP_USD ?? '10');
const SPEND = join(process.cwd(), 'scripts/crm/.data/tiktok/spend.json');

/** The month's cap is reached — stop asking; the ledger resumes. */
export class AnthropicCap extends Error {}

let key: string | null | undefined;
/** The key, or null when none is stored — the lane then reads on Groq as before. */
export function anthropicKey(): string | null {
  if (key !== undefined) return key;
  key = (process.env.TIKTOK_ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY ?? '').trim() || null;
  if (!key) {
    try {
      // launchd and the Hermes gateway carry no shell profile; the Keychain copy is canonical.
      key = execSync('security find-generic-password -s mkan-ANTHROPIC_API_KEY -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch {
      key = null;
    }
  }
  return key;
}

interface Spend {
  month: string;
  usd: number;
  calls: number;
  inputTokens: number;
  outputTokens: number;
}
const thisMonth = () => new Date().toISOString().slice(0, 7);
export function monthSpend(): Spend {
  const empty: Spend = { month: thisMonth(), usd: 0, calls: 0, inputTokens: 0, outputTokens: 0 };
  if (!existsSync(SPEND)) return empty;
  const s = JSON.parse(readFileSync(SPEND, 'utf8')) as Spend;
  return s.month === empty.month ? s : empty;
}
function addSpend(model: string, input: number, output: number): void {
  const [pin, pout] = PRICE[model] ?? PRICE['claude-sonnet-5-5']!; // an unknown model is costed high, never free
  const s = monthSpend();
  s.usd = Math.round((s.usd + (input * pin + output * pout) / 1e6) * 1e6) / 1e6;
  s.calls++;
  s.inputTokens += input;
  s.outputTokens += output;
  mkdirSync(dirname(SPEND), { recursive: true });
  writeFileSync(`${SPEND}.tmp`, JSON.stringify(s, null, 2));
  renameSync(`${SPEND}.tmp`, SPEND);
}

export interface AnthropicCall {
  prompt: string;
  /** JPEG paths sent inline, in order, before the prompt. */
  images?: string[];
  model?: string;
  maxTokens?: number;
}

let client: Anthropic | null = null;

/** Runs the reader and returns the model's text. Throws `AnthropicCap` once the month is spent. */
export async function runAnthropic(call: AnthropicCall): Promise<string> {
  const k = anthropicKey();
  if (!k) throw new Error('needs an API key — the Keychain item mkan-ANTHROPIC_API_KEY, or ANTHROPIC_API_KEY in .env');
  const spent = monthSpend();
  if (spent.usd >= MONTHLY_CAP_USD) throw new AnthropicCap(`anthropic cap: $${spent.usd.toFixed(2)} of $${MONTHLY_CAP_USD} spent in ${spent.month}`);
  client ??= new Anthropic({ apiKey: k, maxRetries: 3 });
  const model = call.model ?? ANTHROPIC_VISION_MODEL;
  const content: Anthropic.ContentBlockParam[] = [
    ...(call.images ?? []).map(
      (p): Anthropic.ImageBlockParam => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(p).toString('base64') } }),
    ),
    { type: 'text', text: call.prompt },
  ];
  // Extraction, not reasoning: low effort keeps the thinking short. The installed
  // SDK (0.68) predates `output_config`, so it rides on the body untyped.
  const body = { model, max_tokens: call.maxTokens ?? 4000, messages: [{ role: 'user', content }], output_config: { effort: 'low' } };
  let res: Anthropic.Message;
  try {
    res = await client.messages.create(body as unknown as Anthropic.MessageCreateParamsNonStreaming);
  } catch (e) {
    // Out of credits is a cap too — never fall through to paid overage.
    if (e instanceof Anthropic.APIError && (e.status === 402 || /credit balance|billing/i.test(e.message))) throw new AnthropicCap(`anthropic credits: ${e.message.slice(0, 200)}`);
    throw e;
  }
  addSpend(model, res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0) + (res.usage.cache_creation_input_tokens ?? 0), res.usage.output_tokens);
  if (res.stop_reason === 'refusal') throw new Error('anthropic: refused');
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
}
