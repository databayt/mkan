import { districtName } from "@/lib/geo/rwanda-places";
import { toListingsParams } from "@/components/listings/url-state";
import { NEIGHBOURHOODS } from "../areas";
import type { Requirements } from "../requirements";

/**
 * The /listings filters a set of agent requirements maps to, so the page behind
 * the panel shows the same homes the agent is narrowing down. Only the fields
 * both sides mean the same way cross over — place, bedrooms, bathrooms,
 * guests. The budget stays with the agent: it is RWF per night or per month,
 * while the listings price filter is a nightly price in each listing's own
 * currency, so passing it would hide homes the agent would still offer.
 * A neighbourhood narrows to its district: listings carry the district as
 * their `state`, while neighbourhood names rarely appear in addresses.
 */
export function listingsQueryFor(req: Requirements | null): string {
  if (!req) return "";
  const district =
    req.district ?? NEIGHBOURHOODS.find((n) => n.name.toLowerCase() === req.neighbourhood?.toLowerCase())?.district;
  const qs = toListingsParams({
    location: district ? districtName(district, "en") : undefined,
    beds: req.bedrooms ?? (req.family ? 3 : undefined),
    baths: req.bathrooms ?? undefined,
    guests: req.guests ?? undefined,
  });
  return qs.toString();
}
