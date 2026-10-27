import "server-only";

/**
 * A broker's WhatsApp reply to Mkan, turned into what it means. Kigali brokers
 * answer in free text and albums, not through links (Abdout's own chats, Oct
 * 2026), so the outbox (wa-outbox.ts) hands every reply here, read against the
 * last question that number got:
 *
 *   - a no-home ask (BROKER_ASK):
 *     - a home ("Kibagabaga / 2 bedrooms / Price: 300k" + photos) → a lead in
 *       the tenant's chat, same path as the /b/d form;
 *     - "How much?" / "Where?" / "Features&budget" → one answer with the need;
 *     - photos without a price → one "what's the rent, and where?";
 *   - "is this available?" (BROKER_REQUEST):
 *     - "yes" / "taken" anywhere in the reply → the answer, as if tapped, and
 *       one short thanks;
 *     - "budget?" / "single or family?" → one answer with the need;
 *     - only a hello → one "is it still available?";
 *   - anything else → the caller posts it to #mkan for a person.
 *
 * Every word back is the tenant's own (broker-message.ts) and goes out at most
 * once per ask. "Are you a bot?" is never answered here: a person does.
 */
import { db } from "@/lib/db";
import { applyAnswer, brokerAnswers } from "./broker";
import { createBrokerHome, type AskForHome } from "./broker-home";
import { aboutMeMessage, availableAckMessage, needReplyMessage, needSummary, priceQuestionMessage, reAskMessage, takenAckMessage } from "./broker-message";
import { isOffer, parseBrokerReply, type BrokerReply } from "./broker-reply";
import { coerceRequirements, EMPTY_REQUIREMENTS, mergeRequirements } from "./requirements";

/** An ask is still being answered this long after it went out. */
const ASK_WINDOW_MS = 72 * 3_600_000;
const REQUEST_WINDOW_MS = 48 * 3_600_000;

export type InboxAction =
  | { kind: "home"; listingId: number; matched: boolean }
  /** Send `text` now; `outboundId` is its row (already SENT) — mark it FAILED if the send fails. */
  | { kind: "reply"; text: string; why: "question" | "photos-need-price" | "about-me" | "greeting"; outboundId: string }
  /** `applied` — the answer was news to Mkan; `reply` — the thanks to send, as above. */
  | { kind: "availability"; listingId: number; answer: "AVAILABLE" | "RENTED"; applied: boolean; reply: { text: string; outboundId: string } | null }
  | { kind: "none" };

/** Phones are stored "+250…"; numbers from WhatsApp come as digits. */
const phoneVariants = (phone: string) => [`+${phone.replace(/^\+/, "")}`, phone.replace(/^\+/, "")];

type Ask = { id: string; kind: "BROKER_ASK" | "BROKER_REQUEST" | "TENANT_ALERT"; to: string; sentAt: Date | null; brokerRequestIds: string[] };

/** The last question this number got from Mkan before `at`: a no-home ask, or "is this available?" with its requests. */
async function lastAsk(phone: string, at: Date): Promise<Ask | null> {
  return db.outboundMessage.findFirst({
    where: {
      to: { in: phoneVariants(phone) },
      status: "SENT",
      sentAt: { lte: at, gte: new Date(at.getTime() - ASK_WINDOW_MS) },
      OR: [{ kind: "BROKER_ASK" }, { kind: "BROKER_REQUEST", brokerRequestIds: { isEmpty: false } }],
    },
    orderBy: { sentAt: "desc" },
    select: { id: true, kind: true, to: true, sentAt: true, brokerRequestIds: true },
  });
}

/**
 * The homes an availability ask covers. "Yes" is about one home: the one still
 * open, or the only one asked about — several open homes need a person to say
 * which one the broker means.
 */
async function askedHomes(requestIds: string[]) {
  const requests = await db.brokerRequest.findMany({ where: { id: { in: requestIds } }, select: { listingId: true, status: true, need: true } });
  const all = [...new Set(requests.map((q) => q.listingId))];
  const open = [...new Set(requests.filter((q) => q.status === "PENDING" || q.status === "NO_REPLY").map((q) => q.listingId))];
  const home = open.length === 1 ? open[0]! : open.length === 0 && all.length === 1 ? all[0]! : null;
  const wanted = mergeRequirements(EMPTY_REQUIREMENTS, coerceRequirements((requests[0]?.need as { requirements?: unknown } | null)?.requirements));
  return { home, isNews: open.length === 1, many: all.length > 1, need: needSummary(wanted) };
}

/**
 * What a reply to "is this available?" says, with nothing written — the
 * outbox and scripts/wa/replay-answers.ts read it the same way. Null when the
 * number's last question was not an availability ask, or is past answering.
 */
export async function readAvailabilityReply(phone: string, text: string, at: Date, known?: Ask | null) {
  const ask = known === undefined ? await lastAsk(phone, at) : known;
  if (ask?.kind !== "BROKER_REQUEST" || !ask.sentAt || at.getTime() - ask.sentAt.getTime() > REQUEST_WINDOW_MS) return null;
  const r = parseBrokerReply(text);
  const homes = await askedHomes(ask.brokerRequestIds);
  const answer: "AVAILABLE" | "RENTED" | null = r.asksIfBot || homes.home == null ? null : r.gone ? "RENTED" : r.yes ? "AVAILABLE" : null;
  // The same answer already on record (the form, another broker who posted it) is not news: tenants heard it.
  const onRecord = answer && homes.home != null ? (await brokerAnswers([homes.home])).get(homes.home)?.status : undefined;
  return { ask, r, answer, ...homes, isNews: homes.isNews && onRecord !== answer };
}

/**
 * A typed answer, kept like a tap on the form: on the ask's own requests (a
 * late one too — an ask that expired unanswered is still asking), then on every
 * task waiting on the home (broker.ts applyAnswer).
 */
export async function recordTypedAnswer(requestIds: string[], listingId: number, answer: "AVAILABLE" | "RENTED") {
  await db.brokerRequest.updateMany({
    where: { id: { in: requestIds }, listingId, status: { in: ["PENDING", "NO_REPLY"] } },
    data: { status: answer, respondedAt: new Date() },
  });
  await applyAnswer(listingId, answer);
}

/** Write a word back to the broker — once per ask and label — for the caller to send. Null when it already went. */
async function replyOnce(ask: Ask, label: string, text: string): Promise<{ text: string; outboundId: string } | null> {
  const already = await db.outboundMessage.count({ where: { to: ask.to, label, createdAt: { gte: ask.sentAt ?? new Date(0) } } });
  if (already > 0) return null;
  const { id } = await db.outboundMessage.create({
    data: { kind: "BROKER_REQUEST", to: ask.to, body: text, label, status: "SENT", sentAt: new Date() },
    select: { id: true },
  });
  return { text, outboundId: id };
}

/** Learn how fast the broker answers: a running blend that favours their usual pace over one slow day. */
async function stampReply(brokerId: string, at: Date) {
  const [broker, last] = await Promise.all([
    db.broker.findUnique({ where: { id: brokerId }, select: { replyMinutes: true } }),
    db.outboundMessage.findFirst({ where: { brokerId, status: "SENT", sentAt: { lte: at, gte: new Date(at.getTime() - 3 * 86_400_000) } }, orderBy: { sentAt: "desc" }, select: { sentAt: true } }),
  ]);
  const minutes = last?.sentAt ? Math.max(0, Math.round((at.getTime() - last.sentAt.getTime()) / 60_000)) : null;
  const blended = minutes == null ? undefined : broker?.replyMinutes == null ? minutes : Math.round((broker.replyMinutes * 2 + minutes) / 3);
  await db.broker.update({ where: { id: brokerId }, data: { lastReplyAt: at, lastSeenAt: at, ...(blended != null ? { replyMinutes: blended } : {}) } });
}

export async function handleBrokerReply(input: { brokerId: string; phone: string; text: string; photoUrls: string[]; at: Date }): Promise<InboxAction> {
  const { brokerId, phone, text, photoUrls, at } = input;
  await stampReply(brokerId, at);
  // A person answers "are you a bot?" (wa-outbox flags it in #mkan); the inbox stays quiet.
  if (parseBrokerReply(text).asksIfBot) return { kind: "none" };
  // The broker answers the last question this number got; an older no-home ask never takes the reply.
  const last = await lastAsk(phone, at);
  if (last?.kind !== "BROKER_REQUEST") return answerDemandAsk(brokerId, text, photoUrls, at);
  const read = await readAvailabilityReply(phone, text, at, last);
  return read ? answerAvailabilityAsk(read, text, photoUrls.length > 0) : { kind: "none" };
}

/** The reply to "is this available?". */
async function answerAvailabilityAsk(read: NonNullable<Awaited<ReturnType<typeof readAvailabilityReply>>>, text: string, hasPhotos: boolean): Promise<InboxAction> {
  const { ask, r, answer, home, isNews, many, need } = read;
  if (answer && home != null) {
    if (isNews) await recordTypedAnswer(ask.brokerRequestIds, home, answer);
    // "Budget?" next to the yes gets its answer in the same message; "when do you want to visit?" waits for the tenant.
    const aboutTenant = r.question && !/visit|view|come|see/i.test(text);
    const body = answer === "RENTED" ? takenAckMessage(ask.id) : aboutTenant ? `${availableAckMessage(ask.id)} ${need.me}` : availableAckMessage(ask.id);
    return { kind: "availability", listingId: home, answer, applied: isNews, reply: await replyOnce(ask, "auto-ack", body) };
  }
  if (r.question) {
    const reply = await replyOnce(ask, "auto-about", aboutMeMessage(need, ask.id, many));
    return reply ? { kind: "reply", ...reply, why: "about-me" } : { kind: "none" };
  }
  if (r.greeting && !hasPhotos) {
    const reply = await replyOnce(ask, "auto-greet", reAskMessage(text, ask.id, many));
    return reply ? { kind: "reply", ...reply, why: "greeting" } : { kind: "none" };
  }
  return { kind: "none" };
}

/** The reply to a no-home ask: a home, a question back, or photos still missing their price. */
async function answerDemandAsk(brokerId: string, text: string, photoUrls: string[], at: Date): Promise<InboxAction> {
  const r: BrokerReply = parseBrokerReply(text);
  const ask = (await db.outboundMessage.findFirst({
    where: {
      brokerId,
      kind: "BROKER_ASK",
      status: "SENT",
      sentAt: { gte: new Date(at.getTime() - ASK_WINDOW_MS) },
      tenantRequest: { status: { in: ["OPEN", "MATCHED"] }, expiresAt: { gte: at } },
    },
    orderBy: { sentAt: "desc" },
    select: {
      id: true,
      tenantRequestId: true,
      broker: { select: { id: true, name: true, userId: true, phones: true, visitFee: true } },
      tenantRequest: { select: { id: true, taskId: true, requirements: true, locale: true, phone: true, matchedListingIds: true, status: true, expiresAt: true } },
    },
  })) as (AskForHome & { tenantRequestId: string | null; broker: AskForHome["broker"] & { visitFee: number | null } }) | null;

  if (ask?.tenantRequest && ask.broker) {
    const wanted = mergeRequirements(EMPTY_REQUIREMENTS, coerceRequirements(ask.tenantRequest.requirements));
    const price = r.price;
    if (price != null && (isOffer(r) || photoUrls.length > 0)) {
      const place = r.place ?? wanted.neighbourhood ?? (wanted.district ? wanted.district.charAt(0) + wanted.district.slice(1).toLowerCase() : "Kigali");
      const res = await createBrokerHome(ask, {
        priceMonth: price,
        bedrooms: r.bedrooms ?? wanted.bedrooms ?? 1,
        bathrooms: r.bathrooms ?? undefined,
        place,
        furnished: r.furnished ?? undefined,
        note: text.slice(0, 500),
        homeType: wanted.homeType ?? undefined,
        viewingFee: r.visitFee ?? ask.broker.visitFee ?? undefined,
        photoUrls,
      });
      if (res.ok) return { kind: "home", listingId: res.listingId, matched: res.matched };
      return { kind: "none" };
    }
    const label = r.question ? "auto-answer" : photoUrls.length ? "auto-photos" : null;
    if (label) {
      const already = await db.outboundMessage.count({ where: { tenantRequestId: ask.tenantRequestId, brokerId, label } });
      if (already === 0) {
        const need = needSummary(wanted);
        let body: string;
        let outboundId: string;
        if (label === "auto-answer") {
          body = needReplyMessage(need, ask.id);
          ({ id: outboundId } = await db.outboundMessage.create({
            data: { kind: "BROKER_ASK", to: ask.broker.phones[0]!, body, label, status: "SENT", sentAt: new Date(), brokerId, tenantRequestId: ask.tenantRequestId },
            select: { id: true },
          }));
        } else {
          body = priceQuestionMessage(ask.id);
          ({ id: outboundId } = await db.outboundMessage.create({
            data: { kind: "BROKER_ASK", to: ask.broker.phones[0]!, body, label, status: "SENT", sentAt: new Date(), brokerId, tenantRequestId: ask.tenantRequestId },
            select: { id: true },
          }));
        }
        return { kind: "reply", text: body, why: label === "auto-answer" ? "question" : "photos-need-price", outboundId };
      }
    }
  }

  return { kind: "none" };
}
