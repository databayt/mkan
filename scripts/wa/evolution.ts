/**
 * A minimal Evolution API v2 client for the Mac sender — the calls the outbox
 * drain and the pairing script need, in the shape of
 * hogwarts/src/lib/whatsapp/evolution-client.ts.
 *
 *   MKAN_EVOLUTION_URL       default http://127.0.0.1:8081 (ops/evolution)
 *   MKAN_EVOLUTION_KEY       or EVOLUTION_API_KEY, else Keychain mkan-EVOLUTION_API_KEY
 *   MKAN_EVOLUTION_INSTANCE  default mkan
 */
import { execSync } from 'node:child_process';

const TIMEOUT_MS = 15_000;

export const EVOLUTION_URL = (process.env.MKAN_EVOLUTION_URL ?? '').trim().replace(/\/+$/, '') || 'http://127.0.0.1:8081';
export const INSTANCE = (process.env.MKAN_EVOLUTION_INSTANCE ?? '').trim() || 'mkan';

let cachedKey: string | null = null;
export function evolutionKey(): string {
  if (cachedKey != null) return cachedKey;
  cachedKey = (process.env.MKAN_EVOLUTION_KEY ?? process.env.EVOLUTION_API_KEY ?? '').trim();
  if (!cachedKey) {
    try {
      cachedKey = execSync('security find-generic-password -s mkan-EVOLUTION_API_KEY -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      cachedKey = '';
    }
  }
  return cachedKey;
}

export class EvolutionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'EvolutionError';
  }
}

/**
 * True when the bridge itself is the problem — unreachable, timing out, 5xx,
 * or the instance/key gone — rather than this one message. The drain stops
 * on these without burning the row's attempts.
 */
export function isBridgeDown(err: unknown): boolean {
  if (err instanceof EvolutionError) return err.status === 0 || err.status >= 500 || [401, 403, 404].includes(err.status);
  return true;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = evolutionKey();
  if (!key) throw new EvolutionError(0, 'no Evolution API key (MKAN_EVOLUTION_KEY / Keychain mkan-EVOLUTION_API_KEY)');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${EVOLUTION_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', apikey: key, ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new EvolutionError(res.status, `Evolution ${res.status} ${path}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof EvolutionError) throw err;
    throw new EvolutionError(0, `Evolution unreachable at ${EVOLUTION_URL}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

export type ConnectionState = 'open' | 'close' | 'connecting' | 'unknown';

/** The instance if it exists, else null. */
export async function fetchInstance(name = INSTANCE): Promise<{ name: string; connectionStatus?: string } | null> {
  const list = await request<Array<{ name?: string; instance?: { instanceName?: string } ; connectionStatus?: string }>>(
    `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
  ).catch((err) => {
    if (err instanceof EvolutionError && err.status === 404) return [];
    throw err;
  });
  const hit = (Array.isArray(list) ? list : []).find((i) => (i.name ?? i.instance?.instanceName) === name);
  return hit ? { name, connectionStatus: hit.connectionStatus } : null;
}

/** Creates a Baileys instance with QR pairing and no webhook (nothing public to call). */
export async function createInstance(name = INSTANCE): Promise<unknown> {
  return request('/instance/create', {
    method: 'POST',
    body: JSON.stringify({ instanceName: name, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
  });
}

export async function connectionState(name = INSTANCE): Promise<ConnectionState> {
  const res = await request<{ instance?: { state?: string }; state?: string }>(`/instance/connectionState/${encodeURIComponent(name)}`);
  const state = res.instance?.state ?? res.state;
  return state === 'open' || state === 'close' || state === 'connecting' ? state : 'unknown';
}

export interface QRCode {
  base64: string | null;
  code: string | null;
  pairingCode: string | null;
}

/** Starts (or refreshes) pairing. `number` (digits) also asks for an 8-character pairing code. */
export async function qr(name = INSTANCE, number?: string): Promise<QRCode> {
  const q = number ? `?number=${encodeURIComponent(number.replace(/[^\d]/g, ''))}` : '';
  const res = await request<Partial<QRCode>>(`/instance/connect/${encodeURIComponent(name)}${q}`);
  return { base64: res.base64 ?? null, code: res.code ?? null, pairingCode: res.pairingCode ?? null };
}

export async function sendText(to: string, text: string, name = INSTANCE): Promise<{ key?: { id?: string } }> {
  return request(`/message/sendText/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: JSON.stringify({ number: to.replace(/[^\d]/g, '').replace(/^00/, ''), text }),
  });
}

/** One stored message as Evolution v2 returns it from /chat/findMessages. */
export interface EvoMessage {
  id?: string;
  key?: { id?: string; fromMe?: boolean; remoteJid?: string; remoteJidAlt?: string; senderPn?: string; participant?: string };
  pushName?: string | null;
  messageType?: string;
  message?: Record<string, unknown> | null;
  messageTimestamp?: number | string;
}

/** Messages stored in [since, until], newest first, up to `limit`. Both directions — filter `key.fromMe` yourself. */
export async function findMessages(since: Date, until: Date, limit = 200, name = INSTANCE): Promise<EvoMessage[]> {
  const res = await request<{ messages?: { records?: EvoMessage[] } } | EvoMessage[]>(`/chat/findMessages/${encodeURIComponent(name)}`, {
    method: 'POST',
    body: JSON.stringify({ where: { messageTimestamp: { gte: since.toISOString(), lte: until.toISOString() } }, page: 1, offset: limit }),
  });
  if (Array.isArray(res)) return res;
  return res.messages?.records ?? [];
}
