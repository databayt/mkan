/**
 * What a home will cost the tenant — computed in code, never by the model.
 *
 * Two markets, two shapes:
 *  - NIGHTLY (Airbnb homes): nights × price + cleaning + mkan's 12% service fee
 *    (the same fee `booking-actions.ts` charges). A long stay in a nightly home
 *    is 30 nights with the listing's own monthly discount.
 *  - MONTHLY (Kigali broker market): rent in advance + deposit + broker
 *    commission + viewing fee. The terms are what Kigali brokers typically ask
 *    (founder's field notes, 2026-10) — every figure is shown as an estimate,
 *    and the commission as a range.
 */

export const SERVICE_FEE_PCT = 0.12;

export const KIGALI_LONG_TERMS = {
  monthsInAdvance: 3,
  depositMonths: 0.5,
  commissionPct: [0.25, 0.3] as const,
  viewingFee: 5_000,
};

export interface PricedHome {
  rentPeriod: "NIGHTLY" | "MONTHLY";
  pricePerNight: number | null;
  priceMonth: number | null;
  /** Percent, as stored on Listing (e.g. 20 = 20%). */
  monthlyDiscount: number | null;
  cleaningFee: number | null;
}

export type CostLineKey =
  | "nights"
  | "cleaning"
  | "serviceFee"
  | "monthlyDiscount"
  | "rentInAdvance"
  | "deposit"
  | "commission"
  | "viewingFee";

export interface CostLine {
  key: CostLineKey;
  amount: number;
  /** Upper bound when the line is a range (broker commission). */
  amountHigh?: number;
  /** Multiplier shown in the label: nights, months. */
  qty?: number;
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
  const advance = rent * t.monthsInAdvance;
  const deposit = round(rent * t.depositMonths);
  const commissionLow = round(rent * t.commissionPct[0]);
  const commissionHigh = round(rent * t.commissionPct[1]);
  const lines: CostLine[] = [
    { key: "rentInAdvance", amount: advance, qty: t.monthsInAdvance },
    { key: "deposit", amount: deposit },
    { key: "commission", amount: commissionLow, amountHigh: commissionHigh },
    { key: "viewingFee", amount: t.viewingFee },
  ];
  const base = advance + deposit + t.viewingFee;
  return {
    headline: rent,
    period: "month",
    lines,
    total: base + commissionLow,
    totalHigh: base + commissionHigh,
  };
}
