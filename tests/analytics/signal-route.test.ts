import { beforeEach, describe, expect, it, vi } from "vitest";

const { recordSignal, auth } = vi.hoisted(() => ({ recordSignal: vi.fn(async () => true), auth: vi.fn(async () => null as unknown) }));

vi.mock("@prisma/client", () => ({ ListingEventType: { VIEW: "VIEW", CONTACT_PHONE_REVEAL: "CONTACT_PHONE_REVEAL", CONTACT_PHONE_CLICK: "CONTACT_PHONE_CLICK", CONTACT_MESSAGE: "CONTACT_MESSAGE", CONTACT_APPLICATION: "CONTACT_APPLICATION" }, Prisma: { sql: () => ({}) } }));
vi.mock("@/lib/auth", () => ({ auth }));
vi.mock("@/lib/analytics/events", () => ({ recordListingEvent: vi.fn() }));
vi.mock("@/lib/analytics/signals", () => ({
  SIGNAL_KINDS: ["visit", "wa_tap", "chat_open"],
  SIGNAL_PLACES: ["home", "find", "today", "tt", "k", "listing", "bubble", "sheet"],
  recordSignal,
}));
vi.mock("@/lib/rate-limit", () => ({
  getClientId: vi.fn(async () => "41.223.10.5"),
  rateLimitWithFallback: vi.fn(async () => ({ success: true })),
  rateLimitResponse: vi.fn(() => new Response(null, { status: 429 })),
}));

import { POST } from "@/app/api/track/route";

const REAL_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";

function req(body: unknown, opts: { ua?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = { "user-agent": opts.ua ?? REAL_UA, "content-type": "text/plain" };
  if (opts.cookie) headers.cookie = opts.cookie;
  const request = new Request("https://mkan.sd/api/track", { method: "POST", body: JSON.stringify(body), headers });
  return Object.assign(request, { cookies: { get: (n: string) => (opts.cookie?.split("; ").map((c) => c.split("=")).find(([k]) => k === n)?.[0] ? { name: n, value: "1" } : undefined) } }) as never;
}

const signal = { signal: { kind: "visit", place: "home", source: "fb-kimironko" } };

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue(null);
  process.env.ANALYTICS_SALT_SECRET = "test-secret";
});

describe("/api/track signal branch", () => {
  it("records a visit with its cleaned source and a visitor hash", async () => {
    const res = await POST(req(signal));
    expect(res.status).toBe(204);
    expect(recordSignal).toHaveBeenCalledTimes(1);
    expect(recordSignal).toHaveBeenCalledWith(expect.objectContaining({ kind: "visit", place: "home", source: "fb-kimironko", visitorHash: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  });
  it("an unclean source becomes direct", async () => {
    await POST(req({ signal: { kind: "wa_tap", place: "tt", source: "<b>x</b>" } }));
    expect(recordSignal).toHaveBeenCalledWith(expect.objectContaining({ kind: "wa_tap", source: "direct" }));
  });
  it("rejects unknown kinds and places without writing", async () => {
    expect((await POST(req({ signal: { kind: "nope", place: "home" } }))).status).toBe(204);
    expect((await POST(req({ signal: { kind: "visit", place: "nowhere" } }))).status).toBe(204);
    expect(recordSignal).not.toHaveBeenCalled();
  });
  it("skips a crawler, an automated browser, a team browser and an admin", async () => {
    await POST(req(signal, { ua: "Googlebot/2.1" }));
    await POST(req(signal, { ua: "Mozilla/5.0 HeadlessChrome/120" }));
    await POST(req(signal, { cookie: "mkan_team=1" }));
    auth.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    await POST(req(signal));
    auth.mockResolvedValue({ user: { id: "u2", role: "SUPER_ADMIN" } });
    await POST(req(signal));
    expect(recordSignal).not.toHaveBeenCalled();
  });
  it("counts a signed-in non-admin", async () => {
    auth.mockResolvedValue({ user: { id: "u3", role: "USER" } });
    await POST(req(signal));
    expect(recordSignal).toHaveBeenCalledTimes(1);
  });
});
