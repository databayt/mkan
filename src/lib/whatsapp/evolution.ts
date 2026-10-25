/**
 * The Evolution API v2 client for mkan's WhatsApp line (+250780984777).
 *
 * The bridge is the Evolution process inside the hogwarts container, shared
 * through its private `WhatsappBridge` entrypoint (hogwarts cf/worker.js).
 * Only a Worker can hold that service binding, so mkan's Worker forwards
 * `https://www.mkan.sd/__wa/*` to it (cf/worker.js) for callers that carry
 * `x-mkan-wa: $MKAN_WA_BRIDGE_SECRET` — the app in the container, and the Mac
 * scripts (pair, outbox --dry-run). Evolution then checks `apikey`: mkan's
 * own instance token, which opens the `mkan` instance and no other.
 *
 *   MKAN_EVOLUTION_URL       default https://www.mkan.sd/__wa
 *   MKAN_EVOLUTION_KEY       the `mkan` instance's token
 *   MKAN_WA_BRIDGE_SECRET    the Worker's gate
 *   MKAN_EVOLUTION_INSTANCE  default mkan
 *
 * Plain fetch, no server-only: the Mac scripts import it too (scripts/wa/).
 */
import { createHash } from "node:crypto";

const TIMEOUT_MS = 15_000;

const env = (name: string) => (process.env[name] ?? "").trim();
export const evolutionUrl = () => env("MKAN_EVOLUTION_URL").replace(/\/+$/, "") || "https://www.mkan.sd/__wa";
export const INSTANCE = env("MKAN_EVOLUTION_INSTANCE") || "mkan";

export class EvolutionError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "EvolutionError";
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

/** `apikey` overrides the instance token — only `pnpm wa:pair` uses it, with the bridge's admin key, to create the instance. */
async function request<T>(path: string, init: RequestInit & { apikey?: string } = {}): Promise<T> {
  const key = init.apikey ?? env("MKAN_EVOLUTION_KEY");
  if (!key) throw new EvolutionError(0, "no Evolution key (MKAN_EVOLUTION_KEY)");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const url = evolutionUrl();
  try {
    const res = await fetch(`${url}${path}`, {
      ...init,
      signal: controller.signal,
      redirect: "error",
      headers: { "Content-Type": "application/json", apikey: key, "x-mkan-wa": env("MKAN_WA_BRIDGE_SECRET"), ...(init.headers ?? {}) },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new EvolutionError(res.status, `Evolution ${res.status} ${path}: ${body.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  } catch (err) {
    if (err instanceof EvolutionError) throw err;
    throw new EvolutionError(0, `Evolution unreachable at ${url}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Where the bridge posts this instance's events: the app's webhook, behind a
 * token derived from the bridge secret (the URL sits in the bridge's database,
 * so it is not the secret itself).
 */
export const hookToken = () => createHash("sha256").update(`wa-hook:${env("MKAN_WA_BRIDGE_SECRET")}`).digest("hex").slice(0, 32);
export const hookUrl = (base = "https://www.mkan.sd") => `${base}/api/whatsapp/hook/${hookToken()}`;

const digits = (to: string) => to.replace(/[^\d]/g, "").replace(/^00/, "");

export type ConnectionState = "open" | "close" | "connecting" | "unknown";

/** Creates the Baileys instance (QR pairing) with the bridge's admin key; its `hash` is the instance token. */
export async function createInstance(adminKey: string, name = INSTANCE): Promise<{ hash?: string | { apikey?: string } }> {
  return request("/instance/create", {
    method: "POST",
    apikey: adminKey,
    body: JSON.stringify({ instanceName: name, integration: "WHATSAPP-BAILEYS", qrcode: true }),
  });
}

/** The instance's token, read with the admin key — for an instance that already exists. */
export async function instanceToken(adminKey: string, name = INSTANCE): Promise<string | null> {
  const list = await request<Array<{ name?: string; token?: string }>>(`/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`, { apikey: adminKey }).catch(
    (err) => {
      if (err instanceof EvolutionError && err.status === 404) return [];
      throw err;
    },
  );
  return (Array.isArray(list) ? list : []).find((i) => i.name === name)?.token ?? null;
}

export async function connectionState(name = INSTANCE): Promise<ConnectionState> {
  const res = await request<{ instance?: { state?: string }; state?: string }>(`/instance/connectionState/${encodeURIComponent(name)}`);
  const state = res.instance?.state ?? res.state;
  return state === "open" || state === "close" || state === "connecting" ? state : "unknown";
}

export interface QRCode {
  base64: string | null;
  code: string | null;
  pairingCode: string | null;
}

/** Starts (or refreshes) pairing. `number` (digits) also asks for an 8-character pairing code. */
export async function qr(name = INSTANCE, number?: string): Promise<QRCode> {
  const q = number ? `?number=${encodeURIComponent(digits(number))}` : "";
  const res = await request<Partial<QRCode>>(`/instance/connect/${encodeURIComponent(name)}${q}`);
  return { base64: res.base64 ?? null, code: res.code ?? null, pairingCode: res.pairingCode ?? null };
}

export async function sendText(to: string, text: string, name = INSTANCE): Promise<{ key?: { id?: string } }> {
  return request(`/message/sendText/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ number: digits(to), text }),
  });
}

/** One stored message as Evolution v2 returns it from /chat/findMessages and the webhook. */
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
    method: "POST",
    body: JSON.stringify({ where: { messageTimestamp: { gte: since.toISOString(), lte: until.toISOString() } }, page: 1, offset: limit }),
  });
  if (Array.isArray(res)) return res;
  return res.messages?.records ?? [];
}

/** A received photo's bytes (Evolution decrypts the media for us). Null when it is gone or not media. */
export async function mediaBytes(messageId: string, name = INSTANCE): Promise<{ bytes: Buffer; mimetype: string } | null> {
  const res = await request<{ base64?: string; mimetype?: string }>(`/chat/getBase64FromMediaMessage/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
  }).catch(() => null);
  if (!res?.base64) return null;
  return { bytes: Buffer.from(res.base64.replace(/^data:[^;]+;base64,/, ""), "base64"), mimetype: res.mimetype ?? "image/jpeg" };
}

/** Point the instance's MESSAGES_UPSERT events (each new message, both directions) at `url`. */
export async function setWebhook(url: string, name = INSTANCE): Promise<unknown> {
  return request(`/webhook/set/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ webhook: { enabled: true, url, byEvents: false, base64: false, events: ["MESSAGES_UPSERT"] } }),
  });
}

/** "typing…" in the tenant's chat while the agent works. Best effort. */
export async function sendPresence(to: string, delayMs = 3_000, name = INSTANCE): Promise<void> {
  await request(`/chat/sendPresence/${encodeURIComponent(name)}`, {
    method: "POST",
    body: JSON.stringify({ number: digits(to), delay: delayMs, presence: "composing" }),
  }).catch(() => {});
}
