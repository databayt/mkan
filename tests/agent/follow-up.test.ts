import { describe, expect, it } from "vitest";
import { followUpKind, underHomes } from "@/components/agent/follow-up";
import { homesTurn, type AgentMessage } from "@/components/agent/types";
import { isThanks } from "@/components/agent/whatsapp-format";

const user = (text: string): AgentMessage => ({ role: "user", text, at: "" });
const homes = (same = false): AgentMessage => ({ role: "agent", kind: "shortlist", count: 3, ...(same ? { same: true } : {}), at: "" });

describe("followUpKind (/find, under the homes)", () => {
  it("reads what the web adds to WhatsApp's gate first", () => {
    expect(followUpKind("person")).toBe("person");
    expect(followUpKind("Are you a bot?")).toBe("about");
    expect(followUpKind("ok thanks")).toBe("thanks");
    expect(followUpKind("Thank you so much 🙏")).toBe("thanks");
    for (const t of ["1", "3", "yes", "👍", "perfect"]) expect(followUpKind(t), t).toBe("check");
  });
  it("then asks afterHomesKind, as WhatsApp does", () => {
    expect(followUpKind("How are you")).toBe("chat");
    expect(followUpKind("Show me the house")).toBe("visit");
    expect(followUpKind("is it still available")).toBe("check");
    expect(followUpKind("What is this")).toBe("about");
    expect(followUpKind("Why you can't ask?")).toBe("person");
  });
  it("leaves the search to what moves it", () => {
    for (const t of ["2 bedroom in Kicukiro", "cheaper", "It's a lot of money", "Give me more options", "K5808", "furnished please"]) {
      expect(followUpKind(t), t).toBe("search");
    }
  });
});

describe("underHomes", () => {
  it("holds while the last agent turn showed the homes or answered under them", () => {
    expect(underHomes([user("2 bedroom"), homes(), user("hi")])).toBe(true);
    expect(underHomes([user("2 bedroom"), homes(), user("hi"), { role: "agent", kind: "followUp", say: "chat", at: "" }, user("?")])).toBe(true);
  });
  it("not after no homes, a question card or an error", () => {
    expect(underHomes([user("2 bedroom"), { role: "agent", kind: "none", at: "" }, user("hi")])).toBe(false);
    expect(underHomes([user("a house"), { role: "agent", kind: "clarify", fields: [], at: "" }, user("ok")])).toBe(false);
    expect(underHomes([user("2 bedroom"), { role: "agent", kind: "error", at: "" }, user("again")])).toBe(false);
  });
});

describe("homesTurn", () => {
  it("keeps the homes under the turn that first showed them", () => {
    expect(homesTurn([user("2 bedroom"), homes(), user("more"), homes(true)])).toBe(1);
    expect(homesTurn([user("2 bedroom"), homes(), user("cheaper"), homes()])).toBe(3);
    expect(homesTurn([user("2 bedroom"), { role: "agent", kind: "none", at: "" }])).toBe(-1);
  });
});

describe("isThanks", () => {
  it("takes an ok before the thanks (it went to a person on WhatsApp)", () => {
    for (const t of ["ok thanks", "Okay thank you", "great, thanks!", "Sawa murakoze"]) expect(isThanks(t), t).toBe(true);
    expect(isThanks("ok")).toBe(false);
  });
});
