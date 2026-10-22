import "server-only";

/**
 * A home a broker sent for a tenant's request — through the `/b/d/<token>`
 * form or as a plain WhatsApp reply (scripts/wa/outbox.ts). Either way it
 * becomes an unpublished lead (source WEB) linked to the broker, and the
 * tenant's request is matched against it at once.
 */
import type { PropertyType } from "@prisma/client";
import { db } from "@/lib/db";
import { DISTRICTS } from "@/lib/geo/rwanda-places";
import { resolveZone } from "@/lib/geo/kigali-zones";
import { matchRequest } from "./demand";

/** Homes one ask may bring in. */
export const MAX_PER_ASK = 3;

export interface BrokerOffer {
  priceMonth: number;
  bedrooms: number;
  bathrooms?: number;
  place: string;
  furnished?: boolean;
  note?: string;
  homeType?: "apartment" | "house" | "room" | "studio";
  viewingFee?: number;
  depositMonths?: number;
  /** Percent of the first rent (25 = 25%). */
  commissionPct?: number;
  waterIncluded?: boolean;
  electricityIncluded?: boolean;
  /** Public URLs of photos already stored (a WhatsApp album). */
  photoUrls?: string[];
}

export interface AskForHome {
  id: string;
  broker: { id: string; name: string; userId: string | null; phones: string[] } | null;
  tenantRequest: {
    id: string;
    taskId: string;
    requirements: unknown;
    locale: string;
    phone: string | null;
    matchedListingIds: number[];
    status: string;
    expiresAt: Date;
  } | null;
}

export type BrokerHomeResult = { ok: true; listingId: number; matched: boolean } | { ok: false; error: "invalid" | "expired" | "limit" };

const PROPERTY_TYPE: Record<NonNullable<BrokerOffer["homeType"]>, PropertyType> = { apartment: "Apartment", house: "Villa", room: "Rooms", studio: "Apartment" };

export async function createBrokerHome(ask: AskForHome, offer: BrokerOffer): Promise<BrokerHomeResult> {
  if (!ask.broker || !ask.tenantRequest) return { ok: false, error: "invalid" };
  if (ask.tenantRequest.expiresAt < new Date() || !["OPEN", "MATCHED"].includes(ask.tenantRequest.status)) return { ok: false, error: "expired" };
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
  const rooms = offer.homeType === "room" ? "Room" : offer.bedrooms === 0 ? "Studio" : offer.homeType === "house" ? `${offer.bedrooms}-bedroom house` : `${offer.bedrooms}-bedroom home`;
  const hasTerms = [offer.viewingFee, offer.depositMonths, offer.commissionPct, offer.waterIncluded, offer.electricityIncluded].some((v) => v != null);
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
      propertyType: offer.homeType ? PROPERTY_TYPE[offer.homeType] : null,
      photoUrls: offer.photoUrls ?? [],
      viewingFee: offer.viewingFee ?? null,
      depositMonths: offer.depositMonths ?? null,
      commissionPct: offer.commissionPct != null ? offer.commissionPct / 100 : null,
      noCommission: offer.commissionPct === 0 ? true : null,
      waterIncluded: offer.waterIncluded ?? null,
      electricityIncluded: offer.electricityIncluded ?? null,
      termsSource: hasTerms ? "BROKER" : null,
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
    already === 0
      ? db.broker.update({
          where: { id: broker.id },
          data: { answers: { increment: 1 }, availableAnswers: { increment: 1 }, lastSeenAt: new Date(), ...(offer.viewingFee != null ? { visitFee: offer.viewingFee } : {}) },
        })
      : null,
  ]);
  const ids = await matchRequest(ask.tenantRequest as Parameters<typeof matchRequest>[0], new Date(listing.createdAt.getTime() - 1000));
  return { ok: true, listingId: listing.id, matched: ids.includes(listing.id) };
}
