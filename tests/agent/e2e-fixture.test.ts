import { describe, expect, it } from "vitest";
import { isE2eFixture } from "@/lib/monetize/e2e-fixture";

// Replay of the one FAILED chat in the 7 days to 2026-11-09 (task cmw7htqkn0000hbsdei5gyn7k): two real
// WhatsApp shortlists, then a wa:e2e script message that hit the 15 s deadline from the Mac.
const replay = [
  { role: "user", wa: "3BF863A372CA13560094", text: "شقة مفروشة بغرفتين في كيتشوكيرو، حتى ٤٠٠ ألف شهرياً" },
  { role: "agent", kind: "shortlist", count: 2 },
  { role: "user", wa: "wae2e-mw7nd4yd-2", text: "2 bedroom in Kicukiro" },
  { role: "agent", kind: "error" },
];

describe("e2e fixture chats are not tenant failures", () => {
  it("flags the replayed failed chat", () => expect(isE2eFixture(replay)).toBe(true));
  it("leaves a real failed chat counted", () => expect(isE2eFixture(replay.slice(0, 2))).toBe(false));
  it("tolerates junk", () => {
    expect(isE2eFixture(null)).toBe(false);
    expect(isE2eFixture([null, 1])).toBe(false);
  });
});
