/**
 * What a home will cost the tenant — computed in code, never by the model.
 *
 * Two markets, two shapes:
 *  - NIGHTLY (host homes): nights × price + cleaning + mkan's 12% service fee
 *    (the same fee `booking-actions.ts` charges). A long stay in a nightly home
 *    is 30 nights with the listing's own monthly discount.
 *  - MONTHLY (Kigali broker market): rent in advance + deposit + broker
 *    commission + viewing fee. The ad's own terms are used when the lead reader
 *    found them (`Listing.depositMonths`, `commissionPct`, `noCommission`,
 *    `viewingFee`) and each such line says "from the ad"; a term the ad is
 *    silent on falls back to what Kigali brokers typically ask (founder's field
 *    notes, 2026-10) and says "typical". An owner's own post has no commission.
 *    Water and electricity are status lines: included, paid separately, or not stated.
 */

export const SERVICE_FEE_PCT = 0.12;

export const KIGALI_LONG_TERMS = {
  monthsInAdvance: 3,
  depositMonths: 0.5,
  commissionPct: [0.25, 0.3] as const,
  viewingFee: 5_000,
};

/** The terms an ad states; null / missing = the ad says nothing. */
export interface ListingTerms {
  /** Months of rent held as deposit (0.5, 1, 2). */
  depositMonths?: number | null;
  /** A fraction of one month's rent (0.25). */
  commissionPct?: number | null;
  noCommission?: boolean | null;
  viewingFee?: number | null;
  waterIncluded?: boolean | null;
  electricityIncluded?: boolean | null;
  /** The home was posted by its owner (`ListingBroker.role = OWNER`): no broker, no commission. */
  owner?: boolean;
}

export interface PricedHome {
  rentPeriod: "NIGHTLY" | "MONTHLY";
  pricePerNight: number | null;
  priceMonth: number | null;
  /** Percent, as stored on Listing (e.g. 20 = 20%). */
  monthlyDiscount: number | null;
  cleaningFee: number | null;
  /** A monthly lead's own terms. */
  terms?: ListingTerms | null;
}

export type CostLineKey =
  | "nights"
  | "cleaning"
  | "serviceFee"
  | "monthlyDiscount"
  | "rentInAdvance"
  | "deposit"
  | "commission"
  | "viewingFee"
  | "water"
  | "electricity";

export interface CostLine {
  key: CostLineKey;
  amount: number;
  /** Upper bound when the line is a range (broker commission). */
  amountHigh?: number;
  /** Multiplier shown in the label: nights, months, a commission percent. */
  qty?: number;
  /** Upper end of a ranged label ("25–30%"). */
  qtyHigh?: number;
  /** A monthly term: read from the ad, or what Kigali brokers typically ask. */
  source?: "ad" | "typical";
  /** Water and electricity carry no amount: in the rent, paid on top, or the ad does not say. */
  status?: "included" | "separate" | "unknown";
}

export interface CostEstimate {
  /** Price the card headlines, per `period`. */
  headline: number;
  period: "night" | "month";
  lines: CostLine[];
  total: number;
  totalHigh: number;
}

const round = (n: number) => Math.round(n);

/** Monthly rent of a home; nightly homes use 30 nights less their monthly discount. */
export function monthlyRent(home: PricedHome): number | null {
  if (home.rentPeriod === "MONTHLY") return home.priceMonth ?? null;
  if (home.pricePerNight == null) return null;
  const disc = Math.min(Math.max(home.monthlyDiscount ?? 0, 0), 90) / 100;
  return round(home.pricePerNight * 30 * (1 - disc));
}

/** Short stay in a nightly home. */
export function shortStayCost(home: PricedHome, nights: number): CostEstimate | null {
  if (home.pricePerNight == null || nights <= 0) return null;
  const subtotal = home.pricePerNight * nights;
  const cleaning = home.cleaningFee ?? 0;
  const service = round(subtotal * SERVICE_FEE_PCT);
  const lines: CostLine[] = [{ key: "nights", amount: round(subtotal), qty: nights }];
  if (cleaning > 0) lines.push({ key: "cleaning", amount: round(cleaning) });
  lines.push({ key: "serviceFee", amount: service });
  const total = round(subtotal + cleaning + service);
  return { headline: home.pricePerNight, period: "night", lines, total, totalHigh: total };
}

/** Moving in for a long stay: what the tenant needs in hand on day one. */
export function longStayCost(home: PricedHome): CostEstimate | null {
  const rent = monthlyRent(home);
  if (rent == null) return null;

  if (home.rentPeriod === "NIGHTLY") {
    // A month in an Airbnb-style home is paid like a booking: no broker,
    // no deposit — first month + service fee.
    const gross = (home.pricePerNight ?? 0) * 30;
    const lines: CostLine[] = [{ key: "nights", amount: round(gross), qty: 30 }];
    const discount = round(gross - rent);
    if (discount > 0) lines.push({ key: "monthlyDiscount", amount: -discount });
    const service = round(rent * SERVICE_FEE_PCT);
    lines.push({ key: "serviceFee", amount: service });
    const total = rent + service;
    return { headline: rent, period: "month", lines, total, totalHigh: total };
  }

  const t = KIGALI_LONG_TERMS;
  const terms = home.terms ?? {};
  const known = (n: number | null | undefined): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;
  const advance = rent * t.monthsInAdvance;
  const lines: CostLine[] = [{ key: "rentInAdvance", amount: advance, qty: t.monthsInAdvance, source: "typical" }];

  const depositMonths = known(terms.depositMonths) && terms.depositMonths <= 12 ? terms.depositMonths : null;
  const deposit = round(rent * (depositMonths ?? t.depositMonths));
  lines.push({ key: "deposit", amount: deposit, qty: depositMonths ?? t.depositMonths, source: depositMonths != null ? "ad" : "typical" });

  // No commission: the owner posted it, or the ad says so (or says 0%).
  const pct = known(terms.commissionPct) && terms.commissionPct <= 1 ? terms.commissionPct : null;
  const free = !!terms.owner || terms.noCommission === true || pct === 0;
  let commissionLow = 0;
  let commissionHigh = 0;
  if (!free && pct != null) {
    commissionLow = commissionHigh = round(rent * pct);
    lines.push({ key: "commission", amount: commissionLow, qty: Math.round(pct * 1000) / 10, source: "ad" });
  } else if (!free) {
    commissionLow = round(rent * t.commissionPct[0]);
    commissionHigh = round(rent * t.commissionPct[1]);
    lines.push({ key: "commission", amount: commissionLow, amountHigh: commissionHigh, qty: t.commissionPct[0] * 100, qtyHigh: t.commissionPct[1] * 100, source: "typical" });
  }

  // A viewing fee is a broker's; an owner showing their own home rarely asks one.
  const viewing = known(terms.viewingFee) ? terms.viewingFee : terms.owner ? 0 : t.viewingFee;
  if (viewing > 0) lines.push({ key: "viewingFee", amount: viewing, source: known(terms.viewingFee) ? "ad" : "typical" });

  const status = (v: boolean | null | undefined): CostLine["status"] => (v === true ? "included" : v === false ? "separate" : "unknown");
  lines.push({ key: "water", amount: 0, status: status(terms.waterIncluded), ...(terms.waterIncluded != null ? { source: "ad" as const } : {}) });
  lines.push({ key: "electricity", amount: 0, status: status(terms.electricityIncluded), ...(terms.electricityIncluded != null ? { source: "ad" as const } : {}) });

  const base = advance + deposit + viewing;
  return {
    headline: rent,
    period: "month",
    lines,
    total: base + commissionLow,
    totalHigh: base + commissionHigh,
  };
}

/** Move-in cost as a multiple of the rent with Kigali's typical terms (3 + ½ + 27.5% → "about 3.8×"). */
export function typicalMoveInMultiple(): number {
  const t = KIGALI_LONG_TERMS;
  return Math.round((t.monthsInAdvance + t.depositMonths + (t.commissionPct[0] + t.commissionPct[1]) / 2) * 10) / 10;
}
