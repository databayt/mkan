/**
 * The chat eval's scorer (scripts/agent/eval-chat-score.ts): every check on a hand-made transcript that
 * should pass and one that should fail, then the fixture itself — real chats, no phone numbers, and the old
 * line's score on them is the baseline the new funnel has to beat.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { aggregate, asksForPerson, baselineTranscript, detectLang, listedHomes, offersSlot, questionsIn, scoreChat, tenantBudget, toTranscript, type ChatFixture, type Msg } from "../../scripts/agent/eval-chat-score";

const list = (...items: [string, number][]) =>
  `I found ${items.length} homes that match. ${items.map(([t, p], i) => `*${i + 1}. ${t}* · RWF ${p.toLocaleString("en")}/month · Kimironko https://www.mkan.sd/en/k/K60${i}`).join(" ")} Reply with a home's number.`;
const T = (text: string): Msg => ({ role: "tenant", text });
const B = (text: string): Msg => ({ role: "bot", text });
const score = (msgs: Msg[], brief = {}, lang = "en") => scoreChat(msgs, { brief, lang }).checks;

describe("reading text", () => {
  it("parses listed homes", () => {
    const h = listedHomes(list(["Studio in Kimironko", 120_000], ["Room in Remera", 80_000]));
    expect(h).toEqual([
      { title: "Studio in Kimironko", price: 120_000, period: "month" },
      { title: "Room in Remera", price: 80_000, period: "month" },
    ]);
    expect(listedHomes("RWF 180,000/شهر")[0].price).toBe(180_000);
  });
  it("reads a tenant's budget", () => {
    expect(tenantBudget("Max budget : 150k")).toBe(150_000);
    expect(tenantBudget("400k-500k")).toBe(500_000);
    expect(tenantBudget("200,000-250,000")).toBe(250_000);
    expect(tenantBudget("٤٠٠ ألف")).toBe(400_000);
    expect(tenantBudget("I need a house for 400 three bedroom")).toBe(400_000);
    expect(tenantBudget("Check K6823 for me")).toBeNull();
    expect(tenantBudget("2 bedroom in Kicukiro")).toBeNull();
  });
  it("tells the four languages apart", () => {
    expect(detectLang("Hello, I need a one bedroom")).toBe("en");
    expect(detectLang("J'aimerais savoir si c'est meublé ?")).toBe("fr");
    expect(detectLang("Nkeneye inzu yo gukodesha")).toBe("rw");
    expect(detectLang("شقة بغرفتين في كيميرونكو")).toBe("ar");
    expect(detectLang("K6823")).toBeNull();
    expect(detectLang("1")).toBeNull();
  });
  it("spots questions, people and slots", () => {
    expect(questionsIn("How many bathrooms?")).toEqual(["bathrooms"]);
    expect(questionsIn("Do you have video ?")).toEqual(["media"]);
    expect(questionsIn("Location")).toEqual(["location"]);
    expect(questionsIn("J'aimerais savoir si c'est meublé ?")).toEqual(["furnished"]);
    expect(questionsIn("Furnished")).toEqual([]);
    expect(asksForPerson("Need talk with a human")).toBe(true);
    expect(asksForPerson("Can we meet and talk about the house ?")).toBe(true);
    expect(asksForPerson("2 bedroom in Kicukiro")).toBe(false);
    expect(offersSlot("Thursday 4pm or Saturday 10am?")).toBe(true);
    expect(offersSlot('Reply with a day and time, like "tomorrow 10am".')).toBe(false);
  });
});

describe("the checks", () => {
  it("budgetRespected", () => {
    const brief = { maxBudget: 150_000 };
    expect(score([T("up to 150k"), B(list(["Flat", 140_000], ["Flat 2", 160_000]))], brief).budgetRespected.pass).toBe(true);
    expect(score([T("up to 150k"), B(list(["Villa", 800_000]))], brief).budgetRespected.pass).toBe(false);
    expect(score([T("a flat"), B(list(["Villa", 800_000]))]).budgetRespected.pass).toBeNull();
    // Before the budget is said, a pricey list is not a miss.
    expect(score([T("hi"), B(list(["Villa", 800_000])), T("150k"), B(list(["Flat", 120_000]))], brief).budgetRespected.pass).toBe(true);
  });
  it("noCommercial", () => {
    expect(score([T("a room"), B(list(["Shop for rent in Gikondo", 100_000]))]).noCommercial.pass).toBe(false);
    expect(score([T("a room"), B(list(["Business room in Nyendo", 100_000]))]).noCommercial.pass).toBe(false);
    expect(score([T("a room"), B(list(["Room in Gikondo", 100_000]))]).noCommercial.pass).toBe(true);
  });
  it("noRepeatList and noIdenticalRepeat", () => {
    const a = list(["Flat", 100_000]);
    expect(score([T("hi"), B(a), T("babe"), B(a)]).noRepeatList.pass).toBe(false);
    expect(score([T("hi"), B(a), T("babe"), B(a)]).noIdenticalRepeat.pass).toBe(false);
    expect(score([T("hi"), B(a), T("cheaper"), B(list(["Flat", 80_000]))]).noRepeatList.pass).toBe(true);
    expect(score([T("hi"), B("Happy to help."), T("?"), B("Happy to help.")]).noIdenticalRepeat.pass).toBe(false);
    expect(score([T("hi"), B("Happy to help.")]).noIdenticalRepeat.pass).toBeNull();
  });
  it("noBudgetReAsk", () => {
    expect(score([T("budget 150k"), B("Tell me the area, the size and your budget, and I'll find homes.")]).noBudgetReAsk.pass).toBe(false);
    expect(score([T("budget 150k"), B(`${list(["Flat", 90_000])} Want me to keep these within a budget?`)]).noBudgetReAsk.pass).toBe(false);
    expect(score([T("hi"), B("Tell me the area, the size and your budget, and I'll find homes."), T("150k")]).noBudgetReAsk.pass).toBe(true);
    expect(score([T("budget 150k"), B("Send its number, or tell me what to change: the area, the budget or the bedrooms.")]).noBudgetReAsk.pass).toBe(true);
  });
  it("noRefusePerson and noPromisePerson", () => {
    const ask = T("Please can you link me with a human?");
    expect(score([ask, B("I'm Mkan's assistant, so I can't connect you to a person here.")]).noRefusePerson.pass).toBe(false);
    expect(score([ask, B("I handle everything here. Thursday 4pm or Saturday 10am?")]).noRefusePerson.pass).toBe(true);
    expect(score([ask, B("Okay, I've asked Osman to reply to you here.")]).noPromisePerson.pass).toBe(false);
    expect(score([ask, B("A person from Mkan will check it and reply to you here.")]).noPromisePerson.pass).toBe(false);
    expect(score([ask, B("Someone from Mkan meets you at the house. Saturday 10am?")]).noPromisePerson.pass).toBe(true);
    expect(score([T("a flat"), B("Here you go.")]).noRefusePerson.pass).toBeNull();
  });
  it("answeredQuestion", () => {
    expect(score([T("How many bathrooms?"), B("Home 1 has two bathrooms.")]).answeredQuestion.pass).toBe(true);
    expect(score([T("How many bathrooms?"), B(list(["Flat", 100_000]))]).answeredQuestion.pass).toBe(false);
    expect(score([T("Is it furnished?"), B("It is unfurnished.")]).answeredQuestion.pass).toBe(true);
    expect(score([T("Do you have video ?"), B("Thanks for trying the links.")]).answeredQuestion.pass).toBe(false);
    expect(score([T("Location"), B("Home 2 is in Nyamirambo.")]).answeredQuestion.pass).toBe(true);
    expect(score([T("hello"), B("hi")]).answeredQuestion.pass).toBeNull();
  });
  it("langConsistent", () => {
    expect(score([T("Mwaramutse"), B("Nishimiye kugufasha. Mbwira agace, ingano n'ingengo y'imari.")], {}, "rw").langConsistent.pass).toBe(true);
    expect(score([T("Iyo apartment ya 120k ndayishaka"), B("I found 6 homes that match. Send me the number.")], {}, "rw").langConsistent.pass).toBe(false);
    expect(score([T("Bonjour, il n'y a rien de meublé ?"), B("Long-term homes in Kigali are mostly unfurnished and I can help you find one.")], {}, "fr").langConsistent.pass).toBe(false);
    expect(score([T("شقة بغرفتين"), B("وجدت 2 منازل مطابقة. *1. 2-bedroom apartment in Gikondo* · RWF 180,000/شهر")], {}, "ar").langConsistent.pass).toBe(true);
  });
  it("slotOffered", () => {
    const shown = [T("2 bed"), B(list(["Flat", 100_000])), T("1")];
    expect(score([...shown, B("I'll check it is free.")]).slotOffered.pass).toBe(false);
    expect(score([...shown, B('Reply with a day and time, like "tomorrow 10am".')]).slotOffered.pass).toBe(false);
    expect(score([...shown, B("It's free. Thursday 4pm or Saturday 10am?")]).slotOffered.pass).toBe(true);
    expect(score([T("Need talk with a human"), B("Saturday 10am?")]).slotOffered.pass).toBe(true);
    expect(score([T("hello"), B("hi")]).slotOffered.pass).toBeNull();
  });
  it("pluralOk", () => {
    expect(score([T("a flat"), B("I found 1 homes that match.")]).pluralOk.pass).toBe(false);
    expect(score([T("a flat"), B("I found 1 home that matches.")]).pluralOk.pass).toBe(true);
    expect(score([T("a flat"), B("I found 1 bedroom homes.")]).pluralOk.pass).toBe(true);
  });
  it("scores only what applies", () => {
    const s = scoreChat([T("hello"), B("Happy to help.")], { brief: {}, lang: "en" });
    expect(s.applicable).toBeLessThan(11);
    expect(s.score).toBe(s.passed / s.applicable);
  });
});

describe("the real-chat fixture", () => {
  const fixtures = JSON.parse(readFileSync(join(__dirname, "fixtures", "real-chats.json"), "utf8")) as ChatFixture[];

  it("holds a real thread per entry, with no numbers or names", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(30);
    expect(new Set(fixtures.map((f) => f.id)).size).toBe(fixtures.length);
    for (const f of fixtures) {
      expect(["wa", "web"]).toContain(f.channel);
      expect(f.tenantTurns.length).toBeGreaterThan(0);
      expect(Array.isArray(f.tags)).toBe(true);
    }
    // No phone number at all, full or partial beyond the three masked digits (…123 only appears masked).
    const all = JSON.stringify(fixtures.map((f) => [f.tenantTurns, f.oldBotReplies, f.timeline]));
    expect(all).not.toMatch(/(?<![\d])(?:\+?250|0)7\d{8}\b/);
    expect(all).not.toMatch(/wa\.me\/\d/);
  });

  it("scores the old line's real replies, worst on the chats the funnel doc names", () => {
    const wa = fixtures.filter((f) => f.timeline);
    const scores = wa.map((f) => scoreChat(baselineTranscript(f), f));
    const agg = aggregate(scores);
    expect(agg.threads).toBe(wa.length);
    // The doc's own examples: the same list seven times, a shop at 150k, "I can't connect you", "A person from Mkan will check".
    const by = (id: string) => scoreChat(baselineTranscript(fixtures.find((f) => f.id === id)!), fixtures.find((f) => f.id === id)!);
    const thread = (pred: (f: ChatFixture) => boolean) => fixtures.find((f) => f.timeline && pred(f))!;
    expect(by(thread((f) => f.tags.includes("small-talk") && f.tags.includes("repeat-list") && f.tenantTurns.length === 8 && f.tenantTurns[1] === "You sleeping").id).checks.noRepeatList.pass).toBe(false);
    expect(by(thread((f) => f.tags.includes("commercial")).id).checks.noCommercial.pass).toBe(false);
    expect(by(thread((f) => f.tags.includes("refuse-person")).id).checks.noRefusePerson.pass).toBe(false);
    expect(by(thread((f) => f.tags.includes("promise-person")).id).checks.noPromisePerson.pass).toBe(false);
    // No thread ever got a viewing time: the funnel's 0.
    expect(agg.perCheck.slotOffered.passed).toBe(0);
    expect(agg.overall).toBeLessThan(0.8);
  });

  it("toTranscript interleaves a thread", () => {
    expect(toTranscript(["a", "b"], ["x"]).map((m) => m.role)).toEqual(["tenant", "bot", "tenant"]);
  });
});
