import "server-only";

/**
 * Outbound WhatsApp for the rental agent — Evolution API when mkan has a paired
 * instance, a #mkan Slack card with a one-tap wa.me link when it does not.
 *
 * Evolution (the Baileys bridge hogwarts embeds) is switched on by three env
 * vars; any missing one, any failure, or the daily cap reached falls back to
 * the human lane rather than dropping the message:
 *   MKAN_EVOLUTION_URL       e.g. http://127.0.0.1:8080 (no trailing slash)
 *   MKAN_EVOLUTION_KEY       the instance's `apikey`
 *   MKAN_EVOLUTION_INSTANCE  the paired instance name (a phone scanned its QR)
 *   MKAN_EVOLUTION_DAILY_CAP optional, default 40 — a fresh number that sends
 *                            too much to strangers gets banned by WhatsApp
 * Slack: SLACK_BOT_TOKEN + SLACK_HOME_CHANNEL (default #mkan).
 */
import { db } from "@/lib/db";
import { waLink } from "../../../scripts/crm/public-links";

const DEFAULT_DAILY_CAP = 40;
const DEFAULT_SLACK_CHANNEL = "C0BS2NZE2AY";
const TIMEOUT_MS = 10_000;

export type SendChannel = "evolution" | "manual";

function evolutionConfig() {
  const url = process.env.MKAN_EVOLUTION_URL?.trim().replace(/\/+$/, "");
  const key = process.env.MKAN_EVOLUTION_KEY?.trim();
  const instance = process.env.MKAN_EVOLUTION_INSTANCE?.trim();
  return url && key && instance ? { url, key, instance } : null;
}

async function underDailyCap(): Promise<boolean> {
  const cap = Number(process.env.MKAN_EVOLUTION_DAILY_CAP) || DEFAULT_DAILY_CAP;
  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);
  // Requests of one message share a sentAt, so count distinct send instants.
  const sends = await db.brokerRequest.groupBy({ by: ["brokerUserId", "sentAt"], where: { channel: "evolution", sentAt: { gte: since } } });
  return sends.length < cap;
}

async function sendEvolution(phone: string, text: string): Promise<boolean> {
  const cfg = evolutionConfig();
  if (!cfg || !(await underDailyCap())) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.url}/message/sendText/${encodeURIComponent(cfg.instance)}`, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", apikey: cfg.key },
      body: JSON.stringify({ number: phone.replace(/[^\d]/g, ""), text }),
    });
    if (!res.ok) console.warn(`[agent] evolution ${res.status} — falling back to the manual lane`);
    return res.ok;
  } catch (err) {
    console.warn(`[agent] evolution failed — falling back to the manual lane: ${(err as Error).message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function postSlackCard(text: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN?.trim();
  if (!token) {
    console.warn(`[agent] no SLACK_BOT_TOKEN — manual send not posted:\n${text}`);
    return;
  }
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: process.env.SLACK_HOME_CHANNEL?.trim() || DEFAULT_SLACK_CHANNEL, text, unfurl_links: false }),
  }).catch(() => null);
  const json = (await res?.json().catch(() => ({}))) as { ok?: boolean; error?: string } | undefined;
  if (!json?.ok) console.warn(`[agent] slack: ${json?.error ?? "unreachable"}`);
}

/**
 * Send one message to a broker. Returns the lane it went through; "manual"
 * means a person must tap the wa.me link in #mkan before the broker sees it.
 */
export async function sendToBroker(phone: string, text: string, label: string): Promise<SendChannel> {
  if (await sendEvolution(phone, text)) return "evolution";
  await postSlackCard(`:house: *Rental agent → ${label}* — tap to send on WhatsApp:\n${waLink(phone, text)}`);
  return "manual";
}
