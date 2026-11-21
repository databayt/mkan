import "server-only";

/**
 * Tenants on WhatsApp → the rental agent, inside the container.
 *
 * The webhook (instant) and the outbox poll (every 2 min, the fallback) both
 * call `answerTenant`: it applies the guardrails (scripts/wa/tenant-pure.ts),
 * shows "typing…", runs the turn in-process (whatsapp-chat.ts) and sends the
 * reply. The turn dedupes by message id, so the two paths answer once.
 */
import { followLine, homesListed, humanChatBeforeBot, langOfWords, LATE_AFTER_MS, lateLead, MAX_AGE_MS, mediaEnabled, MEDIA_NUDGE_MS, REPEAT_WINDOW_MS, repeatsLast, saidJustNow, showsAHome, startText, stopConfirmText, tenantDecision, textHash, typePleaseText, type Sent, type TenantDecision } from "../../../scripts/wa/tenant-pure";
import { db } from "@/lib/db";
import { sendMedia, sendPresence, sendText } from "@/lib/whatsapp/evolution";
import { isPersonal, markPersonal } from "./personal";
import { readRepWord, repDigits } from "./rep-word-pure";
import { testPhones } from "./broker-sends";
import { addToList, CLAIM_STALE_MS, claimMessage, holdReply, MAX_ANSWER_TRIES, mutateState, readState, releaseMessage, removeFromList, settleMessage, writeState } from "./wa-state";
import { handleTenantWhatsApp, silenceTenant } from "./whatsapp-chat";
import { sameHomesText, type WaLang } from "./whatsapp-format";
import { postSlackCard } from "./whatsapp";

const SENT_KEEP = 2000;

/** An echo of the same words this soon after sending is the agent's own, not a person typing. */
const ECHO_WINDOW_MS = 120_000;

/**
 * The agent's own message ids — so the echo of a reply is not mistaken for a person typing. Called
 * with the text before a send (no id yet) and with the id after: a slow send's echo used to arrive
 * first, look like a person taking over, and mute the agent in that chat for 12 h (2026-11-06).
 */
export async function recordSent(phone: string, id: string | undefined, text?: string, media = false): Promise<void> {
  if (!id && !text) return;
  const entry = { id: id ?? "", phone, at: new Date().toISOString(), ...(text ? { h: textHash(text) } : {}), ...(media ? { m: true as const } : {}) };
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

/** The language to answer a guardrail in: what the tenant just wrote says it, else the chat's last turn. */
async function chatLocale(phone: string, text: string): Promise<string> {
  const said = langOfWords(text);
  if (said) return said;
  const task = await db.agentTask.findFirst({ where: { profile: { waPhone: `+${phone}` } }, orderBy: { updatedAt: "desc" }, select: { locale: true } }).catch(() => null);
  return task?.locale ?? "en";
}

/** One line from the line itself (not a turn): held first so a failed send is re-sent, never lost. */
async function sendLine(m: TenantMessage, text: string, tries: number): Promise<void> {
  await holdReply(m.msgId, text, tries);
  await recordSent(m.phone, undefined, text);
  const out = await sendText(m.phone, text);
  await recordSent(m.phone, out?.key?.id, text);
}

export interface TenantMessage {
  phone: string;
  text: string;
  msgId: string;
  sentAt: Date;
  /** A voice note, photo, location… (outbox-pure.ts isMedia): no words to read. */
  media?: boolean;
}

/** A few seconds between photos: three images at once from a number this young reads as spam to WhatsApp. */
const PHOTO_GAP_MS = 2_500;

/** Photo + caption per home; one that fails is skipped, never retried, never the reason a reply is not sent. */
async function sendHomePhotos(phone: string, media: { url: string; caption: string }[]): Promise<number> {
  let sent = 0;
  for (const item of media) {
    try {
      await new Promise((r) => setTimeout(r, PHOTO_GAP_MS));
      await recordSent(phone, undefined, item.caption, true);
      const out = await sendMedia(phone, { url: item.url, caption: item.caption });
      await recordSent(phone, out?.key?.id, item.caption, true);
      sent += 1;
    } catch (err) {
      console.warn(`[wa] photo to +${phone} not sent: ${(err as Error).message}`);
    }
  }
  return sent;
}

const log = (msg: string) => console.log(`[wa] ${msg}`);

export type TenantOutcome = TenantDecision | "error" | "sent" | "nothing" | "busy" | "held" | "duplicate";

/** A reply that could not be sent this long after it was written is handed to a person instead. */
const RESEND_WITHIN_MS = MAX_AGE_MS;

/**
 * Another run holds this message, or its own turn is still writing: the claim stays, and a pass looks
 * again once it can be taken over. Dynamic: wa-outbox imports this module.
 */
const lookAgainSoon = () => void import("./wa-outbox").then((o) => o.kickOutbox("held", CLAIM_STALE_MS + 15_000)).catch(() => {});
/** The next message from the same phone waits for this turn's tail (the writer, the broker ask) at most this long. */
const CHAIN_HOLD_MS = 60_000;

/**
 * Answer one tenant message (or skip it, saying why). Never throws.
 *
 * Each message is claimed once (wa-state.ts claimMessage): the webhook and the poll can both bring it,
 * and only one answers. A busy turn gives the claim back so the poll answers it a pass later; a run
 * that dies leaves it to be retried (MAX_ANSWER_TRIES, then a person); a reply that was written but
 * not sent is sent again — never lost, never twice. "busy", "held" and "error" are not final: the poll
 * must not mark that message seen (wa-outbox.ts).
 */
export function answerTenant(m: TenantMessage): Promise<TenantOutcome> {
  let hold: Promise<unknown> = Promise.resolve();
  const run = async (): Promise<TenantOutcome> => {
    try {
      const claim = await claimMessage(m.msgId);
      if (!claim) return "duplicate";
      if (claim.mode === "held") {
        lookAgainSoon();
        return "held";
      }
      if (claim.mode === "resend") {
        if (Date.now() - new Date(claim.at).getTime() > RESEND_WITHIN_MS) {
          await settleMessage(m.msgId);
          await postSlackCard(`⚠️ A reply to +${m.phone} could not be sent for ${Math.round(RESEND_WITHIN_MS / 3_600_000)} h — answer by hand:\n> ${claim.text.slice(0, 500).replace(/\n/g, "\n> ")}`).catch(() => {});
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
      // Mkan's person closing a step from their phone ("signed K5811", rep-word.ts): theirs, not a tenant's.
      // Only from the number in MKAN_REP_WHATSAPP; anything else they write goes the usual way, except a bare
      // "ok" to one of the line's own notices, which needs no answer. Read before anything that looks at who
      // the number is — so a number that is BOTH the rep's and on the team's test list still gets its words
      // (the test list only gates what reaches a broker, broker-sends.ts; nothing here reads it).
      const rep = repDigits();
      if (rep && m.phone === rep && !m.media) {
        const word = readRepWord(m.text);
        if (word) {
          const { applyRepWord } = await import("./rep-word");
          const text = await applyRepWord(word);
          await sendLine(m, text, claim.tries);
          await settleMessage(m.msgId);
          log(`rep word: ${word.kind === "status" ? `${word.status} K${word.listingId}` : word.kind}`);
          return "sent";
        }
        if (/^(?:ok(?:ay)?|thanks|thank you|noted|👍|تمام|شكرا|شكراً)[\s.!]*$/iu.test(m.text.trim())) {
          await settleMessage(m.msgId);
          return "nothing";
        }
      }
      const now = new Date();
      // Abdout's own contacts (personal.ts) never get a line from the agent: no "please type", no STOP
      // confirmation, no card. A text still reaches the handler, which answers only one about a home.
      const [stopped, human, sent, personal] = await Promise.all([
        readState<string[]>("tenant-stop", []),
        readState<Record<string, string>>("tenant-human", {}),
        readState<Sent>("tenant-sent", []),
        isPersonal(m.phone),
      ]);
      const hourAgo = now.getTime() - 3_600_000;
      // Mkan's own person writing from their phone is not a tenant: anything beyond a word the loop reads
      // (above) is theirs, never the agent's. A number on the team's test list still gets the agent, for the phone test.
      if (rep && m.phone === rep && !m.media && !(await testPhones().catch(() => new Set<string>())).has(m.phone)) {
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} is Mkan's own person — no agent reply`);
        return "skip-personal";
      }
      // A chat the line owner already lived in: a person talked there, long ago, and the agent never did.
      const humanAtPhone = human[m.phone] ? new Date(human[m.phone]!) : null;
      const personalChat =
        !personal &&
        humanChatBeforeBot({
          humanAt: humanAtPhone,
          now,
          botSentToPhone: sent.some((s) => s.phone === m.phone),
          hasAgentChat: humanAtPhone ? (await db.agentTask.count({ where: { profile: { waPhone: `+${m.phone}` } } }).catch(() => 1)) > 0 : false,
        });
      if (personalChat) await markPersonal(m.phone, "a person talked in this chat before the agent did");
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
        personalChat: personalChat || undefined,
      });
      if (decision === "stop") {
        await addToList("tenant-stop", m.phone);
        await silenceTenant(m.phone);
        // One reply, so the tenant knows it worked and how to come back; then nothing until START.
        if (!personal) {
          await sendLine(m, stopConfirmText(await chatLocale(m.phone, m.text)), claim.tries);
          await postSlackCard(`🛑 +${m.phone} said STOP — no replies or alerts until they send START:\n> ${m.text.slice(0, 200)}`).catch(() => {});
        }
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} said STOP — silenced`);
        return decision;
      }
      if (decision === "media") {
        const nudgeKey = `tmedia:${m.phone}`;
        const last = personal ? null : await readState<{ at?: string }>(nudgeKey, {});
        if (!last || (last.at && Date.now() - new Date(last.at).getTime() < MEDIA_NUDGE_MS)) {
          await settleMessage(m.msgId);
          return "nothing";
        }
        // Once an hour per chat: "please type", in the language the chat was last in.
        await sendLine(m, typePleaseText(await chatLocale(m.phone, m.text)), claim.tries);
        await writeState(nudgeKey, { at: new Date().toISOString() });
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} sent media — asked to type`);
        return "sent";
      }
      if (decision === "start") {
        // Back after a STOP: a welcome line, not a turn on the bare word (it read as "not about a home").
        await removeFromList("tenant-stop", m.phone);
        if (!personal) await sendLine(m, startText(await chatLocale(m.phone, m.text)), claim.tries);
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} said START`);
        return personal ? "start" : "sent";
      }
      if (decision === "skip-old") {
        // Older than MAX_AGE_MS (an outage longer than that): a person answers, never silence.
        await settleMessage(m.msgId);
        const hours = Math.round((now.getTime() - m.sentAt.getTime()) / 3_600_000);
        if (!personal && m.text.trim()) await postSlackCard(`⏳ +${m.phone} wrote ${hours} h ago and the line never answered — answer by hand:\n> ${m.text.slice(0, 400).replace(/\n/g, "\n> ")}`).catch(() => {});
        log(`tenant +${m.phone} skip-old (${hours} h)`);
        return decision;
      }
      if (decision !== "answer") {
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} ${decision}`);
        return decision;
      }
      const res = await handleTenantWhatsApp({ phone: m.phone, text: m.text, msgId: m.msgId, retry: claim.mode === "retry", onAnswering: () => void sendPresence(m.phone, 4_000).catch(() => {}) });
      if ("done" in res && res.done) hold = res.done;
      const media = "media" in res && res.media ? res.media : [];
      if (!res.reply) {
        const why = "why" in res ? res.why : "none";
        if (why === "busy") {
          // Not appended: the poll answers it once the last turn is done.
          await releaseMessage(m.msgId);
          log(`tenant +${m.phone} busy — left for the next pass`);
          return "busy";
        }
        if (why === "held") {
          // Taken in, its turn still writing: keep the claim; a pass sends this turn's reply.
          lookAgainSoon();
          log(`tenant +${m.phone} held — its turn is still writing`);
          return "held";
        }
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} no reply (${why})`);
        return "nothing";
      }
      // A message the line took long to reach (the webhook missed it, a restart): say sorry first.
      const late = now.getTime() - m.sentAt.getTime() > LATE_AFTER_MS;
      const body = late ? `${lateLead(await chatLocale(m.phone, m.text))}\n\n${res.reply}` : res.reply;
      // The first reply that shows homes points to the TikTok page, once per phone, ever; never to Abdout's own contacts.
      const followKey = `tfollow:${m.phone}`;
      const askFollow = !personal && showsAHome(body) && !(await readState<{ at?: string }>(followKey, {})).at;
      let plugged = askFollow;
      let reply = askFollow ? `${body}\n\n${followLine(await chatLocale(m.phone, m.text))}` : body;
      // The same words twice in a row read as a machine: an "Okay" after a status line got that line again
      // (11-07 and 11-12, three times in one chat). Said once; the second message needs no answer.
      const sentNow = await readState<Sent>("tenant-sent", []);
      if (saidJustNow(sentNow, m.phone, reply, Date.now())) {
        await settleMessage(m.msgId);
        log(`tenant +${m.phone} not answered: the same reply went out under ${Math.round(REPEAT_WINDOW_MS / 60_000)} min ago`);
        return "nothing";
      }
      // The same words as the last message sent, at any gap in the chat's day: a list becomes the one-line
      // "same homes" answer, anything else stays unsent (…077: seven identical lists; …612: four "Happy to help").
      if (repeatsLast(sentNow, m.phone, reply, Date.now())) {
        const n = homesListed(reply);
        const loc = await chatLocale(m.phone, m.text);
        const alt = n > 0 ? sameHomesText((loc === "ar" || loc === "rw" ? loc : "en") as WaLang, n) : null;
        if (!alt || repeatsLast(sentNow, m.phone, alt, Date.now())) {
          await settleMessage(m.msgId);
          log(`tenant +${m.phone} not answered: the last message sent was the same words`);
          return "nothing";
        }
        reply = alt;
        plugged = false;
      }
      await holdReply(m.msgId, reply, claim.tries);
      // Marked with the held reply: a failed send is re-sent with the line already in it.
      if (plugged) await writeState(followKey, { at: new Date().toISOString() });
      await recordSent(m.phone, undefined, reply);
      const out = await sendText(m.phone, reply);
      await recordSent(m.phone, out?.key?.id, reply);
      await settleMessage(m.msgId);
      // The homes' own photos, as native media with a short caption (MKAN_WA_MEDIA, on unless set off). The
      // list above already carries every link, so a photo that fails to send costs nothing.
      if (media.length && mediaEnabled() && !personal) await sendHomePhotos(m.phone, media);
      log(`tenant +${m.phone} answered${late ? " late" : ""}${plugged ? " + TikTok follow line" : ""} (${reply.length} chars)`);
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
