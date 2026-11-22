import "server-only";

/**
 * The rental agent in TikTok DMs (2026-11-22). A person writes to @mkan.rw; the Mac (`pnpm tt:inbox`) reads the
 * inbox, waits out the burst and POSTs the new lines to /api/agent/tiktok, which lands here: ONE turn through the
 * same brain WhatsApp uses (whatsapp-chat.ts handleTenantWhatsApp) for the handle's pseudo number
 * (tiktok-channel-pure.ts), and the reply goes back as text for the Mac to type. A DM to the brand account is a
 * tenant, so the first-contact classifier (contact-kind.ts) is not asked.
 *
 * Each turn is claimed once (`tmsg:tt-<id>`): the reply is held until the Mac confirms it typed it (`ack`), so a
 * failed type is re-sent from the held text and a typed one is never answered twice.
 */
import { addToList, claimMessage, holdReply, MAX_ANSWER_TRIES, mutateState, readState, releaseMessage, removeFromList, settleMessage } from "./wa-state";
import { rememberHandle } from "./tiktok-channel";
import { cleanHandle, dmReply, turnOf, ttDigits, type TtLine } from "./tiktok-channel-pure";
import { homeForVideoId } from "./tiktok-link";
import { handleTenantWhatsApp, silenceTenant } from "./whatsapp-chat";
import { postSlackCard } from "./whatsapp";
import { saidJustNow, startText, stopConfirmText, stoppedAt, tenantDecision, textHash, type Sent } from "../../../scripts/wa/tenant-pure";
import { waLang } from "./whatsapp-format";

export type TtResult = { reply: string | null; why?: string; taskId?: string | null; /** What to `ack` once the reply is typed. */ ackId?: string };

/** Lines per request: a burst is a few; more is a bug or an abuse. */
export const MAX_LINES = 30;
const MAX_LINE = 1_000;

/** One turn for a handle's new lines. Never throws: a failure is a `why`, and the Mac tries again on its next run. */
export async function answerTikTok(input: { handle: string; lines: TtLine[] }): Promise<TtResult> {
  const handle = cleanHandle(input.handle);
  if (!handle) return { reply: null, why: "bad-handle" };
  const lines = input.lines.slice(-MAX_LINES).map((l) => ({ ...l, text: String(l.text ?? "").slice(0, MAX_LINE) }));
  try {
    const phone = await rememberHandle(handle);
    const digits = ttDigits(phone);

    // A shared video is its home: Mkan's own post (or the broker's video, or the ad), looked up once per video.
    const homes = new Map<string, number | null>();
    for (const id of new Set(lines.map((l) => l.videoId).filter((x): x is string => !!x && /^\d{8,25}$/.test(x)))) homes.set(id, await homeForVideoId(id).catch(() => null));
    const turn = turnOf(lines.map((l) => (l.videoId && !homes.has(l.videoId) ? { ...l, videoId: null } : l)), homes);
    if (!turn) return { reply: null, why: "empty" };

    const claim = await claimMessage(turn.msgId);
    if (!claim) return { reply: null, why: "duplicate" };
    if (claim.mode === "held") return { reply: null, why: "held" };
    if (claim.mode === "resend") return { reply: claim.text, why: "resend", ackId: turn.msgId };
    if (claim.tries > MAX_ANSWER_TRIES) {
      await settleMessage(turn.msgId);
      await postSlackCard(`⚠️ The agent failed ${MAX_ANSWER_TRIES} times on a TikTok DM from @${handle} — answer by hand:\n> ${turn.text.slice(0, 500).replace(/\n/g, "\n> ")}`).catch(() => {});
      return { reply: null, why: "gave-up" };
    }

    const [stopped, human] = await Promise.all([readState<string[]>("tenant-stop", []), readState<Record<string, string>>("tenant-human", {})]);
    const now = new Date();
    const decision = tenantDecision({
      text: turn.text,
      // Not "old": the Mac may find a DM hours late, and a late answer beats none.
      sentAt: now,
      now,
      stopped: stoppedAt(stopped, [digits]),
      humanAt: human[digits] ? new Date(human[digits]!) : null,
      phoneRepliesLastHour: 0,
      lineRepliesLastHour: 0,
    });
    const lang = waLang(turn.text);
    if (decision === "stop") {
      await addToList("tenant-stop", digits);
      await silenceTenant(phone);
      return held(turn.msgId, stopConfirmText(lang), claim.tries);
    }
    if (decision === "start") {
      await removeFromList("tenant-stop", digits);
      return held(turn.msgId, startText(lang), claim.tries);
    }
    if (decision !== "answer") {
      await settleMessage(turn.msgId);
      return { reply: null, why: decision };
    }

    const res = await handleTenantWhatsApp({ phone, text: turn.text, msgId: turn.msgId, retry: claim.mode === "retry", tiktok: handle });
    if (!res.reply) {
      const why = "why" in res ? res.why : "none";
      if (why === "busy") {
        await releaseMessage(turn.msgId);
        return { reply: null, why: "busy" };
      }
      if (why === "held") return { reply: null, why: "held" };
      await settleMessage(turn.msgId);
      return { reply: null, why };
    }
    const reply = dmReply(res.reply);
    if (!reply) {
      await settleMessage(turn.msgId);
      return { reply: null, why: "empty-reply" };
    }
    // The same words as a moment ago read as a machine (wa-tenant.ts): said once.
    const sent = await readState<Sent>("tenant-sent", []);
    if (saidJustNow(sent, digits, reply, Date.now())) {
      await settleMessage(turn.msgId);
      return { reply: null, why: "repeat" };
    }
    return { ...(await held(turn.msgId, reply, claim.tries)), taskId: res.taskId };
  } catch (err) {
    console.warn(`[tiktok] @${handle} failed: ${(err as Error).message}`);
    return { reply: null, why: "error" };
  }
}

/** Hold the reply: a failed type is re-sent from it, and the Mac's `ack` settles it. */
async function held(msgId: string, reply: string, tries: number): Promise<TtResult> {
  await holdReply(msgId, reply, tries);
  return { reply, ackId: msgId };
}

/** The Mac typed the reply: settle the claim (no pass sends it again) and record the words as the agent's own (a repeat is not sent twice). */
export async function ackTikTok(handle: string, ackIds: string[], text?: string): Promise<void> {
  const h = cleanHandle(handle);
  for (const id of ackIds.slice(0, 5)) await settleMessage(id);
  if (!h || !text) return;
  const digits = ttDigits((await rememberHandle(h)));
  const entry = { id: `tt-${ackIds[0] ?? textHash(text)}`, phone: digits, at: new Date().toISOString(), h: textHash(text) };
  await mutateState<Sent>("tenant-sent", [], (sent) => [...sent, entry].slice(-2000));
}
