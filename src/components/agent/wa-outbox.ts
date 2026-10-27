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
  type OutboxRow,
  dailyCap,
  groupByPhone,
  inSendWindow,
  isImage,
  isOptOut,
  messageText,
  phoneKey,
  planOutbox,
  recipientKey,
  senderPhone,
  startOfKigaliDay,
  typingMs,
} from "../../../scripts/wa/outbox-pure";
import { db } from "@/lib/db";
import { askBodyNow } from "./broker";
import { parseBrokerReply } from "./broker-reply";
import { EvolutionError, connectionState, findMessages, isBridgeDown, mediaBytes, sendPresence, sendText } from "@/lib/whatsapp/evolution";
import { handleBrokerReply } from "./broker-inbox";
import { mutateState, readState, releaseLease, takeLease, writeState } from "./wa-state";
import { answerTenant, noteFromMe, recordSent } from "./wa-tenant";
import { postSlackCard } from "./whatsapp";

const LEASE = "outbox-lease";
const LEASE_MS = 5 * 60_000;
const REPLY_LOOKBACK_MS = 24 * 3_600_000;
const SEEN_KEEP = 3000;
/** Photos sent before the price wait this long for it. */
const PENDING_MS = 2 * 3_600_000;
/** Photos kept from one burst. */
const MAX_PHOTOS = 12;
/** Broker messages per tick; the schedule spaces them. */
const BROKER_SENDS_PER_TICK = 1;

type Log = (msg: string) => void;

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

async function drain(dry: boolean, log: Log): Promise<{ sent: number; bridgeError?: string }> {
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
  const plan = planOutbox<(typeof rows)[number] & OutboxRow>({
    now,
    rows,
    sentToday: sentRows.length,
    lastSentAt,
    optedOutBrokers: new Set(brokers.filter((b) => b.optOut).map((b) => b.id)),
    optedOutPhones: new Set([...optedOutByPhone.flatMap((b) => b.phones.map(phoneKey)), ...optedOutPosters.map((p) => phoneKey(p.user.phoneNumber ?? ""))]),
    cap,
  });
  const held = plan.hold.reduce<Record<string, number>>((acc, h) => ({ ...acc, [h.reason]: (acc[h.reason] ?? 0) + 1 }), {});
  const alerts = plan.send.filter((r) => r.kind === "TENANT_ALERT");
  const toSend = [...alerts, ...plan.send.filter((r) => r.kind !== "TENANT_ALERT").slice(0, BROKER_SENDS_PER_TICK)];
  log(`queued ${rows.length} · sent today ${sentRows.length}/${cap} · plan ${plan.send.length} (this tick ${toSend.length}) · skip ${plan.skip.length} · hold ${JSON.stringify(held)}`);

  for (const { row } of plan.skip) {
    log(`skip ${row.id} ${row.kind}: broker opted out`);
    if (!dry) await db.outboundMessage.update({ where: { id: row.id }, data: { status: "SKIPPED", error: "broker opted out" } });
  }

  let sent = 0;
  for (const row of toSend) {
    let body = row.body;
    if (row.kind === "BROKER_REQUEST" && row.brokerRequestIds.length) {
      const worded = await askBodyNow(row.brokerRequestIds.join(), row.brokerRequestIds);
      if (worded === "answered") {
        log(`skip ${row.id}: every home on it was answered before it went out`);
        if (!dry) await db.outboundMessage.update({ where: { id: row.id }, data: { status: "SKIPPED", error: "answered before it went out" } });
        continue;
      }
      if (worded) body = worded;
    }
    if (dry) {
      log(`would send ${row.id} ${row.kind} → ${row.to}: ${body.replace(/\s+/g, " ")}`);
      continue;
    }
    if (row.kind !== "TENANT_ALERT" && !inSendWindow(new Date())) break;
    try {
      // Brokers see "typing…" first, as from a person; tenant alerts go straight out.
      if (row.kind !== "TENANT_ALERT") await sendPresence(row.to, typingMs(body));
      const out = await sendText(row.to, body);
      if (row.kind === "TENANT_ALERT") await recordSent(phoneKey(row.to), out?.key?.id);
      const sentAt = new Date();
      await db.outboundMessage.update({ where: { id: row.id }, data: { status: "SENT", sentAt, attempts: { increment: 1 }, error: null, ...(body !== row.body ? { body } : {}) } });
      if (row.kind === "BROKER_REQUEST" && row.brokerRequestIds.length) {
        await db.brokerRequest.updateMany({ where: { id: { in: row.brokerRequestIds } }, data: { channel: "evolution", sentAt } });
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

/** A word back to a broker, as a person types it; its row turns FAILED if WhatsApp refuses it. */
async function sendReply(phone: string, reply: { text: string; outboundId: string }, name: string, log: Log) {
  try {
    await sendPresence(phone, typingMs(reply.text));
    await sendText(phone, reply.text);
  } catch (err) {
    await db.outboundMessage.update({ where: { id: reply.outboundId }, data: { status: "FAILED", error: (err as Error).message.slice(0, 500) } });
    log(`answer to ${name} failed: ${(err as Error).message}`);
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

async function replies(dry: boolean, log: Log): Promise<number> {
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
  if (!dry) for (const m of all) if (m.fromMe && m.direct && m.phone && !byPhone.has(m.phone) && !posterPhones.has(m.phone)) await noteFromMe(m.phone, m.id, m.sentAt);

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
        await db.broker.update({ where: { id: broker.id }, data: { optOut: true, optOutAt: new Date() } });
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
    const action = await handleBrokerReply({ brokerId: broker.id, phone: g.phone, text: g.text, photoUrls, at }).catch((err) => {
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
      await sendReply(g.phone, action, broker.name, log);
    } else if (action.kind === "availability") {
      if (action.reply) await sendReply(g.phone, action.reply, broker.name, log);
      const marked = `${action.applied ? "marked" : "already"} ${action.answer === "RENTED" ? "rented" : "available"}`;
      await postSlackCard(
        `✅ *${broker.name}* (+${g.phone}) answered → home #${action.listingId} ${marked}${action.reply ? ` · we said "${action.reply.text}"` : ""}\n> ${g.text.replace(/\n/g, "\n> ").slice(0, 600)}`,
      );
    } else {
      if (stored.length) pending[broker.id] = { urls: photoUrls, at: now.toISOString() };
      const botAsk = parseBrokerReply(g.text).asksIfBot ? "🤖 asks if they're talking to a bot — answer this one yourself.\n" : "";
      await postSlackCard(
        `${botAsk}💬 *${broker.name}* (+${g.phone}) replied on WhatsApp${stored.length ? ` (${stored.length} photo(s) kept)` : ""}:\n> ${words.replace(/\n/g, "\n> ")}\n<${waLink(g.phone, "")}|Open the chat> — turn it into a home in this thread.`,
      );
    }
  }
  // Posted a home we asked about, but not in the directory: a person reads it.
  for (const g of dry ? [] : groupByPhone(strangers)) {
    await postSlackCard(`💬 +${g.phone} (posts a home we asked about, not in the broker directory) replied on WhatsApp:\n> ${(g.text || "[photo or voice note]").replace(/\n/g, "\n> ").slice(0, 600)}\n<${waLink(g.phone, "")}|Open the chat>`);
  }
  // Tenants the webhook missed; the turn answers each message id once.
  for (const m of tenants) {
    if (dry) log(`would pass a tenant message to the agent`);
    else await answerTenant({ phone: m.phone!, text: m.text, msgId: m.id, sentAt: m.sentAt });
  }
  if (!dry) {
    await mutateState<string[]>("seen", [], (list) => [...list, ...all.map((m) => m.id)].slice(-SEEN_KEEP));
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
  if (!dry && !(await takeLease(LEASE, LEASE_MS))) return { state, sent: 0, replies: 0, skipped: "locked" };
  try {
    const { sent, bridgeError } = await drain(dry, log);
    if (bridgeError) {
      if (!dry) await recordRun(false, bridgeError);
      return { state, sent, replies: 0 };
    }
    const n = state === "open" ? await replies(dry, log) : 0;
    if (!dry) await recordRun(true);
    return { state, sent, replies: n };
  } catch (err) {
    if (!dry) await recordRun(false, (err as Error).message);
    throw err;
  } finally {
    if (!dry) await releaseLease(LEASE);
  }
}
