import "server-only";

/**
 * The home a TikTok post's code names ("WhatsApp us — send K5808"): the exact
 * search that finds it and homes like it, so the tenant's first message gets
 * that home first instead of being read as a RWF 5,808 budget (it was, until
 * 2026-11-01). Its own district and size, and up to 15% over its rent.
 */
import { db } from "@/lib/db";
import { DISTRICT_CODES } from "./fields";

export async function homeForRef(id: number): Promise<{ id: number; filters: Record<string, unknown> } | null> {
  if (!Number.isInteger(id) || id <= 0) return null;
  const home = await db.listing
    .findUnique({ where: { id }, select: { id: true, bedrooms: true, priceMonth: true, location: { select: { state: true } } } })
    .catch(() => null);
  if (!home) return null;
  const district = (home.location?.state ?? "").toUpperCase();
  const filters: Record<string, unknown> = {
    stay: "long",
    ...((DISTRICT_CODES as readonly string[]).includes(district) ? { district } : {}),
    ...(home.bedrooms != null ? { bedrooms: home.bedrooms } : {}),
    ...(home.priceMonth ? { maxPrice: Math.round(home.priceMonth * 1.15), pricePeriod: "month" } : {}),
  };
  return { id: home.id, filters };
}
