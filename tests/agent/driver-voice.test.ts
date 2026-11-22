// @vitest-environment node
/** The driver's voice (2026-11-22): short, Kigali-local, speaks as Mkan, never a form letter; media readings are what the person said. */
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));

const pure = await import("@/components/agent/driver-pure");

const ctx = (over: Partial<Parameters<typeof pure.guardDriverText>[1]> = {}): Parameters<typeof pure.guardDriverText>[1] => ({
  allowed: pure.guardNumbers("max 150k", "[photo: TikTok ad, K6823, 120k a month]"),
  tenantText: "I need a 1 bedroom",
  anyConfirmed: false,
  budgetKnown: false,
  said: [],
  ...over,
});
const ok = (text: string, over = {}) => pure.guardDriverText(text, ctx(over)).ok;

describe("guard: the voice", () => {
  it("refuses the system's own sentences", () => {
    expect(ok("I found 2 homes that match. Each card shows why it fits.\n[[homes]]")).toBe(false);
    expect(ok("Here are the homes I found for you.\n[[homes]]")).toBe(false);
    expect(ok("Feel free to ask me anything.")).toBe(false);
    expect(ok("J'ai trouvé 2 logements. Chaque carte montre pourquoi.", { tenantText: "Bonjour, je cherche une chambre", replyLanguage: "French" })).toBe(false);
    expect(pure.guardDriverText("Two that fit.\n[[homes]]\nWhich one do you like?", ctx()).ok).toBe(true);
  });

  it("does not let Mkan describe itself unprompted", () => {
    expect(ok("Hi, I'm Mkan's assistant. What area do you like?")).toBe(false);
    expect(ok("I am an AI, so I check with the broker.")).toBe(false);
    expect(ok("Hello! This is Mkan's virtual assistant.")).toBe(false);
    expect(ok("Je suis l'assistant de Mkan.", { tenantText: "Bonjour, je cherche une chambre", replyLanguage: "French" })).toBe(false);
    expect(ok("We check with the broker, usually within a day. Which area?")).toBe(true);
  });

  it("lets it answer honestly when asked", () => {
    expect(ok("It's Mkan's assistant here, and someone from Mkan meets you at the viewing.", { tenantText: "are you a bot or a real person?" })).toBe(true);
    expect(ok("Ndi umufasha wa Mkan, kandi umuntu wa Mkan azabasanga aho inzu iri.", { tenantText: "uri robo cyangwa umuntu?", replyLanguage: "Kinyarwanda" })).toBe(true);
  });

  it("still never claims to be a person, or promises one will call", () => {
    expect(ok("I'm a real person, don't worry.", { tenantText: "are you a bot?" })).toBe(false);
    expect(ok("A colleague will call you tomorrow.")).toBe(false);
  });

  it("keeps it to two short bubbles", () => {
    expect(ok("Kimironko has a few.\n\nBudget around 150k?")).toBe(true);
    expect(ok("Kimironko has a few.\n\nThey are close to the road.\n\nBudget around 150k?")).toBe(false);
    expect(ok("x ".repeat(300))).toBe(false);
  });

  it("answers in the person's language, French and Swahili included", () => {
    expect(pure.replyLanguageOf("J'aimerais savoir si c'est meublé ?", "en")).toBe("French");
    expect(pure.replyLanguageOf("Habari, nataka nyumba ya vyumba viwili", "en")).toBe("Swahili");
    expect(pure.replyLanguageOf("Iyo apartment ya 120k ndayishaka", "rw")).toBe("Kinyarwanda");
    expect(pure.replyLanguageOf("Hello, I need a room", "en")).toBe("English");
  });
});

describe("system prompt", () => {
  it("carries the voice, the honesty rule and the media reading", () => {
    for (const s of [/speak as the Mkan team/i, /Never volunteer that you are an assistant/i, /sincerely ask/i, /\[photo: screenshot of a TikTok ad/, /\[voice note, rw:/, /never say you cannot read voice notes/i, /at most 2 short paragraphs/i, /Never claim to be a person/i]) {
      expect(pure.DRIVER_SYSTEM).toMatch(s);
    }
    expect(pure.DRIVER_SYSTEM).not.toMatch(/a bot\)/);
  });

  it("lets numbers from a media reading through the guard", () => {
    // The caller passes the media text as part of the tenant's message: a K-code and a rent in it are the tenant's.
    const allowed = pure.guardNumbers("[photo: screenshot of a TikTok ad, K6823, 120k a month, Kicukiro]");
    expect(pure.guardDriverText("K6823 at 120k, Kicukiro. Want to see it?", { ...ctx(), allowed }).ok).toBe(true);
  });
});
