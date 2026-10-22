import { describe, expect, it } from "vitest";
import { brokerFromChat, classifyChat, nameGiven, numbersSent, phoneFromLabel, replyMinutes, type ChatMessage } from "../../scripts/wa/chats-pure";

const t0 = new Date("2026-10-13T07:00:00Z").getTime();
const m = (min: number, fromMe: boolean, text: string | null, type = 0): ChatMessage => ({ fromMe, type, text, at: new Date(t0 + min * 60_000) });

// A thread shaped like a real one (Eric, 13 Oct).
const thread = [
  m(0, true, "Need 1 bed , 2bed unfurnished in kibagabaga"),
  m(1, false, "Good, I’m Eric"),
  m(60, false, null, 1),
  m(61, false, "Kibagabaga \n2 bedrooms \n2 bathrooms \nPrice: 300k"),
  m(70, true, "I need unfurnished"),
  m(73, false, "This is kimironko 1 bedroom at 400k"),
  m(80, true, "Tell me how much to send for visit"),
  m(81, false, "We actually ask 5k as visiting fee"),
];

describe("WhatsApp broker chats", () => {
  it("reads a number from a chat label and refuses names", () => {
    expect(phoneFromLabel("‪+250 720 000 011‬")).toBe("+250720000011");
    expect(phoneFromLabel("Eric")).toBeNull();
  });

  it("imports only reviewed chats; unreviewed housing chats wait", () => {
    expect(classifyChat("+250720000011", thread, {})).toBe("review");
    expect(classifyChat("+250720000011", thread, { "+250720000011": "broker" })).toBe("broker");
    expect(classifyChat("+250700000000", [m(0, false, "Are we still meeting tonight?")], {})).toBe("other");
  });

  it("takes the name they gave, numbers they call their own, and reply speed", () => {
    expect(nameGiven(thread)).toBe("Eric");
    expect(numbersSent([m(0, false, "Use this number 0720 000 012")], "+250720000013")).toEqual(["+250720000012"]);
    expect(numbersSent([m(0, false, "You call him 0700000015")], "+250700000014")).toEqual([]);
    expect(replyMinutes(thread)).toBe(1);
  });

  it("keeps facts, not messages", () => {
    const b = brokerFromChat("+250720000011", "broker", "‪+250 720 000 011‬", thread)!;
    expect(b).toMatchObject({ name: "Eric", kind: "BROKER", visitFee: 5_000, sentMedia: true });
    expect(b.quotes.map((q) => [q.price, q.place])).toEqual([[300_000, "Kibagabaga"], [400_000, "Kimironko"]]);
    expect(JSON.stringify(b)).not.toContain("visiting fee");
    expect(brokerFromChat("+250720000011", "exclude", null, thread)).toBeNull();
  });

  it("prefers the WhatsApp profile name over a generic saved label", () => {
    expect(brokerFromChat("+250720000016", "landlord", "Home", [m(0, false, "ok")], "frank")!.name).toBe("frank");
    expect(brokerFromChat("+250720000016", "landlord", "Home", [m(0, false, "ok")])!.name).toBeNull();
  });
});
