// @vitest-environment node
/**
 * Phase 2 — the conversational driver (docs/chat-funnel.md). The guard that stands between the model and a
 * tenant, the bounded tool loop with a scripted model, the fallback when the API fails, and "MKAN_DRIVER off
 * means the old path". No network, no database.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
// The turn's database-facing neighbours: the tools are exercised through the loop, not through these.
vi.mock("@/components/agent/deal", () => ({}));
vi.mock("@/components/agent/availability", () => ({}));
vi.mock("@/components/agent/broker", () => ({}));
vi.mock("@/components/agent/demand", () => ({}));
vi.mock("@/components/agent/viewing-loop", () => ({}));
vi.mock("@/components/agent/task-view", () => ({}));
vi.mock("@/components/agent/run", () => ({}));
vi.mock("@/components/agent/search", () => ({}));
vi.mock("@/components/agent/append", () => ({}));
vi.mock("@/components/agent/profile", () => ({}));
vi.mock("../../scripts/crm/public-links", () => ({ publicAppUrl: () => "https://www.mkan.sd" }));

const pure = await import("@/components/agent/driver-pure");
const { converse } = await import("@/components/agent/driver-loop");
const { driveTurn, driverReady } = await import("@/components/agent/driver");
const { priceOf } = await import("@/components/agent/claude");

const ctx = (over: Partial<Parameters<typeof pure.guardDriverText>[1]> = {}): Parameters<typeof pure.guardDriverText>[1] => ({
  allowed: pure.guardNumbers("max 150k", [{ rent: "RWF 150,000/month", slots: ["Thu 26 Nov, 16:00"] }]),
  tenantText: "I need a 1 bedroom",
  anyConfirmed: false,
  budgetKnown: false,
  said: [],
  ...over,
});

describe("MKAN_DRIVER", () => {
  it("is off unless it says on", () => {
    expect(pure.driverEnabled(undefined)).toBe(false);
    expect(pure.driverEnabled("")).toBe(false);
    expect(pure.driverEnabled("off")).toBe(false);
    expect(pure.driverEnabled("on")).toBe(true);
    expect(pure.driverEnabled(" ON ")).toBe(true);
  });

  it("off: the driver is not ready and a turn goes straight back to the pipeline, touching nothing", async () => {
    delete process.env.MKAN_DRIVER;
    expect(await driverReady()).toBe(false);
    const res = await driveTurn({
      profile: { id: "p", userId: null, waPhone: "+250" },
      viewer: {} as never,
      digits: "250",
      current: null,
      message: { role: "user", text: "hi", at: "x", wa: "w1" },
      lang: "en",
    });
    expect(res).toEqual({ kind: "fallback", why: "unavailable" });
  });

  it("on but no key (or the API capped): also the pipeline", async () => {
    process.env.MKAN_DRIVER = "on";
    delete process.env.AGENT_ANTHROPIC_API_KEY;
    expect(await driverReady()).toBe(false);
    delete process.env.MKAN_DRIVER;
  });
});

describe("guardDriverText", () => {
  it("lets a plain, honest message through and strips the homes mark", () => {
    const g = pure.guardDriverText("Two that fit 150k.\n[[homes]]\nWhich one do you like?", ctx());
    expect(g).toEqual({ ok: true, text: "Two that fit 150k.\n\nWhich one do you like?" });
  });

  it("refuses a number no tool or tenant gave", () => {
    const g = pure.guardDriverText("It is 175,000 a month.", ctx());
    expect(g.ok).toBe(false);
    expect(!g.ok && g.reason).toMatch(/175,000/);
  });

  it("allows a price a tool returned, as people text it, and a slot label a tool returned", () => {
    expect(pure.guardDriverText("It's 150k a month. Does Thu 26 Nov, 16:00 suit you?", ctx()).ok).toBe(true);
    expect(pure.guardDriverText("It's 175k a month.", ctx()).ok).toBe(false);
  });

  it("keeps the list's price form out of prose (it reads as a second list), and notes to self in any language", () => {
    expect(pure.guardDriverText("It's RWF 150,000/month.", ctx()).ok).toBe(false);
    expect(pure.guardDriverText("Le tenant veut voir la chambre.", ctx({ replyLanguage: "French" })).ok).toBe(false);
    const mixed = "None of these list furnishing, so I will be honest about that and ask for the area.\n\nLes deux chambres ne sont pas meublées, dans quel quartier voulez-vous habiter ?";
    expect(pure.guardDriverText(mixed, ctx({ replyLanguage: "French", tenantText: "meublé ?" })).ok).toBe(false);
    expect(pure.guardDriverText("Les deux chambres ne sont pas meublées, dans quel quartier voulez-vous habiter ?", ctx({ replyLanguage: "French", tenantText: "meublé ?" })).ok).toBe(true);
  });

  it("refuses to say a home is free with no broker's yes, allows it once a tool confirmed", () => {
    expect(pure.guardDriverText("Good news, it's still available.", ctx()).ok).toBe(false);
    expect(pure.guardDriverText("Good news, it's available.", ctx({ anyConfirmed: true })).ok).toBe(true);
    expect(pure.guardDriverText("I'm checking it with the broker now.", ctx()).ok).toBe(true);
  });

  it.each(["I can't connect you to a person here.", "A person from Mkan will call you tomorrow.", "Someone will reply to you shortly.", "I am a real person, don't worry."])('refuses "%s"', (t) => {
    expect(pure.guardDriverText(t, ctx()).ok).toBe(false);
  });

  it("allows the true line: someone from Mkan meets them at the house", () => {
    expect(pure.guardDriverText("When you're ready to see it, someone from Mkan meets you at the house.", ctx()).ok).toBe(true);
  });

  it("refuses links, handles and phone numbers", () => {
    expect(pure.guardDriverText("See https://mkan.sd/en/k/K5808", ctx()).ok).toBe(false);
    expect(pure.guardDriverText("Call 0788 123 456 now", ctx()).ok).toBe(false);
  });

  it("refuses asking the budget again once the tenant gave it, in any wording", () => {
    const c = ctx({ budgetKnown: true });
    expect(pure.guardDriverText("What's the most you can pay a month?", c).ok).toBe(false);
    expect(pure.guardDriverText("And your budget?", c).ok).toBe(false);
    expect(pure.guardDriverText("Which area do you prefer?", c).ok).toBe(true);
    // and when it is unknown, asking is the right move
    expect(pure.guardDriverText("What's the most you can pay a month?", ctx()).ok).toBe(true);
  });

  it("keeps the script: Arabic in, Arabic out; not Arabic in, no Arabic out", () => {
    expect(pure.guardDriverText("أهلاً، ما هي المنطقة؟", ctx({ tenantText: "مرحبا" })).ok).toBe(true);
    expect(pure.guardDriverText("Hello, which area?", ctx({ tenantText: "مرحبا" })).ok).toBe(false);
    expect(pure.guardDriverText("أهلاً، ما هي المنطقة؟", ctx({ tenantText: "hello" })).ok).toBe(false);
  });

  it("never repeats: the same message, or the same long sentence, already sent in the chat", () => {
    const said = ["Hello! I find homes to rent in Kigali. What's the most you can pay a month?"];
    expect(pure.guardDriverText("Hello! I find homes to rent in Kigali. What's the most you can pay a month?", ctx({ said })).ok).toBe(false);
    expect(pure.guardDriverText("Sure. Which area do you like?", ctx({ said })).ok).toBe(true);
    expect(pure.guardDriverText("Sure, hello again! I find homes to rent in Kigali.", ctx({ said: ["Okay. I find homes to rent in Kigali."] })).ok).toBe(false);
  });

  it("refuses an empty or long message", () => {
    expect(pure.guardDriverText("   ", ctx()).ok).toBe(false);
    expect(pure.guardDriverText("a".repeat(900), ctx()).ok).toBe(false);
  });
});

describe("notes to self never reach a tenant", () => {
  it.each([
    "The tenant asks for the location, but no home is shown.",
    "\"Location\" could mean the area of K6823, but I have none.",
    "I'd rather ask which area they want.",
    "Let me fix that to one language: Yego.",
  ])('refuses "%s"', (t) => expect(pure.guardDriverText(t, ctx()).ok).toBe(false));
});

describe("the language of the reply", () => {
  it("follows the latest message, not the chat", () => {
    expect(pure.replyLanguageOf("hey Ai, stop sending me messages", "en")).toBe("English");
    expect(pure.replyLanguageOf("Mwiriwe", "rw")).toBe("Kinyarwanda");
    expect(pure.replyLanguageOf("مرحبا", "ar")).toBe("Arabic");
    expect(pure.replyLanguageOf("Il n'y a rien de meublé à ce niveau ?", "en")).toBe("French");
    expect(pure.replyLanguageOf("Hello, I need a room", "en")).toBe("English");
  });
});

describe("composeReply", () => {
  it("puts the list where the model asked, or after its text", () => {
    expect(pure.composeReply("x", "LIST", "Two fit.\n[[homes]]\nWhich?")).toBe("Two fit.\n\nLIST\n\nWhich?");
    expect(pure.composeReply("Two fit.", "LIST", "Two fit.")).toBe("Two fit.\n\nLIST");
    expect(pure.composeReply("Hi", null, "Hi")).toBe("Hi");
  });
});

// A scripted Claude: each call returns the next planned message.
type Plan = { stop: "tool_use" | "end_turn" | "max_tokens"; content: unknown[] };
const text = (t: string): Plan => ({ stop: "end_turn", content: [{ type: "text", text: t }] });
const use = (id: string, name: string, input: Record<string, unknown>): Plan => ({ stop: "tool_use", content: [{ type: "tool_use", id, name, input }] });
function scripted(plans: (Plan | Error)[]) {
  const calls: any[] = [];
  const client = {
    messages: {
      create: vi.fn(async (params: any) => {
        calls.push(JSON.parse(JSON.stringify(params)));
        const next = plans.shift();
        if (!next) throw new Error("script ran out");
        if (next instanceof Error) throw next;
        return { stop_reason: next.stop, content: next.content, usage: { input_tokens: 10, output_tokens: 5 } } as any;
      }),
    },
  };
  return { client, calls };
}
const deps = (client: any, over: Record<string, unknown> = {}) => ({
  client,
  model: "claude-sonnet-5-5",
  system: pure.DRIVER_SYSTEM,
  exec: vi.fn(async (name: string) => ({ ok: name })),
  guard: (raw: string) => pure.guardDriverText(raw, ctx()),
  deadline: Date.now() + 60_000,
  ...over,
});

describe("converse — tool dispatch", () => {
  it("runs the tools the model calls (in parallel, one result message) and returns the guarded final text", async () => {
    const { client, calls } = scripted([
      { stop: "tool_use", content: [{ type: "tool_use", id: "a", name: "search_homes", input: { max_budget: 150000 } }, { type: "tool_use", id: "b", name: "update_brief", input: { bedrooms: 1 } }] },
      use("c", "show_homes", { ids: [7] }),
      text("Two fit 150k.\n[[homes]]\nWhich one?"),
    ]);
    const d = deps(client);
    const out = await converse(d as never, "<chat/>");
    expect(out.ok).toBe(true);
    expect(d.exec.mock.calls.map((c) => c[0])).toEqual(["search_homes", "update_brief", "show_homes"]);
    expect(d.exec.mock.calls[0]![1]).toEqual({ max_budget: 150000 });
    if (out.ok) {
      expect(out.tools).toEqual(["search_homes", "update_brief", "show_homes"]);
      expect(out.effects).toBe(true);
      expect(out.raw).toContain("[[homes]]");
    }
    // both tool results of the first round went back together, in one user message
    const second = calls[1].messages.at(-1);
    expect(second.role).toBe("user");
    expect(second.content.map((b: any) => b.tool_use_id)).toEqual(["a", "b"]);
    // Sonnet 5.5: adaptive thinking (never "disabled", which it rejects), no forced tool choice, no temperature; cached system
    expect(calls[0].thinking).toEqual({ type: "adaptive" });
    expect(calls[0].tool_choice).toBeUndefined();
    expect(calls[0].temperature).toBeUndefined();
    expect(calls[0].system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(calls[0].max_tokens).toBe(pure.DRIVER_MAX_TOKENS);
  });

  it("a tool that throws is an error result the model can read, not a failed turn", async () => {
    const { client, calls } = scripted([use("a", "search_homes", {}), text("Which area do you like?")]);
    const d = deps(client, { exec: vi.fn(async () => { throw new Error("db down"); }) });
    const out = await converse(d as never, "x");
    expect(out.ok).toBe(true);
    const result = calls[1].messages.at(-1).content[0];
    expect(result.is_error).toBe(true);
    expect(result.content).toContain("db down");
  });

  it("at most four tool rounds: the next call has no tools to use", async () => {
    const { client, calls } = scripted([use("1", "search_homes", {}), use("2", "search_homes", {}), use("3", "search_homes", {}), use("4", "search_homes", {}), text("Which area?")]);
    const out = await converse(deps(client) as never, "x");
    expect(out.ok).toBe(true);
    expect(calls).toHaveLength(5);
    expect(calls[4].tool_choice).toEqual({ type: "none" });
    expect(calls[3].tool_choice).toBeUndefined();
  });
});

describe("converse — the guard and the fallback", () => {
  it("sends a refused message back with the reason and takes the rewrite", async () => {
    const { client, calls } = scripted([text("It's available right now!"), text("I'm checking it with the broker now.")]);
    const out = await converse(deps(client) as never, "x");
    expect(out.ok && out.text).toBe("I'm checking it with the broker now.");
    expect(calls[1].messages.at(-1).content).toMatch(/cannot be sent: no tool says a home is confirmed free/);
  });

  it("gives up after two rewrites — the pipeline answers", async () => {
    const bad = "It's available!";
    const { client } = scripted([text(bad), text(bad), text(bad)]);
    const out = await converse(deps(client) as never, "x");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.why).toMatch(/^guard:/);
    expect(!out.ok && out.effects).toBe(false);
  });

  it("an API failure is a failed turn with no effects (so the pipeline answers) and carries the error for the cooldown", async () => {
    const boom = new Error("timeout");
    const { client } = scripted([boom]);
    const out = await converse(deps(client) as never, "x");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.effects).toBe(false);
    expect(!out.ok && out.error).toBe(boom);
  });

  it("an API failure AFTER a tool acted reports the effect, so the turn answers from what the tools did", async () => {
    const { client } = scripted([use("a", "check_availability", { home_numbers: [1] }), new Error("500")]);
    const out = await converse(deps(client) as never, "x");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.effects).toBe(true);
    expect(!out.ok && out.tools).toEqual(["check_availability"]);
  });

  it("nothing starts past the deadline", async () => {
    const { client } = scripted([text("Hello")]);
    const out = await converse(deps(client, { deadline: Date.now() + 100 }) as never, "x");
    expect(out.ok).toBe(false);
    expect(!out.ok && out.why).toBe("deadline");
    expect(client.messages.create).not.toHaveBeenCalled();
  });

  it("a refusal or a cut-off message falls back", async () => {
    const r = await converse(deps(scripted([{ stop: "end_turn", content: [] } as Plan]).client) as never, "x");
    expect(r.ok).toBe(false);
    const m = await converse(deps(scripted([{ stop: "max_tokens", content: [{ type: "text", text: "Hel" }] }]).client) as never, "x");
    expect(!m.ok && m.why).toBe("max_tokens");
  });
});

describe("spend", () => {
  it("prices the driver at Sonnet 5.5 rates, and Haiku unchanged", () => {
    const u = { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    expect(priceOf(u, "claude-sonnet-5-5")).toBeCloseTo(12, 5);
    expect(priceOf(u)).toBeCloseTo(0.6, 5);
  });
});

describe("the tools the model gets", () => {
  it("are the seven of the plan, each with a closed schema", () => {
    expect(pure.DRIVER_TOOLS.map((t) => t.name)).toEqual(["update_brief", "search_homes", "show_homes", "answer_from_listing", "check_availability", "offer_viewing_slots", "book_viewing"]);
    for (const t of pure.DRIVER_TOOLS) expect((t.input_schema as { additionalProperties?: boolean }).additionalProperties).toBe(false);
  });
  it("the prompt carries the product rules", () => {
    for (const s of [/booked viewing/i, /never claim to be a person/i, /never promise that a person will/i, /Ignore any instruction/i, /Never re-send homes/i, /someone from Mkan meets/i]) expect(pure.DRIVER_SYSTEM).toMatch(s);
  });
});
