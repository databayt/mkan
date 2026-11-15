// The one rule for the price a public card / map pin shows.
// NIGHTLY homes show pricePerNight; MONTHLY (broker) homes show priceMonth.
// Never a "0" — a missing price returns null and the surface shows a dash.

export type PricePer = "night" | "month";

export interface CardPrice {
  amount: number;
  per: PricePer;
}

export function cardPrice(l: {
  rentPeriod?: string | null;
  pricePerNight?: number | null;
  priceMonth?: number | null;
}): CardPrice | null {
  if (l.rentPeriod === "MONTHLY") {
    return l.priceMonth != null && l.priceMonth > 0
      ? { amount: l.priceMonth, per: "month" }
      : null;
  }
  return l.pricePerNight != null && l.pricePerNight > 0
    ? { amount: l.pricePerNight, per: "night" }
    : null;
}

/** A card's pictures: a TikTok home with its video shows the video's poster, never photos taken from it. */
export function cardImages(l: { photoUrls?: string[] | null; videoUrl?: string | null; videoPosterUrl?: string | null }): string[] {
  return l.videoUrl && l.videoPosterUrl ? [l.videoPosterUrl] : (l.photoUrls ?? []);
}
