/**
 * The line follows up a tenant who went quiet by itself (2026-11-22): at most two, spaced, each useful, and never
 * across a STOP, a person typing, a personal chat or a team number. The one nudge of 11-14 (six of eight chats ended
 * after the homes went out) is the first of the two.
 */
import { describe, expect, it, vi } from "vitest";
import { afterViewingLikedText, afterViewingNotHomesText, tenantWantsBrokerMessage, type OfferHome } from "@/components/agent/deal-pure";
import {
  FIRST_AFTER_MS,
  FOLLOW_UP_MAX,
  followUpBlock,
  followUpMessage,
  followUpNote,
  MIN_GAP_MS,
  planFollowUp,
  QUIET_LABEL,
  QUIET_MAX_MS,
  quietKey,
  quietNudgeOn,
  quietVerdict,
  SECOND_AFTER_MS,
  sentCount,
} from "@/components/agent/quiet-nudge-pure";
import type { AgentMessage } from "@/components/agent/types";

const h = 3_600_000;
const now = new Date("2026-11-16T12:00:00Z");
const user = (text: string, at: Date): AgentMessage => ({ role: "user", text, at: at.toISOString() }) as AgentMessage;
const homes = (at: Date): AgentMessage => ({ role: "agent", kind: "shortlist", count: 3, at: at.toISOString() }) as AgentMessage;
const three = [{ availability: "unconfirmed" as const }, { availability: "unconfirmed" as const }, { availability: "unconfirmed" as const }];
const ago = (hours: number) => new Date(now.getTime() - hours * h);
const base = (hours: number, sent = 0, sentHoursAgo: number | null = null) => ({
  messages: [user("2 bedroom in Kicukiro", ago(hours)), homes(ago(hours))],
  shortlist: three,
  lastActivity: ago(hours),
  now,
  sent,
  lastSentAt: sentHoursAgo == null ? null : ago(sentHoursAgo),
  inWindow: true,
});

describe("quietVerdict: when the line follows up", () => {
  it("sends the first ~20 h after the tenant's last word, the second ~3 days after it and a day after the first", () => {
    expect(quietVerdict(base(FIRST_AFTER_MS / h - 1))).toBe("too-soon");
    expect(quietVerdict(base(FIRST_AFTER_MS / h))).toBe("first");
    // After the first: not before 72 h from the tenant's last word, nor within 24 h of the first.
    expect(quietVerdict(base(60, 1, 40))).toBe("too-soon");
    expect(quietVerdict(base(SECOND_AFTER_MS / h, 1, 20))).toBe("too-soon");
    expect(quietVerdict(base(SECOND_AFTER_MS / h, 1, MIN_GAP_MS / h))).toBe("second");
  });

  it("never sends more than two, however long the chat stays quiet", () => {
    expect(FOLLOW_UP_MAX).toBe(2);
    expect(quietVerdict(base(100, 2, 30))).toBe("done");
    expect(quietVerdict(base(100, 5, 30))).toBe("done");
  });

  it("waits for the send window, and gives up on a search gone cold", () => {
    expect(quietVerdict({ ...base(30), inWindow: false })).toBe("quiet-hours");
    expect(quietVerdict({ ...base(100, 1, 40), inWindow: false })).toBe("quiet-hours");
    expect(quietVerdict({ ...base(5), lastActivity: new Date(now.getTime() - QUIET_MAX_MS), sent: 0 })).toBe("cold");
  });

  it("leaves alone a chat that picked a home: the broker loop and the deal sheet own it", () => {
    for (const availability of ["asked", "confirmed", "rented", "no_reply"] as const) {
      expect(quietVerdict({ ...base(30), shortlist: [{ availability }, ...three.slice(1)] })).toBe("picked");
    }
  });

  it("only speaks to a chat that ends on homes", () => {
    const question: AgentMessage = { role: "agent", kind: "ask", field: "maxPrice", at: ago(30).toISOString() } as AgentMessage;
    expect(quietVerdict({ ...base(30), messages: [user("hi", ago(30)), question] })).toBe("not-homes");
    expect(quietVerdict({ ...base(30), shortlist: [] })).toBe("not-homes");
    expect(quietVerdict({ ...base(30), lastActivity: null })).toBe("not-homes");
  });

  it("counts a message answered under the homes as the tenant's last word", () => {
    expect(quietVerdict({ ...base(30), lastActivity: ago(2) })).toBe("too-soon");
  });

  it("reads the one-nudge state of 11-14 as one sent", () => {
    expect(sentCount({ at: "2026-11-15T10:00:00Z" })).toBe(1);
    expect(sentCount({})).toBe(0);
    expect(sentCount({ at: "x", n: 2 })).toBe(2);
    expect(sentCount({ n: 9 })).toBe(2);
  });
});

describe("followUpBlock: the holds", () => {
  const free = { test: false, stopped: false, humanAt: null, personal: false, now };
  it("lets a plain chat through", () => expect(followUpBlock(free)).toBeNull());
  it("never follows up a team number, a STOP, or a personal chat", () => {
    expect(followUpBlock({ ...free, test: true })).toBe("test");
    expect(followUpBlock({ ...free, stopped: true })).toBe("stopped");
    expect(followUpBlock({ ...free, personal: true })).toBe("personal");
  });
  it("holds for 12 h after Abdout wrote in the chat, then lets go", () => {
    expect(followUpBlock({ ...free, humanAt: ago(11) })).toBe("human");
    expect(followUpBlock({ ...free, humanAt: ago(13) })).toBeNull();
  });
});

describe("what a follow-up says", () => {
  const kabeza: OfferHome[] = [
    { id: 6711, bedrooms: 2, zone: "gasabo/kimironko", rent: 350_000 },
    { id: 6720, bedrooms: 2, zone: "gasabo/kimironko", rent: 320_000 },
  ];

  it("first: a new home when one fits, else the one question; second: always the soft close", () => {
    expect(planFollowUp("first", kabeza)).toMatchObject({ kind: "homes" });
    expect(planFollowUp("first", [])).toEqual({ kind: "ask", ask: "budget" });
    expect(planFollowUp("first", [], { maxPrice: 400_000 })).toEqual({ kind: "ask", ask: "budget" });
    expect(planFollowUp("first", [], { area: true })).toEqual({ kind: "ask", ask: "area" });
    expect(planFollowUp("second", kabeza)).toEqual({ kind: "close" });
    expect(planFollowUp("first", [...kabeza, ...kabeza])).toMatchObject({ homes: [{ id: 6711 }, { id: 6720 }] });
  });

  it("names the homes and the code to send, short, in English", () => {
    const t = followUpMessage("en", { kind: "homes", homes: kabeza });
    expect(t).toMatch(/^Hi, it's Mkan\. Two new ones fit what you asked for:/);
    expect(t).toContain("• 2-bedroom in Kimironko, RWF 350,000 a month (K6711)");
    expect(t).toContain("Send its code, like K6711");
    expect(followUpMessage("en", { kind: "homes", homes: [kabeza[0]!] })).toMatch(/A new one just came in.*Send K6711\./);
  });

  it("asks one question, or closes softly — and never mentions a person", () => {
    expect(followUpMessage("en", { kind: "ask", ask: "budget" })).toMatch(/budget fixed.*stretch/);
    expect(followUpMessage("en", { kind: "ask", ask: "area" })).toMatch(/nearby areas/);
    expect(followUpMessage("en", { kind: "close" })).toMatch(/No rush.*Say the word anytime/);
  });

  it("speaks the tenant's language: Arabic, Kinyarwanda, French and Swahili", () => {
    const plans = [{ kind: "homes" as const, homes: kabeza }, { kind: "ask" as const, ask: "budget" as const }, { kind: "ask" as const, ask: "area" as const }, { kind: "close" as const }];
    for (const plan of plans) {
      expect(followUpMessage("ar", plan)).toMatch(/[؀-ۿ]/);
      expect(followUpMessage("rw", plan)).toMatch(/^Muraho, ni Mkan\./);
      expect(followUpMessage("fr", plan)).toMatch(/^Bonjour, c'est Mkan\./);
      expect(followUpMessage("sw", plan)).toMatch(/^Habari, ni Mkan\./);
    }
  });

  it("promises no one: every 'I' is the line, in every language", () => {
    const PERSON = /person|someone|شخص|أحد من|umuntu|une personne|mtu fulani|Osman/i;
    for (const lang of ["en", "ar", "rw", "fr", "sw"] as const) {
      for (const plan of [{ kind: "homes" as const, homes: kabeza }, { kind: "ask" as const, ask: "budget" as const }, { kind: "close" as const }]) {
        expect(followUpMessage(lang, plan), `${lang} ${plan.kind}`).not.toMatch(PERSON);
      }
    }
  });

  it("tells Mkan's person what happened as an FYI, never a task", () => {
    expect(followUpNote("first", { kind: "homes", homes: kabeza })).toBe("first follow-up sent: 2 new Kimironko homes (K6711, K6720), no reply yet");
    expect(followUpNote("first", { kind: "ask", ask: "budget" })).toBe("first follow-up sent: asked one question (budget), no reply yet");
    expect(followUpNote("second", { kind: "close" })).toMatch(/soft close — the line stops here/);
  });

  it("are keyed per chat, labelled for the count, and switch off with MKAN_QUIET_NUDGE=off", () => {
    expect(quietKey("t1")).toBe("quiet:t1");
    expect(QUIET_LABEL).toBe("tenant-quiet-nudge");
    expect(quietNudgeOn(undefined)).toBe(true);
    expect(quietNudgeOn("off")).toBe(false);
  });
});

describe("after the viewing, the line goes on by itself", () => {
  it("liked: the broker hears it at once, the tenant gets the terms and the one question left — which day to sign", () => {
    const t = afterViewingLikedText("en", { title: "2-bed in Remera", rent: 350_000, upfront: 1_050_000, rep: "Osman" });
    expect(t).toBe('Great! I\'ve told the broker you want "2-bed in Remera". Rent is RWF 350,000 a month, and about RWF 1,050,000 is paid when you sign. Which day suits you to sign? Send a day and time and I\'ll fix it with the broker. Osman from Mkan will be there, as at the viewing.');
    expect(afterViewingLikedText("ar", { title: "x", rent: null, upfront: null, rep: "عثمان" })).toMatch(/[؀-ۿ]/);
    expect(afterViewingLikedText("en", { title: "x", rent: null, upfront: null, rep: "Osman" })).not.toMatch(/Rent is/);
    expect(tenantWantsBrokerMessage({ title: "2-bed in Remera", ref: "K5811", rep: "Osman" })).toBe("Good news from Mkan: our tenant wants to take 2-bed in Remera (K5811). Osman from Mkan will arrange the signing with you. Murakoze!");
  });

  it("not for me: the next best homes, or the question that unblocks the search", () => {
    const next: OfferHome[] = [{ id: 6711, bedrooms: 2, zone: "gasabo/kimironko", rent: 350_000 }];
    expect(afterViewingNotHomesText("en", next)).toBe("Thanks for telling me. I found another one:\n• 2-bedroom in Kimironko, RWF 350,000 a month (K6711)\nSend the code, like K6711, and I'll check with its broker that it's free, or tell me what to change.");
    expect(afterViewingNotHomesText("en", [])).toMatch(/What should change/);
    expect(afterViewingNotHomesText("rw", next)).toContain("(K6711)");
  });
});
