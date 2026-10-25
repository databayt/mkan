import { timingSafeEqual } from "node:crypto";
import { after, NextResponse, type NextRequest } from "next/server";
import { isDirectChat } from "../../../../../../scripts/wa/tenant-pure";
import { messageText, phoneKey, senderPhone } from "../../../../../../scripts/wa/outbox-pure";
import { mutateState } from "@/components/agent/wa-state";
import { answerTenant, noteFromMe } from "@/components/agent/wa-tenant";
import { db } from "@/lib/db";
import { hookToken, type EvoMessage } from "@/lib/whatsapp/evolution";

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

/** Broker numbers, refreshed every 10 minutes — the directory changes daily, not per message. */
let brokers: { at: number; phones: Set<string> } = { at: 0, phones: new Set() };
async function isBroker(phone: string): Promise<boolean> {
  if (Date.now() - brokers.at > 10 * 60_000) {
    const rows = await db.broker.findMany({ select: { phones: true } });
    brokers = { at: Date.now(), phones: new Set(rows.flatMap((b) => b.phones.map(phoneKey))) };
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
  if (!phone || (await isBroker(phone))) return;
  const ts = Number(m.messageTimestamp ?? 0);
  const sentAt = ts > 0 ? new Date(ts * 1000) : new Date();
  if (key.fromMe) {
    // The echo of the agent's own reply can arrive before sendText returns and its id is recorded.
    await sleep(10_000);
    await noteFromMe(phone, key.id, sentAt);
    return;
  }
  // The poll skips what the webhook already answered.
  await mutateState<string[]>("seen", [], (list) => (list.includes(key.id!) ? list : [...list, key.id!]));
  await answerTenant({ phone, text: messageText(m.message), msgId: key.id, sentAt });
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
  // Answer the bridge at once; the agent's turn takes seconds.
  after(async () => {
    for (const m of messagesOf(payload)) await handle(m).catch((err) => console.error(`[wa] hook: ${(err as Error).message}`));
  });
  return NextResponse.json({ ok: true });
}
