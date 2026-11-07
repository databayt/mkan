import { describe, expect, it } from "vitest";
import en from "@/components/internationalization/en.json";
import {
  buildQuestion,
  clarifyQuestions,
  coerceAnswers,
  describeAnswers,
  joiner,
  MAX_ANSWER_TEXT,
  toMessage,
  wizardQuestions,
  type QuestionContext,
} from "@/components/agent/questions";

const ctx: QuestionContext = { a: en.agent as QuestionContext["a"], locale: "en", money: (n) => `RWF ${n.toLocaleString("en")}` };

describe("the guided search's three questions", () => {
  const [where, home, budget] = wizardQuestions(ctx);

  it("asks where, what home and what budget, each with Other", () => {
    expect([where?.id, home?.id, budget?.id]).toEqual(["where", "homeType", "maxPrice"]);
    expect([where, home, budget].every((q) => q?.other)).toBe(true);
  });

  it("offers Kigali's three districts and anywhere, without a recommendation (the place is the tenant's)", () => {
    expect(where?.options.map((o) => o.key)).toEqual(["gasabo", "kicukiro", "nyarugenge", "anywhere"]);
    expect(where?.options.find((o) => o.key === "kicukiro")?.filters).toEqual({ district: "KICUKIRO" });
    expect(where?.options.find((o) => o.key === "anywhere")?.filters).toEqual({});
    expect(where?.options.some((o) => o.recommended)).toBe(false);
  });

  it("leads the home question with Kigali's usual answer", () => {
    expect(home?.options[0]).toMatchObject({ key: "apartment", recommended: true });
    expect(home?.options.find((o) => o.key === "studio")?.filters).toEqual({ homeType: "studio", bedrooms: 0 });
  });

  it("prices every monthly budget's move-in", () => {
    expect(budget?.options.map((o) => o.key)).toEqual(["m150000", "m300000", "m500000", "m1000000"]);
    for (const o of budget?.options ?? []) {
      expect(o.hint).toMatch(/to move in/);
      expect(o.filters).toMatchObject({ pricePeriod: "month", stay: "long" });
    }
  });
});

describe("the clarify card's questions", () => {
  it("asks what run.ts asked, in its order, recommending only where Kigali has a usual answer", () => {
    const qs = clarifyQuestions(["furnished", "purpose"], ctx);
    expect(qs.map((q) => q.id)).toEqual(["furnished", "purpose"]);
    expect(qs[0]?.options[0]).toMatchObject({ key: "no", recommended: true, filters: { furnished: false } });
    expect(qs[1]?.options.some((o) => o.recommended)).toBe(false);
  });

  it("prices nights for a short stay when asked on its own", () => {
    const q = buildQuestion("maxPrice", { ...ctx, requirements: { stay: "short", nights: 3 } });
    expect(q.options[0]).toMatchObject({ key: "n30000", filters: { pricePeriod: "night", stay: "short" } });
  });
});

describe("toMessage — a finished card as one message", () => {
  const qs = wizardQuestions(ctx);

  it("joins the picked and typed words, sets exactly the picked fields, and keeps the answers", () => {
    const m = toMessage(qs, { where: { key: "gasabo" }, homeType: { text: " a 3-bedroom house " }, maxPrice: { key: "m300000" } }, joiner("en"));
    expect(m.text).toBe("Gasabo, a 3-bedroom house, Up to RWF 300,000 a month");
    expect(m.filters).toEqual({ stay: "long", district: "GASABO", maxPrice: 300000, pricePeriod: "month" });
    expect(m.answers).toEqual([
      { q: "where", a: "gasabo" },
      { q: "homeType", text: "a 3-bedroom house" },
      { q: "maxPrice", a: "m300000" },
    ]);
  });

  it("leaves a skipped question unset — a card search is still a monthly one", () => {
    const m = toMessage(clarifyQuestions(["homeType", "furnished"], ctx), { furnished: { key: "yes" } }, joiner("en"));
    expect(m.text).toBe("Furnished");
    expect(m.filters).toEqual({ stay: "long", furnished: true });
    expect(m.answers).toEqual([{ q: "furnished", a: "yes" }]);
  });

  it("joins Arabic words with the Arabic comma", () => {
    expect(joiner("ar")).toBe("، ");
  });
});

describe("describeAnswers — the tenant's turn drawn as the card", () => {
  it("names each question and its answer, nights included", () => {
    expect(
      describeAnswers(
        [
          { q: "where", a: "gasabo" },
          { q: "homeType", text: "a 3-bedroom house" },
          { q: "maxPrice", a: "n60000" },
        ],
        ctx,
      ),
    ).toEqual([
      { question: "Where in Kigali?", answer: "Gasabo" },
      { question: en.agent.clarify.q.homeType, answer: "a 3-bedroom house" },
      { question: "What's your budget?", answer: "Up to RWF 60,000 a night" },
    ]);
  });

  it("drops what it cannot name", () => {
    expect(describeAnswers([{ q: "colour", a: "blue" }, { q: "where", a: "mombasa" }, { q: "furnished" }], ctx)).toEqual([]);
    expect(describeAnswers(undefined, ctx)).toEqual([]);
  });
});

describe("coerceAnswers — what the server keeps", () => {
  it("keeps known questions with option keys or short typed words, at most four", () => {
    const long = "x".repeat(200);
    expect(
      coerceAnswers([
        { q: "where", a: "gasabo" },
        { q: "homeType", text: `  near\u0000KIST\n ` },
        { q: "furnished", text: long },
        { q: "purpose", a: "family" },
        { q: "maxPrice", a: "m300000" },
      ]),
    ).toEqual([
      { q: "where", a: "gasabo" },
      { q: "homeType", text: "near KIST" },
      { q: "furnished", text: "x".repeat(MAX_ANSWER_TEXT) },
      { q: "purpose", a: "family" },
    ]);
  });

  it("drops unknown questions, odd keys and anything that is not an answer", () => {
    expect(coerceAnswers([{ q: "colour", a: "blue" }, { q: "where", a: "<b>" }, { q: "where", text: "   " }, null, "where", 3])).toEqual([]);
    expect(coerceAnswers("nope")).toEqual([]);
  });
});
