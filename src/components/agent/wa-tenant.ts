import "server-only";

import { createHash } from "node:crypto";

/**
 * Tenants on WhatsApp → the rental agent, inside the container.
 *
 * The webhook (instant) and the outbox poll (every 2 min, the fallback) both
 * call `answerTenant`: it applies the guardrails (scripts/wa/tenant-pure.ts),
 * shows "typing…", runs the turn in-process (whatsapp-chat.ts) and sends the
 * reply. The turn dedupes by message id, so the two paths answer once.
 */
import { MEDIA_NUDGE_MS, tenantDecision, typePleaseText, type TenantDecision } from "../../../scripts/wa/tenant-pure";
import { db } from "@/lib/db";
import { sendPresence, sendText } from "@/lib/whatsapp/evolution";
import { addToList, claimMessage, holdReply, MAX_ANSWER_TRIES, mutateState, readState, releaseMessage, removeFromList, settleMessage, writeState } from "./wa-state";
import { handleTenantWhatsApp, silenceTenant } from "./whatsapp-chat";
import { postSlackCard } from "./whatsapp";

const SENT_KEEP = 2000;

type Sent = { id: string; phone: string; at: string; h?: string }[];

/** A reply's words, hashed: its echo is ours even when it comes back before the send returned its id. */
const textHash = (t: string) => createHash("sha1").update(t.replace(/\s+/g, " ").trim()).digest("hex").slice(0, 12);
/** An echo of the same words this soon after sending is the agent's own, not a person typing. */
const ECHO_WINDOW_MS = 120_000;

/**
 * The agent's own message ids — so the echo of a reply is not mistaken for a person typing. Called
 * with the text before a send (no id yet) and with the id after: a slow send's echo used to arrive
 * first, look like a person taking over, and mute the agent in that chat for 12 h (2026-11-06).
 */
export async function recordSent(phone: string, id: string | undefined, text?: string): Promise<void> {
  if (!id && !text) return;
  const entry = { id: id ?? "", phone, at: new Date().toISOString(), ...(text ? { h: textHash(text) } : {}) };
  await mutateState<Sent>("tenant-sent", [], (sent) => [...sent, entry].slice(-SENT_KEEP));
}

/** A fromMe message in a tenant chat: ours, or a person at Mkan taking over. */
export async function noteFromMe(phone: string, id: string | undefined, at: Date, text?: string): Promise<void> {
  const sent = await readState<Sent>("tenant-sent", []);
  if (!id || sent.some((s) => s.id === id)) return;
  if (text) {
    const h = textHash(text);
    if (sent.some((s) => s.phone === phone && s.h === h && Math.abs(new Date(s.at).getTime() - at.getTime()) < ECHO_WINDOW_MS)) return;
  }
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
  /** A voice note, photo, location… (outbox-pure.ts isMedia): no words to read. */
  media?: boolean;
}

const log = (msg: string) => console.log(`[wa] ${msg}`);

export type TenantOutcome = TenantDecision | "error" | "sent" | "nothing" | "busy" | "duplicate";

/** A reply that could not be sent this long after it was written is handed to a person instead. */
const RESEND_WITHIN_MS = 15 * 60_000;
/** The next message from the same phone waits for this turn's tail (the writer, the broker ask) at most this long. */
const CHAIN_HOLD_MS = 60_000;

/**
 * Answer one tenant message (or skip it, saying why). Never throws.
 *
 * Each message is claimed once (wa-state.ts claimMessage): the webhook and the poll can both bring it,
 * and only one answers. A busy turn gives the claim back so the poll answers it a pass later; a run
 * that dies leaves it to be retried (MAX_ANSWER_TRIES, then a person); a reply that was written but
 * not sent is sent again — never lost, never twice. "busy" and "error" are not final: the poll must
 * not mark that message seen.
 */
export function answerTenant(m: TenantMessage): Promise<TenantOutcome> {
  let hold: Promise<unknown> = Promise.resolve();
  const run = async (): Promise<TenantOutcome> => {
    try {
      const claim = await claimMessage(m.msgId);
      if (!claim) return "duplicate";
      if (claim.mode === "resend") {
        if (Date.now() - new Date(claim.at).getTime() > RESEND_WITHIN_MS) {
          await settleMessage(m.msgId);
          await postSlackCard(`⚠️ A reply to +${m.phone} could not be sent for 15 min — answer by hand:\n> ${claim.text.slice(0, 500).replace(/\n/g, "\n> ")}`).catch(() => {});
          log(`tenant +${m.phone} reply handed to a person after failed sends`);
          return "error";
        }
        await recordSent(m.phone, undefined, claim.text);
        const out = await sendText(m.phone, claim.text);
        await recordSent(m.phone, out?.key?.id, claim.text);
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} answered on a re-send (${claim.text.length} chars)`);
        return "sent";
      }
      if (claim.tries > MAX_ANSWER_TRIES) {
        await settleMessage(m.msgId);
        await postSlackCard(`⚠️ The agent failed ${MAX_ANSWER_TRIES} times on a message from +${m.phone} — answer by hand:\n> ${m.text.slice(0, 500).replace(/\n/g, "\n> ")}`).catch(() => {});
        log(`tenant +${m.phone} handed to a person after ${MAX_ANSWER_TRIES} failed tries`);
        return "error";
      }
      const now = new Date();
      const [stopped, human, sent] = await Promise.all([
        readState<string[]>("tenant-stop", []),
        readState<Record<string, string>>("tenant-human", {}),
        readState<Sent>("tenant-sent", []),
      ]);
      const hourAgo = now.getTime() - 3_600_000;
      // Sent replies only (they carry an id): the pre-send echo marks would count every reply twice.
      const recent = sent.filter((s) => s.id && new Date(s.at).getTime() > hourAgo);
      const decision = tenantDecision({
        text: m.text,
        sentAt: m.sentAt,
        now,
        stopped: stopped.includes(m.phone),
        humanAt: human[m.phone] ? new Date(human[m.phone]!) : null,
        phoneRepliesLastHour: recent.filter((s) => s.phone === m.phone).length,
        lineRepliesLastHour: recent.length,
        media: m.media,
      });
      if (decision === "stop") {
        await addToList("tenant-stop", m.phone);
        await silenceTenant(m.phone);
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} said STOP — silenced`);
        return decision;
      }
      if (decision === "media") {
        // Once an hour per chat: "please type", in the language the chat was last in.
        const nudgeKey = `tmedia:${m.phone}`;
        const last = await readState<{ at?: string }>(nudgeKey, {});
        if (last.at && Date.now() - new Date(last.at).getTime() < MEDIA_NUDGE_MS) {
          await settleMessage(m.msgId);
          return "nothing";
        }
        const task = await db.agentTask.findFirst({ where: { profile: { waPhone: `+${m.phone}` } }, orderBy: { updatedAt: "desc" }, select: { locale: true } }).catch(() => null);
        const text = typePleaseText(task?.locale ?? "en");
        await holdReply(m.msgId, text, claim.tries);
        await recordSent(m.phone, undefined, text);
        const out = await sendText(m.phone, text);
        await recordSent(m.phone, out?.key?.id, text);
        await writeState(nudgeKey, { at: new Date().toISOString() });
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} sent media — asked to type`);
        return "sent";
      }
      if (decision === "start") {
        await removeFromList("tenant-stop", m.phone);
        log(`tenant +${m.phone} said START`);
      } else if (decision !== "answer") {
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} ${decision}`);
        return decision;
      }
      const res = await handleTenantWhatsApp({ phone: m.phone, text: m.text, msgId: m.msgId, retry: claim.mode === "retry", onAnswering: () => void sendPresence(m.phone, 4_000).catch(() => {}) });
      if ("done" in res && res.done) hold = res.done;
      if (!res.reply) {
        const why = "why" in res ? res.why : "none";
        if (why === "busy") {
          // Not appended: the poll answers it once the last turn is done.
          await releaseMessage(m.msgId);
          log(`tenant +${m.phone} busy — left for the next pass`);
          return "busy";
        }
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} no reply (${why})`);
        return "nothing";
      }
      await holdReply(m.msgId, res.reply, claim.tries);
      await recordSent(m.phone, undefined, res.reply);
      const out = await sendText(m.phone, res.reply);
      await recordSent(m.phone, out?.key?.id, res.reply);
      await settleMessage(m.msgId);
      log(`tenant +${m.phone} answered (${res.reply.length} chars)`);
      return "sent";
    } catch (err) {
      // The claim stays: "working" goes stale and is retried, "reply" is re-sent.
      log(`tenant +${m.phone} failed: ${(err as Error).message}`);
      return "error";
    }
  };
  const next = (chains.get(m.phone) ?? Promise.resolve()).then(run, run);
  // The phone's next message waits for this turn to finish, not just for its first reply.
  const held = next.then(() => Promise.race([hold.catch(() => {}), new Promise((r) => setTimeout(r, CHAIN_HOLD_MS))]));
  chains.set(m.phone, held);
  void held.finally(() => {
    if (chains.get(m.phone) === held) chains.delete(m.phone);
  });
  return next;
}
