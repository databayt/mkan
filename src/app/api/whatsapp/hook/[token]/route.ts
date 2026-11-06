import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { isDirectChat } from "../../../../../../scripts/wa/tenant-pure";
import { isMedia, messageText, phoneKey, senderPhone } from "../../../../../../scripts/wa/outbox-pure";
import { answerTenant, noteFromMe } from "@/components/agent/wa-tenant";
import { kickOutbox } from "@/components/agent/wa-outbox";
import { claimMessage, settleMessage } from "@/components/agent/wa-state";
import { postSlackCard } from "@/components/agent/whatsapp";
import { db } from "@/lib/db";
import { hookToken, INSTANCE, type EvoMessage } from "@/lib/whatsapp/evolution";

/**
 * The Mkan line's webhook: the shared bridge (hogwarts' Evolution) posts each
 * new message here (MESSAGES_UPSERT, set by `pnpm wa:pair`). A tenant's
 * message is answered at once; a person at Mkan typing in a tenant's chat
 * pauses the agent there. Brokers are left to the outbox poll, which reads an
 * album and its caption as one reply (wa-outbox.ts).
 *
 * The path token comes from MKAN_WA_BRIDGE_SECRET (evolution.ts hookToken).
 */
export const dynamic = "force-dynamic";

const MAX_BODY = 512 * 1024;

function allowed(token: string): boolean {
  if (!process.env.MKAN_WA_BRIDGE_SECRET?.trim()) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(hookToken());
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Broker numbers, refreshed every 10 minutes — the directory changes daily, not
 * per message. Whoever posted a home we ask about counts too, so a broker's
 * "yes" never reaches the tenant agent.
 */
let brokers: { at: number; phones: Set<string> } = { at: 0, phones: new Set() };
async function isBroker(phone: string): Promise<boolean> {
  if (Date.now() - brokers.at > 10 * 60_000) {
    const [rows, posters] = await Promise.all([
      db.broker.findMany({ select: { phones: true } }),
      db.listingBroker.findMany({ select: { user: { select: { phoneNumber: true } } } }),
    ]);
    const all = [...rows.flatMap((b) => b.phones), ...posters.map((p) => p.user.phoneNumber ?? "")].filter(Boolean);
    brokers = { at: Date.now(), phones: new Set(all.map(phoneKey)) };
  }
  return brokers.phones.has(phone);
}

/** Evolution v2 posts `{ event, instance, data }`; data is one message or a list. */
function messagesOf(payload: unknown): EvoMessage[] {
  const p = payload as { event?: string; data?: EvoMessage | EvoMessage[] | { messages?: EvoMessage[] } };
  if (p?.event && !/messages[._]upsert/i.test(p.event)) return [];
  const d = p?.data;
  if (Array.isArray(d)) return d;
  if (d && "messages" in d && Array.isArray(d.messages)) return d.messages;
  return d ? [d as EvoMessage] : [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function handle(m: EvoMessage) {
  const key = m.key;
  if (!key?.id || !isDirectChat(key.remoteJid)) return;
  const phone = senderPhone(key);
  if (!phone) {
    // WhatsApp hides some senders' numbers (an @lid with no number on it): the agent cannot answer one
    // yet, so a person does, from the phone — it used to be dropped without a word (2026-11-06).
    if (!key.fromMe && key.remoteJid?.endsWith("@lid") && (await claimMessage(key.id))) {
      await settleMessage(key.id);
      await postSlackCard(`📵 Someone with a hidden number wrote to the Mkan line — the agent can't answer them; reply from the phone:\n> ${(messageText(m.message) || "[photo or voice note]").slice(0, 400).replace(/\n/g, "\n> ")}`).catch(() => {});
    }
    return;
  }
  // A broker's message is read by the outbox pass (album grouping, quoted asks, the seen list): one
  // runs a few seconds from now, so a burst of photos and its caption are read together.
  if (await isBroker(phone)) {
    kickOutbox("broker-message", 8_000);
    return;
  }
  const ts = Number(m.messageTimestamp ?? 0);
  const sentAt = ts > 0 ? new Date(ts * 1000) : new Date();
  if (key.fromMe) {
    // The echo of the agent's own reply can arrive before sendText returns and its id is recorded.
    await sleep(10_000);
    await noteFromMe(phone, key.id, sentAt, messageText(m.message));
    return;
  }
  // Claimed once in answerTenant (wa-state.ts claimMessage): the poll that brings the same message
  // finds it answered — and one the webhook could not finish (a busy turn, an error) it answers itself.
  await answerTenant({ phone, text: messageText(m.message), msgId: key.id, sentAt, media: isMedia(m.message, m.messageType) });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  // Evolution appends the event name to the path when byEvents is on; the token is the first segment either way.
  const { token } = await params;
  if (!allowed(token)) return new NextResponse(null, { status: 404 });
  const raw = await request.text();
  if (raw.length > MAX_BODY) return new NextResponse(null, { status: 413 });
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true });
  }
  // The bridge is shared: an event for another instance is not this line's (2026-11-06).
  const instance = (payload as { instance?: unknown })?.instance;
  if (typeof instance === "string" && instance && instance !== INSTANCE) return NextResponse.json({ ok: true });
  // Answer the bridge at once; the agent's turn takes seconds.
  after(async () => {
    for (const m of messagesOf(payload)) await handle(m).catch((err) => console.error(`[wa] hook: ${(err as Error).message}`));
  });
  return NextResponse.json({ ok: true });
}
