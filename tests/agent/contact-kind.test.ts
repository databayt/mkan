/**
 * Who is writing to the line (2026-11-22): the rules in contact-kind-pure.ts and the classifier's precedence in
 * contact-kind.ts, with the database, Evolution and Claude mocked. The chats are invented; the real ones are never in a test.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tenantDecision } from "../../scripts/wa/tenant-pure";
import {
  HEAVY_PERSONAL,
  decideKind,
  housingWords,
  isBareGreeting,
  kindAct,
  kindKey,
  looksLikeBotLine,
  maskAddress,
  worthRereading,
  type HistoryLine,
  type KindInput,
} from "@/components/agent/contact-kind-pure";

const input = (lines: string[], rest: Partial<KindInput> = {}): KindInput => ({ lines, history: [], ...rest });
const h = (fromMe: boolean, text: string, extra: Partial<HistoryLine> = {}): HistoryLine => ({ fromMe, text, at: 1, ...extra });
const kindOf = (i: KindInput) => decideKind(i)?.kind ?? null;

describe("housing words", () => {
  it("a code, a rental word, a want + a place, or an area + a figure", () => {
    for (const t of ["Check K5811 for me", "2 bedroom in Remera", "looking for a house", "ndashaka inzu", "Kimironko 150k", "Is the apartment still free?", "شقة للإيجار"]) expect(housingWords(t), t).toBe(true);
  });
  it("everyday talk and a lone area or figure are not enough", () => {
    for (const t of ["I'm at home", "gas 12k", "Kimironko", "see you at the house party", "what's the price of the ticket"]) expect(housingWords(t), t).toBe(false);
  });
});

describe("a bare greeting", () => {
  it.each(["Hello mr", "How are you doing", "Hi", "good morning sir", "Mwiriwe", "السلام عليكم", "Hey 👋", "Heyyyy", "Hy", "Hiiii", "Hello, how are you today?"])("%s", (t) => expect(isBareGreeting(t)).toBe(true));
  it.each(["Hello, I need a house", "Hi it's John from the gym", "Where are you?", "gas available"])("%s says more", (t) => expect(isBareGreeting(t)).toBe(false));
});

describe("decideKind — rules first", () => {
  it("our own surfaces are always a tenant: a code, ref:, ' s:', the mkan.sd page", () => {
    for (const t of ["Check K5811 for me mkan.sd", "hello k5811", `Hello ref:${"a1b2c3d4".repeat(3)}`, "Hello s:fb-kimironko", "Hi mkan_today", "tiktok_bio"]) expect(decideKind(input([t])), t).toMatchObject({ kind: "tenant", source: "surface" });
  });
  it("a surface beats a private history — it came through our link", () => {
    expect(kindOf(input(["Check K5811 for me mkan.sd"], { history: [h(true, "love you"), h(true, "see you tonight")] }))).toBe("tenant");
  });
  it("a TikTok link is a tenant's, unless the owner has been chatting with them by hand", () => {
    expect(kindOf(input(["https://vt.tiktok.com/ZSabc123/"]))).toBe("tenant");
    expect(kindOf(input(["https://vt.tiktok.com/ZSabc123/"], { history: [h(true, "haha send me more of these")] }))).toBe("personal");
  });
  it("housing words in the new lines → tenant", () => {
    expect(decideKind(input(["Hello", "I need a 2 bedroom in Kicukiro"]))).toMatchObject({ kind: "tenant", why: "housing-words" });
    expect(kindOf(input(["Muraho", "ko nashakaga inzu"]))).toBe("tenant");
  });
  it("a home the agent already showed → tenant, whatever they write next", () => {
    expect(decideKind(input(["ok thanks"], { agentShowedHomes: true }))).toMatchObject({ kind: "tenant", source: "agent" });
  });
  it("earlier housing words from them → tenant on a bare reply", () => {
    expect(decideKind(input(["Thanks"], { history: [h(false, "looking for a studio"), h(true, "Here are homes mkan.sd", { bot: true })] }))).toMatchObject({ kind: "tenant", why: "housing-earlier" });
  });
  it("a person offering a home → landlord; one describing themselves as a broker → broker", () => {
    expect(kindOf(input(["I have a house for rent in Gisozi"]))).toBe("landlord");
    expect(kindOf(input(["Hello I am a broker, we have rooms"]))).toBe("broker");
  });
  it("the owner chatting by hand, nothing about housing → personal", () => {
    expect(decideKind(input(["Hey you"], { history: [h(true, "how was your day"), h(false, "good, tired")] }))).toMatchObject({ kind: "personal", source: "history" });
  });
  it("the bot's own replies are not the owner typing", () => {
    const history = [h(true, "Hi, this is Mkan. We help people find a home", { bot: true }), h(false, "ok")];
    expect(kindOf(input(["thanks bro"], { history }))).not.toBe("personal");
  });
  it("a long private chat is personal even when one line says 'rent'", () => {
    const history = Array.from({ length: HEAVY_PERSONAL }, (_, n) => h(true, `private line ${n}`));
    expect(kindOf(input(["do you know anyone with an apartment for rent?"], { history }))).toBe("personal");
    expect(kindOf(input(["do you know anyone with an apartment for rent?"], { history: history.slice(1) }))).toBe("tenant");
  });
  it("a bare greeting from a brand-new number is answered; with only greetings before it stays silent", () => {
    for (const t of ["Hello mr", "How are you doing"]) expect(decideKind(input([t]))).toMatchObject({ kind: "tenant", why: "new-number-greeting" });
    expect(decideKind(input(["Hello"], { history: [h(false, "Hi")] }))).toMatchObject({ kind: "unknown", why: "greeting-only" });
    expect(decideKind(input([]))).toMatchObject({ kind: "unknown" });
  });
  it("a seller: two sales words and nothing about housing → vendor; one is the model's call", () => {
    expect(kindOf(input(["Gas refill, free delivery today"]))).toBe("vendor");
    expect(decideKind(input(["Do you need gas?"]))).toBeNull();
    expect(kindOf(input(["Special offer, order now! Furnished apartments, free delivery"]))).toBeNull();
  });
  it("anything else is ambiguous (null): the model decides", () => {
    expect(decideKind(input(["Where are you now?"]))).toBeNull();
    expect(decideKind(input(["Kimironko"]))).toBeNull();
  });
});

describe("precedence: a hand label, then a broker, then the list, then the rest", () => {
  const surface = ["Check K5811 for me mkan.sd"];
  it("a manual label beats everything", () => {
    expect(decideKind(input(surface, { manual: "vendor", broker: true, listedPersonal: true }))).toMatchObject({ kind: "vendor", source: "manual" });
    expect(decideKind(input(["Hello"], { manual: "tenant" }))).toMatchObject({ kind: "tenant", source: "manual" });
  });
  it("a broker number beats the list and our surfaces", () => {
    expect(decideKind(input(surface, { broker: true, listedPersonal: true }))).toMatchObject({ kind: "broker", source: "broker" });
  });
  it("the personal list beats a surface and every guess; the handler keeps its own gate for it", () => {
    const read = decideKind(input(surface, { listedPersonal: true }))!;
    expect(read).toMatchObject({ kind: "personal", source: "list" });
    expect(kindAct(read)).toBe("answer");
  });
});

describe("what a label means for the turn", () => {
  it("tenant and landlord answer; broker goes to its path; the rest are silent", () => {
    expect(kindAct({ kind: "tenant", source: "rule" })).toBe("answer");
    expect(kindAct({ kind: "landlord", source: "model" })).toBe("answer");
    expect(kindAct({ kind: "broker", source: "model" })).toBe("broker");
    for (const kind of ["personal", "vendor", "unknown"] as const) expect(kindAct({ kind, source: "history" }), kind).toBe("silent");
    expect(kindAct({ kind: "personal", source: "manual" })).toBe("silent");
  });
  it("an unknown is read again only when they write more than a greeting", () => {
    expect(worthRereading(["Hello mr", "how are you"])).toBe(false);
    expect(worthRereading(["Hello", "I want a house"])).toBe(true);
  });
  it("tenantDecision: silentKind is judged after STOP and START, before the rest", () => {
    const now = new Date("2026-11-22T10:00:00Z");
    const base = { text: "hi", sentAt: now, now, stopped: false, humanAt: null, phoneRepliesLastHour: 0, lineRepliesLastHour: 0 };
    expect(tenantDecision({ ...base, silentKind: true })).toBe("skip-kind");
    expect(tenantDecision({ ...base, text: "STOP", silentKind: true })).toBe("stop");
    expect(tenantDecision({ ...base, text: "start", stopped: true, silentKind: true })).toBe("start");
    expect(tenantDecision({ ...base, sentAt: new Date(now.getTime() - 13 * 3_600_000), silentKind: true })).toBe("skip-kind");
  });
});

describe("small helpers", () => {
  it("masks an address to its last 3", () => {
    expect(maskAddress("250780984777")).toBe("…777");
    expect(maskAddress("12345678901@lid")).toBe("lid…901");
    expect(kindKey("+250780984777")).toBe("kind:250780984777");
  });
  it("spots the line's own words", () => {
    expect(looksLikeBotLine("Here are homes: https://www.mkan.sd/k/5811")).toBe(true);
    expect(looksLikeBotLine("see you at 8")).toBe(false);
  });
});

// ── the classifier, with the database, Evolution and Claude mocked ───────────────────────────────

const rows = new Map<string, unknown>();
const written: string[] = [];
const dbMock = {
  waState: { findMany: vi.fn(async ({ where }: { where: { key: { in: string[] } } }) => where.key.in.filter((k) => rows.has(k)).map((k) => ({ value: rows.get(k) }))) },
  agentTask: { findMany: vi.fn(async () => [] as { messages: unknown }[]) },
  broker: { findMany: vi.fn(async () => [] as { phones: string[] }[]) },
  listingBroker: { findMany: vi.fn(async () => [] as { user: { phoneNumber: string | null } }[]) },
};
vi.mock("@/lib/db", () => ({ db: dbMock }));
const listed = vi.fn(async (): Promise<boolean> => false);
vi.mock("@/components/agent/personal", () => ({ isPersonal: () => listed() }));
vi.mock("@/components/agent/wa-state", () => ({
  readState: vi.fn(async (_k: string, empty: unknown) => empty),
  writeState: vi.fn(async (key: string, value: unknown) => {
    written.push(key);
    rows.set(key, value);
  }),
}));
const chat = vi.fn(async (_jid: string): Promise<unknown[] | null> => []);
vi.mock("@/lib/whatsapp/evolution", () => ({
  findChatMessages: (jid: string) => chat(jid).then((r) => (r === null ? Promise.reject(new Error("down")) : r)),
}));
const parse = vi.fn();
let spend = true;
vi.mock("@/components/agent/claude", async () => {
  const real = await vi.importActual<typeof import("@/components/agent/claude")>("@/components/agent/claude");
  return { ...real, claudeClient: () => ({ messages: { parse } }), canSpend: async () => spend, noteFailure: vi.fn(async () => {}), recordSpend: vi.fn(async () => {}) };
});

const { contactKind, forgetBrokers, historyOf } = await import("@/components/agent/contact-kind");

const P = "250788000111";
const LID = "98765@lid";
const evo = (id: string, fromMe: boolean, text: string, t: number) => ({ key: { id, fromMe }, message: { conversation: text }, messageTimestamp: t });

beforeEach(() => {
  rows.clear();
  written.length = 0;
  forgetBrokers();
  spend = true;
  listed.mockResolvedValue(false);
  chat.mockReset().mockResolvedValue([]);
  parse.mockReset();
  dbMock.agentTask.findMany.mockResolvedValue([]);
  dbMock.broker.findMany.mockResolvedValue([]);
});

describe("contactKind", () => {
  it("a manual label wins over the broker directory, the list and every guess", async () => {
    rows.set(kindKey(P), { kind: "vendor", why: "set-by-hand", at: "x", source: "manual" });
    dbMock.broker.findMany.mockResolvedValue([{ phones: [`+${P}`] }]);
    expect(await contactKind(P, null, ["Check K5811 mkan.sd"])).toMatchObject({ kind: "vendor", source: "manual" });
  });
  it("a manual label kept under the lid covers the phone's message", async () => {
    rows.set(kindKey(LID), { kind: "personal", why: "set-by-hand", at: "x", source: "manual" });
    expect(await contactKind(P, LID, ["2 bedroom in Remera"])).toMatchObject({ kind: "personal", source: "manual" });
  });
  it("a Broker.phones number is a broker, before the list", async () => {
    dbMock.broker.findMany.mockResolvedValue([{ phones: [`+${P}`] }]);
    listed.mockResolvedValue(true);
    expect(await contactKind(P, null, ["hello"])).toMatchObject({ kind: "broker", source: "broker" });
  });
  it("the personal list is personal (the handler's gate decides what it still answers)", async () => {
    listed.mockResolvedValue(true);
    expect(await contactKind(P, null, ["hello"])).toMatchObject({ kind: "personal", source: "list" });
  });
  it("a kept label sticks; a surface of ours turns a kept vendor into a tenant", async () => {
    rows.set(kindKey(P), { kind: "vendor", why: "sales-words", at: "x", source: "model" });
    expect(await contactKind(P, null, ["2 bedroom in Remera"])).toMatchObject({ kind: "vendor", source: "cache" });
    expect(await contactKind(P, null, ["Check K5811 for me mkan.sd"])).toMatchObject({ kind: "tenant", source: "surface" });
    expect(rows.get(kindKey(P))).toMatchObject({ kind: "tenant", why: "k-code" });
  });
  it("a greeting is unknown and kept; the same greeting again is not read again; more words are", async () => {
    // Not a brand-new number: they greeted before (a brand-new number's greeting is answered, see decideKind).
    chat.mockImplementation(async () => [evo("a0", false, "Hi", 1_699_999_000)]);
    expect(await contactKind(P, null, ["Hello mr"])).toMatchObject({ kind: "unknown", source: "rule" });
    expect(rows.get(kindKey(P))).toMatchObject({ kind: "unknown" });
    chat.mockClear();
    expect(await contactKind(P, null, ["How are you doing"])).toMatchObject({ kind: "unknown", source: "cache" });
    expect(chat).not.toHaveBeenCalled();
    expect(await contactKind(P, null, ["Hello", "I need a 2 bedroom in Remera"])).toMatchObject({ kind: "tenant", source: "rule" });
    expect(rows.get(kindKey(P))).toMatchObject({ kind: "tenant" });
  });
  it("reads the chat under both addresses; the owner typing by hand makes it personal; stores no words", async () => {
    chat.mockImplementation(async (jid) => (jid.endsWith("@lid") ? [evo("a2", true, "see you tonight my love", 1_700_000_100), evo("a1", false, "ok", 1_700_000_000)] : [evo("a0", false, "hey", 1_699_999_000)]));
    const read = await contactKind(P, LID, ["Hello"], { excludeIds: ["new1"] });
    expect(read).toMatchObject({ kind: "personal", source: "history" });
    expect(chat).toHaveBeenCalledWith(`${P}@s.whatsapp.net`);
    expect(chat).toHaveBeenCalledWith(LID);
    expect(JSON.stringify([...rows.values()])).not.toMatch(/tonight|love/);
    expect([...rows.keys()].sort()).toEqual([kindKey(P), kindKey(LID)].sort());
  });
  it("the burst's own lines are left out of the history", () => {
    const marks = { ids: new Set<string>(), hashes: new Set<string>() };
    const out = historyOf([evo("n1", false, "Hello", 5), evo("o1", false, "old", 1)], marks, ["n1"]);
    expect(out.map((l) => l.text)).toEqual(["old"]);
  });
  it("an ambiguous message goes to Claude once; its label and reason code are kept", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { kind: "vendor", reason: "selling" }, usage: { input_tokens: 400, output_tokens: 8 } });
    const read = await contactKind(P, null, ["Do you need gas?"]);
    expect(read).toMatchObject({ kind: "vendor", why: "selling", source: "model" });
    expect(parse).toHaveBeenCalledTimes(1);
    expect(rows.get(kindKey(P))).toEqual(expect.objectContaining({ kind: "vendor", why: "selling", source: "model" }));
    expect(Object.keys(rows.get(kindKey(P)) as object).sort()).toEqual(["at", "kind", "source", "why"]);
  });
  it("when Claude cannot spend or fails, the person stays unknown (silent) and nothing is kept", async () => {
    spend = false;
    expect(await contactKind(P, null, ["Where are you now?"])).toMatchObject({ kind: "unknown", source: "default" });
    spend = true;
    parse.mockRejectedValue(new Error("boom"));
    expect(await contactKind(P, null, ["Where are you now?"])).toMatchObject({ kind: "unknown", source: "default" });
    expect(rows.size).toBe(0);
  });
  it("with the bridge down, a tenant's own words still decide; nothing from the chat is guessed", async () => {
    chat.mockResolvedValue(null);
    expect(await contactKind(P, null, ["I need a 2 bedroom in Remera"])).toMatchObject({ kind: "tenant" });
    expect(rows.size).toBe(0);
  });
  it("dry: reads, never writes", async () => {
    parse.mockResolvedValue({ stop_reason: "end_turn", parsed_output: { kind: "personal", reason: "private-chat" }, usage: { input_tokens: 1, output_tokens: 1 } });
    expect(await contactKind(P, null, ["Where are you now?"], { dry: true, history: [] })).toMatchObject({ kind: "personal", source: "model" });
    expect(await contactKind(P, null, ["Hello mr"], { dry: true })).toMatchObject({ kind: "tenant", why: "new-number-greeting" });
    expect(written).toEqual([]);
  });
  it("a home the agent showed makes the person a tenant", async () => {
    dbMock.agentTask.findMany.mockResolvedValue([{ messages: [{ role: "user", text: "x" }, { role: "agent", kind: "shortlist" }] }]);
    expect(await contactKind(P, null, ["ok"])).toMatchObject({ kind: "tenant", source: "agent" });
  });
  it("never throws", async () => {
    dbMock.waState.findMany.mockRejectedValueOnce(new Error("db"));
    // a failing cache read is a miss, not a failure: the rules still run
    expect(await contactKind(P, null, ["I need a 2 bedroom in Remera"])).toMatchObject({ kind: "tenant" });
  });
});
