import "server-only";

/**
 * Outbound WhatsApp for the rental agent.
 *
 * With `MKAN_WA_OUTBOX=1` every message is a row in `OutboundMessage`: the
 * Worker cannot reach the Evolution instance on the Mac, so the Mac drains the
 * outbox (`scripts/wa/outbox.ts`) under its caps — a daily total, one message
 * per broker per day, quiet hours — and falls back to a #mkan wa.me card
 * itself after three failed tries.
 *
 * Without it (the line is not paired yet) a #mkan Slack card with a one-tap
 * wa.me link goes out at once, and outbox rows are still written as SKIPPED so
 * the funnel counts every ask.
 * Slack: SLACK_BOT_TOKEN + SLACK_HOME_CHANNEL (default #mkan).
 */
import type { OutboundKind } from "@prisma/client";
import { db } from "@/lib/db";
import { waLink } from "../../../scripts/crm/public-links";

const DEFAULT_SLACK_CHANNEL = "C0BS2NZE2AY";

/** "queued": the Mac sends it; "manual": a person taps the wa.me link in #mkan. */
export type SendChannel = "queued" | "manual";

const outboxOn = () => process.env.MKAN_WA_OUTBOX?.trim() === "1";

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

export interface Outgoing {
  kind: OutboundKind;
  to: string;
  body: string;
  /** Who it is for, on the Slack card: "@handle", an agency name, "tenant". */
  label: string;
  brokerId?: string | null;
  tenantRequestId?: string | null;
  brokerRequestIds?: string[];
  tokenHash?: string | null;
}

/**
 * Send several messages. Queued for the Mac when the outbox is on; otherwise
 * one #mkan card carries every wa.me link, under `heading`.
 */
export async function sendMessages(messages: Outgoing[], heading: string): Promise<SendChannel> {
  if (messages.length === 0) return outboxOn() ? "queued" : "manual";
  const on = outboxOn();
  await db.outboundMessage.createMany({
    data: messages.map((m) => ({
      kind: m.kind,
      to: m.to,
      body: m.body,
      label: m.label,
      brokerId: m.brokerId ?? null,
      tenantRequestId: m.tenantRequestId ?? null,
      brokerRequestIds: m.brokerRequestIds ?? [],
      tokenHash: m.tokenHash ?? null,
      ...(on ? {} : { status: "SKIPPED" as const, error: "manual: slack card" }),
    })),
  });
  if (on) return "queued";
  const lines = messages.map((m) => `• *${m.label}* — ${waLink(m.to, m.body)}`);
  await postSlackCard(`:house: *${heading}* — tap to send on WhatsApp:\n${lines.join("\n")}`);
  return "manual";
}

/**
 * Send one message to a broker about homes already on Mkan (availability, a
 * chosen viewing time). Returns the lane it went through.
 */
export async function sendToBroker(phone: string, text: string, label: string, brokerRequestIds: string[] = []): Promise<SendChannel> {
  return sendMessages([{ kind: "BROKER_REQUEST", to: phone, body: text, label, brokerRequestIds }], `Rental agent → ${label}`);
}
