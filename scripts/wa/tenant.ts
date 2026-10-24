/**
 * Tenants on WhatsApp → the rental agent, from the Mac.
 *
 * Both the inbox server (webhook, instant) and the outbox drain (poll, every
 * 2 min — the fallback) call `answerTenant`. The Worker runs the turn at
 * POST https://www.mkan.sd/api/agent/whatsapp and returns the reply; this
 * shows "typing…", sends the reply and remembers what it sent. The Worker
 * dedupes by message id, so the two paths answer a message once.
 *
 * State lives next to the outbox's (scripts/crm/.data/wa/):
 *   tenant-stop.json   phones that said STOP (START removes them)
 *   tenant-human.json  when a person last typed in a chat from Mkan's side
 *   tenant-sent.json   ids and times of the agent's own replies — a fromMe
 *                      message not in it was typed by a person
 *
 * Secret: MKAN_WA_BRIDGE_SECRET, else Keychain cf-mkan-MKAN_WA_BRIDGE_SECRET.
 * Target: MKAN_WA_AGENT_URL (default https://www.mkan.sd/api/agent/whatsapp;
 * the apex redirects, and a redirected POST loses its body).
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { sendPresence, sendText } from './evolution';
import { tenantDecision, type TenantDecision } from './tenant-pure';

const DATA = join(__dirname, '..', 'crm', '.data', 'wa');
const STOP = join(DATA, 'tenant-stop.json');
const HUMAN = join(DATA, 'tenant-human.json');
const SENT = join(DATA, 'tenant-sent.json');
const SENT_KEEP = 2000;
const AGENT_TIMEOUT_MS = 30_000;

export const AGENT_URL = (process.env.MKAN_WA_AGENT_URL ?? '').trim() || 'https://www.mkan.sd/api/agent/whatsapp';

let cachedSecret: string | null = null;
function bridgeSecret(): string {
  if (cachedSecret != null) return cachedSecret;
  cachedSecret = (process.env.MKAN_WA_BRIDGE_SECRET ?? '').trim();
  if (!cachedSecret) {
    try {
      cachedSecret = execSync('security find-generic-password -s cf-mkan-MKAN_WA_BRIDGE_SECRET -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      cachedSecret = '';
    }
  }
  return cachedSecret;
}

function readJson<T>(file: string, empty: T): T {
  try {
    return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as T) : empty;
  } catch {
    return empty;
  }
}
function writeJson(file: string, value: unknown) {
  mkdirSync(DATA, { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

type Sent = { id: string; phone: string; at: string }[];

/** The agent's own message ids — so the echo of a reply is not mistaken for a person typing. */
export function recordSent(phone: string, id: string | undefined) {
  if (!id) return;
  const sent = readJson<Sent>(SENT, []);
  sent.push({ id, phone, at: new Date().toISOString() });
  writeJson(SENT, sent.slice(-SENT_KEEP));
}

/** A fromMe message in a tenant chat: ours, or a person at Mkan taking over. */
export function noteFromMe(phone: string, id: string | undefined, at: Date) {
  if (!id || readJson<Sent>(SENT, []).some((s) => s.id === id)) return;
  const human = readJson<Record<string, string>>(HUMAN, {});
  if (!human[phone] || new Date(human[phone]!).getTime() < at.getTime()) {
    human[phone] = at.toISOString();
    writeJson(HUMAN, human);
  }
}

async function callAgent(body: Record<string, unknown>): Promise<{ reply: string | null; why?: string }> {
  const secret = bridgeSecret();
  if (!secret) throw new Error('no MKAN_WA_BRIDGE_SECRET (env or Keychain cf-mkan-MKAN_WA_BRIDGE_SECRET)');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT_MS);
  try {
    const res = await fetch(AGENT_URL, {
      method: 'POST',
      signal: controller.signal,
      redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`agent ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return (await res.json()) as { reply: string | null; why?: string };
  } finally {
    clearTimeout(timer);
  }
}

/** One phone's messages run in order: a second message waits for the first reply. */
const chains = new Map<string, Promise<unknown>>();

export interface TenantMessage {
  phone: string;
  text: string;
  msgId: string;
  sentAt: Date;
}

/** Answer one tenant message (or skip it, saying why). Never throws. */
export function answerTenant(m: TenantMessage, log: (s: string) => void = console.log): Promise<TenantDecision | 'error' | 'sent' | 'nothing'> {
  const run = async () => {
    const now = new Date();
    const stopped = new Set(readJson<string[]>(STOP, []));
    const human = readJson<Record<string, string>>(HUMAN, {});
    const hourAgo = now.getTime() - 3_600_000;
    const recent = readJson<Sent>(SENT, []).filter((s) => new Date(s.at).getTime() > hourAgo);
    const decision = tenantDecision({
      text: m.text,
      sentAt: m.sentAt,
      now,
      stopped: stopped.has(m.phone),
      humanAt: human[m.phone] ? new Date(human[m.phone]!) : null,
      phoneRepliesLastHour: recent.filter((s) => s.phone === m.phone).length,
      lineRepliesLastHour: recent.length,
    });
    try {
      if (decision === 'stop') {
        stopped.add(m.phone);
        writeJson(STOP, [...stopped]);
        await callAgent({ phone: m.phone, msgId: m.msgId, stop: true });
        log(`tenant +${m.phone} said STOP — silenced`);
        return decision;
      }
      if (decision === 'start') {
        stopped.delete(m.phone);
        writeJson(STOP, [...stopped]);
        log(`tenant +${m.phone} said START`);
      } else if (decision !== 'answer') {
        log(`tenant +${m.phone} ${decision}: ${m.text.slice(0, 60).replace(/\s+/g, ' ')}`);
        return decision;
      }
      await sendPresence(m.phone, 4_000);
      const res = await callAgent({ phone: m.phone, text: m.text, msgId: m.msgId });
      if (!res.reply) {
        log(`tenant +${m.phone} no reply (${res.why ?? 'none'})`);
        return 'nothing';
      }
      const sent = await sendText(m.phone, res.reply);
      recordSent(m.phone, sent?.key?.id);
      log(`tenant +${m.phone} answered (${res.reply.length} chars)`);
      return 'sent';
    } catch (err) {
      log(`tenant +${m.phone} failed: ${(err as Error).message}`);
      return 'error';
    }
  };
  const next = (chains.get(m.phone) ?? Promise.resolve()).then(run, run);
  chains.set(m.phone, next);
  void next.finally(() => {
    if (chains.get(m.phone) === next) chains.delete(m.phone);
  });
  return next;
}
