import "server-only";

/**
 * A broker's WhatsApp reply to Mkan, turned into what it means. Kigali brokers
 * answer in free text and albums, not through links (Abdout's own chats, Oct
 * 2026), so the Mac outbox (scripts/wa/outbox.ts) hands every reply here:
 *
 *   - a home ("Kibagabaga / 2 bedrooms / Price: 300k" + photos) for an open
 *     ask → a lead in the tenant's chat, same path as the /b/d form;
 *   - "How much?" / "Where?" / "Features&budget" → one answer with the full
 *     need and a fresh link;
 *   - photos without a price → one "what's the rent, and where?";
 *   - "taken" / "yes, available" to an availability question → the answer,
 *     as if tapped;
 *   - anything else → the caller posts it to #mkan for a person.
 */
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { applyAnswer } from "./broker";
import { createBrokerHome, type AskForHome } from "./broker-home";
import { needSummary } from "./broker-message";
import { isOffer, parseBrokerReply } from "./broker-reply";
import { demandLink } from "./demand";
import { coerceRequirements, EMPTY_REQUIREMENTS, mergeRequirements } from "./requirements";

/** An ask is still being answered this long after it went out. */
const ASK_WINDOW_MS = 72 * 3_600_000;
const REQUEST_WINDOW_MS = 48 * 3_600_000;

export type InboxAction =
  | { kind: "home"; listingId: number; matched: boolean }
  /** Send `text` now; `outboundId` is its row (already SENT) — mark it FAILED if the send fails. */
  | { kind: "reply"; text: string; why: "question" | "photos-need-price"; outboundId: string }
  | { kind: "availability"; listingId: number; answer: "AVAILABLE" | "RENTED" }
  | { kind: "none" };

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

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

export async function handleBrokerReply(input: { brokerId: string; text: string; photoUrls: string[]; at: Date }): Promise<InboxAction> {
  const { brokerId, text, photoUrls, at } = input;
  await stampReply(brokerId, at);
  const r = parseBrokerReply(text);

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
          // A fresh link on its own ask row, so the form still finds the request.
          const token = randomBytes(18).toString("base64url");
          body = [
            `Thanks! The tenant wants ${need.en}.`,
            `If you have one, reply with the photos and the price (and the visit fee), or send it here:`,
            demandLink(token, "en"),
            "",
            `Murakoze! Umukiriya arashaka ${need.rw}.`,
          ].join("\n");
          ({ id: outboundId } = await db.outboundMessage.create({
            data: { kind: "BROKER_ASK", to: ask.broker.phones[0]!, body, label, status: "SENT", sentAt: new Date(), brokerId, tenantRequestId: ask.tenantRequestId, tokenHash: hash(token) },
            select: { id: true },
          }));
        } else {
          body = "Thanks for the photos! What is the rent per month, and where is it (neighbourhood)? / Murakoze! Ni angahe ku kwezi, kandi iri he?";
          ({ id: outboundId } = await db.outboundMessage.create({
            data: { kind: "BROKER_ASK", to: ask.broker.phones[0]!, body, label, status: "SENT", sentAt: new Date(), brokerId, tenantRequestId: ask.tenantRequestId },
            select: { id: true },
          }));
        }
        return { kind: "reply", text: body, why: label === "auto-answer" ? "question" : "photos-need-price", outboundId };
      }
    }
  }

  // "Is this home still available?" — answered in words instead of the link.
  if (r.gone || r.yes) {
    const req = await db.outboundMessage.findFirst({
      where: { brokerId, kind: "BROKER_REQUEST", status: "SENT", sentAt: { gte: new Date(at.getTime() - REQUEST_WINDOW_MS) } },
      orderBy: { sentAt: "desc" },
      select: { brokerRequestIds: true },
    });
    // Only an ask about one home is unambiguous; several homes need the link.
    if (req?.brokerRequestIds.length === 1) {
      const br = await db.brokerRequest.findUnique({ where: { id: req.brokerRequestIds[0]! }, select: { listingId: true, status: true } });
      if (br && (br.status === "PENDING" || br.status === "NO_REPLY")) {
        const answer = r.gone ? "RENTED" : "AVAILABLE";
        await applyAnswer(br.listingId, answer);
        return { kind: "availability", listingId: br.listingId, answer };
      }
    }
  }
  return { kind: "none" };
}
