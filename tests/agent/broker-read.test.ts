/**
 * The broker side of the WhatsApp loop on Claude (2026-11-22): the classifier's reply parsed, the rules kept as
 * the fast path, every failure falling back to today's behaviour, and the ask worded in the broker's language
 * with the tenant's own budget only.
 */
import { describe, expect, it, vi } from "vitest";
import { BROKER_READ_SYSTEM, brokerReadPrompt, needsClassifier, parseBrokerRead, readAsAnswer, rentOf, storedLang } from "@/components/agent/broker-read-pure";
import { parseBrokerReply } from "@/components/agent/broker-reply";
import { availabilityMessage, needLines, tenantStatedBudget } from "@/components/agent/broker-message";
import { EMPTY_REQUIREMENTS } from "@/components/agent/requirements";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("server-only", () => ({}));

const NOW = new Date("2026-11-23T08:00:00Z"); // Mon 23 Nov, 10:00 in Kigali

describe("parseBrokerRead", () => {
  it("reads the plain JSON shape", () => {
    const r = parseBrokerRead('{"answer":"available","time":"2026-11-24T10:00:00+02:00","otherHome":null,"question":null,"lang":"en"}', NOW)!;
    expect(r.answer).toBe("available");
    expect(r.time?.toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(r.lang).toBe("en");
    expect(readAsAnswer(r)).toBe("AVAILABLE");
  });
  it("tolerates a fence and prose around the object", () => {
    const r = parseBrokerRead('Here you go:\n```json\n{"answer":"taken","time":null,"otherHome":{"area":"Gikondo","bedrooms":2,"rent":"200k","furnished":null},"question":null,"lang":"en"}\n```', NOW)!;
    expect(r.answer).toBe("taken");
    expect(r.otherHome).toEqual({ area: "Gikondo", bedrooms: 2, rent: 200_000, furnished: null });
    expect(readAsAnswer(r)).toBe("RENTED");
  });
  it("a time alone is an available home; a question is no answer", () => {
    expect(readAsAnswer(parseBrokerRead('{"answer":"time","time":"2026-11-24T10:00","lang":"en"}', NOW)!)).toBe("AVAILABLE");
    expect(readAsAnswer(parseBrokerRead('{"answer":"question","question":"budget?","lang":"en"}', NOW)!)).toBeNull();
  });
  it("reads a time with no offset as Kigali time, and drops a time in the past or far away", () => {
    expect(parseBrokerRead('{"answer":"time","time":"2026-11-24T10:00:00"}', NOW)!.time?.toISOString()).toBe("2026-11-24T08:00:00.000Z");
    expect(parseBrokerRead('{"answer":"time","time":"2026-11-20T10:00:00+02:00"}', NOW)!.time).toBeNull();
    expect(parseBrokerRead('{"answer":"time","time":"2027-03-01T10:00:00+02:00"}', NOW)!.time).toBeNull();
    expect(parseBrokerRead('{"answer":"time","time":"tomorrow 10am"}', NOW)!.time).toBeNull();
  });
  it("other_home with nothing in it is unclear; an empty other home is dropped", () => {
    expect(parseBrokerRead('{"answer":"other_home","otherHome":{"area":null,"bedrooms":null,"rent":null}}', NOW)!.answer).toBe("unclear");
    expect(parseBrokerRead('{"answer":"taken","otherHome":{"area":" ","rent":12}}', NOW)!.otherHome).toBeNull();
  });
  it("null for anything that is not a read: no JSON, an answer outside the list, an array", () => {
    for (const raw of [null, undefined, "", "I think it is available", '{"answer":"maybe"}', "[1,2]", '{"answer":', '{"time":"x"}']) expect(parseBrokerRead(raw as string | null, NOW)).toBeNull();
  });
  it("rent figures: 200k, 1.2m, '200,000', bare numbers; not a fee or a year", () => {
    expect(rentOf("200k")).toBe(200_000);
    expect(rentOf("1.2M")).toBe(1_200_000);
    expect(rentOf("RWF 200,000")).toBe(200_000);
    expect(rentOf(250_000)).toBe(250_000);
    expect(rentOf("5k")).toBeNull();
    expect(rentOf(2026)).toBeNull();
    expect(rentOf(null)).toBeNull();
  });
  it("keeps the languages the directory stores", () => {
    expect(storedLang("rw")).toBe("RW");
    expect(storedLang("fr")).toBe("FR");
    expect(storedLang("en")).toBe("EN");
    expect(storedLang("sw")).toBeNull();
  });
});

describe("the prompt", () => {
  it("names every answer, the Kigali clock and the offered times", () => {
    for (const a of ["available", "taken", "resend", "other_home", "time", "question", "price", "unclear"]) expect(BROKER_READ_SYSTEM).toContain(`"${a}"`);
    const p = brokerReadPrompt({ text: "Tomorrow 10am we can see it", now: NOW, home: { area: "Gikondo", bedrooms: 2, rent: 200_000 }, offeredSlots: ["Mon 23 Nov, 14:00", "Tue 24 Nov, 09:00"] });
    expect(p).toContain("Mon 23 Nov 2026, 10:00");
    expect(p).toContain("2-bedroom, in Gikondo, rent RWF 200000");
    expect(p).toContain("Mon 23 Nov, 14:00 or Tue 24 Nov, 09:00");
    expect(p).toContain("Tomorrow 10am we can see it");
  });
});

describe("the rules stay the fast path", () => {
  const needs = (t: string) => needsClassifier(t, parseBrokerReply(t), NOW);
  it("a plain yes, taken, a resend, a greeting and a bot question never reach Claude", () => {
    for (const t of ["Yes", "yes available", "Iyinzu irahari", "taken", "Byaragiye", "The video is not available, send the link again", "Hi", "Hello how are you?", "Are you a bot?"]) expect(needs(t), t).toBe(false);
  });
  it("anything wordier does", () => {
    for (const t of [
      "Yes, tomorrow 10am works",
      "Tomorrow 10am we can see it",
      "Taken but I have another one in Gikondo 2 bed 200k",
      "How much is your budget?",
      "it is 250k negotiable",
      "[voice note, rw: \"ejo saa yine\"]",
    ])
      expect(needs(t), t).toBe(true);
    expect(needs("")).toBe(false);
  });
});

describe("readBrokerMessage never throws and falls back", () => {
  const ctx = { text: "Yes tomorrow 10am", now: NOW };
  it("a stubbed reply is parsed; an empty one, junk, a throw and a hang are all null", async () => {
    vi.resetModules();
    const { readBrokerMessage } = await import("@/components/agent/broker-read");
    const ok = await readBrokerMessage(ctx, { call: async () => '{"answer":"available","time":"2026-11-24T10:00:00+02:00","lang":"en"}' });
    expect(ok?.answer).toBe("available");
    expect(await readBrokerMessage(ctx, { call: async () => null })).toBeNull();
    expect(await readBrokerMessage(ctx, { call: async () => "no idea" })).toBeNull();
    expect(await readBrokerMessage(ctx, { call: async () => { throw new Error("boom"); } })).toBeNull();
  });
  it("with no key (the test env) the real call returns null: today's rules run", async () => {
    vi.resetModules();
    delete process.env.AGENT_ANTHROPIC_API_KEY;
    const { readBrokerMessage } = await import("@/components/agent/broker-read");
    expect(await readBrokerMessage(ctx)).toBeNull();
  });
});

describe("the ask: the tenant's need in the broker's language, budget only from the tenant", () => {
  const link = "https://www.mkan.sd/en/k/K6603";
  const homes = [{ title: "x", link }];
  const slots = [{ en: "Mon 23 Nov, 09:00", rw: "Mbere 23 Nov, 09:00" }, { en: "Tue 24 Nov, 09:00", rw: "Kabiri 24 Nov, 09:00" }];
  const need = { ...EMPTY_REQUIREMENTS, bedrooms: 2, homeType: "apartment" as const, neighbourhood: "Remera", maxPrice: 150_000, pricePeriod: "month" as const, stay: "long" as const };

  it("English, French, Kinyarwanda: one message, the /k link, the need, the question with two times", () => {
    const n = needLines(need);
    const en = availabilityMessage(homes, "a", { introduce: false, lang: "EN", need: n, slots });
    const fr = availabilityMessage(homes, "a", { introduce: false, lang: "FR", need: n, slots });
    const rw = availabilityMessage(homes, "a", { introduce: false, lang: "RW", need: n, slots });
    for (const t of [en, fr, rw]) {
      expect(t).toContain(link);
      expect(t).toMatch(/150k|150,000/);
      expect(t.split(link)).toHaveLength(2);
      expect(t).not.toMatch(/tiktok/i);
    }
    expect(en).toMatch(/2-bedroom apartment in Remera, up to 150k/);
    expect(en).toMatch(/Mon 23 Nov, 09:00 or Tue 24 Nov, 09:00/);
    expect(fr).toMatch(/un appartement de 2 chambres à Remera, jusqu'à 150k/);
    expect(fr).toMatch(/[Ll]e Mon 23 Nov, 09:00 ou le Tue 24 Nov, 09:00/);
    expect(rw).toMatch(/Ashaka: .*i Remera, kugeza RWF 150,000 ku kwezi/);
    expect(rw).toMatch(/Mbere 23 Nov, 09:00 cyangwa Kabiri 24 Nov, 09:00/);
    expect(fr).not.toMatch(/Hi |Muraho/);
    expect(rw).not.toMatch(/Hi |Bonjour/);
    // Samples for the report.
    console.log(`\n--- EN ---\n${en}\n--- FR ---\n${fr}\n--- RW ---\n${rw}\n--- EN first message ---\n${availabilityMessage(homes, "a", { introduce: true, name: "Eric", lang: "EN", need: n, slots })}\n`);
  });

  it("no budget in the tenant's words, no budget in the ask", () => {
    const stripped = { ...need, maxPrice: null, pricePeriod: null };
    for (const lang of ["EN", "FR", "RW"] as const) {
      const t = availabilityMessage(homes, "b", { introduce: false, lang, need: needLines(stripped), slots });
      expect(t, lang).not.toMatch(/\d+k|RWF|jusqu'à|kugeza|up to/);
    }
    expect(needLines(EMPTY_REQUIREMENTS)).toEqual({ EN: "", FR: "", RW: "" });
  });

  it("a ceiling the tenant never said is not theirs: 42k from a listing, 150k from their message", () => {
    const messages = [
      { role: "user", text: "I want a 2 bedroom in Remera, budget 150k", at: "x" },
      { role: "agent", kind: "answer", text: "Homes at 42k: ...", at: "x" },
    ];
    expect(tenantStatedBudget(messages, 150_000)).toBe(true);
    expect(tenantStatedBudget(messages, 42_000)).toBe(false);
    expect(tenantStatedBudget([{ role: "user", text: "2 bedroom Remera", at: "x" }], 42_000)).toBe(false);
    expect(tenantStatedBudget([{ role: "user", text: "cheaper", at: "x", filters: { maxPrice: 120_000 } }], 120_000)).toBe(true);
    expect(tenantStatedBudget([], 150_000)).toBe(false);
    expect(tenantStatedBudget(null, 150_000)).toBe(false);
    expect(tenantStatedBudget(messages, null)).toBe(false);
  });

  it("never the same sentence twice to one broker, in any language", () => {
    for (const lang of ["EN", "FR", "RW"] as const) {
      const seen: string[] = [];
      for (const seed of ["s1", "s2", "s3"]) {
        const t = availabilityMessage(homes, seed, { introduce: false, lang, previous: seen });
        const opener = t.split("\n")[0]!.replace(/^(Hi|Bonjour|Muraho)( there)?,/, "");
        expect(seen.map((x) => x.split("\n")[0]!.replace(/^(Hi|Bonjour|Muraho)( there)?,/, "")), `${lang} ${seed}`).not.toContain(opener);
        seen.push(t);
      }
    }
  });
});
