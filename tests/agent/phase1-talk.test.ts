/**
 * Phase 1, item 4 — "talk to a person" (chat-funnel.md, stage 5; Abdout 2026-11-21: the chat stays fully
 * autonomous). Real asks: …114 "Need talk with a human" / "Please can you link me with an human?" got
 * "I can't connect you to a person here"; …099 "Can we talk" got a template; …466 "Can we meet and talk about
 * the house?" got "A person from Mkan will check", twice, then three days of silence.
 */
import { describe, expect, it, vi } from "vitest";
import { asksToTalk, talkText } from "@/components/agent/whatsapp-format";
import { pickSlots, repHours } from "@/components/agent/viewing-loop-pure";
import { viewingLabel } from "@/components/agent/deal-pure";

vi.mock("@/lib/db", () => ({ db: {} }));
const { guardHomeAnswer, PERSON_PROMISE_RE, CANT_CONNECT_RE } = await import("@/components/agent/writer");

describe("what counts as asking to talk", () => {
  it.each([
    "Need talk with a human",
    "Please can you link me with an human ?",
    "Can we talk",
    "can we talk?",
    "Can we meet and talk about the house?",
    "call me",
    "Please call me on this number",
    "I want to talk to someone",
    "can I speak with the owner",
    "Let's talk",
    "person",
    "Ndashaka kuvugana n'umuntu",
    "ممكن نتكلم",
    "اتصل بي",
  ])('"%s"', (text) => expect(asksToTalk(text)).toBe(true));

  it.each(["2 bedroom in Kimironko", "I need a house for my family", "How are you", "Thank you", "what is this", "Is it furnished?", "person with 2 kids", "1", "K6442", "I looked everywhere but nothing is furnished.", "Can we see it tomorrow?"])('"%s" is not', (text) =>
    expect(asksToTalk(text)).toBe(false),
  );
});

describe("the answer: the need behind it, never a refusal, never a promise", () => {
  const slots = ["Mon 23 Nov, 09:00", "Tue 24 Nov, 09:00"];
  it("offers the viewing of the home they are on with two concrete times", () => {
    const t = talkText("en", { title: "Single room in Gikondo", slots });
    expect(t).toBe('I handle everything here, so ask me anything. When you\'re ready to see "Single room in Gikondo", someone from Mkan meets you at the house. Does Mon 23 Nov, 09:00 or Tue 24 Nov, 09:00 suit you?');
  });
  it("asks which day suits when no time is free soon", () => {
    expect(talkText("en", { title: "Room", slots: [] })).toMatch(/Which day suits you\?$/);
    expect(talkText("en", { title: "Room", slots: [slots[0]!] })).toMatch(/Does Mon 23 Nov, 09:00 suit you\?$/);
  });
  it("with no home yet, asks what they are looking for", () => {
    expect(talkText("en")).toMatch(/someone from Mkan meets you at the house\. What are you looking for\?/);
  });
  it("in Arabic and Kinyarwanda too", () => {
    expect(talkText("ar", { title: "غرفة", slots })).toContain("يكون معك شخص من مكان عند المنزل");
    expect(talkText("rw", { title: "Icyumba", slots })).toContain("umuntu wo muri Mkan azahurira nawe ku nzu");
  });
  it("never says it cannot connect them, never claims to be a person, never promises a reply or a call", () => {
    for (const lang of ["en", "ar", "rw"] as const) {
      for (const t of [talkText(lang), talkText(lang, { title: "X", slots }), talkText(lang, { title: "X" })]) {
        expect(t, t).not.toMatch(CANT_CONNECT_RE);
        expect(t, t).not.toMatch(PERSON_PROMISE_RE);
        expect(t, t).not.toMatch(/will (?:reply|call|write|get back|contact)|I'm (?:a )?(?:human|person)/i);
      }
    }
  });
});

describe("the writer may not refuse either", () => {
  const facts = { lang: "en" as const, homes: [] };
  it("drops 'I can't connect you to a person here' (…114)", () => {
    expect(CANT_CONNECT_RE.test("I'm Mkan's assistant, so I can't connect you to a person here, but I can help you find a home.")).toBe(true);
    expect(guardHomeAnswer("I'm Mkan's assistant, so I can't connect you to a person here, but I can help you find a home in Kigali.", facts, "Please can you link me with an human?")).toBeNull();
  });
  it("passes the line the rule now asks for, and still stops a promise", () => {
    const ok = "I handle everything here, so ask me anything. When you're ready to see a home, someone from Mkan meets you at the house. Which day suits you?";
    expect(guardHomeAnswer(ok, facts, "Can we talk")).toBe(ok);
    expect(guardHomeAnswer("Someone from our team will call you soon.", facts, "Can we talk")).toBeNull();
  });
});

describe("two times Mkan's person can be there", () => {
  const hours = repHours("9-18", "1-6");
  // Saturday 21 Nov 2026, 16:00 Kigali: too late for today (the last start is 17:00 and a broker needs 2 h), Sunday is off.
  const sat = new Date("2026-11-21T14:00:00Z");
  it("offers the next working morning, then a different day", () => {
    const slots = pickSlots(sat, [], {}, 2, hours);
    expect(slots.map((s) => viewingLabel(s, "en"))).toEqual(["Mon 23 Nov, 09:00", "Tue 24 Nov, 09:00"]);
  });
  it("stays inside the hours and clear of another viewing and a day off", () => {
    const busy = [new Date("2026-11-23T07:00:00Z")];
    const off = new Set(["2026-11-24"]);
    const slots = pickSlots(sat, busy, { gapMs: 90 * 60_000, off }, 2, hours);
    const labels = slots.map((s) => viewingLabel(s, "en"));
    expect(labels[0]).toBe("Mon 23 Nov, 10:30");
    expect(labels[1]).toBe("Wed 25 Nov, 09:00");
    for (const s of slots) {
      const k = new Date(s.getTime() + 2 * 3_600_000);
      expect(k.getUTCHours()).toBeGreaterThanOrEqual(9);
      expect(k.getUTCHours()).toBeLessThanOrEqual(17);
      expect(k.getUTCDay()).not.toBe(0);
    }
  });
  it("is empty when the hours leave no room", () => {
    expect(pickSlots(sat, [], {}, 2, { start: 9, end: 10, days: [] })).toEqual([]);
  });
});
