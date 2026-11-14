/**
 * One nudge for a tenant who went quiet under the homes (2026-11-14). Six of eight WhatsApp chats between
 * 11-05 and 11-13 ended right after the homes went out, and the line never wrote again.
 */
import { describe, expect, it } from "vitest";
import { afterViewingWantText, tenantWantsBrokerMessage } from "@/components/agent/deal-pure";
import { QUIET_AWAKE_HOURS, QUIET_LABEL, QUIET_MAX_MS, quietKey, quietNudgeMessage, quietNudgeOn, quietVerdict } from "@/components/agent/quiet-nudge-pure";
import type { AgentMessage } from "@/components/agent/types";

const h = 3_600_000;
const now = new Date("2026-11-16T12:00:00Z");
const user = (text: string, at: Date): AgentMessage => ({ role: "user", text, at: at.toISOString() }) as AgentMessage;
const homes = (at: Date): AgentMessage => ({ role: "agent", kind: "shortlist", count: 3, at: at.toISOString() }) as AgentMessage;
const three = [{ availability: "unconfirmed" as const }, { availability: "unconfirmed" as const }, { availability: "unconfirmed" as const }];
const ago = (hours: number) => new Date(now.getTime() - hours * h);
const base = (hours: number) => ({
  messages: [user("2 bedroom in Kicukiro", ago(hours)), homes(ago(hours))],
  shortlist: three,
  lastActivity: ago(hours),
  now,
  awakeMs: hours * h,
  nudged: false,
  inWindow: true,
});

describe("quietVerdict", () => {
  it("nudges once, three daytime hours after the tenant's last word under the homes", () => {
    expect(quietVerdict(base(QUIET_AWAKE_HOURS - 1))).toBe("too-soon");
    expect(quietVerdict(base(QUIET_AWAKE_HOURS))).toBe("nudge");
    expect(quietVerdict({ ...base(5), nudged: true })).toBe("nudged");
  });

  it("waits for the send window, and gives up on a search gone cold", () => {
    expect(quietVerdict({ ...base(5), inWindow: false })).toBe("quiet-hours");
    expect(quietVerdict({ ...base(5), lastActivity: new Date(now.getTime() - QUIET_MAX_MS), awakeMs: 30 * h })).toBe("cold");
  });

  it("leaves alone a chat that picked a home: the broker loop and the deal sheet own it", () => {
    for (const availability of ["asked", "confirmed", "rented", "no_reply"] as const) {
      expect(quietVerdict({ ...base(5), shortlist: [{ availability }, ...three.slice(1)] })).toBe("picked");
    }
  });

  it("only speaks to a chat that ends on homes", () => {
    const question: AgentMessage = { role: "agent", kind: "ask", field: "maxPrice", at: ago(5).toISOString() } as AgentMessage;
    expect(quietVerdict({ ...base(5), messages: [user("hi", ago(5)), question] })).toBe("not-homes");
    expect(quietVerdict({ ...base(5), shortlist: [] })).toBe("not-homes");
    expect(quietVerdict({ ...base(5), lastActivity: null })).toBe("not-homes");
  });

  it("counts a message answered under the homes as the tenant's last word", () => {
    // Homes at 09:00, "how many bathrooms?" answered at 11:30 (a trace row only): not quiet yet at 12:00.
    expect(quietVerdict({ ...base(3), lastActivity: ago(0.5), awakeMs: 0.5 * h })).toBe("too-soon");
  });
});

describe("the words", () => {
  it("ask once, with both ways to go on, and promise no one", () => {
    expect(quietNudgeMessage("en", 3)).toBe("Hi, it's Mkan. Did any of the homes I sent fit? Send its number, 1 to 3, and I'll check with its broker that it's still free, or tell me what to change: the area, the budget or the bedrooms.");
    expect(quietNudgeMessage("en", 1)).toContain("Send its number, 1, and");
    expect(quietNudgeMessage("ar", 3)).toMatch(/[؀-ۿ]/);
    for (const lang of ["en", "ar", "rw"] as const) expect(quietNudgeMessage(lang, 3)).not.toMatch(/person|someone|شخص|أحد من|umuntu/i);
  });

  it("are keyed per chat, labelled for the count, and switch off with MKAN_QUIET_NUDGE=off", () => {
    expect(quietKey("t1")).toBe("quiet:t1");
    expect(QUIET_LABEL).toBe("tenant-quiet-nudge");
    expect(quietNudgeOn(undefined)).toBe(true);
    expect(quietNudgeOn("off")).toBe(false);
  });
});

describe("after the viewing, a tenant who wants the home", () => {
  it("hears what the line did, and who arranges the signing", () => {
    const t = afterViewingWantText("en", "2-bed in Remera", "Osman");
    expect(t).toBe('Great! I\'ve told the broker you want "2-bed in Remera". Osman from Mkan, who came to the viewing with you, arranges the signing and what to pay with you both.');
    expect(t).not.toMatch(/come back to you here/);
    expect(afterViewingWantText("ar", "x", "عثمان")).toMatch(/[؀-ۿ]/);
  });

  it("and the broker is told at once, without the tenant's number", () => {
    const t = tenantWantsBrokerMessage({ title: "2-bed in Remera", ref: "K5811", rep: "Osman" });
    expect(t).toBe("Good news from Mkan: our tenant wants to take 2-bed in Remera (K5811). Osman from Mkan will arrange the signing with you. Murakoze!");
    expect(t).not.toMatch(/\+?\d{9,}/);
  });
});
