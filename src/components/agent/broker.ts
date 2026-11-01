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
 */
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { listingPath } from "@/lib/listing-code";
import { publicAppUrl, waLink } from "../../../scripts/crm/public-links";
import { REASK_GAP_DAYS, tenantActive, tenantGate } from "./broker-gate";
import { availabilityMessage, brokerAnswerMessage, brokerNumber, needSummary, noReplyMessage, viewingRep, type BrokerHomeLine } from "./broker-message";
import { brokerSendMode, testPhones } from "./broker-sends";
import { CONFIRMATION_TTL_DAYS } from "./rank";
import { coerceRequirements, EMPTY_REQUIREMENTS, mergeRequirements, type Requirements } from "./requirements";
import type { EventKind, ShortlistItem, StepStatus } from "./types";
import { postSlackCard, sendMessages, sendToBroker } from "./whatsapp";

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
    homes.push({ title: q.listing.title ?? "", link });
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

/** Everyone who can speak for each home, owner first, then brokers by age — never one who said STOP. */
async function brokersFor(listingIds: number[]): Promise<Map<number, BrokerLink[]>> {
  const links = await db.listingBroker.findMany({
    where: { listingId: { in: listingIds }, user: { phoneNumber: { not: null } }, NOT: { broker: { is: { optOut: true } } } },
    orderBy: [{ role: "desc" }, { createdAt: "asc" }],
    select: {
      listingId: true,
      userId: true,
      sourceUrl: true,
      user: { select: { phoneNumber: true, username: true, sourceHostId: true } },
      listing: { select: HOME_FOR_LINK },
    },
  });
  const out = new Map<number, BrokerLink[]>();
  for (const l of links) if (l.user.phoneNumber) out.set(l.listingId, [...(out.get(l.listingId) ?? []), l]);
  return out;
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
): { join: RecentRequest; broker: BrokerLink } | { ask: BrokerLink } | null {
  for (const b of brokers) {
    const r = recent.get(`${b.listingId}:${b.userId}`);
    if (r?.status === "PENDING" && r.expiresAt.getTime() > now) return { join: r, broker: b };
  }
  // A broker who answered "available" may be asked again once that answer is old; silence and "rented" wait out the gap.
  const fresh = brokers.find((b) => {
    const r = recent.get(`${b.listingId}:${b.userId}`);
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
  const recent = new Map<string, RecentRequest>();
  for (const q of recentRows) if (!recent.has(`${q.listingId}:${q.brokerUserId}`)) recent.set(`${q.listingId}:${q.brokerUserId}`, q);

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
    g.homes.push({ title: a.item.title, link: homeLink(a.broker.sourceUrl, a.broker.listing) ?? brokerLink(a.token, "en") });
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
export async function applyAnswer(listingId: number, answer: Answer, brokerPhone?: string | null) {
  const number = answer === "AVAILABLE" ? brokerNumber(brokerPhone) : null;
  // Every open question about this home has its answer now.
  if (answer !== "NO_REPLY") {
    await db.brokerRequest.updateMany({ where: { listingId, status: "PENDING" }, data: { status: answer, respondedAt: new Date() } });
  }
  const tasks = await db.agentTask.findMany({
    where: { status: { in: ["WAITING", "DONE"] }, updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) }, brokerRequests: { some: { listingId } } },
    select: { id: true, shortlist: true, locale: true, messages: true, profile: { select: { waPhone: true } } },
  });
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
  await tellWhatsAppTenants(tasks, listingId, answer);
  if (answer === "AVAILABLE") {
    // Available again lifts an earlier "taken".
    await db.listing.update({ where: { id: listingId }, data: { lastAvailabilityConfirmedAt: new Date(), lostAt: null, lostReason: null } });
    await tellViewingRep(tasks, listingId, number);
  }
  // A broker's "taken" means the home is lost: out of /find and the TikTok pick for good (it was hidden 30 days).
  if (answer === "RENTED") await db.listing.update({ where: { id: listingId }, data: { lostAt: new Date(), lostReason: "RENTED" } });
}

type AnsweredTask = { id: string; shortlist: unknown; locale: string; messages: unknown; profile: { waPhone: string | null } | null };
const titleIn = (t: AnsweredTask, listingId: number) => ((t.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === listingId)?.title?.trim() || `#${listingId}`;

/**
 * A tenant who asked on WhatsApp hears the broker's answer there — the web
 * chat updates itself, a WhatsApp chat does not. "No reply" reaches only a
 * tenant still in the search. Queued like every other send (whatsapp.ts).
 */
async function tellWhatsAppTenants(tasks: AnsweredTask[], listingId: number, answer: Answer) {
  if (!tasks.some((t) => t.profile?.waPhone)) return;
  // Times exist only when the broker offered them on the form; a typed "yes" offers none.
  const offered = answer === "AVAILABLE" ? await db.brokerRequest.findMany({ where: { listingId, status: "AVAILABLE" }, select: { viewingSlots: true }, take: 20 }) : [];
  const canPick = offered.some((r) => Array.isArray(r.viewingSlots) && r.viewingSlots.some((s) => typeof s === "string" && Date.parse(s) > Date.now()));
  const now = new Date();
  // A yes: the deal sheet (what it costs, what Mkan covers, what happens next) and "when can you come?" (deal.ts).
  if (answer === "AVAILABLE" && !canPick) {
    const { sendDealSheet } = await import("./deal");
    await Promise.all(tasks.filter((t) => t.profile?.waPhone).map((t) => sendDealSheet(t, listingId).catch((err) => console.warn(`[agent] deal sheet: ${(err as Error).message}`))));
    return;
  }
  const messages = tasks.flatMap((t) => {
    const to = t.profile?.waPhone;
    if (!to) return [];
    const link = `${publicAppUrl()}/${t.locale}/find?c=${t.id}`;
    if (answer === "NO_REPLY") return tenantActive(t.messages, now) ? [{ kind: "TENANT_ALERT" as const, to, body: noReplyMessage(t.locale, titleIn(t, listingId), link), label: "tenant" }] : [];
    return [{ kind: "TENANT_ALERT" as const, to, body: brokerAnswerMessage(t.locale, titleIn(t, listingId), answer === "AVAILABLE", link, canPick), label: "tenant" }];
  });
  if (messages.length) await sendMessages(messages, `Broker answered home #${listingId}`);
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

/**
 * Cron: requests unanswered past their expiry become NO_REPLY. A home goes on
 * to the next broker who posted it only for a real tenant still in the search
 * (broker-gate.ts), and never back to a broker asked about it in
 * REASK_GAP_DAYS. Only when nobody is left does the tenant hear "no reply".
 */
export async function expireRequests(now = new Date()): Promise<number> {
  const stale = await db.brokerRequest.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: {
      id: true,
      listingId: true,
      taskId: true,
      locale: true,
      need: true,
      listing: { select: { title: true } },
      task: { select: { messages: true, profile: { select: { waPhone: true } } } },
    },
  });
  if (stale.length === 0) return 0;
  await db.brokerRequest.updateMany({ where: { id: { in: stale.map((r) => r.id) } }, data: { status: "NO_REPLY" } });

  const [mode, tests] = await Promise.all([brokerSendMode(), testPhones()]);
  const live = stale.filter((r) => r.task && tenantGate({ mode, waPhone: r.task.profile?.waPhone ?? null, testPhones: tests }).ok && tenantActive(r.task.messages, now));
  const listingIds = [...new Set(stale.map((r) => r.listingId))];
  const since = new Date(now.getTime() - REASK_GAP_DAYS * 86_400_000);
  const [brokers, recentRows, stillPending] = await Promise.all([
    brokersFor(listingIds),
    db.brokerRequest.findMany({ where: { listingId: { in: listingIds }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, select: RECENT_SELECT }),
    db.brokerRequest.groupBy({ by: ["listingId"], where: { listingId: { in: listingIds }, status: "PENDING", expiresAt: { gte: now } }, _count: true }),
  ]);
  const recent = new Map<string, RecentRequest>();
  for (const q of recentRows) if (!recent.has(`${q.listingId}:${q.brokerUserId}`)) recent.set(`${q.listingId}:${q.brokerUserId}`, q);
  const pendingNow = new Set(stillPending.map((p) => p.listingId));

  for (const listingId of listingIds) {
    if (pendingNow.has(listingId)) continue; // someone else is still being asked
    // Only the searches of real tenants still writing to us carry the question on.
    const mine = live.filter((r) => r.listingId === listingId);
    const pick = mine.length ? pickBroker(brokers.get(listingId) ?? [], recent, now.getTime()) : null;
    if (!pick || !("ask" in pick)) {
      await applyAnswer(listingId, "NO_REPLY");
      continue;
    }
    // The next broker gets the same question, for every task that asked.
    const first = mine[0]!;
    const tokens = mine.map(() => randomBytes(18).toString("base64url"));
    const created = await db.brokerRequest.createManyAndReturn({
      data: mine.map((r, i) => ({ tokenHash: hashToken(tokens[i]!), listingId, brokerUserId: pick.ask.userId, taskId: r.taskId, locale: r.locale, need: json(r.need), expiresAt: new Date(now.getTime() + REQUEST_TTL_HOURS * 3_600_000) })),
      select: { id: true },
    });
    const link = homeLink(pick.ask.sourceUrl, pick.ask.listing) ?? brokerLink(tokens[0]!, "en");
    await sendGrouped(new Map([[pick.ask.userId, { phone: pick.ask.user.phoneNumber!, handle: handleOf(pick.ask), homes: [{ title: first.listing.title ?? "Home in Kigali", link }], ids: created.map((c) => c.id) }]]));
    await Promise.all(
      [...new Set(mine.map((r) => r.taskId).filter((t): t is string => !!t))].map((t) =>
        appendTaskEvent(t, "broker_contact_started", "waiting_person", { listingId, title: first.listing.title, broker: handleOf(pick.ask) ? `@${handleOf(pick.ask)}` : null, next: true }),
      ),
    );
  }
  return stale.length;
}

/**
 * Cron: a turn whose `after()` was lost stays RUNNING forever — unlock it, as
 * an open tab would (task-view.ts `recoverStuck`). One that already answered
 * is done; one that never did gets the error reply, so the chat does not end
 * on the tenant's own message.
 */
export async function failStuckTasks(now = new Date(), olderThanMs = 90_000): Promise<number> {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const errorReply = JSON.stringify([{ role: "agent", kind: "error", at: now.toISOString() }]);
  return db.$executeRaw`
    UPDATE "AgentTask" SET
      "status" = (CASE WHEN "messages"->-1->>'role' = 'agent' THEN 'DONE' ELSE 'FAILED' END)::"AgentTaskStatus",
      "messages" = CASE WHEN "messages"->-1->>'role' = 'agent' THEN "messages" ELSE "messages" || ${errorReply}::jsonb END,
      "updatedAt" = ${now}
    WHERE "status" = 'RUNNING' AND "updatedAt" < ${cutoff}`;
}
