import "server-only";

/**
 * The viewing, agreed and booked by the line itself (viewing-loop-pure.ts has the rules and the words):
 *
 *   proposeViewingAuto ─ the tenant named a time: can Mkan's person be there? then the broker is asked
 *   brokerViewingReply ─ the broker answered: book it, relay their other time, or ask when
 *   acceptOffered      ─ the tenant said yes to a time on the table
 *   noteMeetingPlace   ─ the broker says where to meet, after it is booked
 *   viewingSweep       ─ hourly: one chase for a silent broker, then the tenant is told
 *
 * Booking is deal.ts bookViewing, unchanged: one ListingVisit with all three, a Deal, the tenant's
 * confirmation. A broker with no share on record is still booked while fewer than
 * MKAN_SHARE_REQUIRED_AFTER deals are paid (default 10): the terms are asked in the booking's own
 * message, and Mkan's person settles them at the home. `MKAN_VIEWING_AUTO=off` puts the #mkan card and
 * the one-tap Yes back in charge (deal.ts proposeViewing), as does anything this file cannot do itself.
 */
import { db } from "@/lib/db";
import { scrubTitle } from "@/lib/redact";
import { ALERT_LABEL, firstSendableAt, inSendWindow, phoneKey } from "../../../scripts/wa/outbox-pure";
import { applyAnswer, appendTaskEvent, homeLink } from "./broker";
import { takenAckMessage, viewingRep } from "./broker-message";
import { awakeMs } from "./broker-rank";
import { gateForTask } from "./broker-sends";
import { agreementOf, bookViewing, viewingAskKey, type ViewingAsk } from "./deal";
import { shareLabel, viewingLabel, viewingProposedMessage, type DealLang } from "./deal-pure";
import { termsAskKey, type TermsAsk } from "./deal-intro";
import { MKAN_TERMS } from "./intro-pure";
import type { ShortlistItem } from "./types";
import {
  bookingNowMessage,
  brokerCannotMessage,
  counterOfferMessage,
  nextSlot,
  noSlotMessage,
  readBrokerViewingReply,
  repBusyMessage,
  repHours,
  slotVerdict,
  sweepPlan,
  VIEWING_ASK_TTL_MS,
  viewingBookedBrokerMessage,
  viewingChaseMessage,
  viewingCounterAckMessage,
  viewingRepCannotMessage,
  viewingRepMessage,
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

/** From this many paid deals on, a viewing is not booked with a broker who has agreed no share. */
const shareRequiredAfter = () => {
  const n = Number(process.env.MKAN_SHARE_REQUIRED_AFTER);
  return Number.isFinite(n) && n >= 0 && process.env.MKAN_SHARE_REQUIRED_AFTER?.trim() ? Math.floor(n) : 10;
};

const plus = (phone: string) => `+${phoneKey(phone)}`;
const variants = (phone: string) => [plus(phone), phoneKey(phone)];
const labels = (at: Date) => ({ en: viewingLabel(at, "en"), rw: viewingLabel(at, "rw") });
/** The outbox label of every word to a broker about a viewing: the line's own reply, never held for "asked today". */
const brokerLabel = (what: string, listingId: number) => `auto-viewing-${what}:${listingId}`;

/** The other viewings Mkan's person has around `at` (this chat's own viewing of this home is the one being moved). */
async function repBusy(at: Date, taskId: string, listingId: number): Promise<Date[]> {
  const rows = await db.listingVisit.findMany({
    where: { outcome: "Scheduled", scheduledFor: { gte: new Date(at.getTime() - 86_400_000), lte: new Date(at.getTime() + 15 * 86_400_000) } },
    select: { scheduledFor: true, taskId: true, listingId: true },
  });
  return rows.filter((v) => !(v.taskId === taskId && v.listingId === listingId)).map((v) => v.scheduledFor);
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

/**
 * The tenant named a time. Returns their reply — or null when the line cannot take it from here (auto is
 * off, sends are paused, a team number, no broker who said yes with a number, or a share is required and
 * none is agreed): the caller then posts the #mkan card, as before.
 */
export async function proposeViewingAuto(ask: ViewingAsk, at: Date, tenant: string, lang: DealLang, now = new Date()): Promise<string | null> {
  if (!viewingAuto()) return null;
  const gate = await gateForTask(ask.taskId).catch(() => null);
  if (!gate?.ok) return null;
  const broker = await yesBrokerOf(ask.listingId);
  if (!broker) return null;
  if (!broker.agreement && (await db.deal.count({ where: { status: "PAID" } })) >= shareRequiredAfter()) return null;

  const rep = viewingRep();
  const askable = firstSendableAt({ kind: "BROKER_REQUEST", label: "auto-viewing" }, now);
  const busy = await repBusy(at, ask.taskId, ask.listingId);
  const hours = repHours();
  if (slotVerdict(at, askable, busy, hours) !== "ok") {
    const alt = nextSlot(at, askable, busy, hours);
    if (!alt) return noSlotMessage(lang);
    // The nearest time Mkan's person can be there: the tenant's yes proposes it to the broker.
    await setTenantAsk(tenant, { taskId: ask.taskId, listingId: ask.listingId, offered: alt.toISOString(), offeredBy: "mkan" });
    return repBusyMessage(lang, { label: viewingLabel(at, lang), alt: viewingLabel(alt, lang), rep });
  }

  const iso = at.toISOString();
  const pending = await pendingFor(broker.phone, now);
  await savePending(broker.phone, withAsk(pending, { taskId: ask.taskId, listingId: ask.listingId, tenant: plus(tenant), lang, at: iso, askedAt: now.toISOString(), stage: "time" }));
  await sendMessages(
    [{ kind: "BROKER_REQUEST", to: broker.phone, body: viewingTimeAskMessage({ name: broker.name, lang: broker.lang, title: broker.title, link: broker.link, ...labels(at), rep }), label: brokerLabel("ask", ask.listingId), brokerId: broker.brokerId }],
    `Viewing time → broker (home #${ask.listingId})`,
  );
  await setTenantAsk(tenant, { taskId: ask.taskId, listingId: ask.listingId, proposedAt: iso, offered: undefined, offeredBy: undefined });
  await appendTaskEvent(ask.taskId, "viewing_proposed", "waiting_person", { listingId: ask.listingId, at: iso, auto: true }).catch(() => {});
  await postSlackCard(`📅 *Viewing asked* — ${broker.title} (K${ask.listingId}), *${viewingLabel(at, "en")}*. The line asked the broker to confirm; ${rep} is told when it is booked. Nothing to do.`).catch(() => {});
  return viewingProposedMessage(lang, viewingLabel(at, lang));
}

/** Book it, tell Mkan's person, and write what the broker is told. */
async function book(ask: ViewingTimeAsk, at: Date, brokerPhone: string, place: string | null): Promise<string> {
  const broker = await yesBrokerOf(ask.listingId);
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
  const repPhone = process.env.MKAN_REP_WHATSAPP?.trim();
  if (repPhone) {
    await sendMessages(
      [{ kind: "TENANT_ALERT", to: plus(repPhone), body: viewingRepMessage({ rep, title, ref: `K${ask.listingId}`, en: viewingLabel(at, "en"), place, tenant: ask.tenant, broker: brokerPhone, share: shareLabel(broker?.agreement ?? null) }), label: `rep-viewing:v${booked.visitId}` }],
      `Viewing booked → ${rep}`,
    ).catch(() => {});
  }
  let text = viewingBookedBrokerMessage({ en: viewingLabel(at, "en"), rep, askPlace: !place });
  if (!broker?.agreement && broker?.brokerId) {
    // Mkan's terms ride on the booking's message. Kept as a terms ask already "handed" (deal-intro.ts
    // answerTerms): their YES records the agreement and prices the open deal; nothing else is sent.
    const stamp = new Date().toISOString();
    const value: TermsAsk = { listingId: ask.listingId, brokerId: broker.brokerId, tenants: [{ taskId: ask.taskId, phone: ask.tenant, lang: ask.lang }], at: stamp, handedAt: stamp };
    await writeState(termsAskKey(brokerPhone), value).catch(() => {});
    text += `\nOne more thing, for the tenants Mkan brings you: we ask ${Math.round(MKAN_TERMS.pct * 100)}% of your commission when they sign, and no viewing fee for them. Reply YES if that works for you.`;
  }
  return text;
}

export type ViewingReply = { listingId: number; outcome: "booked" | "countered" | "rep-cannot" | "what-time" | "asked-when" | "taken" | "place"; reply: string | null };

/**
 * A broker's message, read as the answer to an open time ask. Null when no ask is waiting on this number,
 * the message is the answer to a newer "is this available?", or it is not an answer the rules can place
 * (a person reads it in #mkan, as before).
 */
export async function brokerViewingReply(phone: string, text: string, at: Date, opts: { newestAvailabilityAskAt?: Date | null; quoted?: boolean } = {}): Promise<ViewingReply | null> {
  const pending = await pendingFor(phone, at);
  // The newest ask still waiting on the broker (one with the tenant is the tenant's to answer).
  const ask = pending.filter((a) => a.stage !== "tenant").sort((a, b) => Date.parse(b.askedAt) - Date.parse(a.askedAt))[0];
  if (!ask) return null;
  // A "yes" to a newer "is this available?" is that ask's answer, not the time's.
  if (!opts.quoted && opts.newestAvailabilityAskAt && opts.newestAvailabilityAskAt.getTime() > Date.parse(ask.askedAt)) return null;
  const r = readBrokerViewingReply(text, at);
  if (!r) return null;
  const rest = without(pending, ask);
  const title = await titleIn(ask.taskId, ask.listingId);
  const tenantLabel = (d: Date) => viewingLabel(d, ask.lang);

  if (r.kind === "taken") {
    await savePending(phone, rest);
    // The home is gone: every tenant waiting on it hears so, and it leaves /find (broker.ts applyAnswer).
    await applyAnswer(ask.listingId, "RENTED", phone, "typed");
    await db.waState.deleteMany({ where: { key: viewingAskKey(ask.tenant) } }).catch(() => {});
    return { listingId: ask.listingId, outcome: "taken", reply: takenAckMessage(ask.taskId) };
  }
  if (r.kind === "yes" && ask.stage === "time") {
    await savePending(phone, rest);
    const reply = await book(ask, new Date(ask.at), phone, r.place);
    return { listingId: ask.listingId, outcome: "booked", reply };
  }
  if (r.kind === "day" || (r.kind === "yes" && ask.stage === "when")) {
    // A day with no hour, or a yes to "which day and time?": the hour is still missing.
    await savePending(phone, withAsk(rest, { ...ask, stage: "when", askedAt: at.toISOString(), chasedAt: undefined }));
    return { listingId: ask.listingId, outcome: "what-time", reply: viewingWhatTimeBrokerMessage() };
  }
  if (r.kind === "no") {
    await savePending(phone, withAsk(rest, { ...ask, stage: "when", askedAt: at.toISOString(), chasedAt: undefined }));
    await sendMessages([{ kind: "TENANT_ALERT", to: ask.tenant, body: brokerCannotMessage(ask.lang, { title, label: tenantLabel(new Date(ask.at)) }), label: ALERT_LABEL.brokerAnswer }], `Viewing time → tenant (home #${ask.listingId})`);
    return { listingId: ask.listingId, outcome: "asked-when", reply: viewingWhenBrokerMessage() };
  }
  if (r.kind === "time") {
    // Their time: can Mkan's person be there? If not, the nearest one that works goes back to them.
    const askable = firstSendableAt({ kind: "BROKER_REQUEST", label: "auto-viewing" }, at);
    const busy = await repBusy(r.at, ask.taskId, ask.listingId);
    const hours = repHours();
    if (slotVerdict(r.at, askable, busy, hours) !== "ok") {
      const alt = nextSlot(r.at, askable, busy, hours);
      if (!alt) return null;
      await savePending(phone, withAsk(rest, { ...ask, at: alt.toISOString(), stage: "time", askedAt: at.toISOString(), chasedAt: undefined }));
      return { listingId: ask.listingId, outcome: "rep-cannot", reply: viewingRepCannotMessage({ en: viewingLabel(r.at, "en"), alt: viewingLabel(alt, "en") }) };
    }
    await savePending(phone, withAsk(rest, { ...ask, at: r.at.toISOString(), stage: "tenant", askedAt: at.toISOString(), chasedAt: undefined }));
    await setTenantAsk(ask.tenant, { taskId: ask.taskId, listingId: ask.listingId, offered: r.at.toISOString(), offeredBy: "broker" });
    await sendMessages([{ kind: "TENANT_ALERT", to: ask.tenant, body: counterOfferMessage(ask.lang, { title, label: tenantLabel(r.at) }), label: ALERT_LABEL.brokerAnswer }], `Viewing time → tenant (home #${ask.listingId})`);
    return { listingId: ask.listingId, outcome: "countered", reply: viewingCounterAckMessage(viewingLabel(r.at, "en")) };
  }
  return null;
}

/**
 * The tenant said yes to the time on the table. The broker's own time is booked at once (they offered it);
 * the nearest time Mkan could do goes to the broker like any other. Null when nothing was on the table.
 */
export async function acceptOffered(ask: ViewingAsk, tenant: string, lang: DealLang, now = new Date()): Promise<string | null> {
  if (!ask.offered) return null;
  const at = new Date(ask.offered);
  if (Number.isNaN(at.getTime()) || at.getTime() <= now.getTime()) return null;
  if (ask.offeredBy !== "broker") return proposeViewingAuto({ ...ask, offered: undefined, offeredBy: undefined }, at, tenant, lang, now);
  const broker = await yesBrokerOf(ask.listingId);
  if (!broker) return null;
  const pending = await pendingFor(broker.phone, now);
  const mine: ViewingTimeAsk = pending.find((a) => a.taskId === ask.taskId && a.listingId === ask.listingId) ?? { taskId: ask.taskId, listingId: ask.listingId, tenant: plus(tenant), lang, at: ask.offered, askedAt: now.toISOString(), stage: "tenant" };
  await savePending(broker.phone, without(pending, mine));
  const text = await book({ ...mine, at: ask.offered }, at, broker.phone, null);
  await sendMessages([{ kind: "BROKER_REQUEST", to: broker.phone, body: text, label: brokerLabel("booked", ask.listingId), brokerId: broker.brokerId }], `Viewing booked → broker (home #${ask.listingId})`);
  return bookingNowMessage(lang, viewingLabel(at, lang));
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
