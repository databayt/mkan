/**
 * TikTok DMs as a channel of the agent (2026-11-22): the handle's pseudo number, a shared video as its K-code,
 * the broker gate for a TikTok tenant, the follow-up choke point (sendMessages → tt-outbox), and the route's auth.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { burstOf, cleanHandle, dmReply, isTtPhone, ttDigits, ttPhone, turnOf, videoRefText } from "@/components/agent/tiktok-channel-pure";
import { tenantGate, tenantNumber } from "@/components/agent/broker-gate";
import { ttAllowed } from "@/components/agent/tiktok-auth";

describe("a handle's pseudo number", () => {
  it("is stable, case-blind, never a real country code, and fits a phone number", () => {
    const p = ttPhone("Lilv1000");
    expect(p).toBe(ttPhone("@lilv1000"));
    expect(p).toMatch(/^\+999\d{12}$/);
    expect(isTtPhone(p)).toBe(true);
    expect(isTtPhone(ttDigits(p))).toBe(true);
    expect(ttPhone("lilv1001")).not.toBe(p);
  });
  it("a real phone number is never one", () => {
    expect(isTtPhone("+250788123456")).toBe(false);
    expect(isTtPhone("250788123456")).toBe(false);
    expect(isTtPhone(null)).toBe(false);
  });
  it("only valid handles", () => {
    expect(cleanHandle(" @Mkan.rw ")).toBe("mkan.rw");
    expect(cleanHandle("has space")).toBeNull();
    expect(cleanHandle("")).toBeNull();
    expect(() => ttPhone("no way")).toThrow();
  });
});

describe("a shared video is a home code", () => {
  const homes = new Map<string, number | null>([["7677896079379090696", 6972], ["7000000000000000001", null]]);
  it("the K-code goes first, like a K-code message", () => {
    expect(videoRefText("7677896079379090696", 6972)).toBe("K6972");
    const t = turnOf([{ id: "9", text: "N igikondo ahagana he neza ???", at: "2026-11-22T16:00:00Z", videoId: "7677896079379090696" }], homes);
    expect(t?.text).toBe("K6972 N igikondo ahagana he neza ???");
  });
  it("a video of no home Mkan knows stays a link, so the agent asks for the code", () => {
    expect(turnOf([{ id: "9", text: "", at: "2026-11-22T16:00:00Z", videoId: "7000000000000000001" }], homes)?.text).toBe("https://www.tiktok.com/@mkan.rw/video/7000000000000000001");
  });
  it("a burst joins in order; the newest line carries the claim id, namespaced", () => {
    const t = turnOf(
      [
        { id: "2", text: "70k", at: "2026-11-22T16:00:20Z" },
        { id: "1", text: "Ndashak icyuba na saloon mur kimihurura", at: "2026-11-22T16:00:00Z" },
      ],
      homes,
    );
    expect(t).toEqual({ text: "Ndashak icyuba na saloon mur kimihurura\n70k", msgId: "tt-2", folded: ["tt-1"] });
  });
  it("nothing to read → no turn", () => {
    expect(turnOf([{ id: "1", text: "  ", at: "2026-11-22T16:00:00Z" }], homes)).toBeNull();
    expect(burstOf([], homes)).toEqual([]);
  });
});

describe("the reply for a DM", () => {
  it("drops the paragraph that points to the chat's web page; home links stay", () => {
    const reply = "Homes for you:\n\n*1. Gikondo* K6972\nhttps://www.mkan.sd/en/k/K6972\n\nSee all in the chat\nhttps://www.mkan.sd/en/find?c=abc&s=def";
    expect(dmReply(reply)).toBe("Homes for you:\n\n*1. Gikondo* K6972\nhttps://www.mkan.sd/en/k/K6972");
  });
});

describe("the broker gate: a TikTok tenant passes like a WhatsApp one", () => {
  const phone = ttPhone("lilv1000");
  it("gated mode lets the pick through; off still blocks; the team's test list still applies", () => {
    expect(tenantGate({ mode: "gated", waPhone: phone, testPhones: new Set() })).toEqual({ ok: true });
    expect(tenantGate({ mode: "off", waPhone: phone, testPhones: new Set() })).toEqual({ ok: false, why: "sends-off" });
    expect(tenantGate({ mode: "gated", waPhone: phone, testPhones: new Set([ttDigits(phone)]) })).toEqual({ ok: false, why: "test-phone" });
  });
  it("the profile's number is where the answer is sent", () => {
    expect(tenantNumber({ profile: { waPhone: phone } })).toBe(phone);
  });
});

describe("the follow-up choke point: sendMessages", () => {
  const queueTikTok = vi.fn(async (m: unknown[]) => m.length);
  const createMany = vi.fn(async () => ({ count: 1 }));
  beforeEach(() => {
    vi.resetModules();
    queueTikTok.mockClear();
    createMany.mockClear();
    vi.stubEnv("MKAN_WA_OUTBOX", "1");
  });
  async function load() {
    vi.doMock("@/lib/db", () => ({ db: { outboundMessage: { createMany } } }));
    vi.doMock("@/components/agent/tiktok-channel", () => ({ queueTikTok }));
    vi.doMock("@/components/agent/wa-outbox", () => ({ kickOutbox: vi.fn() }));
    return import("@/components/agent/whatsapp");
  }
  it("a TikTok tenant's message goes to tt-outbox, never to the WhatsApp outbox", async () => {
    const { sendMessages } = await load();
    const tt = ttPhone("lilv1000");
    await sendMessages([{ kind: "TENANT_ALERT", to: tt, body: "A broker answered", label: "broker-answer" }], "Broker answered home #6972");
    expect(queueTikTok).toHaveBeenCalledWith([expect.objectContaining({ to: tt, body: "A broker answered" })]);
    expect(createMany).not.toHaveBeenCalled();
  });
  it("a mixed batch splits: the WhatsApp tenant still queues on WhatsApp", async () => {
    const { sendMessages } = await load();
    const channel = await sendMessages(
      [
        { kind: "TENANT_ALERT", to: ttPhone("lilv1000"), body: "tt", label: "x" },
        { kind: "TENANT_ALERT", to: "+250788123456", body: "wa", label: "y" },
      ],
      "mixed",
    );
    expect(channel).toBe("queued");
    expect(queueTikTok).toHaveBeenCalledTimes(1);
    expect(createMany).toHaveBeenCalledTimes(1);
    const data = (createMany.mock.calls[0] as unknown as [{ data: { to: string }[] }])[0].data;
    expect(data.map((d) => d.to)).toEqual(["+250788123456"]);
  });
});

describe("tt-outbox queueing", () => {
  const exec = vi.fn(async () => 1);
  const findUnique = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    exec.mockClear();
    findUnique.mockReset();
  });
  async function load() {
    vi.doUnmock("@/components/agent/tiktok-channel");
    vi.doMock("@/lib/db", () => ({ db: { $executeRaw: exec, waState: { findUnique } } }));
    return import("@/components/agent/tiktok-channel");
  }
  it("queues for the remembered handle in one SQL append, with an id", async () => {
    const tt = ttPhone("lilv1000");
    findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => {
      if (where.key === "tenant-stop") return { value: [] };
      if (where.key === `tt-handle:${ttDigits(tt)}`) return { value: { handle: "lilv1000" } };
      return null;
    });
    const { queueTikTok } = await load();
    expect(await queueTikTok([{ to: tt, body: "Your viewing is set", label: "viewing-confirmed" }])).toBe(1);
    expect(exec).toHaveBeenCalledTimes(1);
  });
  it("a tenant who said STOP is not queued; a number with no known handle is not either", async () => {
    const tt = ttPhone("lilv1000");
    findUnique.mockImplementation(async ({ where }: { where: { key: string } }) => (where.key === "tenant-stop" ? { value: [ttDigits(tt)] } : null));
    const { queueTikTok } = await load();
    expect(await queueTikTok([{ to: tt, body: "x", label: "y" }])).toBe(0);
    findUnique.mockImplementation(async () => null);
    expect(await queueTikTok([{ to: ttPhone("someone.else"), body: "x", label: "y" }])).toBe(0);
    expect(exec).not.toHaveBeenCalled();
  });
});

describe("POST /api/agent/tiktok — auth", () => {
  const answer = vi.fn(async () => ({ reply: "Muraho!", ackId: "tt-1" }));
  const ack = vi.fn(async () => {});
  beforeEach(() => {
    vi.resetModules();
    answer.mockClear();
    ack.mockClear();
    vi.unstubAllEnvs();
  });
  async function post(headers: Record<string, string>, body: unknown) {
    vi.doMock("@/components/agent/tiktok-chat", () => ({ answerTikTok: answer, ackTikTok: ack, MAX_LINES: 30 }));
    const { POST } = await import("@/app/api/agent/tiktok/route");
    const { NextRequest } = await import("next/server");
    return POST(new NextRequest("https://www.mkan.sd/api/agent/tiktok", { method: "POST", headers, body: JSON.stringify(body) }));
  }
  const body = { handle: "lilv1000", lines: [{ id: "1", text: "hello", at: "2026-11-22T16:00:00Z" }] };

  it("is closed when no secret is configured", async () => {
    expect((await post({ "x-mkan-tt-secret": "anything" }, body)).status).toBe(401);
    expect(answer).not.toHaveBeenCalled();
  });
  it("rejects a missing or wrong secret, accepts the right one", async () => {
    vi.stubEnv("MKAN_TT_SECRET", "s3cret");
    expect((await post({}, body)).status).toBe(401);
    expect((await post({ "x-mkan-tt-secret": "wrong" }, body)).status).toBe(401);
    expect(answer).not.toHaveBeenCalled();
    const ok = await post({ "x-mkan-tt-secret": "s3cret" }, body);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ reply: "Muraho!" });
    expect(answer).toHaveBeenCalledWith({ handle: "lilv1000", lines: [expect.objectContaining({ id: "1", text: "hello" })] });
  });
  it("falls back to the WhatsApp bridge secret the Mac already holds", async () => {
    vi.stubEnv("MKAN_WA_BRIDGE_SECRET", "bridge");
    expect((await post({ "x-mkan-tt-secret": "bridge" }, body)).status).toBe(200);
  });
  it("an ack settles the claim", async () => {
    vi.stubEnv("MKAN_TT_SECRET", "s3cret");
    const res = await post({ "x-mkan-tt-secret": "s3cret" }, { handle: "lilv1000", ack: ["tt-1"], text: "Muraho!" });
    expect(res.status).toBe(200);
    expect(ack).toHaveBeenCalledWith("lilv1000", ["tt-1"], "Muraho!");
  });
  it("ttAllowed compares in constant time and refuses an empty secret", () => {
    expect(ttAllowed("a", "")).toBe(false);
    expect(ttAllowed(null, "a")).toBe(false);
    expect(ttAllowed("ab", "a")).toBe(false);
    expect(ttAllowed("a", "a")).toBe(true);
  });
});
