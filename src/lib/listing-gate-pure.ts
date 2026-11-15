/**
 * The trust gate (Abdout, 2026-11-15): a home is on the site only when a tenant can actually get it —
 * someone Mkan can reach about it, a price, a place, real photos with no broker number on them, and
 * not gone. 4,687 Airbnb homes were public with nobody to ask; the 1,000 broker homes that had a
 * broker were hidden. `pnpm listings:gate` applies this both ways, so one run is the swap.
 *
 * Pure on purpose: the script loads the rows, this decides, tests pin every reason.
 */

/** RWF a month above which a "rent" is a sale price read as rent (tiktok-post-pure MAX_MONTHLY_RENT). */
export const MAX_MONTHLY_RENT = 15_000_000;
export const MIN_PHOTOS = 3;

export type GateReason = "lost" | "no-contact" | "no-price" | "for-sale" | "no-place" | "few-photos" | "photo-phone";

export interface GateContact {
  phones: string[];
  whatsapp?: string | null;
  optOut?: boolean;
  /** Merged into another broker: the survivor carries the contact. */
  mergedIntoId?: string | null;
}

export interface GateHome {
  rentPeriod: "MONTHLY" | "NIGHTLY" | string | null;
  priceMonth: number | null;
  pricePerNight: number | null;
  photoUrls: string[];
  lostAt: Date | string | null;
  claimedAt: Date | string | null;
  hostPhone: string | null;
  /** The home's brokers' directory entries; a ListingBroker with no entry passes its user's phone as one. */
  contacts: GateContact[];
  /** An area, sector, neighbourhood or a map pin. */
  hasPlace: boolean;
  /** The photos on file show a broker's number (the TikTok ledger's OCR), and were not re-made clean. */
  photosShowPhone: boolean;
}

const reachable = (c: GateContact) => !c.optOut && !c.mergedIntoId && (c.phones.some((p) => p.trim()) || !!c.whatsapp?.trim());

export function gateOf(h: GateHome): { ok: boolean; reasons: GateReason[] } {
  const reasons: GateReason[] = [];
  if (h.lostAt) reasons.push("lost");
  if (!h.claimedAt && !h.hostPhone?.trim() && !h.contacts.some(reachable)) reasons.push("no-contact");
  const price = h.rentPeriod === "MONTHLY" ? h.priceMonth : h.pricePerNight;
  if (!price || price <= 0) reasons.push("no-price");
  else if (h.rentPeriod === "MONTHLY" && price > MAX_MONTHLY_RENT) reasons.push("for-sale");
  if (!h.hasPlace) reasons.push("no-place");
  if (h.photoUrls.filter((u) => u?.trim()).length < MIN_PHOTOS) reasons.push("few-photos");
  if (h.photosShowPhone) reasons.push("photo-phone");
  return { ok: reasons.length === 0, reasons };
}

/** Photos `pnpm tt:web` re-made from the cleaned video carry no number, whatever the old OCR said. */
export const CLEAN_PHOTO_PREFIX = "/listing-photo/";
export const photosAreClean = (urls: string[]) => urls.length > 0 && urls.every((u) => u.includes(CLEAN_PHOTO_PREFIX));

/** What the run would flip: hide the published that fail, publish the hidden that pass. */
export function gateMove(isPublished: boolean, draft: boolean, ok: boolean): "publish" | "hide" | null {
  const shown = isPublished && !draft;
  if (ok && !shown) return "publish";
  if (!ok && isPublished) return "hide";
  return null;
}
