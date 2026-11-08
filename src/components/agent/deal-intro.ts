import "server-only";

/**
 * Direct intros until 10 deals are paid (Abdout, 2026-11-07). The words are in intro-pure.ts; this
 * file decides and writes:
 *
 *   broker says a home is free ─► startIntro: terms on record → the intro now; else the terms ask
 *                                 rides as the line's reply to their yes (introReplyFor), and the
 *                                 tenant hears "the broker will connect"
 *   broker answers YES          ─► answerTerms: the agreement on Broker, a Deal per tenant
 *                                 (introducedAt), the tenant gets the broker's WhatsApp and the
 *                                 broker the tenant's
 *   no YES in 2 daytime h / NO ─► the tenant goes the usual way: deal sheet, a person (deal.ts); a late YES is still recorded
 *   the hourly cron             ─► introSweep: follow-ups at 24 h (tenant) and 7 days (both, with a
 *                                 1–5 rating), re-queued once more if the outbox dropped one
 *   their answers               ─► introTenantAnswer / introBrokerUpdate: VIEWED, SIGNED (the
 *                                 invoice card, deal.ts setDealStatus), LOST, and the ratings
 *
 * From the 10th paid deal on, connectionMode says "relay" and none of this runs: Mkan stays in the
 * middle, as deal.ts has done since 2026-11-01.
 */
import { db } from "@/lib/db";
import { scrubTitle } from "@/lib/redact";

import { phoneKey } from "../../../scripts/wa/outbox-pure";
import { ALERT_LABEL, inSendWindow } from "../../../scripts/wa/outbox-pure";
import { agreementOf, sendDealSheet, setDealStatus } from "./deal";
import { askedOnLabel, expectedShare, type DealLang } from "./deal-pure";
import { lastTenantAt, reachedAt, TENANT_REACH } from "./broker-gate";
import { brokerSendMode } from "./broker-sends";
import {
  connectionMode,
  decideSend,
  dueFollowUps,
  heldIntroCard,
  FOLLOW_UP_TTL_MS,
  followUpBrokerMessage,
  followUpTenantMessage,
  introBrokerMessage,
  introPendingMessage,
  lastDigits,
  introTenantMessage,
  MKAN_TERMS,
  readBrokerFollowUp,
  readRating,
  readTenantFollowUp,
  readTermsReply,
  termsReplyApplies,
  TERMS_ASK_TTL_MS,
  TERMS_WAIT_AWAKE_HOURS,
  termsAskMessage,
  termsHandOffDue,
  type ConnectionMode,
  type FollowUpMark,
  type IntroOutcome,
} from "./intro-pure";
import type { ShortlistItem } from "./types";
import { readState, writeState } from "./wa-state";
import { postSlackCard, sendMessages } from "./whatsapp";

/** A WaState row gone (a Json column cannot hold a bare null). */
const clearState = (key: string) => db.waState.deleteMany({ where: { key } });
const langOf = (l: string | null | undefined): DealLang => (l === "ar" || l === "rw" ? l : "en");
const variants = (phone: string) => [`+${phoneKey(phone)}`, phoneKey(phone)];
const plus = (phone: string) => `+${phoneKey(phone)}`;

/** Intro or relay, from the paid deals so far (intro-pure.ts INTRO_CAP; MKAN_INTRO_CAP overrides it for deal:e2e). */
export async function introMode(): Promise<ConnectionMode> {
  const paid = await db.deal.count({ where: { status: "PAID" } });
  const cap = Number(process.env.MKAN_INTRO_CAP);
  return connectionMode(paid, Number.isFinite(cap) && process.env.MKAN_INTRO_CAP !== "" && process.env.MKAN_INTRO_CAP != null ? cap : undefined);
}

/** `messages`, when the caller has them: a yes a day or more after the tenant last wrote names the day they asked. */
type IntroTask = { id: string; locale: string; shortlist: unknown; messages?: unknown; profile: { waPhone: string | null } | null };
type Pending = { taskId: string; phone: string; lang: DealLang; /** "27 Oct" when the yes came a day or more after they last wrote. */ askedOn?: string | null };

/**
 * The usual way for an intro that will not happen (the broker said no to Mkan's terms, or let them wait):
 * each tenant's deal sheet, to the chat's number — a web tenant's left one (broker-gate.ts reachedAt), else
 * the number the intro was started for. Says which chats got nothing, so #mkan is never told "the tenant
 * got the deal sheet" when none went (2026-11-08).
 */
async function sheetsFor(tenants: Pending[], listingId: number): Promise<{ sent: number; missed: string[] }> {
  let sent = 0;
  const missed: string[] = [];
  for (const t of tenants) {
    const row = await db.agentTask.findUnique({ where: { id: t.taskId }, select: { id: true, locale: true, shortlist: true, messages: true, ...TENANT_REACH } });
    if (!row) {
      missed.push(t.taskId);
      continue;
    }
    const task = reachedAt(row);
    if (!task.profile.waPhone && t.phone) task.profile.waPhone = t.phone;
    if (await sendDealSheet(task, listingId).catch(() => false)) sent += 1;
    else missed.push(t.taskId);
  }
  return { sent, missed };
}
/** The terms ask waiting on one broker (WaState `terms-ask:<number>`). */
export type TermsAsk = {
  listingId: number;
  brokerId: string;
  tenants: Pending[];
  at: string;
  replied?: boolean;
  queuedAt?: string;
  /** When #mkan was told this ask is held (sends off, or dropped 3 times). */
  heldAt?: string;
  /**
   * When the tenants went the usual way (deal sheet, a person) because the broker had not agreed in
   * TERMS_WAIT_AWAKE_HOURS. Kept until TERMS_ASK_TTL_MS so a late YES still records the terms.
   */
  handedAt?: string;
};
export const termsAskKey = (phone: string) => `terms-ask:${phoneKey(phone)}`;

async function saidStop(phone: string): Promise<boolean> {
  const stopped = await readState<string[]>("tenant-stop", []).catch(() => [] as string[]);
  return stopped.map(phoneKey).includes(phoneKey(phone));
}

/** The broker who said the home is free, with a number to give the tenant. */
async function yesBroker(listingId: number, answeredFrom: string | null) {
  const yes = await db.brokerRequest.findFirst({
    where: { listingId, status: "AVAILABLE", respondedAt: { not: null } },
    orderBy: { respondedAt: "desc" },
    select: { brokerUserId: true, broker: { select: { phoneNumber: true } } },
  });
  const byPhone = answeredFrom ? await db.broker.findFirst({ where: { phones: { hasSome: variants(answeredFrom) }, mergedIntoId: null }, select: { id: true } }) : null;
  const link = !byPhone && yes ? await db.listingBroker.findFirst({ where: { listingId, userId: yes.brokerUserId, brokerId: { not: null } }, select: { brokerId: true } }) : null;
  const id = byPhone?.id ?? link?.brokerId ?? null;
  if (!id) return null;
  const b = await db.broker.findUnique({
    where: { id },
    select: { id: true, name: true, contactName: true, phones: true, whatsapp: true, sharePct: true, shareFlatRwf: true, relationship: true, optOut: true },
  });
  if (!b || b.optOut) return null;
  const phone = answeredFrom ?? b.whatsapp ?? b.phones[0] ?? yes?.broker.phoneNumber ?? null;
  return phone ? { ...b, phone: plus(phone) } : null;
}

const firstName = (b: { contactName: string | null; name: string }) => (b.contactName?.trim() || b.name).split(/\s+/).slice(0, 2).join(" ");

/**
 * A broker said the home is free, and the deals so far say "intro": start one for each WhatsApp
 * tenant waiting on it. `started: false` when no intro can start (no broker on file, no number) —
 * the caller sends the deal sheet as before. `replyTo`: the chat answering right now gets its words
 * as `reply` instead of a queued message.
 */
export async function startIntro(tasks: IntroTask[], listingId: number, answeredFrom: string | null, opts: { replyTo?: string; typed?: boolean } = {}): Promise<{ started: boolean; reply: string | null }> {
  const broker = await yesBroker(listingId, answeredFrom);
  if (!broker) return { started: false, reply: null };
  const tenants: Pending[] = [];
  let again: string | null = null;
  for (const t of tasks) {
    const phone = t.profile?.waPhone;
    if (!phone) {
      // A web chat with no WhatsApp number cannot be introduced: it used to vanish here. A person asks for the number.
      await postSlackCard(`📵 *Intro* K${listingId}: ${broker.name} said it's free, but chat …${t.id.slice(-6)} has no WhatsApp number — ask the tenant for one, or the intro cannot start.`).catch(() => {});
      continue;
    }
    if (await saidStop(phone)) continue;
    // One intro per chat and home: a second yes about it is not a second deal.
    const open = await db.deal.findFirst({ where: { taskId: t.id, listingId, introducedAt: { not: null }, status: { in: ["VIEWING_BOOKED", "VIEWED"] } }, select: { id: true } });
    if (!open) tenants.push({ taskId: t.id, phone: plus(phone), lang: langOf(t.locale), askedOn: askedOnLabel(lastTenantAt(t.messages), new Date(), langOf(t.locale)) });
    // The tenant picking it again hears the broker's number again, not silence.
    else if (t.id === opts.replyTo && agreementOf(broker)) again = introTenantMessage(langOf(t.locale), { title: await homeTitle(listingId, tasks), ref: `K${listingId}`, broker: firstName(broker), phone: broker.phone });
  }
  if (tenants.length === 0) return { started: true, reply: again };
  if (agreementOf(broker)) {
    const made = await makeIntro(listingId, broker, tenants, opts.replyTo);
    // Their yes gets the tenant's number as its reply (introReplyFor), else the queue carries it (introSweep).
    await writeState(introReplyKey(broker.phone), { listingId, brokerId: broker.id, text: made.brokerText, at: new Date().toISOString(), tenants: tenants.map((t) => ({ phone: t.phone })) });
    return { started: true, reply: made.tenantText };
  }
  const key = termsAskKey(broker.phone);
  const prev = await readState<TermsAsk | null>(key, null);
  // An ask already handed to a person is not joined: these tenants get their own wait.
  const same = prev && !prev.handedAt && prev.listingId === listingId && Date.now() - Date.parse(prev.at) < TERMS_ASK_TTL_MS ? prev : null;
  const merged: TermsAsk = {
    listingId,
    brokerId: broker.id,
    tenants: [...(same?.tenants ?? []), ...tenants.filter((t) => !same?.tenants.some((s) => s.taskId === t.taskId))],
    at: same?.at ?? new Date().toISOString(),
    ...(same?.replied ? { replied: true } : {}),
    ...(same?.queuedAt ? { queuedAt: same.queuedAt } : {}),
  };
  await writeState(key, merged);
  const title = await homeTitle(listingId, tasks);
  // A yes from the form has no reply of the broker's to ride on: the terms ask goes out now, not at the next sweep.
  if (opts.typed === false) await sweepTermsAsk(key.slice("terms-ask:".length), merged, new Date(), false).catch((err) => console.warn(`[agent] terms ask: ${(err as Error).message}`));
  const queued = tenants.filter((t) => t.taskId !== opts.replyTo);
  if (queued.length) {
    await sendMessages(
      queued.map((t) => ({ kind: "TENANT_ALERT" as const, to: t.phone, body: introPendingMessage(t.lang, title, t.askedOn), label: ALERT_LABEL.intro })),
      `Intro pending → tenant (home #${listingId})`,
    );
  }
  if (!same)
    await postSlackCard(
      `🤝 *Intro* K${listingId} (${title}): ${broker.name} said it's free — asking them to agree Mkan's terms (10% + free viewing) before the tenant's number goes. ` +
        `No YES in ${TERMS_WAIT_AWAKE_HOURS} daytime hours → the tenant gets the deal sheet and a person books the viewing.`,
    ).catch(() => {});
  const mine = tenants.find((t) => t.taskId === opts.replyTo);
  return { started: true, reply: mine ? introPendingMessage(mine.lang, title, mine.askedOn) : null };
}

async function homeTitle(listingId: number, tasks: { shortlist: unknown }[] = []): Promise<string> {
  const fromList = tasks.map((t) => ((t.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === listingId)?.title).find(Boolean);
  if (fromList) return scrubTitle(fromList) || `K${listingId}`;
  const home = await db.listing.findUnique({ where: { id: listingId }, select: { title: true } });
  return scrubTitle(home?.title) || `K${listingId}`;
}

const introReplyKey = (phone: string) => `intro-reply:${phoneKey(phone)}`;

/**
 * The line's reply to a broker's typed yes, when it starts an intro: the terms ask, or — terms on
 * record — the tenant's number. Null: the usual thanks. Read once, within minutes of the yes.
 */
type IntroReply = { listingId: number; brokerId: string; text: string; at: string; tenants?: { phone: string }[]; heldAt?: string };

export async function introReplyFor(phone: string, listingId: number): Promise<string | null> {
  // Nothing is cleared or flagged here: whether the words went out is read from the outbox rows
  // (introSweep), so a reply the line could not send (sends off, a failure) is still owed.
  const made = await readState<IntroReply | null>(introReplyKey(phone), null);
  if (made && made.listingId === listingId && Date.now() - Date.parse(made.at) < 10 * 60_000) return made.text;
  const ask = await readState<TermsAsk | null>(termsAskKey(phone), null);
  if (ask && ask.listingId === listingId && Date.now() - Date.parse(ask.at) < 10 * 60_000) {
    return termsAskMessage({ ref: `K${listingId}`, title: await homeTitle(listingId), tenants: ask.tenants.length });
  }
  return null;
}

/** Deals for each tenant and their messages (queued, or returned for `replyTo`); and what the broker is told. */
async function makeIntro(
  listingId: number,
  broker: NonNullable<Awaited<ReturnType<typeof yesBroker>>>,
  tenants: Pending[],
  replyTo?: string,
): Promise<{ brokerText: string; tenantText: string | null }> {
  const agreement = agreementOf(broker);
  const title = await homeTitle(listingId);
  const ref = `K${listingId}`;
  for (const t of tenants) {
    const task = await db.agentTask.findUnique({ where: { id: t.taskId }, select: { shortlist: true } });
    const item = ((task?.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === listingId);
    const commission = item?.cost?.lines.find((l) => l.key === "commission")?.amount ?? null;
    const rent = item?.cost?.headline ?? null;
    await db.deal.create({
      data: {
        listingId,
        brokerId: broker.id,
        taskId: t.taskId,
        tenantPhone: t.phone,
        rentMonthly: rent != null ? Math.round(rent) : null,
        brokerCommission: commission != null ? Math.round(commission) : null,
        mkanShare: expectedShare(commission, agreement),
        // Free for Mkan's tenants: part of the terms the broker agreed.
        viewingFeePaid: 0,
        introducedAt: new Date(),
        notes: "direct intro",
      },
    });
  }
  const textFor = (t: Pending) => introTenantMessage(t.lang, { title, ref, broker: firstName(broker), phone: broker.phone });
  const queued = tenants.filter((t) => t.taskId !== replyTo);
  if (queued.length) {
    await sendMessages(
      queued.map((t) => ({ kind: "TENANT_ALERT" as const, to: t.phone, body: textFor(t), label: ALERT_LABEL.intro })),
      `Intro → tenant (home #${listingId})`,
    );
  }
  const paid = await db.deal.count({ where: { status: "PAID" } });
  await postSlackCard(
    `🤝 *Intro sent* ${ref} (${title}) — ${broker.name} ↔ ${tenants.map((t) => t.phone).join(", ")}. Terms: ${agreement?.pct ? `${Math.round(agreement.pct * 100)}% of the commission` : "flat"} + free viewing. ` +
      `Intros last until 10 deals are paid (${paid} so far). Follow-ups go at 24 h and 7 days.`,
  ).catch(() => {});
  const mine = tenants.find((t) => t.taskId === replyTo);
  return { brokerText: introBrokerMessage({ ref, title, tenants: tenants.map((t) => t.phone) }), tenantText: mine ? textFor(mine) : null };
}

/** What the broker's message did to an open terms ask; null when no terms ask is waiting on this number. */
export async function answerTerms(
  phone: string,
  text: string,
  at: Date,
  opts: { newestAvailabilityAskAt?: Date | null; quotedTerms?: boolean } = {},
): Promise<{ answer: "yes" | "no" | null; listingId: number; reply: string | null; tenants: number } | null> {
  const key = termsAskKey(phone);
  const ask = await readState<TermsAsk | null>(key, null);
  if (!ask || at.getTime() - Date.parse(ask.at) > TERMS_ASK_TTL_MS || at.getTime() < Date.parse(ask.at)) return null;
  // A "yes" to a newer "is this available?" is that answer's, not the terms' (it used to start an intro for the older home).
  if (!termsReplyApplies({ askAt: new Date(ask.at), newestAvailabilityAskAt: opts.newestAvailabilityAskAt ?? null, quotedTerms: opts.quotedTerms ?? false })) return null;
  const answer = readTermsReply(text);
  if (answer == null) return { answer, listingId: ask.listingId, reply: null, tenants: ask.tenants.length };
  await clearState(key);
  // The tenants already went the usual way (the deal sheet, a person books the viewing): the answer
  // is recorded and #mkan hears it; the tenant gets no second message.
  if (ask.handedAt) {
    const title = await homeTitle(ask.listingId);
    if (answer === "yes") {
      const b = await recordAgreement(ask.brokerId);
      await postSlackCard(
        `🤝 *Terms agreed late* K${ask.listingId} (${title}): ${b.name} agreed Mkan's terms (10% + free viewing) after the tenant was handed to a person — ` +
          `the agreement is on record; book the viewing with them as planned.`,
      ).catch(() => {});
      return { answer, listingId: ask.listingId, reply: "Thank you, agreed. Mkan will be in touch about the viewing. Murakoze!", tenants: ask.tenants.length };
    }
    await postSlackCard(`✋ *Terms declined* K${ask.listingId} (${title}): the broker (${lastDigits(phone)}) said no to Mkan's terms after the hand-off.`).catch(() => {});
    return { answer, listingId: ask.listingId, reply: "Understood, thank you. Mkan will be in touch about this tenant. Murakoze!", tenants: ask.tenants.length };
  }
  if (answer === "no") {
    // The usual way, with a person in the middle: the deal sheet asks the tenant when they can come.
    const { missed } = await sheetsFor(ask.tenants, ask.listingId);
    if (missed.length) await postSlackCard(`⚠️ K${ask.listingId}: the broker declined Mkan's terms, and no deal sheet could go to chat ${missed.join(", ")} (no number, or a STOP) — a person takes it.`).catch(() => {});
    return { answer, listingId: ask.listingId, reply: "Understood, thank you. Mkan will be in touch about this tenant. Murakoze!", tenants: ask.tenants.length };
  }
  const b = await recordAgreement(ask.brokerId);
  const made = await makeIntro(ask.listingId, { ...b, phone: plus(phone) }, ask.tenants);
  return { answer, listingId: ask.listingId, reply: made.brokerText, tenants: ask.tenants.length };
}

/** The broker agreed Mkan's terms: the share and the free viewing on their record, and a partner from now on. */
async function recordAgreement(brokerId: string) {
  const now = new Date();
  const b = await db.broker.update({
    where: { id: brokerId },
    data: {
      sharePct: MKAN_TERMS.pct,
      shareFlatRwf: null,
      visitFee: 0,
      agreedAt: now,
      agreementNote: `WhatsApp YES ${now.toISOString().slice(0, 10)}: ${Math.round(MKAN_TERMS.pct * 100)}% of the commission + free viewing for Mkan's tenants`,
    },
    select: { id: true, name: true, contactName: true, phones: true, whatsapp: true, sharePct: true, shareFlatRwf: true, relationship: true, optOut: true },
  });
  await db.broker.updateMany({ where: { id: b.id, relationship: { notIn: ["PAUSED", "DO_NOT_CONTACT"] } }, data: { relationship: "PARTNER" } });
  return b;
}

/** Broker sends on? (broker-sends.ts: `gated` is on, for real WhatsApp tenants; anything else is off.) */
const sendsOn = async () => (await brokerSendMode().catch(() => "off" as const)) === "gated";

/** The outbox rows written for a broker's message since `since` (the terms ask, the tenant's number), oldest first. */
async function sentRows(phone: string, since: string, match: (m: { label: string | null; body: string }) => boolean) {
  const rows = await db.outboundMessage.findMany({
    where: { to: { in: variants(phone) }, kind: "BROKER_REQUEST", createdAt: { gte: new Date(Date.parse(since) - 60_000) } },
    orderBy: { createdAt: "asc" },
    select: { status: true, label: true, body: true },
  });
  return rows.filter(match).map((r) => ({ status: r.status }));
}

/** Tell #mkan once that an intro is held, and remember that it did (state `heldAt`), so the card does not repeat each tick. */
async function holdCard(
  key: string,
  value: Record<string, unknown>,
  why: "sends-off" | "tries-used",
  v: { listingId: number; brokerId: string; phone: string; text: string; tenants: string[] },
) {
  if (value.heldAt) return;
  await writeState(key, { ...value, heldAt: new Date().toISOString(), heldWhy: why });
  const [broker, title] = await Promise.all([db.broker.findUnique({ where: { id: v.brokerId }, select: { name: true } }), homeTitle(v.listingId)]);
  await postSlackCard(
    heldIntroCard({ ref: `K${v.listingId}`, title, broker: broker?.name ?? lastDigits(v.phone), tenants: v.tenants, why, text: v.text, chatLink: `https://wa.me/${phoneKey(v.phone)}?text=${encodeURIComponent(v.text)}` }),
  ).catch(() => {});
}

/** Right after a reply to a broker could not go out: read the outbox again for their open terms ask, so a held one reaches #mkan now. */
export async function reconcileTermsAsk(phone: string, now = new Date()): Promise<void> {
  const ask = await readState<TermsAsk | null>(termsAskKey(phone), null);
  if (ask?.at && !ask.handedAt) await sweepTermsAsk(phone, ask, now, true);
}

/**
 * One terms ask, decided from what the outbox really did with it. `ride`: a typed yes gives its
 * reply ten minutes to go out on the broker's own message first. True when it queued the ask.
 */
async function sweepTermsAsk(phone: string, ask: TermsAsk, now: Date, ride: boolean): Promise<boolean> {
  const rows = await sentRows(phone, ask.at, (m) => m.label === "auto-terms");
  const d = decideSend({ ageMs: now.getTime() - Date.parse(ask.at), rows, sendsOn: await sendsOn(), inWindow: inSendWindow(now) || !ride, ride });
  if (d.do === "hold") {
    await holdCard(termsAskKey(phone), ask as unknown as Record<string, unknown>, d.why, {
      listingId: ask.listingId,
      brokerId: ask.brokerId,
      phone,
      text: termsAskMessage({ ref: `K${ask.listingId}`, title: await homeTitle(ask.listingId), tenants: ask.tenants.length }),
      tenants: ask.tenants.map((t) => t.phone),
    });
    return false;
  }
  if (d.do !== "queue") return false;
  await sendMessages(
    [{ kind: "BROKER_REQUEST", to: `+${phoneKey(phone)}`, body: termsAskMessage({ ref: `K${ask.listingId}`, title: await homeTitle(ask.listingId), tenants: ask.tenants.length }), label: "auto-terms", brokerId: ask.brokerId }],
    `Terms ask → broker (home #${ask.listingId})`,
  );
  await writeState(termsAskKey(phone), { ...ask, queuedAt: now.toISOString(), heldAt: undefined });
  return true;
}

const fuTenantLabel = (mark: "tenant-24h" | "tenant-7d", dealId: string) => `tenant-intro-fu-${mark === "tenant-24h" ? "24h" : "7d"}:${dealId}`;
const fuBrokerLabel = (dealId: string) => `auto-intro-fu:${dealId}`;

/**
 * Hourly (with viewingReminders): terms asks a form answer left unsent go out by the queue; one
 * without a YES for 2 daytime hours (TERMS_WAIT_AWAKE_HOURS) sends the tenants the usual way; intro follow-ups go when due, in the send
 * window; a broker follow-up the outbox dropped (stale, held) is queued again, three times at most.
 */
export async function introSweep(now = new Date()): Promise<number> {
  let n = 0;
  // ── terms asks ──
  const asks = await db.waState.findMany({ where: { key: { startsWith: "terms-ask:" } }, select: { key: true, value: true } });
  for (const row of asks) {
    const ask = row.value as TermsAsk | null;
    if (!ask?.at) continue;
    const phone = row.key.slice("terms-ask:".length);
    if (ask.handedAt) {
      // Handed to a person: kept only so a late YES still records the terms (answerTerms); nothing more goes out.
      if (now.getTime() - Date.parse(ask.at) > TERMS_ASK_TTL_MS) await clearState(row.key);
      continue;
    }
    if (termsHandOffDue(new Date(ask.at), now)) {
      await writeState(row.key, { ...ask, handedAt: now.toISOString() });
      const { sent, missed } = await sheetsFor(ask.tenants, ask.listingId);
      const got = missed.length === 0 ? "the tenant got the deal sheet" : sent > 0 ? `${sent} of ${ask.tenants.length} tenants got the deal sheet (none could go to chat ${missed.join(", ")})` : `no deal sheet could go out (chat ${missed.join(", ")}: no number, or a STOP)`;
      await postSlackCard(
        `⌛ *Intro* K${ask.listingId}: the broker (${lastDigits(phone)}) hasn't agreed Mkan's terms in ${TERMS_WAIT_AWAKE_HOURS} daytime hours — ` +
          `${got}; a person takes it from here. A YES from them later still records the terms.`,
      ).catch(() => {});
      n += 1;
    } else if (await sweepTermsAsk(phone, ask, now, true)) n += 1;
  }
  // ── the tenant's number for a broker whose yes had no reply to ride on, or whose reply could not go ──
  const replies = await db.waState.findMany({ where: { key: { startsWith: "intro-reply:" } }, select: { key: true, value: true } });
  for (const row of replies) {
    const r = row.value as IntroReply | null;
    if (!r?.at) continue;
    const phone = row.key.slice("intro-reply:".length);
    const age = now.getTime() - Date.parse(r.at);
    const rows = await sentRows(phone, r.at, (m) => m.body === r.text);
    const d = decideSend({ ageMs: age, rows, sendsOn: (await sendsOn()), inWindow: inSendWindow(now), ride: true });
    if (d.do === "wait" && d.why === "delivered") await clearState(row.key);
    else if (d.do === "queue") {
      await sendMessages([{ kind: "BROKER_REQUEST", to: `+${phone}`, body: r.text, label: "auto-intro", brokerId: r.brokerId }], `Intro → broker (home #${r.listingId})`);
      n += 1;
    } else if (d.do === "hold") await holdCard(row.key, r as unknown as Record<string, unknown>, d.why, { listingId: r.listingId, brokerId: r.brokerId, phone, text: r.text, tenants: (r.tenants ?? []).map((t) => t.phone) });
    // Past the grace and still unsent after three days: nobody is waiting on it any more.
    if (age > TERMS_ASK_TTL_MS) await clearState(row.key);
  }
  // ── follow-ups ──
  if (!inSendWindow(now)) return n;
  const deals = await db.deal.findMany({
    where: { introducedAt: { not: null, gte: new Date(now.getTime() - 21 * 86_400_000) }, status: { in: ["VIEWING_BOOKED", "VIEWED"] } },
    select: { id: true, listingId: true, taskId: true, tenantPhone: true, introducedAt: true, introFollowUps: true, brokerId: true, broker: { select: { phones: true, whatsapp: true, optOut: true } }, listing: { select: { title: true } } },
  });
  for (const d of deals) {
    const title = scrubTitle(d.listing.title) || `K${d.listingId}`;
    const task = d.taskId ? await db.agentTask.findUnique({ where: { id: d.taskId }, select: { locale: true } }) : null;
    const lang = langOf(task?.locale);
    for (const mark of dueFollowUps(d.introducedAt!, d.introFollowUps, now)) {
      if (mark === "broker-7d") {
        const to = d.broker && !d.broker.optOut ? (d.broker.whatsapp ?? d.broker.phones[0] ?? null) : null;
        if (to) {
          await sendMessages(
            [{ kind: "BROKER_REQUEST", to: plus(to), body: followUpBrokerMessage({ ref: `K${d.listingId}`, title, tenant: d.tenantPhone ?? "the tenant" }), label: fuBrokerLabel(d.id), brokerId: d.brokerId }],
            `Intro follow-up → broker (home #${d.listingId})`,
          );
        }
      } else if (d.tenantPhone && !(await saidStop(d.tenantPhone))) {
        await sendMessages([{ kind: "TENANT_ALERT", to: d.tenantPhone, body: followUpTenantMessage(lang, mark, title), label: fuTenantLabel(mark, d.id) }], `Intro follow-up → tenant (home #${d.listingId})`);
      }
      await db.deal.update({ where: { id: d.id }, data: { introFollowUps: { push: mark } } });
      n += 1;
    }
    // A broker follow-up the outbox skipped (held past 18 h): once more, up to three tries.
    if (d.introFollowUps.includes("broker-7d") && !d.introFollowUps.includes("broker-7d:answered")) {
      const rows = await db.outboundMessage.findMany({ where: { label: fuBrokerLabel(d.id) }, select: { status: true, to: true, body: true }, orderBy: { createdAt: "desc" } });
      if (rows.length > 0 && rows.length < 3 && rows.every((r) => r.status === "SKIPPED" || r.status === "FAILED")) {
        await sendMessages([{ kind: "BROKER_REQUEST", to: rows[0]!.to, body: rows[0]!.body, label: fuBrokerLabel(d.id), brokerId: d.brokerId }], `Intro follow-up again → broker (home #${d.listingId})`);
        n += 1;
      }
    }
  }
  return n;
}

/** The intro follow-up this tenant was last sent and has not answered, within 72 h. */
export async function introFollowUpFor(address: string | null | undefined, now = new Date()) {
  if (!address) return null;
  const row = await db.outboundMessage.findFirst({
    where: { to: { in: variants(address) }, status: "SENT", label: { startsWith: "tenant-intro-fu-" }, sentAt: { gte: new Date(now.getTime() - FOLLOW_UP_TTL_MS) } },
    orderBy: { sentAt: "desc" },
    select: { label: true },
  });
  const m = row?.label?.match(/^tenant-intro-fu-(24h|7d):(.+)$/);
  if (!m) return null;
  const mark: "tenant-24h" | "tenant-7d" = m[1] === "24h" ? "tenant-24h" : "tenant-7d";
  const deal = await db.deal.findUnique({ where: { id: m[2]! }, select: { id: true, status: true, listingId: true, taskId: true, introFollowUps: true, listing: { select: { title: true } } } });
  if (!deal || deal.introFollowUps.includes(`${mark}:answered`)) return null;
  return { deal, mark };
}

async function recordScore(taskId: string | null, who: "tenant" | "broker", score: number, dealId: string) {
  if (!taskId) return;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const last = await db.agentEvent.findFirst({ where: { taskId }, orderBy: { seq: "desc" }, select: { seq: true } });
      await db.agentEvent.create({ data: { taskId, seq: (last?.seq ?? 0) + 1, kind: "feedback", status: "done", payload: { kind: "score", who, score, dealId } } });
      return;
    } catch {
      // A concurrent event took the seq: try the next one.
    }
  }
}

/** Move an intro deal on an answer; SIGNED goes through setDealStatus (the invoice card). */
async function applyOutcome(dealId: string, outcome: IntroOutcome, who: string, text: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId }, select: { id: true, status: true, listingId: true } });
  if (!deal || deal.status === "PAID" || deal.status === "LOST" || deal.status === "SIGNED") return;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  if (outcome === "viewed") {
    if (deal.status === "VIEWING_BOOKED") await db.deal.update({ where: { id: dealId }, data: { status: "VIEWED", notes: `direct intro · viewed (${who}, ${stamp})` } });
    return;
  }
  if (outcome === "lost") {
    await db.deal.update({ where: { id: dealId }, data: { status: "LOST", notes: `direct intro · not taken (${who}, ${stamp})` } });
    await postSlackCard(`👎 Intro K${deal.listingId}: not taken (${who}).\n> ${text.slice(0, 300)}`).catch(() => {});
    return;
  }
  if (outcome === "signed") {
    try {
      await setDealStatus(dealId, "SIGNED", { notes: `direct intro · signed (${who}, ${stamp})` });
    } catch {
      // No commission on record, so no share to invoice yet: a person asks the broker for it.
      await db.deal.update({ where: { id: dealId }, data: { status: "SIGNED", signedAt: new Date(), notes: `direct intro · signed (${who}, ${stamp}) — share not priced` } });
      await postSlackCard(
        `✍️ *Signed* K${deal.listingId} (intro, ${who}) — the broker's commission is not on record, so Mkan's 10% is not priced. Ask the broker, then \`pnpm deal:status --deal=${dealId} --status=signed --share=<RWF>\`.`,
      ).catch(() => {});
    }
  }
}

const thanks = (lang: DealLang, outcome: IntroOutcome | null) => {
  if (lang === "ar") return outcome === "signed" ? "مبروك على منزلك الجديد! شكرًا لاختيارك مكان." : "شكرًا! سجّلنا ردّك.";
  if (lang === "rw") return outcome === "signed" ? "Turakwishimiye ku nzu nshya! Murakoze guhitamo Mkan." : "Murakoze! Twanditse igisubizo cyawe.";
  return outcome === "signed" ? "Congratulations on your new home! Thank you for choosing Mkan." : "Thank you! We've noted your answer.";
};

/** The tenant's answer to an intro follow-up: the deal's next step and a rating; returns the reply. */
export async function introTenantAnswer(fu: NonNullable<Awaited<ReturnType<typeof introFollowUpFor>>>, text: string, lang: DealLang): Promise<string | null> {
  const outcome = readTenantFollowUp(text, fu.mark);
  const rating = fu.mark === "tenant-7d" ? readRating(text) : null;
  if (outcome == null && rating == null) return null;
  if (outcome) await applyOutcome(fu.deal.id, outcome, "tenant", text);
  if (rating != null) await recordScore(fu.deal.taskId, "tenant", rating, fu.deal.id);
  // Answered once the outcome is in (a rating alone leaves room for "yes" in the next message).
  if (outcome) await db.deal.update({ where: { id: fu.deal.id }, data: { introFollowUps: { push: `${fu.mark}:answered` } } });
  return thanks(lang, outcome);
}

/**
 * A broker writing about an intro: the answer to the 7-day follow-up (the latest thing Mkan asked
 * them), or a "signed" on their own any time. Null when the message is about something else.
 */
export async function introBrokerUpdate(brokerId: string, phone: string, text: string, at: Date): Promise<{ listingId: number; outcome: IntroOutcome | null; rating: number | null; reply: string } | null> {
  const fu = await db.outboundMessage.findFirst({
    where: { to: { in: variants(phone) }, status: "SENT", label: { startsWith: "auto-intro-fu:" }, sentAt: { gte: new Date(at.getTime() - FOLLOW_UP_TTL_MS), lte: at } },
    orderBy: { sentAt: "desc" },
    select: { label: true, sentAt: true },
  });
  const newerAsk = fu?.sentAt
    ? await db.outboundMessage.count({ where: { to: { in: variants(phone) }, status: "SENT", kind: "BROKER_REQUEST", brokerRequestIds: { isEmpty: false }, sentAt: { gt: fu.sentAt, lte: at } } })
    : 0;
  let dealId = fu && newerAsk === 0 ? fu.label!.slice("auto-intro-fu:".length) : null;
  const outcome = readBrokerFollowUp(text);
  // "Signed" said unprompted: the broker's open intro, when there is exactly one.
  if (!dealId && outcome === "signed" && /sign/i.test(text)) {
    const open = await db.deal.findMany({ where: { brokerId, introducedAt: { not: null }, status: { in: ["VIEWING_BOOKED", "VIEWED"] } }, select: { id: true }, take: 2 });
    if (open.length === 1) dealId = open[0]!.id;
  }
  if (!dealId) return null;
  const deal = await db.deal.findUnique({ where: { id: dealId }, select: { id: true, listingId: true, taskId: true, introFollowUps: true } });
  if (!deal) return null;
  const rating = fu ? readRating(text.replace(/not yet/gi, "")) : null;
  if (outcome == null && rating == null) return null;
  if (outcome) await applyOutcome(deal.id, outcome, "broker", text);
  if (rating != null) await recordScore(deal.taskId, "broker", rating, deal.id);
  if (outcome && outcome !== "wait") await db.deal.update({ where: { id: deal.id }, data: { introFollowUps: { push: "broker-7d:answered" } } });
  const reply =
    outcome === "signed" ? "Congratulations, and thank you! Mkan will send its share request shortly. Murakoze!" : "Thank you for letting us know. Murakoze!";
  return { listingId: deal.listingId, outcome, rating, reply };
}

/** For the scorecard and the loop: intro deals so far, and how many paid deals remain before relay. */
export async function introCounts(): Promise<{ intros: number; paid: number; mode: ConnectionMode }> {
  const [intros, paid] = await Promise.all([db.deal.count({ where: { introducedAt: { not: null } } }), db.deal.count({ where: { status: "PAID" } })]);
  return { intros, paid, mode: connectionMode(paid) };
}

export type { FollowUpMark };
