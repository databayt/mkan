/**
 * answerTenant's guardrails end to end, with the line and the agent mocked (2026-11-08): a tenant's STOP
 * gets one reply and a #mkan card, a complaint about the homes reaches the agent, START welcomes them back
 * without a turn on the bare word, and Abdout's own contacts never get a line from the bot.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendText = vi.fn<(to: string, text: string) => Promise<{ key: { id: string } }>>(async () => ({ key: { id: "out-1" } }));
vi.mock("@/lib/whatsapp/evolution", () => ({ sendText: (to: string, text: string) => sendText(to, text), sendPresence: vi.fn(async () => {}) }));
vi.mock("@/lib/db", () => ({ db: { agentTask: { findFirst: vi.fn(async () => ({ locale: "en" })) } } }));
const personal = vi.fn<(phone: string) => Promise<boolean>>(async () => false);
vi.mock("@/components/agent/personal", () => ({ isPersonal: (p: string) => personal(p), markPersonal: vi.fn(async () => {}) }));
const post = vi.fn<(text: string) => Promise<void>>(async () => {});
vi.mock("@/components/agent/whatsapp", () => ({ postSlackCard: (t: string) => post(t) }));
const handle = vi.fn();
const silence = vi.fn(async () => {});
vi.mock("@/components/agent/whatsapp-chat", () => ({ handleTenantWhatsApp: (a: unknown) => handle(a), silenceTenant: () => silence() }));

// Who is writing (contact-kind.ts): every test below is a tenant unless it says otherwise; the classifier has its own tests.
const kindRead = vi.fn<(phone: string, lid: string | null, lines: string[]) => Promise<{ kind: string; why: string; source: string }>>(async () => ({ kind: "tenant", why: "housing-words", source: "rule" }));
vi.mock("@/components/agent/contact-kind", async () => {
  const pure = await import("@/components/agent/contact-kind-pure");
  return { ...pure, contactKind: (phone: string, lid: string | null, lines: string[]) => kindRead(phone, lid, lines) };
});

let stopped: string[] = [];
const state = {
  claimMessage: vi.fn(async () => ({ mode: "fresh" as const, tries: 1 })),
  holdReply: vi.fn(async () => {}),
  settleMessage: vi.fn(async () => {}),
  releaseMessage: vi.fn(async () => {}),
  addToList: vi.fn(async (_k: string, v: string) => void stopped.push(v)),
  removeFromList: vi.fn(async (_k: string, v: string) => void (stopped = stopped.filter((p) => p !== v))),
  readState: vi.fn(async (key: string, fallback: unknown) => (key === "tenant-stop" ? stopped : fallback)),
  writeState: vi.fn(async () => {}),
  mutateState: vi.fn(async () => {}),
  lidOfPhone: vi.fn<(phone: string) => Promise<string | null>>(async () => null),
  readClaims: vi.fn(async () => new Map()),
};
vi.mock("@/components/agent/wa-state", () => ({ ...state, MAX_ANSWER_TRIES: 3, CLAIM_STALE_MS: 120_000 }));
const kick = vi.fn();
vi.mock("@/components/agent/wa-outbox", () => ({ kickOutbox: (reason: string, ms: number) => kick(reason, ms) }));

const { answerTenant, answerTenantBurst } = await import("@/components/agent/wa-tenant");

let n = 0;
const msg = (phone: string, text: string, o: Record<string, unknown> = {}) => ({ phone, text, msgId: `m-${++n}`, sentAt: new Date(), ...o });

beforeEach(() => {
  stopped = [];
  for (const f of [sendText, personal, post, handle, silence, kick, kindRead, ...Object.values(state)]) f.mockClear();
  kindRead.mockResolvedValue({ kind: "tenant", why: "housing-words", source: "rule" });
  personal.mockResolvedValue(false);
  handle.mockResolvedValue({ reply: "Here are homes", taskId: "t1" });
  state.claimMessage.mockResolvedValue({ mode: "fresh", tries: 1 });
});

describe("a message another run holds, or whose turn is still writing (2026-11-08)", () => {
  it("a held claim is left alone — no answer, no settle — and a pass is scheduled", async () => {
    state.claimMessage.mockResolvedValueOnce({ mode: "held" } as never);
    expect(await answerTenant(msg("250720000017", "2 bedroom in Remera"))).toBe("held");
    expect(handle).not.toHaveBeenCalled();
    expect(state.settleMessage).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(kick).toHaveBeenCalledWith("held", 135_000));
  });
  it("a turn still writing keeps its claim: never released, never settled", async () => {
    handle.mockResolvedValueOnce({ reply: null, why: "held" });
    expect(await answerTenant(msg("250720000018", "2 bedroom in Remera"))).toBe("held");
    expect(state.releaseMessage).not.toHaveBeenCalled();
    expect(state.settleMessage).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });
});

describe("a message the line reached late", () => {
  it("is answered with an apology first", async () => {
    expect(await answerTenant(msg("250720000019", "2 bedroom in Remera", { sentAt: new Date(Date.now() - 40 * 60_000) }))).toBe("sent");
    expect(sendText.mock.calls[0]![1]).toBe("Sorry for the slow reply.\n\nHere are homes");
  });
  it("past 12 hours goes to a person, not the bot", async () => {
    expect(await answerTenant(msg("250720000010", "2 bedroom in Remera", { sentAt: new Date(Date.now() - 13 * 3_600_000) }))).toBe("skip-old");
    expect(handle).not.toHaveBeenCalled();
    expect(post.mock.calls[0]![0]).toMatch(/answer by hand/);
  });
});

describe("a tenant's STOP", () => {
  it("is recorded, answered once with how to come back, and posted to #mkan", async () => {
    expect(await answerTenant(msg("250720000011", "STOP"))).toBe("stop");
    expect(state.addToList).toHaveBeenCalledWith("tenant-stop", "250720000011");
    expect(silence).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(sendText.mock.calls[0]![1]).toContain("START");
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]![0]).toContain("STOP");
    expect(handle).not.toHaveBeenCalled();
    expect(state.settleMessage).toHaveBeenCalled();
  });

  it("a complaint about the homes reaches the agent and stops nothing", async () => {
    expect(await answerTenant(msg("250720000012", "Stop sending me Kicukiro"))).toBe("sent");
    expect(handle).toHaveBeenCalledTimes(1);
    expect(state.addToList).not.toHaveBeenCalled();
    expect(sendText.mock.calls[0]![1]).toBe("Here are homes");
  });
});

describe("START after a STOP", () => {
  it("welcomes the tenant back with what to send, and runs no turn on the bare word", async () => {
    stopped = ["250720000013"];
    expect(await answerTenant(msg("250720000013", "START"))).toBe("sent");
    expect(state.removeFromList).toHaveBeenCalledWith("tenant-stop", "250720000013");
    expect(sendText.mock.calls[0]![1]).toMatch(/Welcome back/);
    expect(handle).not.toHaveBeenCalled();
  });
});

describe("Abdout's own contacts", () => {
  it("get no 'please type' for a voice note", async () => {
    personal.mockResolvedValue(true);
    expect(await answerTenant(msg("250720000014", "", { media: true }))).toBe("nothing");
    expect(sendText).not.toHaveBeenCalled();
  });
  it("a STOP is kept quietly: no reply, no card", async () => {
    personal.mockResolvedValue(true);
    expect(await answerTenant(msg("250720000015", "stop"))).toBe("stop");
    expect(state.addToList).toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
  it("a tenant who is not one still gets 'please type'", async () => {
    expect(await answerTenant(msg("250720000016", "", { media: true }))).toBe("sent");
    expect(sendText.mock.calls[0]![1]).toMatch(/type/i);
  });
});

describe("one person, two addresses (2026-11-22)", () => {
  it("a STOP kept under the lid silences the phone's message", async () => {
    state.lidOfPhone.mockResolvedValueOnce("98765@lid");
    stopped = ["98765@lid"];
    expect(await answerTenant(msg("250720000031", "2 bedroom in Remera"))).toBe("skip-stopped");
    expect(handle).not.toHaveBeenCalled();
  });
  it("personal is asked with both addresses", async () => {
    state.lidOfPhone.mockResolvedValueOnce("98766@lid");
    personal.mockClear();
    await answerTenant(msg("250720000032", "hello"));
    expect(personal).toHaveBeenCalledWith("250720000032");
  });
  it("a lid the message itself carried is used without a lookup", async () => {
    stopped = ["98767@lid"];
    expect(await answerTenant(msg("250720000033", "hi", { lid: "98767@lid" }))).toBe("skip-stopped");
  });
});

describe("one reply per burst (2026-11-22)", () => {
  const line = (id: string, text: string, secsAgo: number) => ({ id, text, sentAt: new Date(Date.now() - secsAgo * 1000) });
  it("three lines are one turn on the joined words, claimed on the newest, all settled", async () => {
    const out = await answerTenantBurst("250720000041", [line("b3", "ibaye ibonetse mwatubwira", 5), line("b1", "Mwiriwe", 60), line("b2", "ko nashakaga inzu iremera", 30)]);
    expect(out).toBe("sent");
    expect(handle).toHaveBeenCalledTimes(1);
    expect(handle.mock.calls[0]![0]).toMatchObject({ text: "Mwiriwe\nko nashakaga inzu iremera\nibaye ibonetse mwatubwira", msgId: "b3" });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(state.settleMessage.mock.calls.map((c) => (c as unknown[])[0])).toEqual(expect.arrayContaining(["b3", "b1", "b2"]));
  });
  it("lines an earlier turn settled are not read again", async () => {
    state.readClaims.mockResolvedValueOnce(new Map([["c1", { s: "done", at: new Date().toISOString() }]]) as never);
    await answerTenantBurst("250720000042", [line("c1", "old words", 90), line("c2", "new words", 5)]);
    expect(handle.mock.calls[0]![0]).toMatchObject({ text: "new words", msgId: "c2" });
  });
  it("everything settled is a duplicate; no turn", async () => {
    state.readClaims.mockResolvedValueOnce(new Map([["d1", { s: "done", at: new Date().toISOString() }]]) as never);
    expect(await answerTenantBurst("250720000043", [line("d1", "x", 9)])).toBe("duplicate");
    expect(handle).not.toHaveBeenCalled();
  });
  it("a STOP inside a burst's turn still stops (the whole message is the stop) and settles the folded lines", async () => {
    expect(await answerTenantBurst("250720000044", [line("e1", "stop", 3)])).toBe("stop");
  });
  it("the slow-reply rule still applies to the oldest unanswered line", async () => {
    const out = await answerTenantBurst("250720000045", [line("f1", "Mwiriwe", 20 * 60), line("f2", "inzu remera", 5)]);
    expect(out).toBe("sent");
    expect(sendText.mock.calls[0]![1]).toMatch(/^Sorry for the slow reply/);
  });
});

describe("who is writing — the bot is silent with anyone who is not about housing (2026-11-22)", () => {
  it.each(["personal", "vendor", "unknown"])("a %s gets no reply, no card, no turn; the message is settled", async (kind) => {
    kindRead.mockResolvedValue({ kind, why: "x", source: "history" });
    expect(await answerTenant(msg("250720000051", "Hello mr"))).toBe("skip-kind");
    expect(handle).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
    expect(state.settleMessage).toHaveBeenCalled();
  });
  it("a media-only message from a vendor gets no 'please type'", async () => {
    kindRead.mockResolvedValue({ kind: "vendor", why: "sales-words", source: "model" });
    expect(await answerTenant(msg("250720000052", "", { media: true }))).toBe("skip-kind");
    expect(sendText).not.toHaveBeenCalled();
  });
  it("an old message from a friend is not posted to #mkan", async () => {
    kindRead.mockResolvedValue({ kind: "personal", why: "owner-chatted", source: "history" });
    expect(await answerTenant(msg("250720000053", "hello", { sentAt: new Date(Date.now() - 13 * 3_600_000) }))).toBe("skip-kind");
    expect(post).not.toHaveBeenCalled();
  });
  it("a landlord and a tenant get the normal turn", async () => {
    for (const kind of ["landlord", "tenant"]) {
      kindRead.mockResolvedValue({ kind, why: "x", source: "rule" });
      expect(await answerTenant(msg(`25072000005${kind === "tenant" ? 4 : 5}`, "hi"))).toBe("sent");
    }
    expect(handle).toHaveBeenCalledTimes(2);
  });
  it("a broker the directory does not know is left to the outbox pass, silent here", async () => {
    kindRead.mockResolvedValue({ kind: "broker", why: "says-broker", source: "rule" });
    expect(await answerTenant(msg("250720000056", "I am a broker, I have rooms"))).toBe("skip-kind");
    expect(handle).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(kick).toHaveBeenCalledWith("broker-message", 8_000));
  });
  it("STOP and START are unchanged whoever the person is", async () => {
    kindRead.mockResolvedValue({ kind: "vendor", why: "x", source: "model" });
    expect(await answerTenant(msg("250720000057", "STOP"))).toBe("stop");
    expect(kindRead).not.toHaveBeenCalled();
    expect(sendText.mock.calls[0]![1]).toMatch(/START/);
  });
  it("a person on the personal list skips the classifier: the handler's own gate keeps judging them", async () => {
    personal.mockResolvedValue(true);
    await answerTenant(msg("250720000058", "I am looking for a house"));
    expect(kindRead).not.toHaveBeenCalled();
    expect(handle).toHaveBeenCalled();
  });
  it("the classifier reads every line of a burst, never the folded ids", async () => {
    await answerTenantBurst("250720000059", [{ id: "g1", text: "Hello", sentAt: new Date(Date.now() - 60_000) }, { id: "g2", text: "I need 2 bedrooms", sentAt: new Date(Date.now() - 5_000) }]);
    expect(kindRead.mock.calls[0]![2]).toEqual(["Hello", "I need 2 bedrooms"]);
  });
});
