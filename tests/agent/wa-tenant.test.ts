import { describe, expect, it } from "vitest";
import { HOOK_MISS_ALERT_AT, HOOK_MISS_WINDOW_MS, HUMAN_HOLD_MS, isDirectChat, isTenantStop, langOfWords, lateLead, MAX_AGE_MS, noteMisses, PER_PHONE_PER_HOUR, startText, stopConfirmText, tenantDecision, typePleaseText } from "../../scripts/wa/tenant-pure";

const now = new Date("2026-10-24T10:00:00Z");
const base = { text: "2 bedroom in Kicukiro", sentAt: now, now, stopped: false, humanAt: null, phoneRepliesLastHour: 0, lineRepliesLastHour: 0 };

describe("tenantDecision", () => {
  it("answers a fresh message from a tenant", () => {
    expect(tenantDecision(base)).toBe("answer");
  });
  it("honours STOP and START", () => {
    expect(tenantDecision({ ...base, text: "STOP" })).toBe("stop");
    expect(tenantDecision({ ...base, text: "hagarika" })).toBe("stop");
    expect(tenantDecision({ ...base, stopped: true })).toBe("skip-stopped");
    expect(tenantDecision({ ...base, text: "start", stopped: true })).toBe("start");
  });
  it("stays quiet while a person handles the chat, on old messages and over the ceiling", () => {
    expect(tenantDecision({ ...base, humanAt: new Date(now.getTime() - HUMAN_HOLD_MS + 60_000) })).toBe("skip-human");
    expect(tenantDecision({ ...base, humanAt: new Date(now.getTime() - HUMAN_HOLD_MS - 60_000) })).toBe("answer");
    expect(tenantDecision({ ...base, sentAt: new Date(now.getTime() - MAX_AGE_MS - 1) })).toBe("skip-old");
    expect(tenantDecision({ ...base, phoneRepliesLastHour: PER_PHONE_PER_HOUR })).toBe("skip-rate");
    expect(tenantDecision({ ...base, text: "  " })).toBe("skip-empty");
  });
  it("a tenant's STOP is the whole message, in every language the line hears", () => {
    for (const t of ["STOP", "Stop!", "stop.", "please stop", "Please, stop", "stop messaging me", "Stop sending me messages", "stop it", "hagarika", "Arrêtez", "arrete", "unsubscribe", "توقف", "أوقف الرسائل", "don't message me again", "leave me alone"]) {
      expect(isTenantStop(t), t).toBe(true);
      expect(tenantDecision({ ...base, text: t }), t).toBe("stop");
    }
  });
  it("a complaint about the homes is a change to the search, not a STOP (2026-11-08)", () => {
    for (const t of ["Stop sending me Kicukiro", "you keep sending the same houses", "dont send me those again", "this is a wrong number", "wrong number for the broker", "you keep on sending expensive ones", "stop by tomorrow", "sinshaka", "I want to stop renting in Remera"]) {
      expect(isTenantStop(t), t).toBe(false);
      expect(tenantDecision({ ...base, text: t }), t).toBe("answer");
    }
  });
  it("tells the tenant STOP worked and how to come back, and welcomes them back", () => {
    for (const lang of ["en", "ar", "rw"]) expect(stopConfirmText(lang)).toContain("START");
    expect(stopConfirmText("ar")).toMatch(/[؀-ۿ]/);
    expect(startText("en")).toMatch(/budget/i);
    expect(startText("rw")).toMatch(/ibyumba/);
    expect(langOfWords("hagarika")).toBe("rw");
    expect(langOfWords("توقف")).toBe("ar");
    expect(langOfWords("STOP")).toBeNull();
  });
  it("answers up to 12 h late, saying sorry; older is a person's (2026-11-08: it dropped anything past 60 min)", () => {
    expect(MAX_AGE_MS).toBe(12 * 3_600_000);
    expect(tenantDecision({ ...base, sentAt: new Date(now.getTime() - 11 * 3_600_000) })).toBe("answer");
    expect(tenantDecision({ ...base, sentAt: new Date(now.getTime() - 13 * 3_600_000) })).toBe("skip-old");
    expect(lateLead("en")).toMatch(/sorry/i);
    expect(lateLead("ar")).toMatch(/[؀-ۿ]/);
    expect(lateLead("rw")).toMatch(/Mbabarira/);
  });
  it("only one-to-one chats are tenants", () => {
    expect(isDirectChat("250780000001@s.whatsapp.net")).toBe(true);
    expect(isDirectChat("1203630@g.us")).toBe(false);
    expect(isDirectChat("status@broadcast")).toBe(false);
  });
});

describe("messages the webhook never delivered", () => {
  const at = (msAgo: number) => new Date(now.getTime() - msAgo);
  it("a miss or two after a restart stays quiet; a third in the window tells #mkan once", () => {
    let s = noteMisses({ ids: [] }, [{ id: "a", sentAt: at(3 * 60_000) }], now);
    expect(s.alert).toBeNull();
    s = noteMisses(s.next, [{ id: "b", sentAt: at(3 * 60_000) }], now);
    expect(s.alert).toBeNull();
    s = noteMisses(s.next, [{ id: "c", sentAt: at(3 * 60_000) }], now);
    expect(s.alert).toMatchObject({ count: HOOK_MISS_ALERT_AT });
    expect(noteMisses(s.next, [{ id: "d", sentAt: at(3 * 60_000) }], now).alert).toBeNull();
  });
  it("one message that waited half an hour is enough", () => {
    expect(noteMisses({ ids: [] }, [{ id: "a", sentAt: at(40 * 60_000) }], now).alert).toMatchObject({ count: 1, oldestMin: 40 });
  });
  it("the same message seen on every pass counts once, and old misses age out", () => {
    let s = noteMisses({ ids: [] }, [{ id: "a", sentAt: at(3 * 60_000) }], now);
    s = noteMisses(s.next, [{ id: "a", sentAt: at(3 * 60_000) }], now);
    expect(s.next.ids).toHaveLength(1);
    const later = new Date(now.getTime() + HOOK_MISS_WINDOW_MS + 60_000);
    expect(noteMisses(s.next, [], later).next.ids).toHaveLength(0);
  });
});

describe("a voice note, photo or location", () => {
  it("is answered with 'please type', not silence", () => {
    expect(tenantDecision({ ...base, text: "", media: true })).toBe("media");
    expect(tenantDecision({ ...base, text: "" })).toBe("skip-empty");
  });

  it("still respects STOP, a person's chat and the age limit", () => {
    expect(tenantDecision({ ...base, text: "", media: true, stopped: true })).toBe("skip-stopped");
    expect(tenantDecision({ ...base, text: "", media: true, humanAt: new Date(now.getTime() - 60_000) })).toBe("skip-human");
    expect(tenantDecision({ ...base, text: "", media: true, sentAt: new Date(now.getTime() - MAX_AGE_MS - 60_000) })).toBe("skip-old");
  });

  it("a photo with a caption is read as words", () => {
    expect(tenantDecision({ ...base, text: "2 bedroom in Remera", media: true })).toBe("answer");
  });

  it("asks in the chat's language", () => {
    expect(typePleaseText("en")).toMatch(/type/i);
    expect(typePleaseText("ar")).toMatch(/[؀-ۿ]/);
    expect(typePleaseText("rw")).toMatch(/andika/i);
  });
});
