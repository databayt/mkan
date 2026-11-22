/**
 * Two pure rules from 2026-11-22: one reply per burst of a tenant's lines, and one person's two
 * WhatsApp addresses (phone + @lid) read as one (tenant-pure.ts).
 */
import { describe, expect, it } from "vitest";
import {
  TENANT_BURST_QUIET_MS,
  addressList,
  botSentTo,
  burstQuietLeft,
  humanAtAny,
  isImmediateLine,
  joinBurst,
  lastWriteAt,
  planBurst,
  resolveAddresses,
  segmentBursts,
  stoppedAt,
  type BurstLine,
} from "../../scripts/wa/tenant-pure";

const t0 = new Date("2026-11-22T10:00:00Z");
const at = (s: number) => new Date(t0.getTime() + s * 1000);
const L = (id: string, text: string, s: number, extra: Partial<BurstLine> = {}): BurstLine => ({ id, text, sentAt: at(s), ...extra });

describe("burst: who is last, what is joined", () => {
  const lines = [L("c", "ibaye ibonetse mwatubwira", 150), L("a", "Mwiriwe", 0), L("b", "ko nashakaga inzu iremera cg kicukiro", 60)];
  it("joins every line in time order, newline-separated; the newest carries the claim", () => {
    const j = joinBurst(lines)!;
    expect(j.text).toBe("Mwiriwe\nko nashakaga inzu iremera cg kicukiro\nibaye ibonetse mwatubwira");
    expect(j.primary.id).toBe("c");
    expect(j.folded).toEqual(["a", "b"]);
  });
  it("the wait is counted from the oldest line (the slow-reply rule)", () => {
    expect(joinBurst(lines)!.sentAt).toEqual(at(0));
  });
  it("equal times keep their given order", () => {
    const j = joinBurst([L("x", "one", 5), L("y", "two", 5)])!;
    expect(j.text).toBe("one\ntwo");
    expect(j.primary.id).toBe("y");
  });
  it("a burst of only media has no words but is media", () => {
    const j = joinBurst([L("m", "", 0, { media: true })])!;
    expect(j.text).toBe("");
    expect(j.media).toBe(true);
  });
  it("nothing joins to nothing", () => expect(joinBurst([])).toBeNull());
});

describe("burst: quiet", () => {
  it("is ready once the newest line is TENANT_BURST_QUIET_MS old", () => {
    const lines = [L("a", "hi", 0), L("b", "more", 10)];
    expect(burstQuietLeft(lines, at(10))).toBe(TENANT_BURST_QUIET_MS);
    expect(burstQuietLeft(lines, at(10 + 10))).toBe(TENANT_BURST_QUIET_MS - 10_000);
    expect(burstQuietLeft(lines, at(10 + TENANT_BURST_QUIET_MS / 1000))).toBe(0);
    expect(burstQuietLeft(lines, at(200))).toBeLessThan(0);
  });
  it("uses the server's arrival time over the phone's clock, and never a future one", () => {
    expect(lastWriteAt([L("a", "hi", 500, { arrivedAt: at(20) })], at(30))).toBe(at(20).getTime());
    expect(lastWriteAt([L("a", "hi", 500)], at(30))).toBe(at(30).getTime());
  });
  it("an empty burst has nothing to wait for", () => expect(burstQuietLeft([], at(0))).toBe(0));
});

describe("burst: STOP, START and a digit never wait", () => {
  it.each(["1", " 2 ", "stop", "STOP", "please stop", "توقف", "hagarika", "START", "tangira"])("%s is immediate", (t) => expect(isImmediateLine(t)).toBe(true));
  it.each(["Mwiriwe", "2 bedroom in Remera", "stop sending me Kicukiro", "100000", "", "1 bedroom"])("%s is not", (t) => expect(isImmediateLine(t)).toBe(false));
  it("a poll's burst is split around an immediate line, in order", () => {
    const seg = segmentBursts([L("a", "hi", 0), L("b", "stop", 5), L("c", "wait", 10), L("d", "more", 12), L("e", "2", 14), L("f", "x", 20)]);
    expect(seg.map((s) => s.map((l) => l.id))).toEqual([["a"], ["b"], ["c", "d"], ["e"], ["f"]]);
  });
  it("ordinary lines stay one burst", () => expect(segmentBursts([L("a", "hi", 0), L("b", "there", 5)])).toHaveLength(1));
});

describe("burst: which lines a turn reads (never lost, never twice)", () => {
  const now = at(100);
  const claim = (s: "working" | "reply" | "done", sec: number) => ({ s, at: at(sec).toISOString() });
  const lines = [L("a", "hi", 0), L("b", "there", 10)];
  it("a fresh burst is read whole", () => expect(planBurst(lines, new Map(), now, 120_000)).toEqual({ kind: "burst", lines }));
  it("lines already settled are dropped", () => {
    const p = planBurst(lines, new Map([["a", claim("done", 20)]]), now, 120_000);
    expect(p).toEqual({ kind: "burst", lines: [lines[1]] });
  });
  it("all settled is nothing", () => expect(planBurst(lines, new Map([["a", claim("done", 1)], ["b", claim("done", 1)]]), now, 120_000)).toEqual({ kind: "none" }));
  it("an earlier line another run is live on holds the burst", () => expect(planBurst(lines, new Map([["a", claim("working", 90)]]), now, 120_000)).toEqual({ kind: "held" }));
  it("an earlier line whose run died (stale) is read again", () => expect(planBurst(lines, new Map([["a", claim("working", -500)]]), now, 120_000).kind).toBe("burst"));
  it("an earlier line with a written, unsent reply is sent first, alone", () => expect(planBurst(lines, new Map([["a", claim("reply", 50)]]), now, 120_000)).toEqual({ kind: "resend-first", line: lines[0] }));
  it("the newest line's own claim is the claim's business, not the plan's", () => expect(planBurst(lines, new Map([["b", claim("working", 99)]]), now, 120_000).kind).toBe("burst"));
});

describe("one person, two addresses", () => {
  const PHONE = "250788123456";
  it("a lid chat carrying the number in remoteJidAlt gives both", () => {
    expect(resolveAddresses({ remoteJid: "98765@lid", remoteJidAlt: `${PHONE}@s.whatsapp.net` })).toEqual({ phone: PHONE, lid: "98765@lid" });
  });
  it("a phone chat carrying the lid in senderLid gives both", () => {
    expect(resolveAddresses({ remoteJid: `${PHONE}@s.whatsapp.net`, senderLid: "98765@lid" })).toEqual({ phone: PHONE, lid: "98765@lid" });
  });
  it("senderPn and participantAlt are read too, and a device suffix is dropped", () => {
    expect(resolveAddresses({ remoteJid: "98765:7@lid", senderPn: `+${PHONE}:3@s.whatsapp.net` })).toEqual({ phone: PHONE, lid: "98765@lid" });
    expect(resolveAddresses({ participant: "55@lid", participantAlt: `${PHONE}@s.whatsapp.net` }).phone).toBe(PHONE);
  });
  it("a plain phone chat has no lid", () => expect(resolveAddresses({ remoteJid: `${PHONE}@s.whatsapp.net` })).toEqual({ phone: PHONE, lid: null }));
  it("a lid alone has no phone — until a remembered alias gives it one", () => {
    expect(resolveAddresses({ remoteJid: "98765@lid" })).toEqual({ phone: null, lid: "98765@lid" });
    expect(resolveAddresses({ remoteJid: "98765@lid" }, PHONE)).toEqual({ phone: PHONE, lid: "98765@lid" });
  });
  it("groups give nothing", () => expect(resolveAddresses({ remoteJid: "1203630@g.us" })).toEqual({ phone: null, lid: null }));
  it("addressList is the phone then the lid, whichever exist", () => {
    expect(addressList({ phone: PHONE, lid: "98765@lid" })).toEqual([PHONE, "98765@lid"]);
    expect(addressList({ phone: null, lid: "98765@lid" })).toEqual(["98765@lid"]);
    expect(addressList(null)).toEqual([]);
  });
  const addrs = [PHONE, "98765@lid"];
  it("STOP on either address stops the person", () => {
    expect(stoppedAt(["98765@lid"], addrs)).toBe(true);
    expect(stoppedAt([PHONE], addrs)).toBe(true);
    expect(stoppedAt(["250700000000"], addrs)).toBe(false);
  });
  it("the human's newest message under either address counts", () => {
    const human = { [PHONE]: "2026-11-20T10:00:00.000Z", "98765@lid": "2026-11-21T10:00:00.000Z" };
    expect(humanAtAny(human, addrs)).toEqual(new Date("2026-11-21T10:00:00.000Z"));
    expect(humanAtAny({ "98765@lid": "2026-11-21T10:00:00.000Z" }, addrs)).toEqual(new Date("2026-11-21T10:00:00.000Z"));
    expect(humanAtAny({}, addrs)).toBeNull();
  });
  it("the bot having written to either address means it has spoken there", () => {
    expect(botSentTo([{ id: "x", phone: PHONE, at: "2026-11-21T10:00:00Z" }], addrs)).toBe(true);
    expect(botSentTo([{ id: "x", phone: "98765@lid", at: "2026-11-21T10:00:00Z" }], addrs)).toBe(true);
    expect(botSentTo([{ id: "x", phone: "250700000000", at: "2026-11-21T10:00:00Z" }], addrs)).toBe(false);
  });
});
