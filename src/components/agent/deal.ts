import "server-only";

/**
 * From a broker's yes to a signed lease, with Mkan in the middle (Abdout,
 * 2026-11-01). The tenant never gets the broker's number:
 *
 *   broker says available ─► sendDealSheet: the WhatsApp tenant gets the deal
 *                            (deal-pure.ts) and is asked when they can come
 *   tenant names a time    ─► proposeViewing → viewing-loop.ts settleViewingTime: the line asks the
 *                            broker itself, books on their yes, and tells both sides (2026-11-22: no
 *                            person agrees a time by hand any more). The #mkan card is an FYI left only
 *                            for what the line may not do (automation off, a team number, a web tenant)
 *   the line books it      ─► bookViewing — the ONE booking path, also `pnpm deal:book …` for a person
 *                            who must book by hand: a three-party ListingVisit + a Deal, and the
 *                            tenant's confirmation (time, where, who meets them)
 *   the hourly cron        ─► viewingReminders: 24 h and 2 h before, and "how did it go?" after
 *   "how did it go?"       ─► recordAfterViewing: liked → the terms and the day to sign, the broker told;
 *                            not → the next best homes. The rep's words (signed / paid / lost) override
 *   the lease is signed    ─► setDealStatus (`pnpm deal:status`)
 */
import { db } from "@/lib/db";
import { waLink } from "../../../scripts/crm/public-links";
import { viewingRep } from "./broker-message";
import { replyLang } from "./language";
import { meetingSpot, viewingFallbackCard } from "./viewing-loop-pure";
import { newHomesFor } from "./follow-homes";
import { dealEvent } from "./deal-event";
import { repAfterMessage, repReminderMessage } from "./loop-schedule-pure";
import { repDigits } from "./rep-word-pure";
import { longStayCost, type CostEstimate, type ListingTerms } from "./cost";
import { lastTenantAt, TENANT_REACH, tenantNumber } from "./broker-gate";
import {
  afterViewingClosedText,
  afterViewingLikedText,
  afterViewingMessage,
  afterViewingNotHomesText,
  afterViewingUnsureText,
  signingAskAgainText,
  signingBrokerMessage,
  signingNotedText,
  stripTimeAsk,
  askedOnLabel,
  confirmedTermsLine,
  dealCommand,
  dealSheetMessage,
  expectedShare,
  invoiceDraft,
  rwf,
  shareForStatus,
  shareLabel,
  tenantWantsBrokerMessage,
  termsToAsk,
  unitEconomicsLine,
  viewingConfirmedMessage,
  viewingLabel,
  viewingProposedMessage,
  viewingReminderMessage,
  kigaliDayWord,
  readViewingTime,
  type ConfirmLang,
  type BrokerTerms,
  type DealLang,
  type ShareAgreement,
} from "./deal-pure";
import { buildViewingDecision, viewingMarker } from "./viewing-decision";
import type { ShortlistItem } from "./types";
import { postSlackCard, sendMessages } from "./whatsapp";
import { scrubTitle } from "@/lib/redact";
import { chatLink } from "./demand";
import { readState } from "./wa-state";
import { ALERT_LABEL, afterViewingAt, inSendWindow, phoneKey, reminderLabel } from "../../../scripts/wa/outbox-pure";

/** The number said STOP on WhatsApp (wa-tenant.ts keeps the list). */
async function saidStop(phone: string): Promise<boolean> {
  const stopped = await readState<string[]>("tenant-stop", []).catch(() => [] as string[]);
  return stopped.map(phoneKey).includes(phoneKey(phone));
}

/** The deal sheet asked this tenant for a time; their next message may be one (WaState). */
const askKey = (address: string) => `viewing-ask:${address.replace(/\D/g, "")}`;
export const viewingAskKey = askKey;
const ASK_TTL_MS = 72 * 3_600_000;
/**
 * `proposedAt`: the time the tenant named, now with the broker. `offered`: a time on the table for the
 * tenant's yes — the broker's other time (`offeredBy` "broker"), or the nearest one Mkan's person can be
 * there ("mkan") — viewing-loop.ts.
 */
export type ViewingAsk = {
  taskId: string;
  listingId: number;
  at: string;
  proposedAt?: string;
  offered?: string;
  offeredBy?: "broker" | "mkan";
  /** A time the tenant named before any broker confirmed the home: asked of the broker the moment they say yes (prepareDealSheet). */
  wanted?: string;
};

const langOf = (l: string): DealLang => (l === "ar" || l === "rw" ? l : "en");

/** A broker's recorded share agreement (Broker.sharePct / shareFlatRwf); null when there is none. */
export function agreementOf(b: { sharePct: unknown; shareFlatRwf: number | null } | null | undefined): ShareAgreement | null {
  if (!b) return null;
  const pct = b.sharePct != null ? Number(b.sharePct) : null;
  if ((pct == null || !(pct > 0)) && !(b.shareFlatRwf != null && b.shareFlatRwf > 0)) return null;
  return { pct: pct != null && pct > 0 ? pct : null, flatRwf: b.shareFlatRwf != null && b.shareFlatRwf > 0 ? b.shareFlatRwf : null };
}

/** Where brokers pay Mkan, for the invoice draft (MKAN_PAYOUT_MOMO + MKAN_PAYOUT_NAME in the env). */
function payoutLine(): string | null {
  const momo = process.env.MKAN_PAYOUT_MOMO?.trim();
  const name = process.env.MKAN_PAYOUT_NAME?.trim();
  return momo ? `MoMo ${momo}${name ? ` (${name})` : ""}` : null;
}

async function nextSeq(taskId: string): Promise<number> {
  const last = await db.agentEvent.findFirst({ where: { taskId }, orderBy: { seq: "desc" }, select: { seq: true } });
  return (last?.seq ?? 0) + 1;
}

/** One trace row on the task, so /find shows the step too. */
async function trace(taskId: string, kind: "viewing_proposed" | "viewing_confirmed" | "outcome_recorded", status: "done" | "waiting_person", payload: Record<string, unknown>) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await db.agentEvent.create({ data: { taskId, seq: await nextSeq(taskId), kind, status, payload: payload as never } });
      return;
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
}

/** `messages`, when the caller has them: an answer a day or more after the tenant last wrote names the day they asked. */
type DealTask = { id: string; locale: string; shortlist: unknown; messages?: unknown; profile: { waPhone: string | null } | null };

/**
 * The deal sheet for a home a broker said is free — what it costs, what Mkan covers, "when can you
 * come?" — and the 72 h window in which the tenant's next day-and-time is read as the viewing.
 * Null for a tenant with no WhatsApp, or one who said STOP.
 */
export async function prepareDealSheet(task: DealTask, listingId: number): Promise<{ to: string; body: string } | null> {
  const to = task.profile?.waPhone;
  if (!to) return null;
  // A tenant who said STOP gets nothing more from the line (the outbox skips it too).
  if (await saidStop(to)) return null;
  const item = ((task.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === listingId);
  const lang = langOf(task.locale);
  const body = dealSheetMessage(
    {
      title: scrubTitle(item?.title) || `#${listingId}`,
      ref: `K${listingId}`,
      cost: item?.cost ?? null,
      rep: viewingRep(),
      link: chatLink(task.id, lang),
      askedOn: askedOnLabel(lastTenantAt(task.messages), new Date(), lang),
    },
    lang,
  );
  const kept = await readViewingAsk(to);
  await openViewingAsk(to, task.id, listingId);
  // The tenant already named a time (before this yes): the sheet drops its "when can you come?", and the line asks
  // the broker for that time now, so the one message tells them both things (viewing-loop.ts settleViewingTime).
  const wanted = kept && kept.taskId === task.id && kept.listingId === listingId && kept.wanted ? new Date(kept.wanted) : null;
  if (wanted && wanted.getTime() > Date.now()) {
    const settled = await import("./viewing-loop")
      .then((m) => m.settleViewingTime({ by: "tenant", tenant: to, ask: { taskId: task.id, listingId, at: new Date().toISOString() }, lang, at: wanted, skipAvailability: true }))
      .catch(() => null);
    if (settled && settled.outcome !== "fallback" && settled.reply) return { to, body: `${stripTimeAsk(body)}\n\n${settled.reply}` };
  }
  return { to, body };
}

/** Open the 72 h "when can you come?" window for this number and home: its next day-and-time is the viewing. */
export async function openViewingAsk(to: string, taskId: string, listingId: number): Promise<void> {
  const value = { taskId, listingId, at: new Date().toISOString() } satisfies ViewingAsk;
  await db.waState.upsert({ where: { key: askKey(to) }, create: { key: askKey(to), value }, update: { value } });
}

/** The broker said the home is free: the WhatsApp tenant gets the deal and is asked when they can come. */
export async function sendDealSheet(task: DealTask, listingId: number): Promise<boolean> {
  const sheet = await prepareDealSheet(task, listingId);
  if (!sheet) return false;
  // Labelled as a deal sheet: it may go until 22:00, the answer to the tenant's own pick (outbox-pure.ts).
  await sendMessages([{ kind: "TENANT_ALERT", to: sheet.to, body: sheet.body, label: ALERT_LABEL.dealSheet }], `Deal sheet → tenant (home #${listingId})`);
  return true;
}

/** The open "when can you come?" for this number, if it is still fresh. */
export async function readViewingAsk(address: string | null | undefined): Promise<ViewingAsk | null> {
  if (!address) return null;
  const row = await db.waState.findUnique({ where: { key: askKey(address) }, select: { value: true } }).catch(() => null);
  const ask = row?.value as ViewingAsk | null | undefined;
  if (!ask?.taskId || !ask.at || Date.now() - Date.parse(ask.at) > ASK_TTL_MS) return null;
  return ask;
}

/**
 * The tenant named a time. The line settles it itself (viewing-loop.ts settleViewingTime): it asks the broker,
 * books on their yes, and tells both sides — no viewing was ever booked while a person had to phone the broker
 * and type `pnpm deal:book`. Where it may not (MKAN_VIEWING_AUTO=off, broker sends paused, a team number, a web
 * tenant) one FYI card goes to #mkan that says why and what to run, with both
 * chats one tap away. Dynamic import: viewing-loop.ts imports this file.
 */
export async function proposeViewing(ask: ViewingAsk, at: Date, tenant: string, lang: DealLang): Promise<string> {
  const settled = await import("./viewing-loop")
    .then((m) => m.settleViewingTime({ by: "tenant", tenant, ask, lang, at }))
    .catch((err) => {
      console.warn(`[agent] viewing auto: ${(err as Error).message}`);
      return null;
    });
  if (settled && settled.outcome !== "fallback" && settled.reply) return settled.reply;
  const label = viewingLabel(at, lang);
  const [home, brokers, task] = await Promise.all([
    db.listing.findUnique({ where: { id: ask.listingId }, select: { title: true, location: { select: { address: true, neighbourhood: true, sector: true } } } }),
    db.listingBroker.findMany({
      where: { listingId: ask.listingId },
      select: { user: { select: { phoneNumber: true, username: true } }, broker: { select: { sharePct: true, shareFlatRwf: true } } },
      take: 3,
    }),
    db.agentTask.findUnique({ where: { id: ask.taskId }, select: { shortlist: true } }),
  ]);
  const broker = brokers.map((b) => (b.user.phoneNumber ? `${b.user.username ?? "broker"} <${waLink(b.user.phoneNumber, "")}|${b.user.phoneNumber}>` : null)).filter(Boolean).join(" · ") || "no broker number on file";
  const shown = ((task?.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === ask.listingId)?.cost ?? null;
  const iso = at.toISOString();
  // Mkan's share is agreed before Mkan sends a person and pays the viewing fee (2026-11-07): the card
  // says what is on record, or asks for it with the time.
  const agreed = brokers.map((b) => agreementOf(b.broker)).find((a) => a != null) ?? null;
  const share = shareLabel(agreed);
  const why = settled?.why ?? "sends-off";
  const command = `\`pnpm deal:book --task=${ask.taskId} --listing=${ask.listingId} --at=${iso} --place="…"\` + what they said, e.g. \`--advance=3 --deposit=1 --commission=10 --water=yes --power=no --lease=12 --move-in=YYYY-MM-DD${share ? "" : " --share-pct=50"}\`; ask: ${termsToAsk(shown).join(" · ")}${share ? "" : " · Mkan's share"}`;
  await postSlackCard(
    `${viewingFallbackCard({ title: home?.title ?? `#${ask.listingId}`, ref: `K${ask.listingId}`, label: viewingLabel(at, "en"), why, tenant: `<${waLink(tenant, "")}|${tenant}>`, broker, command, rep: viewingRep() })}\n` +
      `💵 Mkan's share: ${share ? `${share} (agreed)` : "*none agreed*"}`,
  ).catch(() => {});
  // The one-tap Yes on /monetize is kept for the case where a choice is really his: the automation is off.
  const decided = why === "auto-off" ? await offerViewingDecision(ask, at, agreed, shown?.period === "month" ? Math.round(shown.headline) : null).catch(() => false) : false;
  await trace(ask.taskId, "viewing_proposed", "waiting_person", { listingId: ask.listingId, at: iso, decision: decided, fallback: why });
  const value = { ...ask, proposedAt: iso } satisfies ViewingAsk;
  await db.waState.update({ where: { key: askKey(tenant) }, data: { value } }).catch(() => {});
  return viewingProposedMessage(lang, label);
}

/**
 * The same viewing as one Yes on /monetize: a blocked prompt in the open sprint plus its `deal.book`
 * decision (WaState `decision:<promptId>`). A second time from the same chat for the same home moves the
 * open, unanswered one instead of stacking a second; an answered one is never touched. False when there
 * is no open sprint or the ask cannot be a valid action — the Slack card above is still the path then.
 */
export async function offerViewingDecision(ask: ViewingAsk, at: Date, agreed: ShareAgreement | null, rent: number | null): Promise<boolean> {
  const d = buildViewingDecision({ taskId: ask.taskId, listingId: ask.listingId, at, agreed, rent });
  if (!d) return false;
  const sprint = await db.sprint.findFirst({ where: { status: "active" }, orderBy: { startsAt: "desc" }, select: { id: true } });
  if (!sprint) return false;
  const { decisionKey, actionEffect } = await import("@/lib/monetize/actions");
  const record = (promptId: string) => ({ promptId, ask: d.ask, kind: "deal.book" as const, params: d.params, effect: actionEffect("deal.book", d.params), createdAt: new Date().toISOString() });
  const open = await db.sprintPrompt.findMany({ where: { sprintId: sprint.id, status: "blocked", text: { startsWith: viewingMarker(ask.taskId, ask.listingId) } }, select: { id: true } });
  for (const p of open) {
    const row = await db.waState.findUnique({ where: { key: decisionKey(p.id) }, select: { value: true } });
    const cur = row?.value as { decision?: string; consumedAt?: string } | null;
    if (cur && !cur.decision && !cur.consumedAt) {
      const value = record(p.id);
      await db.waState.update({ where: { key: decisionKey(p.id) }, data: { value } });
      return true;
    }
  }
  const now = new Date();
  const order = await db.sprintPrompt.count({ where: { sprintId: sprint.id } });
  const p = await db.sprintPrompt.create({
    data: { sprintId: sprint.id, text: d.text, order, status: "blocked", metric: "viewingsBooked", blockedAt: now, processedAt: now, result: "Waiting for Abdout's Yes on /monetize: the viewing a WhatsApp tenant asked for." },
  });
  const value = record(p.id);
  await db.waState.create({ data: { key: decisionKey(p.id), value } });
  return true;
}

type HomeTerms = { depositMonths: number | null; commissionPct: number | null; noCommission: boolean | null; viewingFee: number | null; waterIncluded: boolean | null; electricityIncluded: boolean | null };

/** The home's own terms with the broker's word on top, as cost.ts reads them. */
function mergedTerms(home: HomeTerms | null, shown: CostEstimate | null, t: BrokerTerms): ListingTerms {
  // Shown with no commission (the owner posted it, or the ad said so): it stays none unless the broker named one.
  const shownFree = shown != null && !shown.lines.some((l) => l.key === "commission");
  return {
    monthsInAdvance: t.monthsInAdvance ?? null,
    depositMonths: t.depositMonths ?? home?.depositMonths ?? null,
    commissionPct: t.commissionPct ?? home?.commissionPct ?? null,
    noCommission: t.noCommission ?? (t.commissionPct != null ? false : shownFree ? true : (home?.noCommission ?? null)),
    viewingFee: t.viewingFee ?? home?.viewingFee ?? null,
    waterIncluded: t.waterIncluded ?? home?.waterIncluded ?? null,
    electricityIncluded: t.electricityIncluded ?? home?.electricityIncluded ?? null,
  };
}

/** The Listing columns the broker's word fills in, marked as theirs; null when it named none of them. */
function listingTermsData(t: BrokerTerms) {
  const data = {
    ...(t.depositMonths != null ? { depositMonths: t.depositMonths } : {}),
    ...(t.commissionPct != null ? { commissionPct: t.commissionPct } : {}),
    ...(t.noCommission != null || t.commissionPct != null ? { noCommission: t.noCommission ?? false } : {}),
    ...(t.viewingFee != null ? { viewingFee: t.viewingFee } : {}),
    ...(t.waterIncluded != null ? { waterIncluded: t.waterIncluded } : {}),
    ...(t.electricityIncluded != null ? { electricityIncluded: t.electricityIncluded } : {}),
  };
  return Object.keys(data).length ? { ...data, termsSource: "BROKER" as const } : null;
}

/**
 * The person from Mkan confirmed the time with the broker: one ListingVisit
 * with all three, a Deal, and the tenant's confirmation on WhatsApp. The terms
 * the broker confirmed (`terms`) price the Deal, restate the deal to the tenant,
 * and stay on the home for the next tenant's card.
 */
export async function bookViewing(input: {
  taskId: string;
  listingId: number;
  at: Date;
  place?: string | null;
  by?: string | null;
  terms?: BrokerTerms | null;
  /** Mkan's share as the broker agreed it now (`--share-pct=` / `--share-rwf=`), or `none` (`--no-share`). */
  share?: (ShareAgreement & { none?: boolean }) | null;
}): Promise<{ visitId: number; dealId: string; share: number | null; economics: string }> {
  const task = await db.agentTask.findUnique({ where: { id: input.taskId }, select: { id: true, locale: true, shortlist: true, messages: true, ...TENANT_REACH } });
  if (!task) throw new Error(`no task ${input.taskId}`);
  const item = ((task.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === input.listingId);
  // The broker who said yes earns the deal — after a hand-on that is not the first poster (2026-11-06).
  // Only the answering broker's own requests carry respondedAt (broker-inbox.ts recordTypedAnswer).
  const yes = await db.brokerRequest.findFirst({
    where: { listingId: input.listingId, status: "AVAILABLE", respondedAt: { not: null } },
    orderBy: { respondedAt: "desc" },
    select: { brokerUserId: true },
  });
  const answered = yes ? await db.listingBroker.findFirst({ where: { listingId: input.listingId, userId: yes.brokerUserId, brokerId: { not: null } }, select: { brokerId: true } }) : null;
  const link = answered ?? (await db.listingBroker.findFirst({ where: { listingId: input.listingId }, orderBy: [{ role: "desc" }, { createdAt: "asc" }], select: { brokerId: true } }));
  // Mkan's share is settled before anything is written: Mkan sends a person and pays the viewing fee
  // only for a deal that pays it back, or on purpose with --no-share (2026-11-07).
  const brokerRow = link?.brokerId
    ? await db.broker.findUnique({ where: { id: link.brokerId }, select: { id: true, sharePct: true, shareFlatRwf: true, relationship: true } })
    : null;
  const given = input.share && !input.share.none && (input.share.pct || input.share.flatRwf) ? { pct: input.share.pct ?? null, flatRwf: input.share.flatRwf ?? null } : null;
  const agreement = given ?? agreementOf(brokerRow);
  if (!agreement && !input.share?.none) {
    throw new Error("no share agreed with this home's broker — add --share-pct=<% of their commission> or --share-rwf=<RWF a lease> (or record it first with pnpm deal:terms), or --no-share to book without one");
  }
  // Booking the same home for the same chat again is a new time, not a second deal: the open one moves.
  const open = await db.deal.findFirst({ where: { taskId: task.id, listingId: input.listingId, status: { in: ["VIEWING_BOOKED", "VIEWED"] } }, select: { id: true, visitId: true } });
  const rep = input.by?.trim() || viewingRep();
  // A web tenant's left number too: their confirmation and reminders go there (2026-11-08: they got none).
  const tenant = tenantNumber(task);
  const terms = input.terms && Object.keys(input.terms).length > 0 ? input.terms : null;
  let cost: CostEstimate | null = item?.cost ?? null;
  if (terms) {
    const home = await db.listing.findUnique({
      where: { id: input.listingId },
      select: { priceMonth: true, depositMonths: true, commissionPct: true, noCommission: true, viewingFee: true, waterIncluded: true, electricityIncluded: true },
    });
    const rent = terms.rent ?? cost?.headline ?? home?.priceMonth ?? null;
    if (rent != null) cost = longStayCost({ rentPeriod: "MONTHLY", priceMonth: rent, pricePerNight: null, monthlyDiscount: null, cleaningFee: null, terms: mergedTerms(home, cost, terms) }) ?? cost;
    const data = listingTermsData(terms);
    if (data) await db.listing.update({ where: { id: input.listingId }, data });
  }
  const viewingFee = cost?.lines.find((l) => l.key === "viewingFee")?.amount ?? null;
  const commission = cost?.lines.find((l) => l.key === "commission")?.amount ?? null;
  // What moving in costs the tenant on these terms: the viewing fee is Mkan's.
  const moveIn: [number, number] | null = cost?.period === "month" ? [cost.total - (viewingFee ?? 0), cost.totalHigh - (viewingFee ?? 0)] : null;
  const round = (n: number | null | undefined) => (n == null ? null : Math.round(n));
  const share = expectedShare(commission, agreement);
  const economics = unitEconomicsLine({ share, commission: round(commission), agreement, viewingFee: round(viewingFee) });
  // A share agreed now is the broker's terms from here on: the next deal with them starts from it.
  if (given && brokerRow) {
    await db.broker.update({
      where: { id: brokerRow.id },
      data: {
        sharePct: given.pct ?? null,
        shareFlatRwf: given.flatRwf ?? null,
        agreedAt: new Date(),
        agreementNote: `agreed at deal:book K${input.listingId} (${new Date().toISOString().slice(0, 10)}, ${rep})`,
        ...(brokerRow.relationship === "PAUSED" || brokerRow.relationship === "DO_NOT_CONTACT" ? {} : { relationship: "PARTNER" as const }),
      },
    });
  }

  const visitData = {
    contactPhone: tenant,
    scheduledFor: input.at,
    recordedById: `mkan:${rep}`,
    brokerId: link?.brokerId ?? null,
    taskId: task.id,
    repName: rep,
    meetingPoint: input.place?.trim() || null,
  };
  const dealData = {
    brokerId: link?.brokerId ?? null,
    tenantPhone: tenant,
    rentMonthly: round(cost?.headline),
    upfront: moveIn ? round(moveIn[0]) : null,
    brokerCommission: round(commission),
    viewingFeePaid: round(viewingFee),
    mkanShare: share,
    ...(input.share?.none ? { notes: "booked with --no-share: no share agreed" } : {}),
  };
  let visit: { id: number };
  let deal: { id: string };
  if (open?.visitId) {
    // A new time for the same viewing: its reminders start over.
    visit = await db.listingVisit.update({ where: { id: open.visitId }, data: { ...visitData, outcome: "Scheduled", reminders: [] }, select: { id: true } });
    // ...and a reminder still queued for the old time must not go out.
    await db.outboundMessage.updateMany({
      where: { status: "QUEUED", label: { startsWith: "tenant-reminder-", endsWith: `:v${open.visitId}` } },
      data: { status: "SKIPPED", error: "viewing re-booked" },
    });
    deal = await db.deal.update({ where: { id: open.id }, data: { ...dealData, status: "VIEWING_BOOKED" }, select: { id: true } });
  } else {
    visit = await db.listingVisit.create({ data: { listingId: input.listingId, ...visitData }, select: { id: true } });
    deal = await db.deal.create({ data: { listingId: input.listingId, visitId: visit.id, taskId: task.id, ...dealData }, select: { id: true } });
  }
  await db.brokerRequest.updateMany({
    where: { taskId: task.id, listingId: input.listingId, status: "AVAILABLE" },
    data: { chosenSlot: input.at, visitId: visit.id, ...(terms ? { terms: terms as never } : {}) },
  });
  await trace(task.id, "viewing_confirmed", "done", { listingId: input.listingId, at: input.at.toISOString(), visitId: visit.id });
  // The one place a viewing is booked — the broker loop, the web path and `pnpm deal:book` all end here (2026-11-15).
  void dealEvent("VIEWING_BOOKED", {
    listingId: input.listingId,
    taskId: task.id,
    dealId: deal.id,
    tenantPhone: tenant,
    brokerId: link?.brokerId ?? null,
    viewingAt: input.at,
    meetingPoint: input.place?.trim() || null,
    rent: round(cost?.headline),
    share,
  });
  if (tenant) {
    // The tenant's language, as they write it (language.ts: en, rw, fr, ar, sw), else the chat's stored one.
    const chatLang: ConfirmLang = replyLang(((task.messages as { text?: string | null; role?: string }[] | null) ?? []).filter((m) => m && typeof m === "object"), (["en", "rw", "fr", "ar", "sw"] as const).find((l) => l === task.locale) ?? "en");
    const labelLang = langOf(chatLang);
    const where = await db.listing
      .findUnique({ where: { id: input.listingId }, select: { location: { select: { latitude: true, longitude: true, neighbourhood: true, sector: true } } } })
      .catch(() => null);
    const body = viewingConfirmedMessage(chatLang, {
      title: item?.title?.trim() || `#${input.listingId}`,
      label: viewingLabel(input.at, chatLang),
      place: input.place?.trim() || null,
      // The broker's spot, else the home's map pin, else its area.
      spot: meetingSpot(input.place, where?.location ?? null, chatLang),
      rep,
      terms: terms ? confirmedTermsLine(labelLang, terms, moveIn) : null,
      toConfirm: true,
    });
    await sendMessages([{ kind: "TENANT_ALERT", to: tenant, body, label: ALERT_LABEL.viewingConfirmed }], `Viewing confirmed → tenant (home #${input.listingId})`);
    await db.waState.delete({ where: { key: askKey(tenant) } }).catch(() => {});
  }
  const said = terms ? confirmedTermsLine("en", terms, moveIn) : null;
  await postSlackCard(
    `✅ *Viewing booked* — ${item?.title ?? `#${input.listingId}`}, *${viewingLabel(input.at, "en")}*${input.place ? ` · ${input.place}` : ""} · ${rep} · deal \`${deal.id}\`${said ? `\n${said}` : ""}\n${economics}`,
  ).catch(() => {});
  return { visitId: visit.id, dealId: deal.id, share, economics };
}

/**
 * Hourly: the tenant is reminded 24 h and 2 h before (the person from Mkan hears in #mkan), and asked
 * how it went 3 h after — or at 08:00 the next morning when that falls in quiet hours (outbox-pure
 * afterViewingAt). A queued reminder is marked `<mark>:queued`; the outbox marks `<mark>` when it
 * actually goes out and `<mark>:dropped` when it cannot (2026-11-07: a late viewing's "how did it go?"
 * queued after 20:00 was dropped as stale, yet the visit read it as sent). Each mark is queued once.
 */
export async function viewingReminders(now = new Date()): Promise<number> {
  const visits = await db.listingVisit.findMany({
    // 18 h back: an evening viewing's "how did it go?" is queued the next morning.
    where: { outcome: "Scheduled", taskId: { not: null }, scheduledFor: { gte: new Date(now.getTime() - 18 * 3_600_000), lte: new Date(now.getTime() + 25 * 3_600_000) } },
    select: { id: true, listingId: true, scheduledFor: true, contactPhone: true, reminders: true, repName: true, meetingPoint: true, taskId: true, listing: { select: { title: true } } },
  });
  let sent = 0;
  for (const v of visits) {
    const ms = v.scheduledFor.getTime() - now.getTime();
    const mark: "24h" | "2h" | "after" | null =
      ms <= 25 * 3_600_000 && ms > 3 * 3_600_000
        ? "24h"
        : ms <= 2.5 * 3_600_000 && ms > 0
          ? "2h"
          : ms <= 0 && now.getTime() >= afterViewingAt(v.scheduledFor).getTime()
            ? "after"
            : null;
    if (!mark || v.reminders.some((r) => r === mark || r.startsWith(`${mark}:`))) continue;
    // "Your viewing is in 2 h" queued in quiet hours could only arrive late: a pass in the window sends it.
    if (mark === "2h" && !inSendWindow(now)) continue;
    const task = v.taskId ? await db.agentTask.findUnique({ where: { id: v.taskId }, select: { locale: true } }) : null;
    const lang = langOf(task?.locale ?? "en");
    const title = v.listing.title?.trim() || `#${v.id}`;
    const rep = v.repName || viewingRep();
    let note: string = `${mark}:none`;
    // Mkan's person goes to every viewing: he is reminded 2 h before and asked how it went 3 h after, in his own
    // words (the tenant has theirs below). Labelled with the visit, so the outbox never sends one twice (2026-11-15).
    const repNumber = repDigits();
    if (repNumber && (mark === "2h" || mark === "after")) {
      const ref = `K${v.listingId}`;
      const body = mark === "2h" ? repReminderMessage({ listingId: v.listingId, title, at: v.scheduledFor, meetingPoint: v.meetingPoint, tenantPhone: v.contactPhone }) : repAfterMessage(ref);
      await sendMessages([{ kind: "TENANT_ALERT", to: `+${repNumber}`, body, label: `rep-${mark === "2h" ? "reminder-2h" : "after"}:v${v.id}` }], `Viewing ${mark} → ${rep}`).catch(() => {});
    }
    if (v.contactPhone) {
      if (await saidStop(v.contactPhone)) note = `${mark}:stopped`;
      else {
        const body = mark === "after" ? afterViewingMessage(lang, title) : viewingReminderMessage(lang, { title, label: viewingLabel(v.scheduledFor, lang), rep }, mark, kigaliDayWord(v.scheduledFor, now));
        // Labelled with the visit: the outbox marks it when it goes out (wa-outbox.ts drain).
        const channel = await sendMessages([{ kind: "TENANT_ALERT", to: v.contactPhone, body, label: reminderLabel(mark, v.id) }], `Viewing ${mark} → tenant`);
        // A manual send is a person tapping the #mkan card: it counts as sent, as before.
        note = channel === "queued" ? `${mark}:queued` : mark;
      }
    }
    if (mark !== "after") await postSlackCard(`⏰ Viewing ${mark === "24h" ? (kigaliDayWord(v.scheduledFor, now) ?? "coming up") : "in 2 h"}: ${title}, ${viewingLabel(v.scheduledFor, "en")}${v.meetingPoint ? ` · ${v.meetingPoint}` : ""} · ${rep}`).catch(() => {});
    await db.listingVisit.update({ where: { id: v.id }, data: { reminders: { push: note } } });
    sent += 1;
  }
  return sent;
}

/**
 * How the deal ended up, written by the person who was there (`pnpm deal:status`). SIGNED and PAID
 * need Mkan's share — given now, booked, or the broker's agreement on the commission — unless
 * `noShare` closes it without one on purpose. SIGNED posts the invoice for a person to send.
 */
export async function setDealStatus(
  dealId: string,
  status: "VIEWED" | "SIGNED" | "PAID" | "LOST",
  extras: { mkanShare?: number | null; notes?: string | null; noShare?: boolean } = {},
) {
  const now = new Date();
  const before = await db.deal.findUnique({
    where: { id: dealId },
    select: {
      status: true,
      mkanShare: true,
      brokerCommission: true,
      viewingFeePaid: true,
      listingId: true,
      taskId: true,
      tenantPhone: true,
      tenantName: true,
      rentMonthly: true,
      broker: { select: { id: true, name: true, contactName: true, phones: true, whatsapp: true, optOut: true, sharePct: true, shareFlatRwf: true } },
      listing: { select: { title: true } },
    },
  });
  if (!before) throw new Error(`no deal ${dealId}`);
  // Throws before anything is written when a signed or paid deal would close with no share.
  const share = shareForStatus(status, {
    given: extras.mkanShare != null && extras.mkanShare > 0 ? Math.round(extras.mkanShare) : null,
    booked: before.mkanShare,
    commission: before.brokerCommission,
    agreement: agreementOf(before.broker),
    noShare: !!extras.noShare,
  });
  const deal = await db.deal.update({
    where: { id: dealId },
    data: {
      status,
      ...(status === "SIGNED" ? { signedAt: now } : {}),
      ...(status === "PAID" ? { paidAt: now } : {}),
      ...(share != null ? { mkanShare: share } : {}),
      ...(extras.notes ? { notes: extras.notes } : extras.noShare && (status === "SIGNED" || status === "PAID") ? { notes: `closed ${status} with --no-share` } : {}),
    },
    select: { id: true, visitId: true, listingId: true, brokerId: true, mkanShare: true },
  });
  // Paid means the money is in: Mkan's share lands on /monetize as received, once per deal.
  if (status === "PAID" && (deal.mkanShare ?? 0) > 0) {
    const had = await db.revenueEntry.findFirst({ where: { dealId: deal.id, line: "COMMISSION" }, select: { id: true } });
    if (!had) {
      await db.revenueEntry.create({
        data: { line: "COMMISSION", amountRwf: deal.mkanShare!, receivedAt: now, dealId: deal.id, brokerId: deal.brokerId, note: "deal:status PAID" },
      });
    }
  }
  if (deal.visitId && status !== "PAID") {
    // The viewing took place, whatever came of it.
    await db.listingVisit.update({ where: { id: deal.visitId }, data: { outcome: "Completed", occurredAt: now } }).catch(() => {});
  }
  // A signed lease — or paid, which means signed (11-06: PAID alone left the home listed): the home is
  // off the market. The broker became a PARTNER when the share was agreed (bookViewing, deal:terms) —
  // a signature alone no longer promotes them (2026-11-07: every broker would have been "a partner"
  // with no terms on record).
  if (status === "PAID") await db.deal.updateMany({ where: { id: deal.id, signedAt: null }, data: { signedAt: now } });
  if (status === "SIGNED" || status === "PAID") {
    await db.listing.update({ where: { id: deal.listingId }, data: { lostAt: now, lostReason: "RENTED" } });
  }
  // One line to Mkan's person and one record in Twenty, once per change — every way to close a deal ends here:
  // the rep's words, `pnpm deal:status`, /monetize (2026-11-15).
  if (before.status !== status) {
    void dealEvent(status, {
      listingId: deal.listingId,
      taskId: before.taskId,
      dealId: deal.id,
      tenantPhone: before.tenantPhone,
      tenantName: before.tenantName,
      brokerId: deal.brokerId,
      note: extras.notes ?? null,
      rent: before.rentMonthly,
      share: deal.mkanShare,
    });
  }
  // #mkan hears the money steps once, when the status changes.
  if (before.status !== status) {
    const ref = `K${deal.listingId}`;
    const title = scrubTitle(before.listing.title) || `#${deal.listingId}`;
    const fee = before.viewingFeePaid ?? 0;
    if (status === "SIGNED" && share != null) {
      const phone = before.broker?.whatsapp ?? before.broker?.phones?.[0] ?? null;
      const payout = payoutLine();
      const draft = invoiceDraft({ broker: before.broker?.contactName?.trim() || before.broker?.name || null, amount: share, ref, title, payout });
      // Since 2026-11-14 the share request goes by itself once there is somewhere to pay (MKAN_PAYOUT_MOMO): it
      // used to wait in #mkan for a person to send, like every other step after a broker's yes. With no payout
      // number, no broker number or a broker who opted out, the card still carries the draft for a person.
      const auto = !!phone && !!payout && !!before.broker && !before.broker.optOut && process.env.MKAN_SHARE_REQUEST_AUTO?.trim().toLowerCase() !== "off";
      if (auto) {
        // auto-*: the line's word about the broker's own deal, never held as a new ask (outbox-pure.ts).
        await sendMessages([{ kind: "BROKER_REQUEST", to: `+${phone!.replace(/\D/g, "")}`, body: draft, label: "auto-share-request", brokerId: before.broker!.id }], `Share request → broker (${ref})`);
        const value = { at: now.toISOString(), amount: share, by: "line" };
        await db.waState.upsert({ where: { key: `share-asked:${deal.id}` }, create: { key: `share-asked:${deal.id}`, value }, update: { value } }).catch(() => {});
      }
      await postSlackCard(
        (auto
          ? `🧾 *Share requested* ${before.broker?.name ?? "the broker"} ${rwf(share)} for ${ref} (${title}) — the line sent the request on WhatsApp.\n`
          : `🧾 *Invoice* ${before.broker?.name ?? "the broker"} ${rwf(share)} for ${ref} (${title}) — ${phone ? `<${waLink(phone, draft)}|open the drafted WhatsApp>` : "no broker number on file"}; a person sends it.\n` +
            `${payout ? "" : "⚠ No payout number set (MKAN_PAYOUT_MOMO): add where the broker should pay, and the line sends this itself from then on.\n"}`) +
          `When it is in: \`${dealCommand(deal.id, "paid")}\``,
      ).catch(() => {});
    } else if (status === "SIGNED") {
      await postSlackCard(`✍️ *Signed* ${ref} (${title}) — closed with no share for Mkan (--no-share).`).catch(() => {});
    } else if (status === "PAID" && share != null) {
      await postSlackCard(`💰 *Paid* ${ref} (${title}) — ${rwf(share)} received${fee > 0 ? `, ${rwf(share - fee)} after the ${rwf(fee)} viewing fee` : ""}.`).catch(() => {});
    }
  }
  return deal;
}


/** The tenant's viewing whose "how did it go?" went out in the last 72 h — their next message answers it. */
export async function afterViewingFor(address: string | null | undefined, now = new Date()) {
  if (!address) return null;
  const digits = address.replace(/\D/g, "");
  return db.listingVisit.findFirst({
    where: {
      contactPhone: { in: [`+${digits}`, digits] },
      reminders: { has: "after" },
      scheduledFor: { gte: new Date(now.getTime() - 75 * 3_600_000), lte: now },
    },
    orderBy: { scheduledFor: "desc" },
    select: { id: true, listingId: true, taskId: true, scheduledFor: true, listing: { select: { title: true } }, deal: { select: { id: true, status: true, rentMonthly: true, upfront: true } } },
  });
}

/** The broker of the deal and where to write to them, or null (no number, or they opted out). */
async function dealBroker(dealId: string | undefined): Promise<{ id: string; phone: string } | null> {
  if (!dealId) return null;
  const broker = await db.deal
    .findUnique({ where: { id: dealId }, select: { broker: { select: { id: true, phones: true, whatsapp: true, optOut: true } } } })
    .then((d) => d?.broker ?? null)
    .catch(() => null);
  const phone = broker && !broker.optOut ? (broker.whatsapp ?? broker.phones[0] ?? null) : null;
  return broker && phone ? { id: broker.id, phone: `+${phone.replace(/\D/g, "")}` } : null;
}

/**
 * Write the answer to "how did the viewing go?" and drive the deal forward by itself (2026-11-22):
 *   liked → the deal goes VIEWED, the broker is told, and the tenant gets the move-in terms and is asked which
 *           day to sign; the day they name is asked of the broker (the same answer, a message later);
 *   not   → the deal is LOST and the line offers the next best homes from the tenant's brief, or asks what to change;
 *   other → the question again, plainly (or "which day to sign?" once they said they want it).
 * Mkan's person is told each step as an FYI — nothing waits for him. His words override: a deal he already
 * closed (signed / paid / lost) is never moved back by a late "1" or "2". Returns the reply.
 */
export async function recordAfterViewing(
  v: NonNullable<Awaited<ReturnType<typeof afterViewingFor>>>,
  verdict: "want" | "not" | null,
  text: string,
  phone: string,
  lang: DealLang,
  now = new Date(),
): Promise<string> {
  const title = scrubTitle(v.listing.title) || `#${v.listingId}`;
  const stamp = now.toISOString().slice(0, 16).replace("T", " ");
  const rep = viewingRep();
  const repPhone = process.env.MKAN_REP_WHATSAPP?.trim();
  const fyi = (body: string, what: string) => (repPhone ? sendMessages([{ kind: "TENANT_ALERT", to: `+${repPhone.replace(/\D/g, "")}`, body, label: `rep-${what}:v${v.id}` }], `${what} → ${rep}`).catch(() => {}) : Promise.resolve());
  await db.listingVisit.update({ where: { id: v.id }, data: { outcome: "Completed" } }).catch(() => {});
  const status = v.deal?.status;
  // His words (signed / paid / lost K…) win: the deal is closed, the tenant's late answer changes nothing.
  if (status === "SIGNED" || status === "PAID" || status === "LOST") {
    await postSlackCard(`💬 FYI — ${phone} answered the viewing question for *K${v.listingId}* (${title}) after you closed it (${status}); the line left the deal as it is.\n> ${text.slice(0, 300)}`).catch(() => {});
    return afterViewingClosedText(lang);
  }

  // The tenant already said they want it: what they write now is read as the day to sign.
  if (status === "VIEWED" && verdict !== "not") {
    const when = readViewingTime(text, now);
    if (when && "at" in when && when.at.getTime() > now.getTime()) {
      const label = viewingLabel(when.at, lang);
      const broker = await dealBroker(v.deal?.id);
      if (broker) {
        await sendMessages(
          [{ kind: "BROKER_REQUEST", to: broker.phone, body: signingBrokerMessage({ title, ref: `K${v.listingId}`, label: viewingLabel(when.at, "en"), rep }), label: `auto-signing:v${v.id}`, brokerId: broker.id }],
          `Signing day → broker (K${v.listingId})`,
        ).catch(() => {});
      }
      if (v.deal) await db.deal.update({ where: { id: v.deal.id }, data: { notes: `tenant wants it; signing asked for ${viewingLabel(when.at, "en")} (WhatsApp ${stamp})` } }).catch(() => {});
      await fyi(`FYI ${rep}: ${phone} would sign for ${title} (K${v.listingId}) on ${viewingLabel(when.at, "en")}. The line asked the broker${broker ? "" : " — no number on file, it could not"}; you are there.`, "signing");
      await postSlackCard(`✍️ FYI — signing for *K${v.listingId}* (${title}) asked for ${viewingLabel(when.at, "en")}; ${broker ? "the line asked the broker to confirm" : "no broker number on file, nothing sent"}.`).catch(() => {});
      return signingNotedText(lang, { title, label, rep });
    }
    if (verdict === "want") return afterViewingLikedText(lang, { title, rent: v.deal?.rentMonthly ?? null, upfront: v.deal?.upfront ?? null, rep });
    await postSlackCard(`💬 FYI — ${phone} wrote about signing *K${v.listingId}* (${title}); the line asked them for a day:\n> ${text.slice(0, 400)}`).catch(() => {});
    return signingAskAgainText(lang, title);
  }

  if (verdict === "want") {
    const first = !v.deal || v.deal.status === "VIEWING_BOOKED";
    if (v.deal && first) {
      await db.deal.update({ where: { id: v.deal.id }, data: { status: "VIEWED", notes: `tenant wants it (WhatsApp ${stamp})` } });
      void dealEvent("VIEWED", { listingId: v.listingId, taskId: v.taskId, dealId: v.deal.id, tenantPhone: phone, note: "the tenant wants it" });
    }
    // The broker hears it now, from the line, once.
    const broker = await dealBroker(v.deal?.id);
    if (first && broker) {
      await sendMessages(
        [{ kind: "BROKER_REQUEST", to: broker.phone, body: tenantWantsBrokerMessage({ title, ref: `K${v.listingId}`, rep }), label: "auto-tenant-wants", brokerId: broker.id }],
        `Tenant wants the home → broker (K${v.listingId})`,
      ).catch(() => {});
    }
    if (first) {
      await fyi(`FYI ${rep}: the tenant ${phone} wants to take ${title} (K${v.listingId}) after the viewing. The line sent them the move-in terms and asked for a signing day, and told the broker${broker ? ` (${broker.phone})` : " (no number on file: the line could not)"}. Say \`signed K${v.listingId}\` when it is signed.`, "wants");
      await postSlackCard(`🎉 FYI — ${phone} wants to take *K${v.listingId}* (${title}) after the viewing. The line told the ${broker ? "broker" : "broker? no number on file — nothing sent"}, sent the tenant the terms and asked which day to sign.${v.deal ? `\nWhen it is signed: \`${dealCommand(v.deal.id, "signed")}\`` : ""}\n> ${text.slice(0, 300)}`).catch(() => {});
    }
    return afterViewingLikedText(lang, { title, rent: v.deal?.rentMonthly ?? null, upfront: v.deal?.upfront ?? null, rep });
  }

  if (verdict === "not") {
    if (v.deal && (v.deal.status === "VIEWING_BOOKED" || v.deal.status === "VIEWED")) {
      await db.deal.update({ where: { id: v.deal.id }, data: { status: "LOST", notes: `not for the tenant (WhatsApp ${stamp})` } });
      void dealEvent("LOST", { listingId: v.listingId, taskId: v.taskId, dealId: v.deal.id, tenantPhone: phone, note: "the tenant passed on it after the viewing" });
    }
    // The line goes on by itself: the next best homes from their brief, never one already shown or taken.
    const task = v.taskId ? await db.agentTask.findUnique({ where: { id: v.taskId }, select: { id: true, profileId: true, requirements: true, shortlist: true } }).catch(() => null) : null;
    const homes = task ? await newHomesFor(task, 2) : [];
    await postSlackCard(`👎 FYI — ${phone} passed on *K${v.listingId}* (${title}) after the viewing. ${homes.length ? `The line offered ${homes.length} other home${homes.length > 1 ? "s" : ""} (${homes.map((h) => `K${h.id}`).join(", ")}).` : "No other home fits their brief: the line asked what to change."}\n> ${text.slice(0, 300)}`).catch(() => {});
    return afterViewingNotHomesText(lang, homes);
  }

  // Neither a yes nor a no: the question again, plainly — never "someone from Mkan will answer you here"
  // (nobody did). #mkan gets what they wrote, as an FYI.
  await postSlackCard(`💬 FYI — ${phone} wrote about the viewing of *K${v.listingId}* (${title}); the line asked them again whether they want it:\n> ${text.slice(0, 400)}`).catch(() => {});
  return afterViewingUnsureText(lang, title);
}
