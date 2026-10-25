import "server-only";

/**
 * Tenants on WhatsApp → the rental agent, inside the container.
 *
 * The webhook (instant) and the outbox poll (every 2 min, the fallback) both
 * call `answerTenant`: it applies the guardrails (scripts/wa/tenant-pure.ts),
 * shows "typing…", runs the turn in-process (whatsapp-chat.ts) and sends the
 * reply. The turn dedupes by message id, so the two paths answer once.
 */
import { tenantDecision, type TenantDecision } from "../../../scripts/wa/tenant-pure";
import { sendPresence, sendText } from "@/lib/whatsapp/evolution";
import { mutateState, readState } from "./wa-state";
import { handleTenantWhatsApp, silenceTenant } from "./whatsapp-chat";

const SENT_KEEP = 2000;

type Sent = { id: string; phone: string; at: string }[];

/** The agent's own message ids — so the echo of a reply is not mistaken for a person typing. */
export async function recordSent(phone: string, id: string | undefined): Promise<void> {
  if (!id) return;
  await mutateState<Sent>("tenant-sent", [], (sent) => [...sent, { id, phone, at: new Date().toISOString() }].slice(-SENT_KEEP));
}

/** A fromMe message in a tenant chat: ours, or a person at Mkan taking over. */
export async function noteFromMe(phone: string, id: string | undefined, at: Date): Promise<void> {
  if (!id || (await readState<Sent>("tenant-sent", [])).some((s) => s.id === id)) return;
  await mutateState<Record<string, string>>("tenant-human", {}, (human) =>
    !human[phone] || new Date(human[phone]!).getTime() < at.getTime() ? { ...human, [phone]: at.toISOString() } : human,
  );
}

/** One phone's messages run in order: a second message waits for the first reply. */
const chains = new Map<string, Promise<unknown>>();

export interface TenantMessage {
  phone: string;
  text: string;
  msgId: string;
  sentAt: Date;
}

const log = (msg: string) => console.log(`[wa] ${msg}`);

/** Answer one tenant message (or skip it, saying why). Never throws. */
export function answerTenant(m: TenantMessage): Promise<TenantDecision | "error" | "sent" | "nothing"> {
  const run = async () => {
    try {
      const now = new Date();
      const [stopped, human, sent] = await Promise.all([
        readState<string[]>("tenant-stop", []),
        readState<Record<string, string>>("tenant-human", {}),
        readState<Sent>("tenant-sent", []),
      ]);
      const hourAgo = now.getTime() - 3_600_000;
      const recent = sent.filter((s) => new Date(s.at).getTime() > hourAgo);
      const decision = tenantDecision({
        text: m.text,
        sentAt: m.sentAt,
        now,
        stopped: stopped.includes(m.phone),
        humanAt: human[m.phone] ? new Date(human[m.phone]!) : null,
        phoneRepliesLastHour: recent.filter((s) => s.phone === m.phone).length,
        lineRepliesLastHour: recent.length,
      });
      if (decision === "stop") {
        await mutateState<string[]>("tenant-stop", [], (list) => [...new Set([...list, m.phone])]);
        await silenceTenant(m.phone);
        log(`tenant +${m.phone} said STOP — silenced`);
        return decision;
      }
      if (decision === "start") {
        await mutateState<string[]>("tenant-stop", [], (list) => list.filter((p) => p !== m.phone));
        log(`tenant +${m.phone} said START`);
      } else if (decision !== "answer") {
        log(`tenant +${m.phone} ${decision}`);
        return decision;
      }
      await sendPresence(m.phone, 4_000);
      const res = await handleTenantWhatsApp({ phone: m.phone, text: m.text, msgId: m.msgId });
      if (!res.reply) {
        log(`tenant +${m.phone} no reply (${"why" in res ? res.why : "none"})`);
        return "nothing";
      }
      const out = await sendText(m.phone, res.reply);
      await recordSent(m.phone, out?.key?.id);
      log(`tenant +${m.phone} answered (${res.reply.length} chars)`);
      return "sent";
    } catch (err) {
      log(`tenant +${m.phone} failed: ${(err as Error).message}`);
      return "error";
    }
  };
  const next = (chains.get(m.phone) ?? Promise.resolve()).then(run, run);
  chains.set(m.phone, next);
  void next.finally(() => {
    if (chains.get(m.phone) === next) chains.delete(m.phone);
  });
  return next;
}
