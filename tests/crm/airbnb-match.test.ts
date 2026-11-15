import { describe, expect, it } from "vitest";

import { dHash, hamming, isFlat, matchHomes } from "../../scripts/crm/airbnb-match-pure";

const gradient = (seed: number) => Array.from({ length: 72 }, (_, i) => ((i * 37 + seed * 101) % 251));

describe("dHash / hamming", () => {
  it("is 16 hex chars and 0 apart from itself", () => {
    const h = dHash(gradient(1));
    expect(h).toMatch(/^[0-9a-f]{16}$/);
    expect(hamming(h, h)).toBe(0);
  });

  it("counts differing bits", () => {
    expect(hamming("0000000000000000", "000000000000000f")).toBe(4);
    expect(hamming("ffffffffffffffff", "0000000000000000")).toBe(64);
  });

  it("calls a blank photo flat", () => {
    expect(isFlat("0000000000000000")).toBe(true);
    expect(isFlat("ffffffffffffffff")).toBe(true);
    expect(isFlat("0f0f0f0f0f0f0f0f")).toBe(false);
  });
});

describe("matchHomes", () => {
  it("matches homes sharing a near-identical photo, not others", () => {
    const shared = "0f0f0f0f0f0f0f0f";
    const close = "0f0f0f0f0f0f0f0e"; // 1 bit off: the same photo re-encoded
    const far = "f0f0f0f0f0f0f0f0";
    const m = matchHomes([{ id: 1, hashes: [shared] }, { id: 2, hashes: [far] }], [{ id: 10, hashes: [close] }, { id: 11, hashes: ["3c3c3c3c3c3c3c3c"] }]);
    expect(m.get(1)).toEqual([{ id: 10, distance: 1 }]);
    expect(m.has(2)).toBe(false);
  });

  it("ignores flat photos", () => {
    const m = matchHomes([{ id: 1, hashes: ["0000000000000000"] }], [{ id: 10, hashes: ["0000000000000000"] }]);
    expect(m.size).toBe(0);
  });
});
