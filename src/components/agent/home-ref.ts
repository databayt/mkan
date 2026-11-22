import "server-only";

/**
 * The home a TikTok post's code names ("WhatsApp us — send K5808"): the exact
 * search that finds it and homes like it, so the tenant's first message gets
 * that home first instead of being read as a RWF 5,808 budget (it was, until
 * 2026-11-01). Its own district and size, and up to 15% over its rent.
 */
import { db } from "@/lib/db";
import { DISTRICT_CODES } from "./fields";

export interface HomeRef {
  id: number;
  filters: Record<string, unknown>;
  /** A broker said it is rented, or its ad is gone (Listing.lostAt): the code a post still shows leads nowhere. */
  taken?: boolean;
  /** The home's own rent: a yardstick for "similar", never the tenant's budget (ref-budget-pure.ts). */
  rent?: number;
}

export async function homeForRef(id: number): Promise<HomeRef | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const home = await db.listing
    .findUnique({ where: { id }, select: { id: true, bedrooms: true, priceMonth: true, lostAt: true, location: { select: { state: true } } } })
    .catch(() => null);
  if (!home) return null;
  const district = (home.location?.state ?? "").toUpperCase();
  const filters: Record<string, unknown> = {
    stay: "long",
    ...((DISTRICT_CODES as readonly string[]).includes(district) ? { district } : {}),
    ...(home.bedrooms != null ? { bedrooms: home.bedrooms } : {}),
    ...(home.priceMonth ? { maxPrice: Math.round(home.priceMonth * 1.15), pricePeriod: "month" } : {}),
  };
  return { id: home.id, filters, ...(home.lostAt ? { taken: true } : {}), ...(home.priceMonth ? { rent: home.priceMonth } : {}) };
}
