import "server-only";

/**
 * The broker loop: ask the people who can speak for a shortlisted home whether
 * it is still available, apply their answers to every task waiting on them,
 * and give up honestly after 24 h of silence.
 *
 * Silence is never confirmation. A broker is asked about a home at most once
 * in REASK_GAP_DAYS, by any search — a later tenant's task joins the pending
 * request instead — and only for a real WhatsApp tenant who picked the home
 * (broker-gate.ts) while broker sends are on (broker-sends.ts). Until 11-01 an
 * unanswered ask went back to the same broker every day: the "next broker"
 * check looked back 24 h, and the expired ask was older than that.
 *
 * Since 11-05 the broker most likely to answer is asked first, and one who is
 * silent for FALLBACK_AWAKE_HOURS of daytime hands the home to the next one —
 * at most MAX_BROKERS_PER_HOME per home per tenant (broker-rank.ts).
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { listingPath } from "@/lib/listing-code";
import { publicAppUrl, waLink } from "../../../scripts/crm/public-links";
import { lastTenantAt, REASK_GAP_DAYS, tenantActive, tenantGate, tenantNumber } from "./broker-gate";
import { askedOnLabel } from "./deal-pure";
import { ALERT_LABEL, inSendWindow, phoneKey, REST_DAYS, brokerRest, startOfKigaliDay } from "../../../scripts/wa/outbox-pure";
import { answerStats, dueForNext, MAX_BROKERS_PER_HOME, nudgeDue, rankBrokers, SILENT_LOOKBACK_DAYS, type BrokerSignal } from "./broker-rank";
import { availabilityMessage, brokerAnswerMessage, brokerNumber, needSummary, noReplyMessage, nudgeMessage, viewingRep, type BrokerHomeLine } from "./broker-message";
import { brokerSendMode, testPhones } from "./broker-sends";
import { CONFIRMATION_TTL_DAYS } from "./rank";
import { coerceRequirements, EMPTY_REQUIREMENTS, mergeRequirements, type Requirements } from "./requirements";
import type { EventKind, ShortlistItem, StepStatus } from "./types";
import { postSlackCard, sendMessages, sendToBroker } from "./whatsapp";
import { handOffFailedChat } from "./failed-handoff";

export const REQUEST_TTL_HOURS = 24;
const json = (v: unknown) => v as Prisma.InputJsonValue;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const brokerLink = (token: string, lang = "en") => `${publicAppUrl()}/${lang}/b/${token}`;

/** Append an event at the task's next seq (tasks are written by one turn or one answer at a time). */
export async function appendTaskEvent(taskId: string, kind: EventKind, status: StepStatus, payload: Record<string, unknown>) {
  await appendTaskEvents(taskId, [[kind, status, payload]]);
}

/** Several events in one write: one read of the last seq, one insert. */
export async function appendTaskEvents(taskId: string, rows: [EventKind, StepStatus, Record<string, unknown>][]) {
  if (rows.length === 0) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    const last = await db.agentEvent.findFirst({ where: { taskId }, orderBy: { seq: "desc" }, select: { seq: true } });
    const base = last?.seq ?? 0;
    try {
      await db.agentEvent.createMany({ data: rows.map(([kind, status, payload], i) => ({ taskId, seq: base + i + 1, kind, status, payload: json(payload) })) });
      return;
    } catch (err) {
      if (attempt === 2) throw err; // another writer took the seq; read it again
    }
  }
}

/** Latest broker answer per listing: AVAILABLE within the TTL, or RENTED within 30 days. */
export async function brokerAnswers(listingIds: number[]): Promise<Map<number, { status: "AVAILABLE" | "RENTED"; at: Date }>> {
  if (listingIds.length === 0) return new Map();
  const rows = await db.brokerRequest.findMany({
    where: {
      listingId: { in: listingIds },
      OR: [
        { status: "AVAILABLE", respondedAt: { gte: new Date(Date.now() - CONFIRMATION_TTL_DAYS * 86_400_000) } },
        { status: "RENTED", respondedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } },
      ],
    },
    orderBy: { respondedAt: "desc" },
    select: { listingId: true, status: true, respondedAt: true },
  });
  const out = new Map<number, { status: "AVAILABLE" | "RENTED"; at: Date }>();
  for (const r of rows) if (!out.has(r.listingId) && r.respondedAt) out.set(r.listingId, { status: r.status as "AVAILABLE" | "RENTED", at: r.respondedAt });
  return out;
}

type BrokerLink = {
  listingId: number;
  userId: string;
  /** The ad this broker posted for the home. */
  sourceUrl?: string | null;
  user: { phoneNumber: string | null; username: string | null; sourceHostId: string | null };
  listing?: HomeForLink;
  /** Their directory row, when the ad is linked to one: what the ranking reads. */
  broker?: { relationship: string; lastReplyAt: Date | null; lastSeenAt: Date | null; replyMinutes: number | null } | null;
};
type HomeForLink = { id: number; sourceUrl: string | null; isPublished: boolean; code: string | null; sourceListingId: string | null };
const HOME_FOR_LINK = { id: true, sourceUrl: true, isPublished: true, code: true, sourceListingId: true } as const;

const isUrl = (u: string | null | undefined): u is string => !!u && /^https?:\/\//.test(u);

/**
 * The link a tenant would send: the broker's own ad, else wherever the home was
 * found, else its Mkan page — only when published (an unpublished one 404s).
 */
export function homeLink(ad: string | null | undefined, home: HomeForLink | null | undefined): string | null {
  if (isUrl(ad)) return ad;
  const found = home?.sourceUrl;
  if (isUrl(found)) return found;
  return home?.isPublished ? `${publicAppUrl()}${listingPath("en", home)}` : null;
}

/** Where the line remembers it has introduced Mkan to a broker's number (WaState). */
export const introKey = (phone: string) => `broker-intro:${phone.replace(/\D/g, "")}`;

export async function wasIntroduced(phone: string): Promise<boolean> {
  return !!(await db.waState.findUnique({ where: { key: introKey(phone) }, select: { key: true } }).catch(() => null));
}

export async function markIntroduced(phone: string, at = new Date()): Promise<void> {
  const value = { at: at.toISOString() };
  await db.waState.upsert({ where: { key: introKey(phone) }, create: { key: introKey(phone), value }, update: { value } }).catch(() => {});
}

/**
 * What a queued ask says when it goes out, read again from its requests: a
 * wording change reaches rows queued before it, and a home answered in the
 * meantime is not asked about again. Worded as Mkan, in the broker's language:
 * their first message introduces us. `answered` — every home on it already has
 * its answer; `expired` — every request on it timed out while it waited;
 * null — keep the stored text.
 */
export async function askBodyNow(seed: string, requestIds: string[], to?: string): Promise<{ body: string; intro: boolean } | "answered" | "expired" | null> {
  const requests = await db.brokerRequest.findMany({
    where: { id: { in: requestIds } },
    select: { listingId: true, brokerUserId: true, status: true, expiresAt: true, need: true, listing: { select: { title: true, ...HOME_FOR_LINK } } },
  });
  if (requests.length === 0) return null;
  const open = requests.filter((q) => q.status !== "AVAILABLE" && q.status !== "RENTED");
  if (open.length === 0) return "answered";
  // A request that timed out in the queue has been handed on (or given up) by the hourly cron.
  if (open.every((q) => q.status === "NO_REPLY" || q.expiresAt.getTime() < Date.now())) return "expired";
  const ads = await db.listingBroker.findMany({
    where: { OR: open.map((q) => ({ listingId: q.listingId, userId: q.brokerUserId })) },
    select: { listingId: true, sourceUrl: true, broker: { select: { contactName: true, preferredLanguage: true } } },
  });
  const adOf = new Map(ads.map((a) => [a.listingId, a]));
  const homes: BrokerHomeLine[] = [];
  const seen = new Set<number>();
  for (const q of open) {
    if (seen.has(q.listingId)) continue;
    seen.add(q.listingId);
    const link = homeLink(adOf.get(q.listingId)?.sourceUrl, q.listing);
    if (!link) return null;
    homes.push({ title: q.listing.title ?? "", link, code: q.listing.code });
  }
  const broker = ads.find((a) => a.broker)?.broker ?? null;
  const wanted = mergeRequirements(EMPTY_REQUIREMENTS, coerceRequirements((open[0]?.need as { requirements?: unknown } | null)?.requirements));
  const intro = to ? !(await wasIntroduced(to)) : true;
  const need = hasNeed(wanted) ? needSummary(wanted).they : null;
  const body = availabilityMessage(homes, seed, { introduce: intro, name: broker?.contactName, lang: broker?.preferredLanguage, need });
  return { body, intro };
}

/** Enough of a need to tell a broker: a size, a type, a place or a budget. */
const hasNeed = (r: Requirements) => r.bedrooms != null || !!r.homeType || !!r.district || !!r.neighbourhood || !!r.maxPrice;

type RecentRequest = { id: string; listingId: number; brokerUserId: string; status: string; expiresAt: Date; taskId: string | null; createdAt: Date };
const RECENT_SELECT = { id: true, listingId: true, brokerUserId: true, status: true, expiresAt: true, taskId: true, createdAt: true } as const;

/** Phones are stored "+250…" on users and as given on outbox rows. */
const phoneVariants = (phones: string[]) => [...new Set(phones.map(phoneKey).filter(Boolean).flatMap((k) => [`+${k}`, k]))];

/**
 * Everyone who can speak for each home — never one who said STOP — the one
 * most likely to answer first (broker-rank.ts): their own answer rate, where
 * Mkan stands with them, how recently they were active. A broker the outbox
 * would hold today goes behind the rest, one who never answers goes last.
 */
async function brokersFor(listingIds: number[], now = new Date()): Promise<Map<number, BrokerLink[]>> {
  const links = await db.listingBroker.findMany({
    where: {
      listingId: { in: listingIds },
      user: { phoneNumber: { not: null } },
      NOT: [{ broker: { is: { optOut: true } } }, { broker: { is: { relationship: "DO_NOT_CONTACT" } } }],
    },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      listingId: true,
      userId: true,
      sourceUrl: true,
      user: { select: { phoneNumber: true, username: true, sourceHostId: true } },
      listing: { select: HOME_FOR_LINK },
      broker: { select: { relationship: true, lastReplyAt: true, lastSeenAt: true, replyMinutes: true } },
    },
  });
  const reachable = links.filter((l) => l.user.phoneNumber);
  const signals = await brokerSignals(reachable, now);
  const out = new Map<number, BrokerLink[]>();
  for (const l of reachable) out.set(l.listingId, [...(out.get(l.listingId) ?? []), l]);
  for (const [id, list] of out) out.set(id, rankBrokers(list, (l) => signals.get(l.userId) ?? { asked: 0, answered: 0, askedLong: 0, answeredLong: 0 }, now));
  return out;
}

/** What the ranking knows about each broker: their asks and own answers, and whether the outbox would hold an ask to them now. */
async function brokerSignals(links: BrokerLink[], now: Date): Promise<Map<string, BrokerSignal>> {
  const out = new Map<string, BrokerSignal>();
  if (links.length === 0) return out;
  const userIds = [...new Set(links.map((l) => l.userId))];
  const phones = phoneVariants(links.map((l) => l.user.phoneNumber!));
  const [asks, outbound] = await Promise.all([
    db.brokerRequest.findMany({
      where: { brokerUserId: { in: userIds }, createdAt: { gte: new Date(now.getTime() - SILENT_LOOKBACK_DAYS * 86_400_000) } },
      select: { brokerUserId: true, status: true, channel: true, sentAt: true, respondedAt: true, createdAt: true },
    }),
    db.outboundMessage.findMany({
      where: {
        to: { in: phones },
        kind: { in: ["BROKER_REQUEST", "BROKER_ASK"] },
        OR: [{ status: "QUEUED" }, { status: "SENT", sentAt: { gte: new Date(now.getTime() - REST_DAYS * 86_400_000) } }],
      },
      select: { to: true, status: true, sentAt: true, label: true },
    }),
  ]);
  const stats = answerStats(asks, now);
  const today = startOfKigaliDay(now);
  const busy = new Set<string>();
  const sent = new Map<string, Date[]>();
  for (const m of outbound) {
    const key = phoneKey(m.to);
    // One message per broker a Kigali day (outbox-pure.ts): a queued one or one sent today takes it.
    if (m.status === "QUEUED" || (m.sentAt && m.sentAt >= today)) busy.add(key);
    if (m.status === "SENT" && m.sentAt && !m.label?.startsWith("auto-")) sent.set(key, [...(sent.get(key) ?? []), m.sentAt]);
  }
  for (const l of links) {
    if (out.has(l.userId)) continue;
    const key = phoneKey(l.user.phoneNumber!);
    const s = stats.get(l.userId) ?? { asked: 0, answered: 0, askedLong: 0, answeredLong: 0 };
    const lastReplyAt = l.broker?.lastReplyAt ?? null;
    out.set(l.userId, {
      ...s,
      relationship: l.broker?.relationship ?? null,
      lastReplyAt,
      lastSeenAt: l.broker?.lastSeenAt ?? null,
      replyMinutes: l.broker?.replyMinutes ?? null,
      held: busy.has(key) || brokerRest(sent.get(key) ?? [], lastReplyAt, now) != null,
    });
  }
  return out;
}

/**
 * Per broker user, the last `days` days: availability asks that went out and
 * those they answered themselves — the number the ranking reads, and what
 * `pnpm wa:brokers` prints. A later tenant joining an ask is not another ask.
 */
export async function brokerAnswerRates(now = new Date(), days = 30): Promise<{ brokerUserId: string; asked: number; answered: number }[]> {
  const rows = await db.brokerRequest.findMany({
    where: { createdAt: { gte: new Date(now.getTime() - days * 86_400_000) }, channel: { not: "joined" }, sentAt: { not: null } },
    select: { brokerUserId: true, status: true, channel: true, sentAt: true, respondedAt: true, createdAt: true },
  });
  return [...answerStats(rows, now)].map(([brokerUserId, s]) => ({ brokerUserId, asked: s.asked, answered: s.answered }));
}

/** The newest request per (home, broker). */
function newestPerBroker(rows: RecentRequest[]): Map<string, RecentRequest> {
  const recent = new Map<string, RecentRequest>();
  for (const q of [...rows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) if (!recent.has(`${q.listingId}:${q.brokerUserId}`)) recent.set(`${q.listingId}:${q.brokerUserId}`, q);
  return recent;
}

/**
 * Who to ask about one home, given its requests of the last REASK_GAP_DAYS. A
 * question already out is joined; otherwise the first broker not asked about it
 * in that time — so a broker who said nothing hands the home to the next one
 * who posted it, and is never asked about it again the next day.
 */
export function pickBroker(
  brokers: BrokerLink[],
  recent: Map<string, RecentRequest>,
  now = Date.now(),
  opts: { join?: boolean } = {},
): { join: RecentRequest; broker: BrokerLink } | { ask: BrokerLink } | null {
  // Handing a slow ask on (`join: false`), the broker still being asked is passed over, not joined.
  for (const b of opts.join === false ? [] : brokers) {
    const r = recent.get(`${b.listingId}:${b.userId}`);
    if (r?.status === "PENDING" && r.expiresAt.getTime() > now) return { join: r, broker: b };
  }
  // One person can post a home under two accounts: a number already asked about it is not asked again
  // as "the next broker" (2026-11-06).
  const digits = (b: BrokerLink) => (b.user.phoneNumber ?? "").replace(/\D/g, "");
  const askedNumbers = new Set(brokers.filter((b) => recent.has(`${b.listingId}:${b.userId}`)).map(digits).filter(Boolean));
  // A broker who answered "available" may be asked again once that answer is old; silence and "rented" wait out the gap.
  const fresh = brokers.find((b) => {
    const r = recent.get(`${b.listingId}:${b.userId}`);
    if (!r && digits(b) && askedNumbers.has(digits(b))) return false;
    return !r || (r.status === "AVAILABLE" && now - r.createdAt.getTime() > CONFIRMATION_TTL_DAYS * 86_400_000);
  });
  return fresh ? { ask: fresh } : null;
}

const handleOf = (b: BrokerLink) => (b.user.sourceHostId?.startsWith("tiktok:") ? b.user.sourceHostId.slice(7) : null);

/** Send each broker one message for all their homes, and record the channel it went by. */
async function sendGrouped(
  groups: Map<string, { phone: string; handle: string | null; homes: BrokerHomeLine[]; ids: string[] }>,
): Promise<{ broker: string | null; count: number; channel: string }[]> {
  return Promise.all(
    [...groups.values()].map(async (m) => {
      const channel = await sendToBroker(m.phone, availabilityMessage(m.homes, m.ids.join()), m.handle ? `@${m.handle}` : m.phone, m.ids);
      // "queued": the Mac's outbox stamps channel "evolution" and sentAt once it really went out.
      await db.brokerRequest.updateMany({ where: { id: { in: m.ids } }, data: { channel, sentAt: null } });
      return { broker: m.handle ? `@${m.handle}` : null, count: m.homes.length, channel };
    }),
  );
}

/**
 * For every unconfirmed home on the shortlist that has a reachable broker,
 * make sure a request is out. One WhatsApp per broker, listing all their homes.
 * Returns the listing ids now awaiting an answer.
 *
 * Reads and writes in batches: this ran one query per home and one event
 * insert per home and per broker, all in sequence, inside the tenant's turn.
 */
export async function requestConfirmations(taskId: string, shortlist: ShortlistItem[], r: Requirements, lang: string): Promise<number[]> {
  const unconfirmed = shortlist.filter((s) => s.availability === "unconfirmed");
  if (unconfirmed.length === 0) return [];
  // The caller has checked the tenant (availability.ts); with broker sends off nothing is asked at all.
  if ((await brokerSendMode()) !== "gated") return [];
  const ids = unconfirmed.map((s) => s.id);
  const since = new Date(Date.now() - REASK_GAP_DAYS * 86_400_000);
  const [brokers, recentRows] = await Promise.all([
    brokersFor(ids),
    db.brokerRequest.findMany({ where: { listingId: { in: ids }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: RECENT_SELECT }),
  ]);
  const recent = newestPerBroker(recentRows);

  const need = needSummary(r);
  const needJson = json({ requirements: r, summary: need });
  const joins: Prisma.BrokerRequestCreateManyInput[] = [];
  const asks: { row: Prisma.BrokerRequestCreateManyInput; token: string; item: ShortlistItem; broker: BrokerLink }[] = [];
  const events: [EventKind, StepStatus, Record<string, unknown>][] = [];
  const waiting: number[] = [];

  for (const item of unconfirmed) {
    const pick = pickBroker(brokers.get(item.id) ?? [], recent);
    if (!pick) continue;
    waiting.push(item.id);
    if ("join" in pick) {
      // Already asked today: this task joins the same question (a row of its
      // own so the answer reaches it), and nothing is sent again.
      if (pick.join.taskId !== taskId) {
        joins.push({ tokenHash: hashToken(randomBytes(18).toString("base64url")), listingId: item.id, brokerUserId: pick.broker.userId, taskId, locale: lang, need: needJson, channel: "joined", expiresAt: pick.join.expiresAt });
      }
      events.push(["broker_contact_started", "waiting_person", { listingId: item.id, title: item.title, reused: true }]);
      continue;
    }
    const token = randomBytes(18).toString("base64url");
    const row = { tokenHash: hashToken(token), listingId: item.id, brokerUserId: pick.ask.userId, taskId, locale: lang, need: needJson, expiresAt: new Date(Date.now() + REQUEST_TTL_HOURS * 3_600_000) };
    asks.push({ row, token, item, broker: pick.ask });
  }

  const created = asks.length
    ? await db.brokerRequest.createManyAndReturn({ data: asks.map((a) => a.row), select: { id: true, tokenHash: true } })
    : [];
  if (joins.length) await db.brokerRequest.createMany({ data: joins });
  const idByHash = new Map(created.map((c) => [c.tokenHash, c.id]));
  const groups = new Map<string, { phone: string; handle: string | null; homes: BrokerHomeLine[]; ids: string[] }>();
  for (const a of asks) {
    const id = idByHash.get(a.row.tokenHash);
    if (!id) continue;
    const g = groups.get(a.broker.userId) ?? { phone: a.broker.user.phoneNumber!, handle: handleOf(a.broker), homes: [], ids: [] };
    g.homes.push({ title: a.item.title, link: homeLink(a.broker.sourceUrl, a.broker.listing) ?? brokerLink(a.token, "en"), code: a.broker.listing?.code });
    g.ids.push(id);
    groups.set(a.broker.userId, g);
  }
  for (const sent of await sendGrouped(groups)) events.push(["broker_contact_started", "waiting_person", sent]);
  await appendTaskEvents(taskId, events);
  return waiting;
}

type Answer = "AVAILABLE" | "RENTED" | "NO_REPLY";

/** Re-derive tasks' status: WAITING while any of its homes still has a pending request. */
async function settleTasks(taskIds: string[]) {
  if (taskIds.length === 0) return;
  const pending = await db.brokerRequest.groupBy({ by: ["taskId"], where: { taskId: { in: taskIds }, status: "PENDING" }, _count: true });
  const waiting = new Set(pending.map((p) => p.taskId));
  const ids = (s: boolean) => taskIds.filter((t) => waiting.has(t) === s);
  // A RUNNING turn writes its own status when it finishes.
  await Promise.all([
    ids(true).length ? db.agentTask.updateMany({ where: { id: { in: ids(true) }, status: { not: "RUNNING" } }, data: { status: "WAITING" } }) : null,
    ids(false).length ? db.agentTask.updateMany({ where: { id: { in: ids(false) }, status: { not: "RUNNING" } }, data: { status: "DONE" } }) : null,
  ]);
}

/**
 * Write a broker's answer onto every task whose shortlist holds the home and
 * that is still waiting — not just the task that sent the request. Mkan stays
 * in the middle (2026-11-01): the tenant never gets the broker's number; a yes
 * goes to #mkan for the person who sets up the viewing.
 */
export async function applyAnswer(listingId: number, answer: Answer, brokerPhone?: string | null, via: "typed" | "form" = "form") {
  const number = answer === "AVAILABLE" ? brokerNumber(brokerPhone) : null;
  // Every open question about this home has its answer now. `respondedAt` stays on the
  // answering broker's own rows (the caller stamped them), so a broker's answer rate
  // counts only what they said (broker-rank.ts answerStats).
  if (answer !== "NO_REPLY") {
    // "Taken" closes the earlier "available" answers too: the home is gone (2026-11-06).
    await db.brokerRequest.updateMany({ where: { listingId, status: answer === "RENTED" ? { in: ["PENDING", "AVAILABLE"] } : "PENDING" }, data: { status: answer } });
  }
  const rows = await db.agentTask.findMany({
    // RUNNING too: an answer that lands mid-turn is written into the chat, and the turn keeps it (run.ts).
    where: { status: { in: ["WAITING", "DONE", "RUNNING"] }, updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, brokerRequests: { some: { listingId } } },
    select: {
      id: true, shortlist: true, locale: true, messages: true,
      profile: { select: { waPhone: true } },
      // A web tenant who left a number beside "Ask the broker" hears the answer there too (2026-11-08).
      demand: { select: { phone: true, optInAt: true } },
      brokerRequests: { where: { listingId }, select: { status: true } },
    },
  });
  // From here a task's `profile.waPhone` is where the tenant is reached: the WhatsApp chat's own number, else that one.
  const found = rows.map(({ demand: _demand, ...t }) => ({ ...t, profile: { waPhone: tenantNumber({ profile: t.profile, demand: _demand }) } }));
  // "No reply" is news only to a tenant still waiting: one whose broker already said yes (or taken) in
  // these 7 days used to hear "the broker hasn't answered" when a later ask expired (2026-11-06).
  const tasks = answer === "NO_REPLY" ? found.filter((t) => !t.brokerRequests.some((r) => r.status === "AVAILABLE" || r.status === "RENTED")) : found;
  const availability = answer === "AVAILABLE" ? "confirmed" : answer === "RENTED" ? "rented" : "no_reply";
  await Promise.all(
    tasks.map(async (t) => {
      const list = ((t.shortlist as unknown as ShortlistItem[]) ?? []).map((s) => (s.id === listingId ? { ...s, availability: availability as ShortlistItem["availability"] } : s));
      const item = list.find((s) => s.id === listingId);
      await db.agentTask.update({ where: { id: t.id }, data: { shortlist: json(list) } });
      await appendTaskEvent(t.id, "broker_replied", answer === "AVAILABLE" ? "done" : answer === "RENTED" ? "failed" : "uncertain", {
        listingId,
        title: item?.title ?? null,
        answer: availability,
      });
    }),
  );
  await settleTasks(tasks.map((t) => t.id));
  await markOriginChats(found, listingId, availability);
  const introduced = await tellWhatsAppTenants(tasks, listingId, answer, brokerPhone ?? null, via === "typed");
  if (answer === "AVAILABLE") {
    // Available again lifts an earlier "taken".
    await db.listing.update({ where: { id: listingId }, data: { lastAvailabilityConfirmedAt: new Date(), lostAt: null, lostReason: null } });
    // An intro needs no person at the viewing (deal-intro.ts posts its own card).
    if (!introduced) await tellViewingRep(tasks, listingId, number);
  }
  // A broker's "taken" means the home is lost: out of /find and the TikTok pick for good (it was hidden 30 days).
  if (answer === "RENTED") await db.listing.update({ where: { id: listingId }, data: { lostAt: new Date(), lostReason: "RENTED" } });
}

/**
 * The web chats these WhatsApp chats were started from ("Check K1234 for me ref:<chat>"): the tenant
 * asked on the web, so the answer shows there too, not only on WhatsApp (2026-11-06).
 */
async function markOriginChats(tasks: { id: string; messages: unknown }[], listingId: number, availability: string) {
  const answered = new Set(tasks.map((t) => t.id));
  const origins = [
    ...new Set(
      tasks.flatMap((t) => ((t.messages as { role?: string; origin?: string }[] | null) ?? []).filter((m) => m.role === "user" && m.origin).map((m) => m.origin!)),
    ),
  ].filter((id) => !answered.has(id));
  for (const id of origins) {
    const web = await db.agentTask.findUnique({ where: { id }, select: { id: true, shortlist: true } }).catch(() => null);
    const list = (web?.shortlist as unknown as ShortlistItem[] | null) ?? [];
    if (!web || !list.some((s) => s.id === listingId)) continue;
    await db.agentTask.update({ where: { id }, data: { shortlist: json(list.map((s) => (s.id === listingId ? { ...s, availability: availability as ShortlistItem["availability"] } : s))) } }).catch(() => {});
    await appendTaskEvent(id, "broker_replied", availability === "confirmed" ? "done" : availability === "rented" ? "failed" : "uncertain", { listingId, answer: availability, via: "whatsapp" }).catch(() => {});
  }
}

type AnsweredTask = { id: string; shortlist: unknown; locale: string; messages: unknown; profile: { waPhone: string | null } | null };
const titleIn = (t: AnsweredTask, listingId: number) => ((t.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === listingId)?.title?.trim() || `#${listingId}`;

/**
 * A tenant who asked on WhatsApp hears the broker's answer there — the web
 * chat updates itself, a WhatsApp chat does not. "No reply" reaches only a
 * tenant still in the search. Queued like every other send (whatsapp.ts).
 */
async function tellWhatsAppTenants(tasks: AnsweredTask[], listingId: number, answer: Answer, brokerPhone: string | null, typed = false): Promise<boolean> {
  if (!tasks.some((t) => t.profile?.waPhone)) return false;
  // Times exist only when the broker offered them on the form; a typed "yes" offers none.
  const offered = answer === "AVAILABLE" ? await db.brokerRequest.findMany({ where: { listingId, status: "AVAILABLE" }, select: { viewingSlots: true }, take: 20 }) : [];
  const canPick = offered.some((r) => Array.isArray(r.viewingSlots) && r.viewingSlots.some((s) => typeof s === "string" && Date.parse(s) > Date.now()));
  const now = new Date();
  // A yes, until 10 deals are paid: a direct intro — the broker agrees Mkan's terms, then each gets
  // the other's number (deal-intro.ts, Abdout 2026-11-07). Dynamic: deal-intro imports deal.ts.
  if (answer === "AVAILABLE" && !canPick) {
    const { introMode, startIntro } = await import("./deal-intro");
    if ((await introMode().catch(() => "relay" as const)) === "intro") {
      const res = await startIntro(tasks, listingId, brokerPhone, { typed }).catch((err) => {
        console.warn(`[agent] intro: ${(err as Error).message}`);
        return { started: false, reply: null };
      });
      if (res.started) return true;
    }
    // After that, Mkan in the middle: the deal sheet (what it costs, what Mkan covers, what happens
    // next) and "when can you come?" (deal.ts).
    const { sendDealSheet } = await import("./deal");
    await Promise.all(tasks.filter((t) => t.profile?.waPhone).map((t) => sendDealSheet(t, listingId).catch((err) => console.warn(`[agent] deal sheet: ${(err as Error).message}`))));
    return false;
  }
  // Dynamic: demand.ts imports this module.
  const { chatLink } = await import("./demand");
  const messages = tasks.flatMap((t) => {
    const to = t.profile?.waPhone;
    if (!to) return [];
    const link = chatLink(t.id, t.locale);
    if (answer === "NO_REPLY") return tenantActive(t.messages, now) ? [{ kind: "TENANT_ALERT" as const, to, body: noReplyMessage(t.locale, titleIn(t, listingId), link), label: ALERT_LABEL.brokerAnswer }] : [];
    // A day or more after they last wrote: name the day they asked, and ask whether they're still looking.
    const askedOn = askedOnLabel(lastTenantAt(t.messages), now, t.locale === "ar" || t.locale === "rw" ? t.locale : "en");
    return [{ kind: "TENANT_ALERT" as const, to, body: brokerAnswerMessage(t.locale, titleIn(t, listingId), answer === "AVAILABLE", link, canPick, undefined, askedOn), label: ALERT_LABEL.brokerAnswer }];
  });
  if (messages.length) await sendMessages(messages, `Broker answered home #${listingId}`);
  return false;
}

/** A yes for a WhatsApp tenant: the person who will be at the viewing hears it in #mkan, with both chats one tap away. */
async function tellViewingRep(tasks: AnsweredTask[], listingId: number, brokerPhone: string | null) {
  const tenants = [...new Set(tasks.map((t) => t.profile?.waPhone).filter((p): p is string => !!p))];
  if (tenants.length === 0) return;
  const title = titleIn(tasks.find((t) => t.profile?.waPhone)!, listingId);
  const who = tenants.map((p) => `<${waLink(p, "")}|${p}>`).join(", ");
  const broker = brokerPhone ? ` · broker <${waLink(brokerPhone, "")}|${brokerPhone}>` : "";
  await postSlackCard(`🔑 *${title}* (#${listingId}) is available — ${viewingRep()}, set up the viewing (tenant + broker + you).\nTenant: ${who}${broker}`).catch(() => {});
}

type Waiting = {
  taskId: string | null;
  locale: string;
  need: Prisma.JsonValue;
  task: { messages: Prisma.JsonValue; profile: { waPhone: string | null } | null } | null;
};
const WAITING_SELECT = { taskId: true, locale: true, need: true, task: { select: { messages: true, profile: { select: { waPhone: true } } } } } as const;

/** The waiting rows whose search carries the question on: a real WhatsApp tenant (broker-gate.ts) still writing to us, while sends are on. */
async function liveWaiting<T extends Waiting>(rows: T[], now: Date): Promise<T[]> {
  if (rows.length === 0) return [];
  const [mode, tests] = await Promise.all([brokerSendMode(), testPhones()]);
  return rows.filter((r) => r.task && tenantGate({ mode, waPhone: r.task.profile?.waPhone ?? null, testPhones: tests }).ok && tenantActive(r.task.messages, now));
}

/**
 * Ask the next broker who posted the home, for every task waiting on it: one
 * message and one counted ask (the other tasks join it). Never a broker asked
 * about the home in REASK_GAP_DAYS, never more than MAX_BROKERS_PER_HOME for one
 * tenant. False when nobody is left to ask.
 */
async function askNext(listingId: number, title: string | null, waiting: Waiting[], now: Date, why: "expired" | "slow"): Promise<boolean> {
  const byTask = new Map<string, Waiting>();
  for (const w of waiting) if (w.taskId && !byTask.has(w.taskId)) byTask.set(w.taskId, w);
  if (byTask.size === 0) return false;
  const since = new Date(now.getTime() - REASK_GAP_DAYS * 86_400_000);
  const [brokers, recentRows] = await Promise.all([
    brokersFor([listingId], now),
    db.brokerRequest.findMany({ where: { listingId, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: RECENT_SELECT }),
  ]);
  const askedFor = new Map<string, Set<string>>();
  for (const q of recentRows) if (q.taskId) askedFor.set(q.taskId, (askedFor.get(q.taskId) ?? new Set<string>()).add(q.brokerUserId));
  const tasks = [...byTask.values()].filter((t) => (askedFor.get(t.taskId!)?.size ?? 0) < MAX_BROKERS_PER_HOME);
  if (tasks.length === 0) return false;
  const pick = pickBroker(brokers.get(listingId) ?? [], newestPerBroker(recentRows), now.getTime(), { join: false });
  if (!pick || !("ask" in pick)) return false;

  const tokens = tasks.map(() => randomBytes(18).toString("base64url"));
  const expiresAt = new Date(now.getTime() + REQUEST_TTL_HOURS * 3_600_000);
  const created = await db.brokerRequest.createManyAndReturn({
    data: tasks.map((t, i) => ({
      tokenHash: hashToken(tokens[i]!),
      listingId,
      brokerUserId: pick.ask.userId,
      taskId: t.taskId,
      locale: t.locale,
      need: json(t.need),
      expiresAt,
      // One ask goes out; the other tasks ride on it, as in requestConfirmations.
      ...(i > 0 ? { channel: "joined" } : {}),
    })),
    select: { id: true, tokenHash: true },
  });
  const first = created.find((c) => c.tokenHash === hashToken(tokens[0]!));
  if (!first) return false;
  const link = homeLink(pick.ask.sourceUrl, pick.ask.listing) ?? brokerLink(tokens[0]!, "en");
  const handle = handleOf(pick.ask);
  await sendGrouped(new Map([[pick.ask.userId, { phone: pick.ask.user.phoneNumber!, handle, homes: [{ title: title ?? "Home in Kigali", link, code: pick.ask.listing?.code }], ids: [first.id] }]]));
  await Promise.all(tasks.map((t) => appendTaskEvent(t.taskId!, "broker_contact_started", "waiting_person", { listingId, title, broker: handle ? `@${handle}` : null, next: true, why })));
  return true;
}

/**
 * Cron: requests unanswered past their expiry become NO_REPLY. A home goes on
 * to the next broker who posted it only for a real tenant still in the search
 * (broker-gate.ts), and never back to a broker asked about it in
 * REASK_GAP_DAYS. Only when nobody is left does the tenant hear "no reply".
 */
export async function expireRequests(now = new Date()): Promise<number> {
  const stale = await db.brokerRequest.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true, listingId: true, ...WAITING_SELECT, listing: { select: { title: true } } },
  });
  if (stale.length === 0) return 0;
  await db.brokerRequest.updateMany({ where: { id: { in: stale.map((r) => r.id) } }, data: { status: "NO_REPLY" } });

  const live = await liveWaiting(stale, now);
  const listingIds = [...new Set(stale.map((r) => r.listingId))];
  const stillPending = await db.brokerRequest.groupBy({ by: ["listingId"], where: { listingId: { in: listingIds }, status: "PENDING", expiresAt: { gte: now } }, _count: true });
  const pendingNow = new Set(stillPending.map((p) => p.listingId));

  for (const listingId of listingIds) {
    if (pendingNow.has(listingId)) continue; // someone else is still being asked
    // Only the searches of real tenants still writing to us carry the question on.
    const mine = live.filter((r) => r.listingId === listingId);
    const asked = mine.length ? await askNext(listingId, mine[0]!.listing.title, mine, now, "expired") : false;
    if (!asked) await applyAnswer(listingId, "NO_REPLY");
  }
  return stale.length;
}

/**
 * Cron, hourly: a broker who has not answered within FALLBACK_AWAKE_HOURS of
 * daytime (08:00–20:00 Kigali) since the ask really went out hands the home to
 * the next broker who posted it. Their own ask stays open for its 24 h — a late
 * yes still counts. Nothing is handed on at night, while an ask still waits in
 * the outbox (caps, quiet hours), or with broker sends off. Returns the homes
 * handed on.
 */
export async function handOnUnanswered(now = new Date()): Promise<number> {
  if (!inSendWindow(now)) return 0;
  const open = await db.brokerRequest.findMany({
    where: { status: "PENDING", expiresAt: { gt: now } },
    select: { listingId: true, channel: true, sentAt: true, createdAt: true, ...WAITING_SELECT, listing: { select: { title: true } } },
  });
  const byHome = new Map<number, typeof open>();
  for (const r of open) byHome.set(r.listingId, [...(byHome.get(r.listingId) ?? []), r]);
  let handed = 0;
  for (const [listingId, rows] of byHome) {
    // The newest ask about the home: still queued, or not yet slow, keeps the wait.
    const newest = rows.filter((r) => r.channel !== "joined").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    if (!newest?.sentAt || !dueForNext(newest.sentAt, now)) continue;
    const live = await liveWaiting(rows, now);
    if (live.length && (await askNext(listingId, rows[0]!.listing.title, live, now, "slow"))) handed += 1;
  }
  return handed;
}

/**
 * Cron, hourly: the one nudge. A broker whose ask went out and is still unanswered after NUDGE_AWAKE_HOURS
 * of daytime (08:00–20:00 Kigali; a night ask is nudged next morning) gets one short reminder for all their
 * open homes, Kinyarwanda first. It is recorded on each BrokerRequest (`need.nudgedAt`) before it is queued,
 * so it never repeats. It follows every gate an ask does: broker sends `gated`, a real tenant still writing
 * (liveWaiting), the send window, and the outbox's own opt-out and caps (label `auto-nudge` is a reply to our
 * own ask, so it is not held for "asked today"). Returns the brokers nudged.
 */
export async function nudgeUnanswered(now = new Date()): Promise<number> {
  if (!inSendWindow(now) || (await brokerSendMode()) !== "gated") return 0;
  const open = await db.brokerRequest.findMany({
    where: { status: "PENDING", expiresAt: { gt: now }, sentAt: { not: null }, channel: { not: "joined" } },
    select: {
      id: true,
      listingId: true,
      brokerUserId: true,
      sentAt: true,
      ...WAITING_SELECT,
      listing: { select: HOME_FOR_LINK },
      broker: { select: { phoneNumber: true, username: true } },
    },
  });
  const due = open.filter((r) => nudgeDue(r.sentAt, now, (r.need as { nudgedAt?: string } | null)?.nudgedAt));
  const live = new Set((await liveWaiting(due, now)).map((r) => r.id));
  const byBroker = new Map<string, typeof due>();
  for (const r of due) if (live.has(r.id) && r.broker.phoneNumber) byBroker.set(r.brokerUserId, [...(byBroker.get(r.brokerUserId) ?? []), r]);
  let nudged = 0;
  for (const [userId, rows] of byBroker) {
    const ads = await db.listingBroker.findMany({
      where: { userId, listingId: { in: rows.map((r) => r.listingId) } },
      select: { listingId: true, sourceUrl: true, broker: { select: { contactName: true, preferredLanguage: true, optOut: true } } },
    });
    const person = ads.find((a) => a.broker)?.broker ?? null;
    if (person?.optOut) continue;
    const links = rows.map((r) => homeLink(ads.find((a) => a.listingId === r.listingId)?.sourceUrl, r.listing)).filter((l): l is string => !!l);
    if (links.length === 0) continue;
    // Recorded first: a failed send is not retried, the nudge is never sent twice.
    const stamp = now.toISOString();
    await Promise.all(rows.map((r) => db.brokerRequest.update({ where: { id: r.id }, data: { need: json({ ...((r.need as object | null) ?? {}), nudgedAt: stamp }) } })));
    const phone = rows[0]!.broker.phoneNumber!;
    await sendMessages([{ kind: "BROKER_ASK", to: phone, body: nudgeMessage(links, person?.preferredLanguage, person?.contactName), label: `auto-nudge:${userId}` }], "Rental agent nudge").catch((err) => console.warn(`[broker] nudge: ${(err as Error).message}`));
    nudged += 1;
  }
  return nudged;
}

/**
 * Cron: a turn whose `after()` was lost stays RUNNING forever — unlock it, as
 * an open tab would (task-view.ts `recoverStuck`). One that already answered
 * is done; one that never did gets the error reply, so the chat does not end
 * on the tenant's own message.
 */
/**
 * WAITING tasks with no broker question still open are DONE: nothing can answer them, and a WAITING chat
 * polls for half an hour every time it is opened. A pause or a script that closed the questions without
 * settling their tasks left 9 such chats for 6–17 days (2026-11-08). Raw SQL so `updatedAt` stays: the
 * chat keeps its place in the list, and the poll still sees the status change.
 */
export async function settleOrphanedWaiting(now = new Date(), idleMs = 15 * 60_000): Promise<number> {
  return db.$executeRaw`
    UPDATE "AgentTask" t SET "status" = 'DONE'
    WHERE t."status" = 'WAITING' AND t."updatedAt" < ${new Date(now.getTime() - idleMs)}
      AND NOT EXISTS (SELECT 1 FROM "BrokerRequest" b WHERE b."taskId" = t."id" AND b."status" = 'PENDING')`;
}

export async function failStuckTasks(now = new Date(), olderThanMs = 90_000): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const errorReply = JSON.stringify([{ role: "agent", kind: "error", at: now.toISOString() }]);
  const rows = await db.$queryRaw<{ id: string; failed: boolean }[]>`
    UPDATE "AgentTask" SET
      "status" = (CASE WHEN "messages"->-1->>'role' = 'agent' THEN 'DONE' ELSE 'FAILED' END)::"AgentTaskStatus",
      "messages" = CASE WHEN "messages"->-1->>'role' = 'agent' THEN "messages" ELSE "messages" || ${errorReply}::jsonb END,
      "updatedAt" = ${now}
    WHERE "status" = 'RUNNING' AND "updatedAt" < ${cutoff}
    RETURNING id, ("status" = 'FAILED') AS failed`;
  // A chat that ended on the tenant's own words reaches #mkan, not just the tenant's "Try again".
  await Promise.all(rows.filter((r) => r.failed).map((r) => handOffFailedChat(r.id, "stuck")));
  return rows.length;
}
