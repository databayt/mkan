import "server-only";

/**
 * From a broker's yes to a signed lease, with Mkan in the middle (Abdout,
 * 2026-11-01). The tenant never gets the broker's number:
 *
 *   broker says available ─► sendDealSheet: the WhatsApp tenant gets the deal
 *                            (deal-pure.ts) and is asked when they can come
 *   tenant names a time    ─► proposeViewing: a #mkan card for the person from
 *                            Mkan, who confirms the time with the broker and
 *                            asks the terms the tenant was shown as usual
 *   that person books it   ─► bookViewing (`pnpm deal:book … --advance=3 …`): a
 *                            three-party ListingVisit + a Deal on the confirmed
 *                            terms, and the tenant's confirmation restating them
 *   the hourly cron        ─► viewingReminders: 24 h and 2 h before, and "how did
 *                            it go?" after
 *   the lease is signed    ─► setDealStatus (`pnpm deal:status`)
 *
 * The person confirms with the broker by hand on purpose: a broker hears from
 * a person, not a machine, about the time they show their home.
 */
import { db } from "@/lib/db";
import { publicAppUrl, waLink } from "../../../scripts/crm/public-links";
import { viewingRep } from "./broker-message";
import { longStayCost, type CostEstimate, type ListingTerms } from "./cost";
import {
  afterViewingMessage,
  afterViewingNotText,
  afterViewingWantText,
  confirmedTermsLine,
  dealSheetMessage,
  termsToAsk,
  viewingConfirmedMessage,
  viewingLabel,
  viewingProposedMessage,
  viewingReminderMessage,
  type BrokerTerms,
  type DealLang,
} from "./deal-pure";
import type { ShortlistItem } from "./types";
import { postSlackCard, sendMessages } from "./whatsapp";
import { scrubTitle } from "@/lib/redact";
import { chatLink } from "./demand";
import { readState } from "./wa-state";
import { phoneKey } from "../../../scripts/wa/outbox-pure";

/** The number said STOP on WhatsApp (wa-tenant.ts keeps the list). */
async function saidStop(phone: string): Promise<boolean> {
  const stopped = await readState<string[]>("tenant-stop", []).catch(() => [] as string[]);
  return stopped.map(phoneKey).includes(phoneKey(phone));
}

/** The deal sheet asked this tenant for a time; their next message may be one (WaState). */
const askKey = (address: string) => `viewing-ask:${address.replace(/\D/g, "")}`;
const ASK_TTL_MS = 72 * 3_600_000;
export type ViewingAsk = { taskId: string; listingId: number; at: string; proposedAt?: string };

const langOf = (l: string): DealLang => (l === "ar" || l === "rw" ? l : "en");

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

type DealTask = { id: string; locale: string; shortlist: unknown; profile: { waPhone: string | null } | null };

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
    { title: scrubTitle(item?.title) || `#${listingId}`, ref: `K${listingId}`, cost: item?.cost ?? null, rep: viewingRep(), link: chatLink(task.id, lang) },
    lang,
  );
  const value = { taskId: task.id, listingId, at: new Date().toISOString() } satisfies ViewingAsk;
  await db.waState.upsert({ where: { key: askKey(to) }, create: { key: askKey(to), value }, update: { value } });
  return { to, body };
}

/** The broker said the home is free: the WhatsApp tenant gets the deal and is asked when they can come. */
export async function sendDealSheet(task: DealTask, listingId: number): Promise<boolean> {
  const sheet = await prepareDealSheet(task, listingId);
  if (!sheet) return false;
  await sendMessages([{ kind: "TENANT_ALERT", to: sheet.to, body: sheet.body, label: "tenant" }], `Deal sheet → tenant (home #${listingId})`);
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

/** The tenant named a time: the person from Mkan gets it in #mkan with both chats one tap away; the tenant hears so. */
export async function proposeViewing(ask: ViewingAsk, at: Date, tenant: string, lang: DealLang): Promise<string> {
  const label = viewingLabel(at, lang);
  const [home, brokers, task] = await Promise.all([
    db.listing.findUnique({ where: { id: ask.listingId }, select: { title: true, location: { select: { address: true, neighbourhood: true, sector: true } } } }),
    db.listingBroker.findMany({ where: { listingId: ask.listingId }, select: { user: { select: { phoneNumber: true, username: true } } }, take: 3 }),
    db.agentTask.findUnique({ where: { id: ask.taskId }, select: { shortlist: true } }),
  ]);
  const broker = brokers.map((b) => (b.user.phoneNumber ? `${b.user.username ?? "broker"} <${waLink(b.user.phoneNumber, "")}|${b.user.phoneNumber}>` : null)).filter(Boolean).join(" · ") || "no broker number on file";
  const shown = ((task?.shortlist as ShortlistItem[] | null) ?? []).find((s) => s.id === ask.listingId)?.cost ?? null;
  const iso = at.toISOString();
  // The deal sheet told the tenant the usual and unstated terms get confirmed: the person asks them with the time.
  await postSlackCard(
    `📅 *Viewing asked* — ${home?.title ?? `#${ask.listingId}`} (K${ask.listingId}), *${viewingLabel(at, "en")}*\n` +
      `Tenant: <${waLink(tenant, "")}|${tenant}> · Broker: ${broker}\n` +
      `${viewingRep()}: confirm the time with the broker and ask: ${termsToAsk(shown).join(" · ")}. Then\n` +
      `\`pnpm deal:book --task=${ask.taskId} --listing=${ask.listingId} --at=${iso} --place="…"\` + what they said, e.g. \`--advance=3 --deposit=1 --commission=10 --water=yes --power=no --lease=12 --move-in=YYYY-MM-DD\``,
  ).catch(() => {});
  await trace(ask.taskId, "viewing_proposed", "waiting_person", { listingId: ask.listingId, at: iso });
  const value = { ...ask, proposedAt: iso } satisfies ViewingAsk;
  await db.waState.update({ where: { key: askKey(tenant) }, data: { value } }).catch(() => {});
  return viewingProposedMessage(lang, label, viewingRep());
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
export async function bookViewing(input: { taskId: string; listingId: number; at: Date; place?: string | null; by?: string | null; terms?: BrokerTerms | null }): Promise<{ visitId: number; dealId: string }> {
  const task = await db.agentTask.findUnique({ where: { id: input.taskId }, select: { id: true, locale: true, shortlist: true, profile: { select: { waPhone: true } } } });
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
  // Booking the same home for the same chat again is a new time, not a second deal: the open one moves.
  const open = await db.deal.findFirst({ where: { taskId: task.id, listingId: input.listingId, status: { in: ["VIEWING_BOOKED", "VIEWED"] } }, select: { id: true, visitId: true } });
  const rep = input.by?.trim() || viewingRep();
  const tenant = task.profile?.waPhone ?? null;
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
  };
  let visit: { id: number };
  let deal: { id: string };
  if (open?.visitId) {
    // A new time for the same viewing: its reminders start over.
    visit = await db.listingVisit.update({ where: { id: open.visitId }, data: { ...visitData, outcome: "Scheduled", reminders: [] }, select: { id: true } });
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
  if (tenant) {
    const lang = langOf(task.locale);
    const body = viewingConfirmedMessage(lang, {
      title: item?.title?.trim() || `#${input.listingId}`,
      label: viewingLabel(input.at, lang),
      place: input.place?.trim() || null,
      rep,
      terms: terms ? confirmedTermsLine(lang, terms, moveIn) : null,
    });
    await sendMessages([{ kind: "TENANT_ALERT", to: tenant, body, label: "tenant" }], `Viewing confirmed → tenant (home #${input.listingId})`);
    await db.waState.delete({ where: { key: askKey(tenant) } }).catch(() => {});
  }
  const said = terms ? confirmedTermsLine("en", terms, moveIn) : null;
  await postSlackCard(`✅ *Viewing booked* — ${item?.title ?? `#${input.listingId}`}, *${viewingLabel(input.at, "en")}*${input.place ? ` · ${input.place}` : ""} · ${rep} · deal \`${deal.id}\`${said ? `\n${said}` : ""}`).catch(() => {});
  return { visitId: visit.id, dealId: deal.id };
}

/**
 * Hourly: the tenant is reminded 24 h and 2 h before (the person from Mkan
 * hears in #mkan), and asked how it went 3 h after. Each mark is sent once.
 */
export async function viewingReminders(now = new Date()): Promise<number> {
  const visits = await db.listingVisit.findMany({
    where: { outcome: "Scheduled", taskId: { not: null }, scheduledFor: { gte: new Date(now.getTime() - 6 * 3_600_000), lte: new Date(now.getTime() + 25 * 3_600_000) } },
    select: { id: true, scheduledFor: true, contactPhone: true, reminders: true, repName: true, meetingPoint: true, taskId: true, listing: { select: { title: true } } },
  });
  let sent = 0;
  for (const v of visits) {
    const ms = v.scheduledFor.getTime() - now.getTime();
    const mark = ms <= 25 * 3_600_000 && ms > 3 * 3_600_000 ? "24h" : ms <= 2.5 * 3_600_000 && ms > 0 ? "2h" : ms <= -3 * 3_600_000 ? "after" : null;
    if (!mark || v.reminders.includes(mark)) continue;
    const task = v.taskId ? await db.agentTask.findUnique({ where: { id: v.taskId }, select: { locale: true } }) : null;
    const lang = langOf(task?.locale ?? "en");
    const title = v.listing.title?.trim() || `#${v.id}`;
    const rep = v.repName || viewingRep();
    if (v.contactPhone) {
      const body = mark === "after" ? afterViewingMessage(lang, title) : viewingReminderMessage(lang, { title, label: viewingLabel(v.scheduledFor, lang), rep }, mark);
      // Labelled as a reminder: the outbox drops it if it could not go out within 3 h (outbox-pure.ts).
      if (!(await saidStop(v.contactPhone))) await sendMessages([{ kind: "TENANT_ALERT", to: v.contactPhone, body, label: `tenant-reminder-${mark}` }], `Viewing ${mark} → tenant`);
    }
    if (mark !== "after") await postSlackCard(`⏰ Viewing ${mark === "24h" ? "tomorrow" : "in 2 h"}: ${title}, ${viewingLabel(v.scheduledFor, "en")}${v.meetingPoint ? ` · ${v.meetingPoint}` : ""} · ${rep}`).catch(() => {});
    await db.listingVisit.update({ where: { id: v.id }, data: { reminders: { push: mark } } });
    sent += 1;
  }
  return sent;
}

/** How the deal ended up, written by the person who was there (`pnpm deal:status`). */
export async function setDealStatus(dealId: string, status: "VIEWED" | "SIGNED" | "PAID" | "LOST", extras: { mkanShare?: number | null; notes?: string | null } = {}) {
  const now = new Date();
  const deal = await db.deal.update({
    where: { id: dealId },
    data: {
      status,
      ...(status === "SIGNED" ? { signedAt: now } : {}),
      ...(status === "PAID" ? { paidAt: now } : {}),
      ...(extras.mkanShare != null ? { mkanShare: extras.mkanShare } : {}),
      ...(extras.notes ? { notes: extras.notes } : {}),
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
  // off the market, and the broker is a partner in practice.
  if (status === "PAID") await db.deal.updateMany({ where: { id: deal.id, signedAt: null }, data: { signedAt: now } });
  if (status === "SIGNED" || status === "PAID") {
    await db.listing.update({ where: { id: deal.listingId }, data: { lostAt: now, lostReason: "RENTED" } });
    if (deal.brokerId) await db.broker.updateMany({ where: { id: deal.brokerId, relationship: { in: ["NEW", "INTRODUCED", "ACTIVE"] } }, data: { relationship: "PARTNER" } });
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
    select: { id: true, listingId: true, taskId: true, listing: { select: { title: true } }, deal: { select: { id: true, status: true } } },
  });
}

/**
 * Write the answer to "how did the viewing go?": want → the deal stays VIEWED and the person who closes
 * deals hears it now; not → the deal is LOST; anything else → a person reads it. Returns the reply.
 */
export async function recordAfterViewing(
  v: NonNullable<Awaited<ReturnType<typeof afterViewingFor>>>,
  verdict: "want" | "not" | null,
  text: string,
  phone: string,
  lang: DealLang,
): Promise<string> {
  const title = scrubTitle(v.listing.title) || `#${v.listingId}`;
  const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");
  await db.listingVisit.update({ where: { id: v.id }, data: { outcome: "Completed" } }).catch(() => {});
  if (verdict === "want") {
    if (v.deal && v.deal.status === "VIEWING_BOOKED") await db.deal.update({ where: { id: v.deal.id }, data: { status: "VIEWED", notes: `tenant wants it (WhatsApp ${stamp})` } });
    await postSlackCard(`🎉 ${phone} wants to take *K${v.listingId}* (${title}) after the viewing — call the broker to sign.${v.deal ? `\nThen: \`pnpm deal:status ${v.deal.id} SIGNED\`` : ""}\n> ${text.slice(0, 300)}`).catch(() => {});
    return afterViewingWantText(lang, title);
  }
  if (verdict === "not") {
    if (v.deal && (v.deal.status === "VIEWING_BOOKED" || v.deal.status === "VIEWED")) await db.deal.update({ where: { id: v.deal.id }, data: { status: "LOST", notes: `not for the tenant (WhatsApp ${stamp})` } });
    await postSlackCard(`👎 ${phone} passed on *K${v.listingId}* (${title}) after the viewing.\n> ${text.slice(0, 300)}`).catch(() => {});
    return afterViewingNotText(lang);
  }
  await postSlackCard(`💬 ${phone} wrote about the viewing of *K${v.listingId}* (${title}) — answer them yourself:\n> ${text.slice(0, 400)}`).catch(() => {});
  return personAfterViewingText(lang);
}

const personAfterViewingText = (lang: DealLang) =>
  lang === "ar" ? "شكراً! سيقرأ رسالتك شخص من فريق مكان ويرد عليك هنا." : lang === "rw" ? "Murakoze! Umuntu wo muri Mkan arasoma ubutumwa bwawe akagusubiza hano." : "Thanks! Someone from Mkan will read this and answer you here.";
