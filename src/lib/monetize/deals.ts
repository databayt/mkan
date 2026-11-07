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
