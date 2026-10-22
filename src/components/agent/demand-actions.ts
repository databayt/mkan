"use server";

/**
 * Both ends of unmet demand, by one tap and no account: the tenant leaves a
 * WhatsApp number for an alert, and a broker answers "do you have one?" by
 * sending a home through `/b/d/<token>`. A sent home becomes an unpublished
 * lead (source WEB) the tenant's chat is matched against at once.
 */
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { DISTRICTS } from "@/lib/geo/rwanda-places";
import { resolveZone } from "@/lib/geo/kigali-zones";
import { matchRequest, optInDemand } from "./demand";
import { normalisePhone } from "./demand-pure";
import { ownedBy, requireProfile } from "./profile";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
/** Homes one broker message may bring in. */
const MAX_PER_ASK = 3;

export type OptInResult = { ok: true } | { ok: false; error: "phone" | "missing" };

/** "WhatsApp me when it's found": the number goes on this chat's request only. */
export async function optInForDemand(input: { taskId: string; phone: string }): Promise<OptInResult> {
  const phone = normalisePhone(String(input.phone ?? ""));
  if (!phone) return { ok: false, error: "phone" };
  const viewer = await requireProfile();
  const task = await db.agentTask.findFirst({ where: { id: String(input.taskId), ...ownedBy(viewer) }, select: { id: true } });
  if (!task || !(await optInDemand(task.id, phone))) return { ok: false, error: "missing" };
  // Touch the task so an open tab's poll picks the change up.
  await db.agentTask.update({ where: { id: task.id }, data: { updatedAt: new Date() } });
  return { ok: true };
}

/** The ask behind a broker's link, with what the page and the submission need. */
export async function demandAskByToken(token: string) {
  if (!token || token.length > 64) return null;
  return db.outboundMessage.findFirst({
    where: { tokenHash: hash(token), kind: "BROKER_ASK" },
    select: {
      id: true,
      createdAt: true,
      broker: { select: { id: true, name: true, userId: true, phones: true, tiktokHandle: true } },
      tenantRequest: { select: { id: true, taskId: true, requirements: true, locale: true, phone: true, matchedListingIds: true, status: true, expiresAt: true } },
    },
  });
}

const OfferSchema = z.object({
  priceMonth: z.coerce.number().int().min(10_000).max(15_000_000),
  bedrooms: z.coerce.number().int().min(0).max(10),
  bathrooms: z.coerce.number().int().min(1).max(10).optional(),
  place: z.string().trim().min(2).max(80),
  furnished: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

export type OfferResult = { ok: true; matched: boolean } | { ok: false; error: "invalid" | "expired" | "form" | "limit" };

/** A broker's home for a tenant's request: a lead, linked to the broker, matched now. */
export async function submitDemandHome(token: string, input: z.input<typeof OfferSchema>): Promise<OfferResult> {
  const ask = await demandAskByToken(token);
  if (!ask?.broker || !ask.tenantRequest) return { ok: false, error: "invalid" };
  if (ask.tenantRequest.expiresAt < new Date() || !["OPEN", "MATCHED"].includes(ask.tenantRequest.status)) return { ok: false, error: "expired" };
  const parsed = OfferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "form" };
  const offer = parsed.data;
  const prefix = `broker:${ask.id}:`;
  const already = await db.listing.count({ where: { sourceListingId: { startsWith: prefix } } });
  if (already >= MAX_PER_ASK) return { ok: false, error: "limit" };

  const broker = ask.broker;
  const phone = broker.phones[0] ?? null;
  // Leads need an account to hang on; nobody signs in as it.
  let hostId = broker.userId;
  if (!hostId) {
    const sourceHostId = `broker:${broker.id}`;
    const user = await db.user.upsert({
      where: { sourceHostId },
      create: { email: sourceHostId, sourceHostId, phoneNumber: phone, role: "MANAGER" },
      update: { phoneNumber: phone },
      select: { id: true },
    });
    hostId = user.id;
    await db.broker.update({ where: { id: broker.id }, data: { userId: hostId } });
  }

  // Place: the zone the broker names pins it (neighbourhood > sector); otherwise
  // the district the tenant asked for. Same shape as the TikTok mirror's leads:
  // `state` is the district's name ("Gasabo"), the zone slugs beside it.
  const wanted = (ask.tenantRequest.requirements ?? {}) as { district?: string | null };
  const zone = resolveZone({ text: offer.place, pinIsReal: false });
  const district = DISTRICTS.find((d) => d.code === (zone?.district ?? wanted.district)) ?? DISTRICTS[0]!;
  const pin = zone && zone.zone.level !== "district" ? zone.zone : district;
  const location = await db.location.create({
    data: {
      address: offer.place,
      city: "Kigali",
      state: district.nameEn,
      country: "Rwanda",
      postalCode: "",
      latitude: pin.lat,
      longitude: pin.lng,
      zoneKey: `KIGALI_${district.code}`,
      sector: zone?.sector ?? null,
      neighbourhood: zone?.neighbourhood ?? null,
    },
    select: { id: true },
  });
  const rooms = offer.bedrooms === 0 ? "Studio" : `${offer.bedrooms}-bedroom home`;
  const listing = await db.listing.create({
    data: {
      source: "WEB",
      sourceListingId: `${prefix}${already + 1}`,
      // The card opens the broker's WhatsApp: the home has no page of its own yet.
      sourceUrl: phone ? `https://wa.me/${phone.replace(/[^\d]/g, "")}` : null,
      sourceCapturedAt: new Date(),
      canonicalLocale: "en",
      title: `${rooms} in ${offer.place}`,
      description: offer.note ?? "",
      rentPeriod: "MONTHLY",
      priceMonth: offer.priceMonth,
      currency: "RWF",
      bedrooms: offer.bedrooms,
      bathrooms: offer.bathrooms ?? null,
      furnished: offer.furnished ?? null,
      photoUrls: [],
      hostId,
      locationId: location.id,
      draft: true,
      isPublished: false,
    },
    select: { id: true, createdAt: true },
  });
  await Promise.all([
    db.listingBroker.create({ data: { listingId: listing.id, userId: hostId, brokerId: broker.id, role: "BROKER" } }),
    db.outboundMessage.update({ where: { id: ask.id }, data: { listingId: listing.id } }),
    already === 0 ? db.broker.update({ where: { id: broker.id }, data: { answers: { increment: 1 }, availableAnswers: { increment: 1 }, lastSeenAt: new Date() } }) : null,
  ]);
  const ids = await matchRequest(ask.tenantRequest, new Date(listing.createdAt.getTime() - 1000));
  return { ok: true, matched: ids.includes(listing.id) };
}
