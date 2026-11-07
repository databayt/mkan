/**
 * Every deal and its next step (admin, /monetize): who Mkan waits on, and the one tap that moves the
 * money — send the share request once signed, mark it paid once the money is in. Pure: deals.ts loads
 * the rows, this file says what comes next.
 */
export type DealStatusKey = "VIEWING_BOOKED" | "VIEWED" | "SIGNED" | "PAID" | "LOST";
export type DealNext = "tenant24h" | "followUp7d" | "booked" | "askCommission" | "sendShare" | "awaitPayment" | "paid" | "lost";

export interface DealRow {
  id: string;
  listingId: number;
  title: string;
  status: DealStatusKey;
  /** A direct intro (deal-intro.ts), else booked with Mkan in the middle. */
  intro: boolean;
  createdAt: string;
  introducedAt: string | null;
  signedAt: string | null;
  paidAt: string | null;
  tenantPhone: string | null;
  broker: string | null;
  brokerPhone: string | null;
  mkanShare: number | null;
  commission: number | null;
  /** When the share request went to the broker (WaState `share-asked:<deal>`). */
  shareAskedAt: string | null;
}

const DAY = 86_400_000;

export function nextStepOf(d: DealRow, now = new Date()): { key: DealNext; since: string; days: number } {
  const at = (iso: string | null) => iso ?? d.createdAt;
  let key: DealNext;
  let since: string;
  switch (d.status) {
    case "LOST":
      key = "lost";
      since = d.createdAt;
      break;
    case "PAID":
      key = "paid";
      since = at(d.paidAt);
      break;
    case "SIGNED":
      key = d.shareAskedAt ? "awaitPayment" : d.mkanShare ? "sendShare" : "askCommission";
      since = d.shareAskedAt ?? at(d.signedAt);
      break;
    case "VIEWED":
      key = "followUp7d";
      since = at(d.introducedAt);
      break;
    default:
      if (!d.intro) {
        key = "booked";
        since = d.createdAt;
      } else {
        since = at(d.introducedAt);
        key = now.getTime() - Date.parse(since) < 7 * DAY ? "tenant24h" : "followUp7d";
      }
  }
  return { key, since, days: Math.max(0, Math.floor((now.getTime() - Date.parse(since)) / DAY)) };
}

/** Open deals first (the ones waiting on money first of all), then the closed ones. */
export function sortDeals(rows: DealRow[], now = new Date()): DealRow[] {
  const rank: Record<DealNext, number> = { sendShare: 0, askCommission: 1, awaitPayment: 2, followUp7d: 3, tenant24h: 4, booked: 5, paid: 6, lost: 7 };
  return [...rows].sort((a, b) => rank[nextStepOf(a, now).key] - rank[nextStepOf(b, now).key] || Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
