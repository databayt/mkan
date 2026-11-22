import "server-only";

/**
 * The viewing, agreed and booked by the line itself (viewing-loop-pure.ts has the rules and the words).
 * No step waits for a person to type: Mkan's person (Osman, MKAN_VIEWING_REP) only goes to the viewing, and
 * hears every step as an FYI.
 *
 * ── THE CALL CONTRACT — `settleViewingTime(event)` (2026-11-22) ─────────────────────────────────────
 * Both sides of a viewing time call this one function; it knows the state of the ask (WaState
 * `viewing-time:<broker number>` for the broker's side, `viewing-ask:<tenant number>` for the tenant's) and does
 * the next thing. It never throws for a rule (a clash, an off day, a taken home): those are results.
 *
 *   TENANT  { by: "tenant", tenant, ask, lang, at }          the tenant named a time ("tomorrow 10am")
 *           { by: "tenant", tenant, ask, lang, accept: true } the tenant said yes to the time on the table
 *           `ask` = readViewingAsk(tenant) (deal.ts); `tenant` the WhatsApp number; `lang` en | ar | rw.
 *           → `reply` is what to answer the tenant (return it as the chat's reply). Nothing is sent to the
 *             tenant by this function except the booking confirmation itself.
 *   BROKER  { by: "broker", phone, text, at }                a broker's message (the line's whole inbox text)
 *           { by: "broker", phone, slot, at }                the broker named a time/slot already read by the
 *                                                            caller ("2" of the two offered, "Tue 10:00")
 *           optional `newestAvailabilityAskAt`, `quoted`, `listingId` (the home, when the caller knows it).
 *           → `reply` is what to answer the broker (send it as the line, label `auto-viewing-<outcome>`).
 *           → `null` when the message is not about a viewing time: carry on reading it as before.
 *
 *   What it does, whichever side speaks first:
 *     tenant time, broker confirmed the home  → can Mkan's person be there (MKAN_VIEWING_HOURS/DAYS, the
 *                                               MKAN_VIEWING_GAP_MIN gap — 90 min —, `off` days)? yes: the broker
 *                                               is asked; no: the nearest free time goes back to the tenant.
 *     tenant time, home not confirmed         → availability.ts askAvailabilityFor asks the broker if the home is
 *                                               free, the time is kept (`wanted`), and prepareDealSheet (deal.ts)
 *                                               asks the broker for it the moment they say yes.
 *     broker says yes to the time             → BOOKED (deal.ts bookViewing, the one path `deal:book` uses).
 *     broker names another time (unprompted,
 *       or in answer to ours)                 → the tenant is asked; their yes books it. A time Mkan's person
 *                                               can't do goes back to the broker as the nearest one that works.
 *     broker says no / "taken"                → asked for a time / the home leaves /find and the tenant is told.
 *   On BOOKED: a ListingVisit (tenant + broker + rep) and a Deal; the tenant and the broker each get a short
 *   confirmation in their own language (time, where, "Osman from Mkan will meet you there"); Mkan's person gets
 *   an FYI. Terms the broker did not state are "to confirm at the viewing". Reminders (24 h / 2 h) and "how
 *   did it go?" are deal.ts viewingReminders, unchanged.
 *   `fallback` (only for the tenant side): the line may not do it itself — MKAN_VIEWING_AUTO=off, sends
 *   paused, a team number, a web tenant. deal.ts proposeViewing then posts
 *   the one FYI card; `reply` is null and the caller must not invent a promise.
 *
 * `proposeViewingAuto`, `brokerViewingReply` and `acceptOffered` below are the same code, kept as thin
 * wrappers for the callers that already use them.
 *
 * Booking is deal.ts bookViewing, unchanged. A broker with no share on record is always booked, at any deal count
 * (2026-11-22: the MKAN_SHARE_REQUIRED_AFTER block is gone): Mkan's share is asked in the booking's own message,
 * one short line in the broker's language, and the FYI line to Mkan's person says none is agreed yet.
 * `MKAN_VIEWING_AUTO=off` puts the FYI card and the one-tap Yes back in charge (deal.ts proposeViewing).
 */
import { db } from "@/lib/db";
import { scrubTitle } from "@/lib/redact";
import { ALERT_LABEL, firstSendableAt, inSendWindow, phoneKey } from "../../../scripts/wa/outbox-pure";
import { applyAnswer, appendTaskEvent, homeLink } from "./broker";
import { takenAckMessage, viewingRep } from "./broker-message";
import { awakeMs } from "./broker-rank";
import { gateForTask } from "./broker-sends";
import { dealEvent } from "./deal-event";
import { agreementOf, bookViewing, viewingAskKey, type ViewingAsk } from "./deal";
import { shareLabel, viewingLabel, viewingProposedMessage, type DealLang } from "./deal-pure";
import { termsAskKey, type TermsAsk } from "./deal-intro";
import type { ShortlistItem } from "./types";
import {
  bookingNowMessage,
  brokerCannotMessage,
  checkingHomeFirstMessage,
  counterOfferMessage,
  homeGoneMessage,
  meetingSpot,
  nextSlot,
  noBrokerMessage,
  noSlotMessage,
  pickSlots,
  type BrokerViewingReply,
  type FallbackWhy,
  type PlaceFacts,
  REP_OFF_PREFIX,
  repGapMs,
  readBrokerViewingReply,
  repBusyMessage,
  repHours,
  slotVerdict,
  sweepPlan,
  type SlotOpts,
  VIEWING_ASK_TTL_MS,
  viewingBookedBrokerMessage,
  viewingChaseMessage,
  viewingCounterAckMessage,
  viewingRepCannotMessage,
  viewingRepMessage,
  viewingShareAskLine,
  viewingTimeAskMessage,
  viewingTimeKey,
  viewingWaitMessage,
  viewingWhatTimeBrokerMessage,
  viewingWhenBrokerMessage,
  type ViewingTimeAsk,
} from "./viewing-loop-pure";
import { readState, writeState } from "./wa-state";
import { postSlackCard, sendMessages } from "./whatsapp";

/** On unless MKAN_VIEWING_AUTO=off. */
export const viewingAuto = () => process.env.MKAN_VIEWING_AUTO?.trim().toLowerCase() !== "off";

const plus = (phone: string) => `+${phoneKey(phone)}`;
const variants = (phone: string) => [plus(phone), phoneKey(phone)];
const labels = (at: Date) => ({ en: viewingLabel(at, "en"), rw: viewingLabel(at, "rw") });
/** The outbox label of every word to a broker about a viewing: the line's own reply, never held for "asked today". */
const brokerLabel = (what: string, listingId: number) => `auto-viewing-${what}:${listingId}`;
const langOf = (l: string | null | undefined): DealLang => (l === "ar" || l === "rw" ? l : "en");

/** The rep's gap between viewings and the days they marked off (WaState `rep-off:<date>`, set by the word `off`). */
async function slotOpts(): Promise<SlotOpts> {
  let rows: { key: string }[] = [];
  try {
    rows = await db.waState.findMany({ where: { key: { startsWith: REP_OFF_PREFIX } }, select: { key: true } });
  } catch {
    // No days-off read is no days off: a viewing is never refused for a database hiccup.
  }
  return { gapMs: repGapMs(), off: new Set(rows.map((r) => r.key.slice(REP_OFF_PREFIX.length))) };
}

/** The other viewings Mkan's person has around `at` (this chat's own viewing of this home is the one being moved). */
async function repBusy(at: Date, taskId: string, listingId: number): Promise<Date[]> {
  const rows = await db.listingVisit.findMany({
    where: { outcome: "Scheduled", scheduledFor: { gte: new Date(at.getTime() - 86_400_000), lte: new Date(at.getTime() + 15 * 86_400_000) } },
    select: { scheduledFor: true, taskId: true, listingId: true },
  });
  return rows.filter((v) => !(v.taskId === taskId && v.listingId === listingId)).map((v) => v.scheduledFor);
}

/** The home's pin and area, for "where to meet". Never throws: no place is just no place. */
async function placeOf(listingId: number): Promise<PlaceFacts> {
  try {
    const home = await db.listing.findUnique({ where: { id: listingId }, select: { location: { select: { latitude: true, longitude: true, neighbourhood: true, sector: true } } } });
    return home?.location ?? null;
  } catch {
    return null;
  }
}

/** The broker who said this home is free: where to write to them, how, and what Mkan has agreed with them. */
async function yesBrokerOf(listingId: number) {
  const yes = await db.brokerRequest.findFirst({
    where: { listingId, status: "AVAILABLE", respondedAt: { not: null } },
    orderBy: { respondedAt: "desc" },
    select: { brokerUserId: true, broker: { select: { phoneNumber: true } } },
  });
  if (!yes?.broker.phoneNumber) return null;
  const link = await db.listingBroker.findFirst({
    where: { listingId, userId: yes.brokerUserId },
    select: {
      sourceUrl: true,
      listing: { select: { id: true, sourceUrl: true, isPublished: true, code: true, sourceListingId: true, title: true } },
      broker: { select: { id: true, name: true, contactName: true, preferredLanguage: true, sharePct: true, shareFlatRwf: true, optOut: true, relationship: true } },
    },
  });
  if (link?.broker?.optOut || link?.broker?.relationship === "DO_NOT_CONTACT") return null;
  return {
    phone: plus(yes.broker.phoneNumber),
    brokerId: link?.broker?.id ?? null,
    name: link?.broker?.contactName ?? null,
    lang: link?.broker?.preferredLanguage ?? null,
    agreement: agreementOf(link?.broker ?? null),
    link: link ? homeLink(link.sourceUrl, link.listing) : null,
    title: scrubTitle(link?.listing.title) || `K${listingId}`,
  };
}

async function pendingFor(phone: string, now: Date): Promise<ViewingTimeAsk[]> {
  const list = await readState<ViewingTimeAsk[]>(viewingTimeKey(phone), []).catch(() => [] as ViewingTimeAsk[]);
  return (Array.isArray(list) ? list : []).filter((a) => a?.askedAt && now.getTime() - Date.parse(a.askedAt) < VIEWING_ASK_TTL_MS);
}

const savePending = (phone: string, list: ViewingTimeAsk[]) => (list.length ? writeState(viewingTimeKey(phone), list) : db.waState.deleteMany({ where: { key: viewingTimeKey(phone) } }).then(() => undefined));

/** One ask per chat and home: a new time replaces the one on the table. */
const withAsk = (list: ViewingTimeAsk[], ask: ViewingTimeAsk) => [...list.filter((a) => !(a.taskId === ask.taskId && a.listingId === ask.listingId)), ask];
const without = (list: ViewingTimeAsk[], ask: Pick<ViewingTimeAsk, "taskId" | "listingId">) => list.filter((a) => !(a.taskId === ask.taskId && a.listingId === ask.listingId));

async function setTenantAsk(tenant: string, patch: Partial<ViewingAsk> & Pick<ViewingAsk, "taskId" | "listingId">): Promise<void> {
  const key = viewingAskKey(tenant);
  const cur = await readState<ViewingAsk | null>(key, null).catch(() => null);
  const value = { ...(cur && cur.taskId === patch.taskId && cur.listingId === patch.listingId ? cur : { at: new Date().toISOString() }), ...patch } as ViewingAsk;
  await writeState(key, value);
}

const titleIn = async (taskId: string, listingId: number): Promise<string> => {
  const task = await db.agentTask.findUnique({ where: { id: taskId }, select: { shortlist: true } }).catch(() => null);
  return scrubTitle(((task?.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === listingId)?.title) || `K${listingId}`;
};

// ── the one entry point ──────────────────────────────────────────────────────────────────────────

export type SettleOutcome =
  /** The broker was asked for the tenant's time. */
  | "asked-broker"
  /** The home was not confirmed: the broker was asked if it is free first, the time is kept for after their yes. */
  | "asked-availability"
  /** The nearest time Mkan's person can do went to the tenant (their time clashed). */
  | "rep-busy"
  /** No time is free in the next fortnight. */
  | "no-slot"
  /** No broker the line may write to has this home: the tenant is offered another. */
  | "no-broker"
  /** The broker's yes (or the tenant's yes to their time) — it is booked. */
  | "booked"
  /** The broker named another time: the tenant is asked. */
  | "countered"
  /** The broker's time does not work for Mkan's person: the nearest one went back to the broker. */
  | "rep-cannot"
  | "what-time"
  | "asked-when"
  | "taken"
  /** The line may not do it itself (SettleResult.why): deal.ts proposeViewing posts the FYI card. */
  | "fallback";

export type SettleResult = {
  outcome: SettleOutcome;
  listingId: number;
  /** What to answer whoever just spoke: the tenant's reply, or the text to send the broker. Null: nothing to say. */
  reply: string | null;
  why?: FallbackWhy;
  /** Set when this call booked the viewing. */
  visitId?: number;
  dealId?: string;
};

export type SettleEvent =
  | { by: "tenant"; tenant: string; ask: ViewingAsk; lang: DealLang; at: Date; now?: Date; skipAvailability?: boolean }
  | { by: "tenant"; tenant: string; ask: ViewingAsk; lang: DealLang; accept: true; now?: Date }
  | { by: "broker"; phone: string; text: string; at: Date; newestAvailabilityAskAt?: Date | null; quoted?: boolean; listingId?: number }
  | { by: "broker"; phone: string; slot: Date; at: Date; listingId?: number };

/** See the contract at the top of this file. Null: the message is not about a viewing time (broker side) or nothing is on the table (tenant yes). */
export async function settleViewingTime(ev: SettleEvent): Promise<SettleResult | null> {
  if (ev.by === "tenant") {
    const now = ev.now ?? new Date();
    return "accept" in ev ? acceptInner(ev.ask, ev.tenant, ev.lang, now) : proposeInner(ev.ask, ev.at, ev.tenant, ev.lang, now, !ev.skipAvailability);
  }
  return brokerInner(ev);
}

// ── the tenant names a time ──────────────────────────────────────────────────────────────────────

async function proposeInner(ask: ViewingAsk, at: Date, tenant: string, lang: DealLang, now: Date, mayAskAvailability: boolean): Promise<SettleResult> {
  const out = (outcome: SettleOutcome, reply: string | null, more: Partial<SettleResult> = {}): SettleResult => ({ outcome, listingId: ask.listingId, reply, ...more });
  if (!viewingAuto()) return out("fallback", null, { why: "auto-off" });
  const gate = await gateForTask(ask.taskId).catch(() => null);
  if (!gate?.ok) return out("fallback", null, { why: !gate ? "sends-off" : gate.why === "test-phone" ? "test-number" : gate.why === "not-whatsapp" ? "no-whatsapp" : "sends-off" });
  const broker = await yesBrokerOf(ask.listingId);
  if (!broker) {
    // No broker has said this home is free yet: ask them, and keep the tenant's time for their yes.
    if (!mayAskAvailability) return out("fallback", null, { why: "sends-off" });
    const asked = await import("./availability").then((m) => m.askAvailabilityFor(ask.taskId, ask.listingId)).catch(() => null);
    if (asked?.why === "taken") return out("no-broker", homeGoneMessage(lang));
    if (asked && (asked.asked || asked.why === "already")) {
      await setTenantAsk(tenant, { taskId: ask.taskId, listingId: ask.listingId, wanted: at.toISOString() });
      void dealEvent("TIME_PROPOSED", { listingId: ask.listingId, taskId: ask.taskId, tenantPhone: plus(tenant), viewingAt: at, note: "the tenant's time is kept; the broker is asked if the home is free first" });
      return out("asked-availability", checkingHomeFirstMessage(lang, viewingLabel(at, lang)));
    }
    // Nobody the line may write to: the tenant hears it plainly and is offered another home; Mkan's person is told.
    await postSlackCard(`📅 FYI — K${ask.listingId}: the tenant asked to see it *${viewingLabel(at, "en")}* but no broker with a number can be asked. The line told them and offered to check another home.`).catch(() => {});
    return out("no-broker", noBrokerMessage(lang));
  }

  const rep = viewingRep();
  const askable = firstSendableAt({ kind: "BROKER_REQUEST", label: "auto-viewing" }, now);
  const busy = await repBusy(at, ask.taskId, ask.listingId);
  const hours = repHours();
  const opts = await slotOpts();
  if (slotVerdict(at, askable, busy, hours, opts) !== "ok") {
    const alt = nextSlot(at, askable, busy, hours, opts);
    if (!alt) return out("no-slot", noSlotMessage(lang));
    // The nearest time Mkan's person can be there: the tenant's yes proposes it to the broker.
    await setTenantAsk(tenant, { taskId: ask.taskId, listingId: ask.listingId, offered: alt.toISOString(), offeredBy: "mkan", wanted: undefined });
    return out("rep-busy", repBusyMessage(lang, { label: viewingLabel(at, lang), alt: viewingLabel(alt, lang), rep }));
  }

  const iso = at.toISOString();
  const pending = await pendingFor(broker.phone, now);
  await savePending(broker.phone, withAsk(pending, { taskId: ask.taskId, listingId: ask.listingId, tenant: plus(tenant), lang, at: iso, askedAt: now.toISOString(), stage: "time" }));
  await sendMessages(
    [{ kind: "BROKER_REQUEST", to: broker.phone, body: viewingTimeAskMessage({ name: broker.name, lang: broker.lang, title: broker.title, link: broker.link, ...labels(at), rep }), label: brokerLabel("ask", ask.listingId), brokerId: broker.brokerId }],
    `Viewing time → broker (home #${ask.listingId})`,
  );
  await setTenantAsk(tenant, { taskId: ask.taskId, listingId: ask.listingId, proposedAt: iso, offered: undefined, offeredBy: undefined, wanted: undefined });
  await appendTaskEvent(ask.taskId, "viewing_proposed", "waiting_person", { listingId: ask.listingId, at: iso, auto: true }).catch(() => {});
  void dealEvent("TIME_PROPOSED", { listingId: ask.listingId, taskId: ask.taskId, tenantPhone: plus(tenant), brokerId: broker.brokerId, viewingAt: at, note: "the tenant's time, asked of the broker" });
  await postSlackCard(`📅 *Viewing asked* — ${broker.title} (K${ask.listingId}), *${viewingLabel(at, "en")}*. The line asked the broker to confirm; ${rep} is told when it is booked. Nothing to do.`).catch(() => {});
  return out("asked-broker", viewingProposedMessage(lang, viewingLabel(at, lang)));
}

/**
 * The tenant named a time. Returns their reply — or null when the line cannot take it from here (auto is
 * off, sends are paused, a team number, no broker who said yes with a number, or a share is required and
 * none is agreed): the caller then posts the #mkan card, as before. Legacy wrapper: new code calls
 * `settleViewingTime`, which also asks the broker about a home nobody has confirmed yet.
 */
export async function proposeViewingAuto(ask: ViewingAsk, at: Date, tenant: string, lang: DealLang, now = new Date()): Promise<string | null> {
  const r = await proposeInner(ask, at, tenant, lang, now, false);
  return r.outcome === "fallback" ? null : r.reply;
}

// ── booking ──────────────────────────────────────────────────────────────────────────────────────

/** Book it, tell Mkan's person, and write what the broker is told. */
async function book(ask: ViewingTimeAsk, at: Date, brokerPhone: string, place: string | null): Promise<{ text: string; visitId: number; dealId: string }> {
  const [broker, loc] = await Promise.all([yesBrokerOf(ask.listingId), placeOf(ask.listingId)]);
  const rep = viewingRep();
  const booked = await bookViewing({
    taskId: ask.taskId,
    listingId: ask.listingId,
    at,
    place,
    by: rep,
    // No share on record: booked without one, on purpose, and asked for in this very message.
    share: broker?.agreement ? null : { none: true },
  });
  const title = broker?.title ?? (await titleIn(ask.taskId, ask.listingId));
  const spot = meetingSpot(place, loc, "en");
  const repPhone = process.env.MKAN_REP_WHATSAPP?.trim();
  if (repPhone) {
    await sendMessages(
      [{ kind: "TENANT_ALERT", to: plus(repPhone), body: viewingRepMessage({ rep, title, ref: `K${ask.listingId}`, en: viewingLabel(at, "en"), place: spot?.text ?? null, tenant: ask.tenant, broker: brokerPhone, share: shareLabel(broker?.agreement ?? null) }), label: `rep-viewing:v${booked.visitId}` }],
      `Viewing booked → ${rep}`,
    ).catch(() => {});
  }
  let text = viewingBookedBrokerMessage({ en: viewingLabel(at, "en"), rw: viewingLabel(at, "rw"), rep, askPlace: !place, lang: broker?.lang, spot });
  if (!broker?.agreement && broker?.brokerId) {
    // Mkan's terms ride on the booking's message. Kept as a terms ask already "handed" (deal-intro.ts
    // answerTerms): their YES records the agreement and prices the open deal; nothing else is sent.
    const stamp = new Date().toISOString();
    const value: TermsAsk = { listingId: ask.listingId, brokerId: broker.brokerId, tenants: [{ taskId: ask.taskId, phone: ask.tenant, lang: ask.lang }], at: stamp, handedAt: stamp };
    await writeState(termsAskKey(brokerPhone), value).catch(() => {});
    text += `\n${viewingShareAskLine(broker.lang)}`;
  }
  return { text, visitId: booked.visitId, dealId: booked.dealId };
}

// ── the broker speaks ────────────────────────────────────────────────────────────────────────────

export type ViewingReply = { listingId: number; outcome: "booked" | "countered" | "rep-cannot" | "what-time" | "asked-when" | "taken" | "place"; reply: string | null };

/** A broker's reading, placed on the ask it answers. */
async function applyBrokerReading(phone: string, ask: ViewingTimeAsk, pending: ViewingTimeAsk[], r: BrokerViewingReply, at: Date): Promise<SettleResult | null> {
  const rest = without(pending, ask);
  const title = await titleIn(ask.taskId, ask.listingId);
  const tenantLabel = (d: Date) => viewingLabel(d, ask.lang);
  const out = (outcome: SettleOutcome, reply: string | null, more: Partial<SettleResult> = {}): SettleResult => ({ outcome, listingId: ask.listingId, reply, ...more });

  if (r.kind === "taken") {
    await savePending(phone, rest);
    // The home is gone: every tenant waiting on it hears so, and it leaves /find (broker.ts applyAnswer).
    await applyAnswer(ask.listingId, "RENTED", phone, "typed");
    await db.waState.deleteMany({ where: { key: viewingAskKey(ask.tenant) } }).catch(() => {});
    return out("taken", takenAckMessage(ask.taskId));
  }
  if (r.kind === "yes" && ask.stage === "time") {
    await savePending(phone, rest);
    const booked = await book(ask, new Date(ask.at), phone, r.place);
    return out("booked", booked.text, { visitId: booked.visitId, dealId: booked.dealId });
  }
  if (r.kind === "day" || (r.kind === "yes" && ask.stage === "when")) {
    // A day with no hour, or a yes to "which day and time?": the hour is still missing.
    await savePending(phone, withAsk(rest, { ...ask, stage: "when", askedAt: at.toISOString(), chasedAt: undefined }));
    return out("what-time", viewingWhatTimeBrokerMessage());
  }
  if (r.kind === "no") {
    await savePending(phone, withAsk(rest, { ...ask, stage: "when", askedAt: at.toISOString(), chasedAt: undefined }));
    await sendMessages([{ kind: "TENANT_ALERT", to: ask.tenant, body: brokerCannotMessage(ask.lang, { title, label: tenantLabel(new Date(ask.at)) }), label: ALERT_LABEL.brokerAnswer }], `Viewing time → tenant (home #${ask.listingId})`);
    return out("asked-when", viewingWhenBrokerMessage());
  }
  if (r.kind === "time") {
    // Their time: can Mkan's person be there? If not, the nearest one that works goes back to them.
    const askable = firstSendableAt({ kind: "BROKER_REQUEST", label: "auto-viewing" }, at);
    const busy = await repBusy(r.at, ask.taskId, ask.listingId);
    const hours = repHours();
    const opts = await slotOpts();
    if (slotVerdict(r.at, askable, busy, hours, opts) !== "ok") {
      const alt = nextSlot(r.at, askable, busy, hours, opts);
      if (!alt) return null;
      await savePending(phone, withAsk(rest, { ...ask, at: alt.toISOString(), stage: "time", askedAt: at.toISOString(), chasedAt: undefined }));
      return out("rep-cannot", viewingRepCannotMessage({ en: viewingLabel(r.at, "en"), alt: viewingLabel(alt, "en") }));
    }
    await savePending(phone, withAsk(rest, { ...ask, at: r.at.toISOString(), stage: "tenant", askedAt: at.toISOString(), chasedAt: undefined }));
    await setTenantAsk(ask.tenant, { taskId: ask.taskId, listingId: ask.listingId, offered: r.at.toISOString(), offeredBy: "broker" });
    void dealEvent("TIME_PROPOSED", { listingId: ask.listingId, taskId: ask.taskId, tenantPhone: ask.tenant, viewingAt: r.at, note: "the broker's time, asked of the tenant" });
    await sendMessages([{ kind: "TENANT_ALERT", to: ask.tenant, body: counterOfferMessage(ask.lang, { title, label: tenantLabel(r.at) }), label: ALERT_LABEL.brokerAnswer }], `Viewing time → tenant (home #${ask.listingId})`);
    return out("countered", viewingCounterAckMessage(viewingLabel(r.at, "en")));
  }
  return null;
}

/**
 * The tenant whose viewing of this broker's home is still to be arranged — the broker said yes to a home in
 * their chat, nothing is booked, and the line may write to them. The broker named a time on their own (after
 * a yes, or in answer to the two times the ask offered): it is that tenant's to accept.
 */
async function waitingTenantOf(phone: string, listingId: number | undefined, at: Date): Promise<ViewingTimeAsk | null> {
  const rows = await db.brokerRequest
    .findMany({
      where: { status: "AVAILABLE", respondedAt: { gte: new Date(at.getTime() - 14 * 86_400_000) }, taskId: { not: null }, broker: { phoneNumber: { in: variants(phone) } }, ...(listingId ? { listingId } : {}) },
      orderBy: { respondedAt: "desc" },
      take: 5,
      select: { taskId: true, listingId: true },
    })
    .catch(() => [] as { taskId: string | null; listingId: number }[]);
  for (const row of rows) {
    if (!row.taskId) continue;
    const task = await db.agentTask.findUnique({ where: { id: row.taskId }, select: { locale: true, profile: { select: { waPhone: true } } } }).catch(() => null);
    const tenant = task?.profile?.waPhone;
    if (!tenant) continue;
    const gate = await gateForTask(row.taskId).catch(() => null);
    if (!gate?.ok) continue;
    const booked = await db.listingVisit.findFirst({ where: { taskId: row.taskId, listingId: row.listingId, outcome: "Scheduled" }, select: { id: true } }).catch(() => null);
    if (booked) continue;
    return { taskId: row.taskId, listingId: row.listingId, tenant: plus(tenant), lang: langOf(task?.locale), at: at.toISOString(), askedAt: at.toISOString(), stage: "when" };
  }
  return null;
}

async function brokerInner(ev: Extract<SettleEvent, { by: "broker" }>): Promise<SettleResult | null> {
  const { phone, at } = ev;
  const reading: BrokerViewingReply | null = "slot" in ev ? { kind: "time", at: ev.slot } : readBrokerViewingReply(ev.text, at);
  if (!reading) return null;
  const pending = await pendingFor(phone, at);
  // The newest ask still waiting on the broker (one with the tenant is the tenant's to answer).
  let ask = pending.filter((a) => a.stage !== "tenant" && (!ev.listingId || a.listingId === ev.listingId)).sort((a, b) => Date.parse(b.askedAt) - Date.parse(a.askedAt))[0];
  if (ask) {
    // A "yes" to a newer "is this available?" is that ask's answer, not the time's.
    if ("text" in ev && !ev.quoted && ev.newestAvailabilityAskAt && ev.newestAvailabilityAskAt.getTime() > Date.parse(ask.askedAt)) return null;
    return applyBrokerReading(phone, ask, pending, reading, at);
  }
  // No time is on the table: only a time the broker names themselves is placed (a "yes" alone answers something else).
  if (reading.kind !== "time") return null;
  const waiting = await waitingTenantOf(phone, ev.listingId, at);
  if (!waiting) return null;
  ask = waiting;
  return applyBrokerReading(phone, ask, withAsk(pending, ask), reading, at);
}

/**
 * A broker's message, read as the answer to an open time ask. Null when no ask is waiting on this number,
 * the message is the answer to a newer "is this available?", or it is not an answer the rules can place
 * (a person reads it in #mkan, as before). Legacy wrapper over `settleViewingTime`.
 */
export async function brokerViewingReply(phone: string, text: string, at: Date, opts: { newestAvailabilityAskAt?: Date | null; quoted?: boolean } = {}): Promise<ViewingReply | null> {
  const r = await brokerInner({ by: "broker", phone, text, at, ...opts });
  return r && r.outcome !== "fallback" ? ({ listingId: r.listingId, outcome: r.outcome, reply: r.reply } as ViewingReply) : null;
}

// ── the tenant says yes ──────────────────────────────────────────────────────────────────────────

async function acceptInner(ask: ViewingAsk, tenant: string, lang: DealLang, now: Date): Promise<SettleResult | null> {
  if (!ask.offered) return null;
  const at = new Date(ask.offered);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return null;
  if (ask.offeredBy !== "broker") return proposeInner({ ...ask, offered: undefined, offeredBy: undefined }, at, tenant, lang, now, false);
  const broker = await yesBrokerOf(ask.listingId);
  if (!broker) return null;
  const pending = await pendingFor(broker.phone, now);
  const mine: ViewingTimeAsk = pending.find((a) => a.taskId === ask.taskId && a.listingId === ask.listingId) ?? { taskId: ask.taskId, listingId: ask.listingId, tenant: plus(tenant), lang, at: ask.offered, askedAt: now.toISOString(), stage: "tenant" };
  await savePending(broker.phone, without(pending, mine));
  const booked = await book({ ...mine, at: ask.offered }, at, broker.phone, null);
  await sendMessages([{ kind: "BROKER_REQUEST", to: broker.phone, body: booked.text, label: brokerLabel("booked", ask.listingId), brokerId: broker.brokerId }], `Viewing booked → broker (home #${ask.listingId})`);
  return { outcome: "booked", listingId: ask.listingId, reply: bookingNowMessage(lang, viewingLabel(at, lang)), visitId: booked.visitId, dealId: booked.dealId };
}

/**
 * The tenant said yes to the time on the table. The broker's own time is booked at once (they offered it);
 * the nearest time Mkan could do goes to the broker like any other. Null when nothing was on the table.
 * Legacy wrapper over `settleViewingTime`.
 */
export async function acceptOffered(ask: ViewingAsk, tenant: string, lang: DealLang, now = new Date()): Promise<string | null> {
  return (await acceptInner(ask, tenant, lang, now))?.reply ?? null;
}

/**
 * After a viewing is booked the broker was asked where to meet: a reply that reads as a place, from the
 * broker of a coming viewing that has none yet, is kept on the visit and sent to the tenant and Mkan's
 * person. True when a place was noted (the caller still reads the message for anything else it says).
 */
export async function noteMeetingPlace(brokerId: string, text: string, at: Date): Promise<number | null> {
  const t = text.trim();
  if (t.length < 6 || t.length > 160 || !/\b(?:at|near|in front of|behind|next to|opposite|kuri|hafi ya|imbere ya|devant|pr[èe]s de)\b/i.test(t)) return null;
  const visit = await db.listingVisit.findFirst({
    where: { brokerId, outcome: "Scheduled", meetingPoint: null, scheduledFor: { gte: at }, createdAt: { gte: new Date(at.getTime() - VIEWING_ASK_TTL_MS) } },
    orderBy: { createdAt: "desc" },
    select: { id: true, listingId: true, contactPhone: true, taskId: true, scheduledFor: true, listing: { select: { title: true } } },
  });
  if (!visit) return null;
  const place = t.replace(/^[\s,.!]*(?:yes|ok(?:ay)?|sure|yego|sawa|oui)\b[\s,.!]*/i, "").slice(0, 120);
  await db.listingVisit.update({ where: { id: visit.id }, data: { meetingPoint: place } });
  const task = visit.taskId ? await db.agentTask.findUnique({ where: { id: visit.taskId }, select: { locale: true } }).catch(() => null) : null;
  const lang: DealLang = task?.locale === "ar" || task?.locale === "rw" ? task.locale : "en";
  const title = scrubTitle(visit.listing.title) || `K${visit.listingId}`;
  const body =
    lang === "ar" ? `مكان اللقاء لمعاينة «${title}»: ${place}` : lang === "rw" ? `Aho muzahurira ku gusura "${title}": ${place}` : `Where to meet for the viewing of "${title}": ${place}`;
  if (visit.contactPhone) await sendMessages([{ kind: "TENANT_ALERT", to: visit.contactPhone, body, label: ALERT_LABEL.viewingConfirmed }], `Meeting place → tenant (home #${visit.listingId})`).catch(() => {});
  const repPhone = process.env.MKAN_REP_WHATSAPP?.trim();
  if (repPhone) await sendMessages([{ kind: "TENANT_ALERT", to: plus(repPhone), body: `Meeting place for ${title}, ${viewingLabel(visit.scheduledFor, "en")}: ${place}`, label: `rep-viewing:v${visit.id}` }], `Meeting place → ${viewingRep()}`).catch(() => {});
  await postSlackCard(`📍 Meeting place for *${title}* (K${visit.listingId}), ${viewingLabel(visit.scheduledFor, "en")}: ${place}`).catch(() => {});
  return visit.listingId;
}

/**
 * Hourly: a broker silent on a time ask for CHASE_AWAKE_HOURS of daytime gets the one chase; after
 * TELL_TENANT_AWAKE_HOURS the tenant hears it is still open and is offered another home; an ask older
 * than VIEWING_ASK_TTL_MS is dropped. Returns what it sent.
 */
export async function viewingSweep(now = new Date()): Promise<number> {
  const rows = await db.waState.findMany({ where: { key: { startsWith: "viewing-time:" } }, select: { key: true, value: true } });
  let n = 0;
  for (const row of rows) {
    const phone = row.key.slice("viewing-time:".length);
    const list = (Array.isArray(row.value) ? row.value : []) as unknown as ViewingTimeAsk[];
    const next: ViewingTimeAsk[] = [];
    for (const ask of list) {
      if (!ask?.askedAt) continue;
      const asked = new Date(ask.askedAt);
      const plan = sweepPlan({ askedAt: asked, chased: !!ask.chasedAt, tenantTold: !!ask.tenantToldAt, awakeMs: awakeMs(asked, now), ageMs: now.getTime() - asked.getTime(), inWindow: inSendWindow(now), stage: ask.stage });
      if (plan === "drop") continue;
      if (plan === "chase") {
        const broker = await db.broker.findFirst({ where: { phones: { hasSome: variants(phone) } }, select: { id: true, contactName: true, preferredLanguage: true, optOut: true } }).catch(() => null);
        if (!broker?.optOut) {
          const body = ask.stage === "when" ? viewingWhenBrokerMessage() : viewingChaseMessage({ name: broker?.contactName, lang: broker?.preferredLanguage, ...labels(new Date(ask.at)) });
          await sendMessages([{ kind: "BROKER_REQUEST", to: plus(phone), body, label: brokerLabel("chase", ask.listingId), brokerId: broker?.id ?? null }], `Viewing time chase → broker (home #${ask.listingId})`);
          n += 1;
        }
        next.push({ ...ask, chasedAt: now.toISOString() });
        continue;
      }
      if (plan === "tell-tenant") {
        const title = await titleIn(ask.taskId, ask.listingId);
        await sendMessages([{ kind: "TENANT_ALERT", to: ask.tenant, body: viewingWaitMessage(ask.lang, title), label: ALERT_LABEL.brokerAnswer }], `Viewing time still open → tenant (home #${ask.listingId})`);
        await postSlackCard(`⌛ The broker (…${phoneKey(phone).slice(-3)}) has not confirmed a viewing time for *${title}* (K${ask.listingId}) after a chase. The tenant was told and offered another home — call the broker if you want this one.`).catch(() => {});
        next.push({ ...ask, tenantToldAt: now.toISOString() });
        n += 1;
        continue;
      }
      next.push(ask);
    }
    if (next.length !== list.length || next.some((a, i) => a !== list[i])) await savePending(phone, next);
  }
  return n;
}

/**
 * Two times Mkan's person can meet a tenant at a home, for the chat to offer (2026-11-21: "can we meet and
 * talk about the house?" got silence, and not one viewing was ever booked). Inside MKAN_VIEWING_HOURS and
 * days, clear of their other viewings and days off, on different days when the diary allows. Empty when
 * nothing is free soon: the chat then asks which day suits.
 */
export async function offerSlots(now = new Date(), n = 2): Promise<Date[]> {
  const [opts, busy] = await Promise.all([
    slotOpts(),
    db.listingVisit
      .findMany({ where: { outcome: "Scheduled", scheduledFor: { gte: new Date(now.getTime() - 86_400_000), lte: new Date(now.getTime() + 15 * 86_400_000) } }, select: { scheduledFor: true } })
      .then((rows) => rows.map((r) => r.scheduledFor))
      .catch(() => [] as Date[]),
  ]);
  return pickSlots(now, busy, opts, n);
}
