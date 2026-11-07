import "server-only";

import { db } from "@/lib/db";
import { scrubTitle } from "@/lib/redact";

import { sortDeals, type DealRow, type DealStatusKey } from "./deal-pipeline";

/** The deals an admin acts on: every open one, and the ones closed in the last 30 days. Admin only (page.tsx). */
export async function loadDeals(now = new Date()): Promise<DealRow[]> {
  const rows = await db.deal.findMany({
    where: { OR: [{ status: { in: ["VIEWING_BOOKED", "VIEWED", "SIGNED"] } }, { updatedAt: { gte: new Date(now.getTime() - 30 * 86_400_000) } }] },
    orderBy: { createdAt: "desc" },
    take: 40,
    select: {
      id: true,
      listingId: true,
      status: true,
      createdAt: true,
      introducedAt: true,
      signedAt: true,
      paidAt: true,
      tenantPhone: true,
      mkanShare: true,
      brokerCommission: true,
      listing: { select: { title: true } },
      broker: { select: { name: true, contactName: true, phones: true, whatsapp: true } },
    },
  });
  const asked = rows.length
    ? await db.waState.findMany({ where: { key: { in: rows.map((r) => `share-asked:${r.id}`) } }, select: { key: true, value: true } })
    : [];
  const askedAt = new Map(asked.map((a) => [a.key.slice("share-asked:".length), (a.value as { at?: string } | null)?.at ?? null]));
  return sortDeals(
    rows.map((r) => ({
      id: r.id,
      listingId: r.listingId,
      title: scrubTitle(r.listing.title) || `K${r.listingId}`,
      status: r.status as DealStatusKey,
      intro: r.introducedAt != null,
      createdAt: r.createdAt.toISOString(),
      introducedAt: r.introducedAt?.toISOString() ?? null,
      signedAt: r.signedAt?.toISOString() ?? null,
      paidAt: r.paidAt?.toISOString() ?? null,
      tenantPhone: r.tenantPhone,
      broker: r.broker ? r.broker.contactName?.trim() || r.broker.name : null,
      brokerPhone: r.broker ? (r.broker.whatsapp ?? r.broker.phones[0] ?? null) : null,
      mkanShare: r.mkanShare,
      commission: r.brokerCommission,
      shareAskedAt: askedAt.get(r.id) ?? null,
    })),
    now,
  );
}

export interface HeldIntro {
  ref: number;
  broker: string;
  /** Full numbers: admin only. */
  tenants: string[];
  why: "off" | "tries";
  chat: string;
  since: string;
}

/**
 * The intros waiting on Abdout: a terms ask or a tenant's number the line holds (sends off, or the outbox dropped it
 * three times). Read straight from WaState, admin only, so a gated intro shows here instead of vanishing.
 */
export async function loadHeldIntros(): Promise<HeldIntro[]> {
  const rows = await db.waState.findMany({ where: { OR: [{ key: { startsWith: "terms-ask:" } }, { key: { startsWith: "intro-reply:" } }] }, select: { key: true, value: true } });
  const held = rows.filter((r) => (r.value as { heldAt?: string } | null)?.heldAt);
  if (held.length === 0) return [];
  const ids = [...new Set(held.map((r) => (r.value as { brokerId?: string }).brokerId).filter((x): x is string => !!x))];
  const brokers = await db.broker.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, contactName: true } });
  const name = new Map(brokers.map((b) => [b.id, b.contactName?.trim() || b.name]));
  return held.map((r) => {
    const v = r.value as { listingId: number; brokerId: string; tenants?: { phone: string }[]; heldAt: string; heldWhy?: string };
    const phone = r.key.slice(r.key.indexOf(":") + 1);
    return {
      ref: v.listingId,
      broker: name.get(v.brokerId) ?? `…${phone.slice(-3)}`,
      tenants: (v.tenants ?? []).map((t) => t.phone),
      why: v.heldWhy === "tries-used" ? ("tries" as const) : ("off" as const),
      chat: `https://wa.me/${phone}`,
      since: v.heldAt,
    };
  });
}
