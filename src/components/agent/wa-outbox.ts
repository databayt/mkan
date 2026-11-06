import "server-only";

/**
 * The WhatsApp outbox, drained on Cloudflare — every 2 minutes by
 * /api/cron/wa-outbox (cf/crons.json), through the shared bridge
 * (src/lib/whatsapp/evolution.ts). It ran on the Mac under launchd until
 * 10-25 (scripts/wa/outbox.ts is now a thin wrapper over this, for
 * `--dry-run` from a terminal).
 *
 *   1. Bridge check — unreachable or not "open": nothing is sent, no row loses
 *      an attempt, the failure streak grows (#mkan hears after three).
 *   2. Send — QUEUED rows under scripts/wa/outbox-pure.ts (Kigali 08:00–20:00,
 *      MKAN_WA_DAILY_CAP a day, one per broker a day). One broker message a
 *      tick: the 2-minute schedule is the gap between sends. Tenant alerts all
 *      go at once. An "is this available?" is worded when it goes, not when it
 *      was queued (broker.ts askBodyNow), and skipped if the home was answered
 *      meanwhile. The third failed try makes a row FAILED and posts a #mkan
 *      card with a wa.me link so a person sends it by hand.
 *   3. Replies — polls /chat/findMessages. STOP / HAGARIKA from a broker sets
 *      Broker.optOut; every other broker burst (an album + its caption) goes
 *      to broker-inbox; tenant messages the webhook missed go to the agent.
 *
 * A lease in WaState keeps two drains from overlapping.
 */
import { waLink } from "../../../scripts/crm/public-links";
import { isDirectChat } from "../../../scripts/wa/tenant-pure";
import {
  MAX_ATTEMPTS,
  REST_DAYS,
  type OutboxRow,
  type RestReason,
  type SkipReason,
  brokerRest,
  dailyCap,
  groupByPhone,
  inSendWindow,
  isImage,
  isMedia,
  quotedId,
  isOptOut,
  messageText,
  phoneKey,
  brokerGapLeft,
  passScheduler,
  planOutbox,
  recipientKey,
  reminderOf,
  senderPhone,
  startOfKigaliDay,
  typingMs,
} from "../../../scripts/wa/outbox-pure";
import { db } from "@/lib/db";
import { askBodyNow, markIntroduced } from "./broker";
import { brokerSendMode } from "./broker-sends";
import { isRepostAsk, parseBrokerReply } from "./broker-reply";
import { EvolutionError, connectionState, findMessages, isBridgeDown, mediaBytes, sendPresence, sendText } from "@/lib/whatsapp/evolution";
import { handleBrokerReply, repostAskKey, askMsgKey } from "./broker-inbox";
import { mutateState, pruneMessageClaims, readState, releaseLease, takeLease, writeState } from "./wa-state";
import { answerTenant, noteFromMe, recordSent } from "./wa-tenant";
import { postSlackCard } from "./whatsapp";

const LEASE = "outbox-lease";
/** Longer than a pass with tenant turns in it (each can take 16 s+); a pass releases it when done. */
const LEASE_MS = 10 * 60_000;
const REPLY_LOOKBACK_MS = 24 * 3_600_000;
const SEEN_KEEP = 3000;
/** Photos sent before the price wait this long for it. */
const PENDING_MS = 2 * 3_600_000;
/** Photos kept from one burst. */
const MAX_PHOTOS = 12;
/** Broker messages per pass; brokerGapLeft (outbox-pure.ts) spaces them — the 2-minute tick no longer does. */
const BROKER_SENDS_PER_TICK = 1;

type Log = (msg: string) => void;

// ── kicks: a pass when something happens, not only on the clock ─────────────────────────────────
// The */2 cron kept Neon awake around the clock (≈ $19/month) for 31 ticks a week that had work
// (2026-11-07). A pass now runs seconds after an alert or ask is queued (whatsapp.ts sendMessages) and
// after a broker writes (the webhook); the cron is the backstop — every 15 min by day, hourly at night.
// The pass is the same one the cron runs, under the same lease: nothing is sent or read twice.
/** Kicks run in the container only (Next's server, production, outbox on) — never in a Mac script. */
const kicksOn = () => process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "production" && process.env.MKAN_WA_OUTBOX?.trim() === "1";

const passes = passScheduler(async (reason) => {
  const r = await runOutbox({ log: (m) => console.log(`[wa-outbox] [kick:${reason}] ${m}`) }).catch((err) => {
    console.warn(`[wa-outbox] kick ${reason} failed: ${(err as Error).message}`);
    return null;
  });
  return { locked: r?.skipped === "locked" };
});

/** Run a pass in `delayMs` (container only). One asked for during a pass runs after it; asks merge. */
export function kickOutbox(reason: string, delayMs = 3_000): void {
  if (kicksOn()) passes.kick(reason, delayMs);
}

export interface OutboxResult {
  state: string;
  sent: number;
  replies: number;
  skipped?: "locked" | "not-paired";
}

/** Phones are stored "+250…"; numbers from WhatsApp come as digits. */
const phoneVariants = (keys: string[]) => keys.flatMap((k) => [`+${k}`, k]);

/** Failed runs in a row; #mkan hears once at three, and again when it recovers. */
async function recordRun(ok: boolean, detail = "") {
  const s = await readState<{ fails: number; alerted: boolean; last?: string }>("streak", { fails: 0, alerted: false });
  if (ok) {
    if (s.alerted) await postSlackCard(`✅ *wa-outbox* is running again after ${s.fails} failed run(s).`);
    if (s.fails) await writeState("streak", { fails: 0, alerted: false });
    return;
  }
  const next = { fails: s.fails + 1, alerted: s.alerted, last: detail.slice(0, 300) };
  if (next.fails >= 3 && !next.alerted) {
    await postSlackCard(`⚠️ *wa-outbox* has failed ${next.fails} runs in a row. Last error: \`${next.last || "unknown"}\``);
    next.alerted = true;
  }
  await writeState("streak", next);
}

const SKIP_TEXT: Record<SkipReason, string> = {
  "opted-out": "broker opted out",
  stale: "stale: queued over 18 h ago",
  "sends-off": "broker sends off",
  "tenant-stop": "tenant said STOP",
  "stale-alert": "tenant alert too late to send",
};

/** Asks (not the line's own short replies, labelled auto-*) each number got in the last REST_DAYS, and when it last wrote back. */
async function restingBrokers(phones: string[], now: Date): Promise<Map<string, RestReason>> {
  const out = new Map<string, RestReason>();
  if (phones.length === 0) return out;
  const since = new Date(now.getTime() - REST_DAYS * 86_400_000);
  const [asks, brokers] = await Promise.all([
    db.outboundMessage.findMany({
      where: { status: "SENT", kind: { in: ["BROKER_REQUEST", "BROKER_ASK"] }, to: { in: phoneVariants(phones) }, sentAt: { gte: since }, NOT: { label: { startsWith: "auto-" } } },
      select: { to: true, sentAt: true },
    }),
    db.broker.findMany({ where: { phones: { hasSome: phoneVariants(phones) } }, select: { phones: true, lastReplyAt: true } }),
  ]);
  const sentAt = new Map<string, Date[]>();
  for (const a of asks) if (a.sentAt) sentAt.set(phoneKey(a.to), [...(sentAt.get(phoneKey(a.to)) ?? []), a.sentAt]);
  const replied = new Map<string, Date>();
  for (const b of brokers) for (const p of b.phones) if (b.lastReplyAt && (!replied.get(phoneKey(p)) || replied.get(phoneKey(p))! < b.lastReplyAt)) replied.set(phoneKey(p), b.lastReplyAt);
  for (const phone of phones) {
    const why = brokerRest(sentAt.get(phone) ?? [], replied.get(phone) ?? null, now);
    if (why) out.set(phone, why);
  }
  return out;
}

async function drain(dry: boolean, log: Log, sendsOff: boolean): Promise<{ sent: number; bridgeError?: string }> {
  const now = new Date();
  const rows = await db.outboundMessage.findMany({ where: { status: "QUEUED" }, orderBy: { createdAt: "asc" }, take: 500 });
  if (!rows.length) return { sent: 0 };

  const sentRows = await db.outboundMessage.findMany({
    where: { status: "SENT", sentAt: { gte: startOfKigaliDay(now) } },
    select: { brokerId: true, to: true, kind: true, sentAt: true },
  });
  const lastSentAt = new Map<string, Date>();
  for (const s of sentRows) if (s.kind !== "TENANT_ALERT" && s.sentAt) lastSentAt.set(recipientKey(s), s.sentAt);

  const brokerIds = [...new Set(rows.map((r) => r.brokerId).filter((id): id is string => !!id))];
  const brokers = brokerIds.length ? await db.broker.findMany({ where: { id: { in: brokerIds } }, select: { id: true, optOut: true } }) : [];
  const bareKeys = [...new Set(rows.filter((r) => !r.brokerId).map((r) => phoneKey(r.to)))];
  const optedOutByPhone = bareKeys.length
    ? await db.broker.findMany({ where: { optOut: true, phones: { hasSome: phoneVariants(bareKeys) } }, select: { phones: true } })
    : [];
  // A broker who said STOP from the number on their ad, which the directory may not list.
  const optedOutPosters = bareKeys.length
    ? await db.listingBroker.findMany({ where: { broker: { is: { optOut: true } }, user: { phoneNumber: { in: phoneVariants(bareKeys) } } }, select: { user: { select: { phoneNumber: true } } } })
    : [];

  const cap = dailyCap();
  const brokerPhones = [...new Set(rows.filter((r) => r.kind !== "TENANT_ALERT").map((r) => phoneKey(r.to)))];
  const resting = sendsOff ? new Map<string, RestReason>() : await restingBrokers(brokerPhones, now);
  const plan = planOutbox<(typeof rows)[number] & OutboxRow>({
    now,
    rows,
    sentToday: sentRows.length,
    lastSentAt,
    optedOutBrokers: new Set(brokers.filter((b) => b.optOut).map((b) => b.id)),
    optedOutPhones: new Set([...optedOutByPhone.flatMap((b) => b.phones.map(phoneKey)), ...optedOutPosters.map((p) => phoneKey(p.user.phoneNumber ?? ""))]),
    resting,
    brokerSendsOff: sendsOff,
    stoppedTenants: new Set((await readState<string[]>("tenant-stop", [])).map(phoneKey)),
    cap,
  });
  const held = plan.hold.reduce<Record<string, number>>((acc, h) => ({ ...acc, [h.reason]: (acc[h.reason] ?? 0) + 1 }), {});
  const alerts = plan.send.filter((r) => r.kind === "TENANT_ALERT");
  // Brokers hear from Mkan at a person's pace: none within BROKER_GAP_MS of the last broker message.
  const gapLeft = brokerGapLeft(sentRows, now);
  const brokerRows = plan.send.filter((r) => r.kind !== "TENANT_ALERT");
  if (gapLeft > 0 && brokerRows.length && !dry) kickOutbox("broker-gap", gapLeft + 1_000);
  const toSend = [...alerts, ...(gapLeft > 0 ? [] : brokerRows.slice(0, BROKER_SENDS_PER_TICK))];
  log(`queued ${rows.length} · sent today ${sentRows.length}/${cap} · plan ${plan.send.length} (this tick ${toSend.length}) · skip ${plan.skip.length} · hold ${JSON.stringify(held)}${sendsOff ? " · broker sends OFF" : ""}`);

  for (const { row, reason } of plan.skip) {
    log(`skip ${row.id} ${row.kind}: ${SKIP_TEXT[reason]}`);
    if (!dry) await db.outboundMessage.update({ where: { id: row.id }, data: { status: "SKIPPED", error: SKIP_TEXT[reason] } });
    // A viewing reminder that never went out is marked so (the visit used to read it as sent), and a
    // person hears it — unless the tenant said STOP, which is the end of it.
    const reminder = reminderOf(row.label);
    if (!dry && reminder) {
      await db.listingVisit.update({ where: { id: reminder.visitId }, data: { reminders: { push: `${reminder.mark}:dropped` } } }).catch(() => {});
      if (reason !== "tenant-stop") {
        await postSlackCard(`⏰ The ${reminder.mark === "after" ? '"how did the viewing go?"' : `${reminder.mark} reminder`} for visit ${reminder.visitId} could not go out (${SKIP_TEXT[reason]}) — message the tenant yourself.`).catch(() => {});
      }
    }
    // An ask that never went out (too old, the broker opted out) is not "asked": its requests expire now,
    // so the hourly pass hands the home to the next broker — they sat PENDING until the tenant heard
    // "no reply" from a broker nobody had asked (2026-11-06). Sends switched off is left to a person.
    if (!dry && row.kind === "BROKER_REQUEST" && row.brokerRequestIds.length && (reason === "stale" || reason === "opted-out")) {
      await db.brokerRequest.updateMany({ where: { id: { in: row.brokerRequestIds }, status: "PENDING", sentAt: null }, data: { expiresAt: new Date() } }).catch(() => {});
    }
  }

  let sent = 0;
  for (const row of toSend) {
    let body = row.body;
    if (row.kind === "BROKER_REQUEST" && row.brokerRequestIds.length) {
      const worded = await askBodyNow(row.brokerRequestIds.join(), row.brokerRequestIds, row.to);
      if (worded === "answered" || worded === "expired") {
        const why = worded === "answered" ? "answered before it went out" : "expired before it went out";
        log(`skip ${row.id}: ${why}`);
        if (!dry) await db.outboundMessage.update({ where: { id: row.id }, data: { status: "SKIPPED", error: why } });
        continue;
      }
      if (worded) body = worded.body;
    }
    // A demand ask whose tenant request closed while it waited is about nothing any more.
    if (row.kind === "BROKER_ASK" && row.tenantRequestId) {
      const open = await db.tenantRequest.count({ where: { id: row.tenantRequestId, status: { in: ["OPEN", "MATCHED"] }, expiresAt: { gte: now } } });
      if (!open) {
        log(`skip ${row.id}: its tenant request is closed`);
        if (!dry) await db.outboundMessage.update({ where: { id: row.id }, data: { status: "SKIPPED", error: "tenant request closed" } });
        continue;
      }
    }
    if (dry) {
      log(`would send ${row.id} ${row.kind} → ${row.to}: ${body.replace(/\s+/g, " ")}`);
      continue;
    }
    if (row.kind !== "TENANT_ALERT" && !inSendWindow(new Date())) break;
    try {
      // Brokers see "typing…" first, as from a person; tenant alerts go straight out.
      if (row.kind !== "TENANT_ALERT") await sendPresence(row.to, typingMs(body));
      if (row.kind === "TENANT_ALERT") await recordSent(phoneKey(row.to), undefined, body);
      const out = await sendText(row.to, body);
      if (row.kind === "TENANT_ALERT") await recordSent(phoneKey(row.to), out?.key?.id, body);
      // A broker who replies to this very message (WhatsApp's quote) answers this ask, not their newest one.
      else if (out?.key?.id) await writeState(askMsgKey(out.key.id), { outboundId: row.id }).catch(() => {});
      const sentAt = new Date();
      await db.outboundMessage.update({ where: { id: row.id }, data: { status: "SENT", sentAt, attempts: { increment: 1 }, error: null, ...(body !== row.body ? { body } : {}) } });
      // The visit hears its reminder went out only now — "after" is what makes the tenant's next
      // message the answer to "how did it go?" (deal.ts afterViewingFor).
      const reminder = reminderOf(row.label);
      if (reminder) await db.listingVisit.update({ where: { id: reminder.visitId }, data: { reminders: { push: reminder.mark } } }).catch(() => {});
      if (row.kind === "BROKER_REQUEST" && row.brokerRequestIds.length) {
        await db.brokerRequest.updateMany({ where: { id: { in: row.brokerRequestIds } }, data: { channel: "evolution", sentAt } });
      }
      // Their first message from Mkan said who we are; every later one is short.
      if (row.kind !== "TENANT_ALERT") {
        await markIntroduced(row.to, sentAt);
        const theirs = { phones: { hasSome: phoneVariants([phoneKey(row.to)]) } };
        // An availability ask counts on the directory row too (demand asks count when queued, demand.ts).
        const ask = row.kind === "BROKER_REQUEST" && row.brokerRequestIds.length > 0;
        await db.broker.updateMany({ where: theirs, data: { lastMessagedAt: sentAt, ...(ask ? { lastAskedAt: sentAt, asks: { increment: 1 } } : {}) } });
        await db.broker.updateMany({ where: { ...theirs, relationship: "NEW" }, data: { relationship: "INTRODUCED", introducedAt: sentAt } });
      }
      sent += 1;
      log(`sent ${row.id} ${row.kind}`);
    } catch (err) {
      const message = (err as Error).message;
      if (isBridgeDown(err)) {
        log(`bridge down mid-run, ${row.id} keeps its attempts: ${message}`);
        return { sent, bridgeError: message };
      }
      const attempts = row.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      await db.outboundMessage.update({
        where: { id: row.id },
        data: { attempts, error: message.slice(0, 500), ...(failed ? { status: "FAILED" as const } : {}) },
      });
      log(`${failed ? "FAILED" : "retry later"} ${row.id} (${attempts}/${MAX_ATTEMPTS}): ${message}`);
      if (failed) {
        if (row.kind === "BROKER_REQUEST" && row.brokerRequestIds.length) {
          await db.brokerRequest.updateMany({ where: { id: { in: row.brokerRequestIds } }, data: { channel: "manual" } });
        }
        await postSlackCard(
          `⚠️ WhatsApp could not send this ${row.kind.toLowerCase().replace("_", " ")} after ${attempts} tries — ${row.label ?? row.to}\n` +
            `<${waLink(row.to, body)}|Send it by hand on WhatsApp> · last error: \`${message.slice(0, 200)}\``,
        );
      }
    }
  }
  return { sent };
}

type Pending = Record<string, { urls: string[]; at: string }>;

/**
 * A word back to a broker, as a person types it; its row turns FAILED if
 * WhatsApp refuses it. With broker sends off nothing goes: the row is SKIPPED
 * and the caller's #mkan card carries what the line would have said.
 */
async function sendReply(phone: string, reply: { text: string; outboundId: string }, name: string, log: Log, sendsOff = false): Promise<boolean> {
  if (sendsOff) {
    await db.outboundMessage.update({ where: { id: reply.outboundId }, data: { status: "SKIPPED", error: "broker sends off" } }).catch(() => {});
    log(`answer to ${name} held: broker sends off`);
    return false;
  }
  try {
    await sendPresence(phone, typingMs(reply.text));
    await sendText(phone, reply.text);
    return true;
  } catch (err) {
    await db.outboundMessage.update({ where: { id: reply.outboundId }, data: { status: "FAILED", error: (err as Error).message.slice(0, 500) } });
    log(`answer to ${name} failed: ${(err as Error).message}`);
    return false;
  }
}

/** A broker's photos → our bucket, so a lead never points at WhatsApp's expiring media. */
async function storePhotos(brokerId: string, ids: string[]): Promise<string[]> {
  const { buildUploadKey, putObject } = await import("@/lib/s3");
  const urls: string[] = [];
  for (const id of ids.slice(0, MAX_PHOTOS)) {
    const media = await mediaBytes(id);
    if (!media) continue;
    const ext = media.mimetype.split("/")[1]?.replace("jpeg", "jpg") ?? "jpg";
    const url = await putObject({ key: buildUploadKey(`broker-${brokerId}`, ext), body: media.bytes, contentType: media.mimetype, cacheControl: "public, max-age=31536000, immutable" }).catch(
      () => null,
    );
    if (url) urls.push(url);
  }
  return urls;
}

async function replies(dry: boolean, log: Log, sendsOff: boolean): Promise<number> {
  const now = new Date();
  const records = await findMessages(new Date(now.getTime() - REPLY_LOOKBACK_MS), now, 200);
  const seen = await readState<string[]>("seen", []);
  const seenSet = new Set(seen);
  const all = records
    .map((m) => ({
      id: m.key?.id ?? m.id ?? "",
      phone: senderPhone(m.key),
      text: messageText(m.message),
      image: isImage(m.message, m.messageType),
      media: isMedia(m.message, m.messageType),
      quoted: quotedId(m.message),
      type: m.messageType ?? "message",
      fromMe: !!m.key?.fromMe,
      direct: isDirectChat(m.key?.remoteJid),
      sentAt: new Date(Number(m.messageTimestamp ?? 0) * 1000 || now.getTime()),
    }))
    .filter((m) => m.id && !seenSet.has(m.id))
    .reverse(); // oldest first
  if (!all.length) return 0;
  const fresh = all.filter((m) => !m.fromMe);

  const phones = [...new Set(all.map((m) => m.phone).filter((p): p is string => !!p))];
  const brokers = phones.length
    ? await db.broker.findMany({ where: { phones: { hasSome: phoneVariants(phones) } }, select: { id: true, name: true, phones: true, optOut: true } })
    : [];
  const byPhone = new Map<string, (typeof brokers)[number]>();
  for (const b of brokers) for (const p of b.phones) byPhone.set(phoneKey(p), b);
  // Whoever posted a home we ask about is a broker even when the directory has another number for them.
  const unlisted = phones.filter((p) => !byPhone.has(p));
  const posters = unlisted.length
    ? await db.listingBroker.findMany({
        where: { user: { phoneNumber: { in: phoneVariants(unlisted) } } },
        select: { user: { select: { phoneNumber: true } }, broker: { select: { id: true, name: true, phones: true, optOut: true } } },
      })
    : [];
  const posterPhones = new Set<string>();
  for (const p of posters) {
    const key = phoneKey(p.user.phoneNumber ?? "");
    posterPhones.add(key);
    if (p.broker && !byPhone.has(key)) byPhone.set(key, p.broker);
  }

  // A person at Mkan typing in a tenant's chat pauses the agent there (wa-tenant.ts).
  if (!dry) for (const m of all) if (m.fromMe && m.direct && m.phone && !byPhone.has(m.phone) && !posterPhones.has(m.phone)) await noteFromMe(m.phone, m.id, m.sentAt, m.text);
  // The TikTok repost ask goes out from the phone, not from here: remember it, so the
  // broker's "yes" answers that ask and not an open "is this available?" (broker-inbox.ts).
  if (!dry) for (const m of all) if (m.fromMe && m.direct && m.phone && (byPhone.has(m.phone) || posterPhones.has(m.phone)) && isRepostAsk(m.text)) await writeState(repostAskKey(m.phone), { at: m.sentAt.toISOString() });

  const rest: typeof fresh = [];
  const tenants: typeof fresh = [];
  const strangers: typeof fresh = [];
  for (const m of fresh) {
    if (m.phone && m.direct && !byPhone.has(m.phone)) {
      // Never let the tenant agent answer a broker we asked about a home.
      (posterPhones.has(m.phone) ? strangers : tenants).push(m);
      continue;
    }
    const broker = m.phone ? byPhone.get(m.phone) : undefined;
    if (broker && isOptOut(m.text)) {
      log(`opt-out from ${broker.name}`);
      if (!dry && !broker.optOut) {
        await db.broker.update({ where: { id: broker.id }, data: { optOut: true, optOutAt: new Date(), relationship: "DO_NOT_CONTACT" } });
        broker.optOut = true;
        await postSlackCard(`🚫 *${broker.name}* (+${m.phone}) replied "${m.text}" — opted out; no more WhatsApp asks.`);
      }
    } else if (broker) rest.push(m);
  }

  // An album and its caption arrive as several messages: read each broker's burst as one reply.
  const pending = await readState<Pending>("pending", {});
  for (const g of groupByPhone(rest)) {
    const broker = byPhone.get(g.phone)!;
    const words = g.text || `[${g.items.map((m) => m.type).join(", ")}]`;
    log(`reply from ${broker.name}${g.imageIds.length ? ` + ${g.imageIds.length} photo(s)` : ""}`);
    if (dry) continue;
    const stored = await storePhotos(broker.id, g.imageIds);
    const held = pending[broker.id] && now.getTime() - new Date(pending[broker.id]!.at).getTime() < PENDING_MS ? pending[broker.id]!.urls : [];
    const photoUrls = [...held, ...stored].slice(0, MAX_PHOTOS);
    const at = g.items[g.items.length - 1]?.sentAt ?? now;
    const quoted = [...g.items].reverse().find((m) => m.quoted)?.quoted ?? null;
    const action = await handleBrokerReply({ brokerId: broker.id, phone: g.phone, text: g.text, photoUrls, at, quotedId: quoted }).catch((err) => {
      log(`inbox failed for ${broker.name}: ${(err as Error).message}`);
      return { kind: "none" } as const;
    });
    if (action.kind === "home") {
      delete pending[broker.id];
      await postSlackCard(
        `🏠 *${broker.name}* (+${g.phone}) sent a home on WhatsApp → lead #${action.listingId}${photoUrls.length ? ` with ${photoUrls.length} photo(s)` : ""}${action.matched ? ", now in the tenant's chat" : ""}.\n> ${g.text.replace(/\n/g, "\n> ").slice(0, 600)}`,
      );
    } else if (action.kind === "reply") {
      if (action.why === "photos-need-price" && photoUrls.length) pending[broker.id] = { urls: photoUrls, at: now.toISOString() };
      if (!(await sendReply(g.phone, action, broker.name, log, sendsOff)) && sendsOff) {
        await postSlackCard(
          `💬 *${broker.name}* (+${g.phone}) replied — broker sends are off, so the line said nothing. It would have said "${action.text}".\n> ${words.replace(/\n/g, "\n> ").slice(0, 600)}\n<${waLink(g.phone, "")}|Answer by hand>`,
        );
      }
    } else if (action.kind === "repost") {
      const next =
        action.answer === "YES"
          ? "The 07:00 run records it on their CRM host; their videos join the TikTok posts from then."
          : action.answer === "NO"
            ? "The 07:00 run records it on their CRM host; their videos stay off the page."
            : "Not a plain yes or no — read it. If it is a yes, tell Hermes: `these brokers said yes: <handle>`.";
      await postSlackCard(`📣 *${broker.name}* (+${g.phone}) answered the TikTok repost ask: *${action.answer ?? "unclear"}*\n> ${g.text.replace(/\n/g, "\n> ").slice(0, 400)}\n${next}`);
    } else if (action.kind === "availability") {
      const said = action.reply ? await sendReply(g.phone, action.reply, broker.name, log, sendsOff) : false;
      const marked = `${action.applied ? "marked" : "already"} ${action.answer === "RENTED" ? "rented" : "available"}`;
      const note = action.reply ? (said ? ` · we said "${action.reply.text}"` : sendsOff ? ` · not answered (broker sends off) — <${waLink(g.phone, "")}|answer by hand>` : "") : "";
      await postSlackCard(`✅ *${broker.name}* (+${g.phone}) answered → home #${action.listingId} ${marked}${note}\n> ${g.text.replace(/\n/g, "\n> ").slice(0, 600)}`);
    } else {
      if (stored.length) pending[broker.id] = { urls: photoUrls, at: now.toISOString() };
      const botAsk = parseBrokerReply(g.text).asksIfBot ? "🤖 asks if they're talking to a bot — answer this one yourself.\n" : "";
      await postSlackCard(
        `${botAsk}💬 *${broker.name}* (+${g.phone}) replied on WhatsApp${stored.length ? ` (${stored.length} photo(s) kept)` : ""}:\n> ${words.replace(/\n/g, "\n> ")}\n<${waLink(g.phone, "")}|Open the chat> — turn it into a home in this thread.`,
      );
    }
  }
  // Posted a home we asked about, but not in the directory: a person reads it — and a "stop"
  // from them holds like anyone's, on a directory row of their own.
  for (const g of dry ? [] : groupByPhone(strangers)) {
    if (isOptOut(g.text)) {
      await db.broker.create({ data: { kind: "BROKER", name: `+${g.phone}`, phones: [`+${g.phone}`], sources: ["whatsapp"], optOut: true, optOutAt: new Date(), relationship: "DO_NOT_CONTACT" } }).catch(() => {});
      await postSlackCard(`🚫 +${g.phone} (posts a home we asked about) replied "${g.text.slice(0, 200)}" — opted out; no more WhatsApp asks.`);
      continue;
    }
    await postSlackCard(`💬 +${g.phone} (posts a home we asked about, not in the broker directory) replied on WhatsApp:\n> ${(g.text || "[photo or voice note]").replace(/\n/g, "\n> ").slice(0, 600)}\n<${waLink(g.phone, "")}|Open the chat>`);
  }
  // Tenants the webhook missed or could not finish; each message is claimed once (wa-state.ts), and one
  // still busy or failed is NOT marked seen, so the next pass answers it (2026-11-06: it was dropped).
  const unfinished = new Set<string>();
  for (const m of tenants) {
    if (dry) {
      log(`would pass a tenant message to the agent`);
      continue;
    }
    const outcome = await answerTenant({ phone: m.phone!, text: m.text, msgId: m.id, sentAt: m.sentAt, media: m.media });
    if (outcome === "busy" || outcome === "error") unfinished.add(m.id);
  }
  if (!dry) {
    await mutateState<string[]>("seen", [], (list) => [...list, ...all.filter((m) => !unfinished.has(m.id)).map((m) => m.id)].slice(-SEEN_KEEP));
    await writeState("pending", pending);
  }
  log(`replies: ${fresh.length} new · ${rest.length} broker · ${strangers.length} unlisted broker · ${tenants.length} tenant`);
  return fresh.length;
}

/** One pass: send what the caps allow now, then read replies. */
export async function runOutbox(opts: { dry?: boolean; log?: Log } = {}): Promise<OutboxResult> {
  const dry = !!opts.dry;
  const log = opts.log ?? ((m: string) => console.log(`[wa-outbox]${dry ? " [dry]" : ""} ${m}`));
  let state: string;
  try {
    state = await connectionState();
  } catch (err) {
    // The instance does not exist until `pnpm wa:pair` makes it — not a failure to alarm about.
    if (err instanceof EvolutionError && err.status === 404) return { state: "missing", sent: 0, replies: 0, skipped: "not-paired" };
    state = `unreachable (${(err as Error).message})`;
  }
  if (state !== "open") {
    log(`bridge ${state}`);
    if (!dry) await recordRun(false, `instance "mkan" is ${state} — run pnpm wa:pair`);
    if (!dry) return { state, sent: 0, replies: 0, skipped: "not-paired" };
  }
  const lease = dry ? null : await takeLease(LEASE, LEASE_MS);
  if (!dry && !lease) return { state, sent: 0, replies: 0, skipped: "locked" };
  if (!dry) passes.enter();
  try {
    // Read once per pass: a person flips it with `pnpm wa:brokers` (broker-sends.ts).
    const sendsOff = (await brokerSendMode()) !== "gated";
    const first = await drain(dry, log, sendsOff);
    if (first.bridgeError) {
      if (!dry) await recordRun(false, first.bridgeError);
      return { state, sent: first.sent, replies: 0 };
    }
    let sent = first.sent;
    const n = state === "open" ? await replies(dry, log, sendsOff) : 0;
    // A broker's answer read just now queued the tenant's alert: it goes in this pass, not the next
    // (2026-11-07: sending ran before reading, so it waited a full tick — 127–132 s this week).
    if (n > 0 && !dry) {
      const again = await drain(dry, log, sendsOff);
      sent += again.sent;
    }
    if (!dry) await pruneMessageClaims().catch(() => 0);
    if (!dry) await recordRun(true);
    return { state, sent, replies: n };
  } catch (err) {
    if (!dry) await recordRun(false, (err as Error).message);
    throw err;
  } finally {
    if (!dry) {
      await releaseLease(LEASE, lease);
      passes.leave();
    }
  }
}
