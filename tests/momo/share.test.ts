import { beforeEach, describe, expect, it, vi } from "vitest";

// An in-memory WaState + Deal, enough for share.ts: create/findUnique/findMany/update and the atomic claim.
const store = new Map<string, unknown>();
let deal: Record<string, unknown>;
const setDealStatus = vi.fn();

vi.mock("@/lib/db", () => ({
  db: {
    waState: {
      create: vi.fn(async ({ data }: { data: { key: string; value: unknown } }) => void store.set(data.key, data.value)),
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) => (store.has(where.key) ? { value: store.get(where.key) } : null)),
      findMany: vi.fn(async ({ where }: { where: { key: { startsWith: string } } }) =>
        [...store.entries()].filter(([k]) => k.startsWith(where.key.startsWith)).map(([, value]) => ({ value }))),
      update: vi.fn(async ({ where, data }: { where: { key: string }; data: { value: unknown } }) => void store.set(where.key, data.value)),
    },
    deal: {
      findUnique: vi.fn(async () => deal),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => void Object.assign(deal, data)),
    },
    // The claim UPDATE: only a row still PENDING takes the new value (strings: [sql…], values: [json, key, key]).
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, json: string, key: string) => {
      const cur = store.get(key) as { status?: string } | undefined;
      if (!cur) return 0;
      if (strings.join("?").includes("= 'PENDING'") && cur.status !== "PENDING") return 0;
      store.set(key, JSON.parse(json));
      return 1;
    }),
  },
}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } }));
vi.mock("@/components/agent/deal", () => ({ setDealStatus }));

const SANDBOX = {
  MOMO_BASE_URL: "https://sandbox.momodeveloper.mtn.com",
  MOMO_TARGET_ENV: "sandbox",
  MOMO_SUBSCRIPTION_KEY: "sub",
  MOMO_API_USER: "user",
  MOMO_API_KEY: "key",
  MOMO_CALLBACK_URL: "https://mkan.example/api/momo/callback",
};

let momoStatus: Record<string, unknown> = { status: "PENDING" };
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  if (url.endsWith("/collection/token/")) return Response.json({ access_token: "t", expires_in: 3600 });
  if (url.endsWith("/requesttopay") && init?.method === "POST") return new Response(null, { status: 202 });
  if (url.includes("/requesttopay/")) return Response.json(momoStatus);
  return new Response(null, { status: 500 });
});

async function load() {
  vi.resetModules();
  return import("@/lib/momo/share");
}

beforeEach(() => {
  store.clear();
  setDealStatus.mockReset();
  fetchMock.mockClear();
  momoStatus = { status: "PENDING" };
  vi.stubGlobal("fetch", fetchMock);
  for (const [k, v] of Object.entries(SANDBOX)) vi.stubEnv(k, v);
  deal = { status: "SIGNED", mkanShare: 45_000, notes: "[sandbox-test] fixture", listingId: 123, broker: { phones: ["+250788000155"], whatsapp: null } };
});

const refOf = () => [...store.keys()].find((k) => k.startsWith("momo-rtp:"))!.slice("momo-rtp:".length);

describe("request-to-pay", () => {
  it("sends a 202 prompt to the TEST payer, never the broker's number, and keeps a PENDING attempt", async () => {
    const { sendShareByMomo } = await load();
    const r = await sendShareByMomo("deal1");
    expect(r).toMatchObject({ sandbox: true, amount: 45_000 });
    const post = fetchMock.mock.calls.find(([u, i]) => String(u).endsWith("/requesttopay") && i?.method === "POST")!;
    const body = JSON.parse(String(post[1]!.body));
    expect(body.payer.partyId).toBe("46733123450");
    expect(JSON.stringify(body)).not.toContain("788000155");
    expect(body.payerMessage).not.toMatch(/#/);
    expect((post[1]!.headers as Record<string, string>)["X-Target-Environment"]).toBe("sandbox");
    expect((post[1]!.headers as Record<string, string>)["X-Callback-Url"]).toContain(`ref=${r.ref}`);
    expect((store.get(`momo-rtp:${r.ref}`) as { status: string }).status).toBe("PENDING");
  });

  it("refuses a second prompt while one is pending", async () => {
    const { sendShareByMomo } = await load();
    await sendShareByMomo("deal1");
    await expect(sendShareByMomo("deal1")).rejects.toThrow("REQUEST_PENDING");
  });

  it("refuses a real (unmarked) deal in the sandbox, and a deal that is not signed", async () => {
    const { sendShareByMomo } = await load();
    deal.notes = "real";
    await expect(sendShareByMomo("deal1")).rejects.toThrow("SANDBOX_REAL_DEAL");
    deal.notes = "[sandbox-test]";
    deal.status = "VIEWED";
    await expect(sendShareByMomo("deal1")).rejects.toThrow("DEAL_NOT_SIGNED");
  });

  it("refuses production until setup.momoApi is ticked", async () => {
    vi.stubEnv("MOMO_BASE_URL", "https://proxy.momoapi.mtn.com");
    vi.stubEnv("MOMO_TARGET_ENV", "mtnrwanda");
    const { sendShareByMomo, momoMode } = await load();
    await expect(sendShareByMomo("deal1")).rejects.toThrow("MOMO_PRODUCTION_BLOCKED");
    expect(await momoMode()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    store.set("mkan-setup", { momoApi: { at: "2026-11-09T00:00:00Z" } });
    // db.waState.findUnique serves the setup row from the same store
    expect(await momoMode()).toBe("production");
  });

  it("a sandbox host with a production target is NOT sandbox", async () => {
    vi.stubEnv("MOMO_TARGET_ENV", "mtnrwanda");
    const { sendShareByMomo } = await load();
    await expect(sendShareByMomo("deal1")).rejects.toThrow("MOMO_PRODUCTION_BLOCKED");
  });
});

describe("callback settlement", () => {
  it("a successful callback marks the deal paid once", async () => {
    const { sendShareByMomo, settleByReference } = await load();
    await sendShareByMomo("deal1");
    momoStatus = { status: "SUCCESSFUL", financialTransactionId: "fin-1" };
    expect(await settleByReference(refOf())).toBe("paid");
    expect(setDealStatus).toHaveBeenCalledTimes(1);
    expect(setDealStatus).toHaveBeenCalledWith("deal1", "PAID", expect.objectContaining({ mkanShare: 45_000 }));
    expect((store.get(`momo-rtp:${refOf()}`) as { status: string; financialTransactionId: string })).toMatchObject({ status: "SUCCESSFUL", financialTransactionId: "fin-1" });
  });

  it("a repeated (or concurrent) callback records nothing twice", async () => {
    const { sendShareByMomo, settleByReference } = await load();
    await sendShareByMomo("deal1");
    momoStatus = { status: "SUCCESSFUL", financialTransactionId: "fin-1" };
    const ref = refOf();
    const results = await Promise.all([settleByReference(ref), settleByReference(ref), settleByReference(ref)]);
    expect(results.filter((x) => x === "paid")).toHaveLength(1);
    expect(await settleByReference(ref)).toBe("already");
    expect(setDealStatus).toHaveBeenCalledTimes(1);
  });

  it("a failed payment leaves the deal signed and lets a new request follow", async () => {
    const { sendShareByMomo, settleByReference } = await load();
    await sendShareByMomo("deal1");
    momoStatus = { status: "FAILED", reason: "APPROVAL_REJECTED" };
    expect(await settleByReference(refOf())).toBe("failed");
    expect(setDealStatus).not.toHaveBeenCalled();
    expect((store.get(`momo-rtp:${refOf()}`) as { status: string }).status).toBe("REJECTED");
    expect(await settleByReference(refOf())).toBe("failed");
    await expect(sendShareByMomo("deal1")).resolves.toMatchObject({ sandbox: true });
  });

  it("a still-pending request changes nothing; an unknown reference is ignored", async () => {
    const { sendShareByMomo, settleByReference } = await load();
    await sendShareByMomo("deal1");
    expect(await settleByReference(refOf())).toBe("pending");
    expect(await settleByReference("00000000-0000-4000-8000-000000000000")).toBe("unknown");
    expect(setDealStatus).not.toHaveBeenCalled();
  });

  it("hands the claim back when marking paid throws, so the next callback finishes it", async () => {
    const { sendShareByMomo, settleByReference } = await load();
    await sendShareByMomo("deal1");
    momoStatus = { status: "SUCCESSFUL", financialTransactionId: "f" };
    setDealStatus.mockRejectedValueOnce(new Error("db down"));
    await expect(settleByReference(refOf())).rejects.toThrow("db down");
    expect(await settleByReference(refOf())).toBe("paid");
    expect(setDealStatus).toHaveBeenCalledTimes(2);
  });
});

describe("payerText", () => {
  it("drops the '#' MTN's firewall refuses", async () => {
    vi.resetModules();
    const { payerText } = await import("@/lib/momo/client");
    expect(payerText("Mkan share #K12 (rent)")).toBe("Mkan share K12 rent");
  });
});
