/**
 * Same home, two sources: an Airbnb home whose photo is also on a broker home Mkan already has a
 * broker for (kun docs mkan-airbnb.mdx, idea 1). Broker pins are district centres, so the photo is
 * the evidence: a 64-bit difference hash per photo, and two homes match when any pair of their
 * photos is within MAX_DISTANCE bits. Pure: the script fetches, this compares.
 */

/** Bits that may differ between two copies of one photo (re-encoded, resized, lightly cropped). */
export const MAX_DISTANCE = 6;

/** dHash of a 9×8 grayscale image (72 bytes, row-major): bit = left pixel brighter than its right. */
export function dHash(gray9x8: Uint8Array | number[]): string {
  if (gray9x8.length !== 72) throw new Error(`dHash wants 72 pixels, got ${gray9x8.length}`);
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (gray9x8[y * 9 + x]! > gray9x8[y * 9 + x + 1]! ? 1n : 0n);
    }
  }
  return bits.toString(16).padStart(16, "0");
}

export function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
}

/** A flat or near-flat photo (a wall, a blank frame) hashes alike everywhere: never evidence. */
export const isFlat = (h: string) => {
  const ones = hamming(h, "0000000000000000");
  return ones <= 4 || ones >= 60;
};

export interface Hashed {
  id: number;
  hashes: string[];
}

/** Each Airbnb home → the broker homes sharing a photo with it, closest first. */
export function matchHomes(airbnb: Hashed[], broker: Hashed[], max = MAX_DISTANCE): Map<number, { id: number; distance: number }[]> {
  // Bucket the broker photos by each 16-bit quarter: two hashes within 6 bits share at least one quarter exactly.
  const buckets = new Map<string, { id: number; h: string }[]>();
  for (const b of broker) {
    for (const h of b.hashes) {
      if (isFlat(h)) continue;
      for (let q = 0; q < 4; q++) {
        const k = `${q}:${h.slice(q * 4, q * 4 + 4)}`;
        const list = buckets.get(k) ?? [];
        list.push({ id: b.id, h });
        buckets.set(k, list);
      }
    }
  }
  const out = new Map<number, { id: number; distance: number }[]>();
  for (const a of airbnb) {
    const best = new Map<number, number>();
    for (const h of a.hashes) {
      if (isFlat(h)) continue;
      for (let q = 0; q < 4; q++) {
        for (const c of buckets.get(`${q}:${h.slice(q * 4, q * 4 + 4)}`) ?? []) {
          const d = hamming(h, c.h);
          if (d <= max && d < (best.get(c.id) ?? Infinity)) best.set(c.id, d);
        }
      }
    }
    if (best.size) out.set(a.id, [...best].map(([id, distance]) => ({ id, distance })).sort((x, y) => x.distance - y.distance));
  }
  return out;
}
