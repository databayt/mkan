/**
 * `pnpm tt:inbox`'s decisions (scripts/crm/tiktok-inbox-pure.ts): which lines are new, the burst window, the
 * 12 h hold when a person typed, the queue drain, the two-message reply, the day and the idle gate.
 */
import { describe, expect, it } from "vitest";
import {
  HUMAN_HOLD_MS,
  OUT_PER_RUN,
  OUT_STALE_MS,
  chatVerdict,
  drainPlan,
  idTime,
  idleSeconds,
  inDay,
  isBotText,
  markOf,
  mayAct,
  newerId,
  quietLeft,
  splitReply,
  videoIdIn,
  type DmMsg,
  type OutRow,
} from "../../scripts/crm/tiktok-inbox-pure";
import { recentRow } from "../../scripts/crm/tiktok-inbox";

// TikTok ids carry their time: unix seconds in the high 32 bits.
const idAt = (iso: string, n = 0) => (BigInt(Math.floor(Date.parse(iso) / 1000)) * BigInt(2 ** 32) + BigInt(n)).toString();
const NOW = new Date("2026-11-22T16:30:00Z");
const msg = (iso: string, mine: boolean, text: string, extra: Partial<DmMsg> = {}): DmMsg => ({ id: idAt(iso), mine, text, videoId: null, ...extra });

describe("message ids", () => {
  it("decodes the send time from the id (the real id of a Nov 21 23:03 CAT message)", () => {
    expect(idTime("7710733276012692993")?.toISOString()).toBe("2026-11-21T21:03:11.000Z");
    expect(idTime("12")).toBeNull();
    expect(idTime("not-an-id")).toBeNull();
  });
  it("orders ids numerically, and a missing seen id is older than everything", () => {
    expect(newerId("7710733276012692993", "7696528511733859847")).toBe(true);
    expect(newerId("9", "10")).toBe(false); // numeric, not lexical
    expect(newerId("5", null)).toBe(true);
  });
  it("reads a video id from a link", () => {
    expect(videoIdIn("https://www.tiktok.com/@mkan.rw/video/7677896079379090696?lang=en")).toBe("7677896079379090696");
    expect(videoIdIn("hello")).toBeNull();
  });
});

describe("burst grouping: the tenant's lines wait for a quiet chat", () => {
  const lines = (secsAgo: number[]) => secsAgo.map((s, i) => ({ id: String(i), text: `l${i}`, sentAt: new Date(NOW.getTime() - s * 1000) }));
  it("is not ready while the newest line is under 25 s old", () => {
    expect(quietLeft(lines([60, 10]), NOW)).toBe(15_000);
  });
  it("is ready once 25 s of quiet have passed", () => {
    expect(quietLeft(lines([90, 40]), NOW)).toBeLessThanOrEqual(0);
  });
  it("answers one burst with every unanswered line in order", () => {
    const v = chatVerdict({
      msgs: [msg("2026-11-22T16:28:00Z", false, "Mwiriwe"), msg("2026-11-22T16:28:20Z", false, "ndashaka inzu i Kimironko"), msg("2026-11-22T16:28:50Z", false, "70k")],
      sent: [],
      seenId: null,
      botWasHere: false,
      now: NOW,
    });
    expect(v.act).toBe("answer");
    if (v.act === "answer") expect(v.lines.map((l) => l.text)).toEqual(["Mwiriwe", "ndashaka inzu i Kimironko", "70k"]);
  });
});

describe("which lines are new", () => {
  const sent = [markOf("Muraho! Ni Mkan 👋 Iyo nzu ni K6972")];
  it("skips a chat whose last message is ours and nothing new came", () => {
    const v = chatVerdict({ msgs: [msg("2026-11-22T16:00:00Z", false, "How much"), msg("2026-11-22T16:01:00Z", true, "Muraho! Ni Mkan 👋 Iyo nzu ni K6972")], sent, seenId: null, botWasHere: true, now: NOW });
    expect(v).toMatchObject({ act: "skip", why: "ours-last" });
  });
  it("takes only the lines after our last message", () => {
    const v = chatVerdict({
      msgs: [msg("2026-11-22T16:00:00Z", false, "How much"), msg("2026-11-22T16:01:00Z", true, "Muraho! Ni Mkan 👋 Iyo nzu ni K6972"), msg("2026-11-22T16:20:00Z", false, "ok can I see it")],
      sent,
      seenId: null,
      botWasHere: true,
      now: NOW,
    });
    expect(v.act === "answer" && v.lines.map((l) => l.text)).toEqual(["ok can I see it"]);
  });
  it("does not answer a line already seen", () => {
    const m = msg("2026-11-22T16:20:00Z", false, "ok");
    expect(chatVerdict({ msgs: [m], sent: [], seenId: m.id, botWasHere: false, now: NOW })).toMatchObject({ act: "skip", why: "no-new" });
  });
  it("leaves lines older than 12 h to a person", () => {
    expect(chatVerdict({ msgs: [msg("2026-11-22T02:00:00Z", false, "still there?")], sent: [], seenId: null, botWasHere: false, now: NOW })).toMatchObject({ act: "skip", why: "old" });
  });
  it("a placeholder for a message type the web cannot show is not words", () => {
    const m = msg("2026-11-22T16:20:00Z", false, "[This message type isn’t supported. Download TikTok app to view this message.]");
    expect(chatVerdict({ msgs: [m], sent: [], seenId: null, botWasHere: false, now: NOW })).toMatchObject({ act: "skip" });
  });
  it("a shared video is a line, and keeps its video id", () => {
    const m = msg("2026-11-22T16:20:00Z", false, "", { videoId: "7677896079379090696" });
    const v = chatVerdict({ msgs: [m], sent: [], seenId: null, botWasHere: false, now: NOW });
    expect(v.act === "answer" && v.videos).toEqual({ [m.id]: "7677896079379090696" });
  });
});

describe("hold: a person at Mkan typed in the chat", () => {
  const theirs = msg("2026-11-22T16:20:00Z", false, "and the price?");
  it("holds the chat 12 h after a message of ours the bot did not type", () => {
    const person = msg("2026-11-22T10:00:00Z", true, "Hi, this is Abdout — I will check it for you");
    const v = chatVerdict({ msgs: [msg("2026-11-22T09:00:00Z", false, "hello"), person, theirs], sent: [], seenId: null, botWasHere: false, now: NOW });
    expect(v).toMatchObject({ act: "skip", why: "hold" });
    expect(v.humanAt?.toISOString()).toBe("2026-11-22T10:00:00.000Z");
  });
  it("the hold runs out after HUMAN_HOLD_MS", () => {
    const person = msg("2026-11-22T03:00:00Z", true, "I will check it for you");
    const v = chatVerdict({ msgs: [msg("2026-11-22T02:00:00Z", false, "hello"), person, theirs], sent: [], seenId: null, botWasHere: false, now: NOW });
    expect(NOW.getTime() - Date.parse("2026-11-22T03:00:00Z")).toBeGreaterThan(HUMAN_HOLD_MS);
    expect(v.act).toBe("answer");
  });
  it("the bot's own typed words are never a person: matched by hash, or by their start", () => {
    const typed = "Muraho! Ni Mkan 👋 Iyo nzu ni K6972: icyumba kimwe i Gikondo, 70k ku kwezi. Wifuza kuyisura ryari?";
    expect(isBotText(typed, [markOf(typed)])).toBe(true);
    // TikTok clipped the end of a long message: the start still matches.
    expect(isBotText(typed.slice(0, 60), [{ h: "x", p: markOf(typed).p }])).toBe(true);
    expect(isBotText("Hi, this is Abdout", [markOf(typed)])).toBe(false);
    const v = chatVerdict({ msgs: [msg("2026-11-22T16:01:00Z", false, "hello"), msg("2026-11-22T16:02:00Z", true, typed), theirs], sent: [markOf(typed)], seenId: null, botWasHere: true, now: NOW });
    expect(v.act).toBe("answer");
  });
  it("a chat that opened with OUR message is a person's own conversation, never the agent's", () => {
    const v = chatVerdict({ msgs: [msg("2026-10-20T10:00:00Z", true, "Hi, I'm Abdout, a software engineer"), msg("2026-11-22T16:20:00Z", false, "Yeah")], sent: [], seenId: null, botWasHere: false, now: NOW });
    expect(v).toMatchObject({ act: "skip", why: "personal" });
  });
  it("…unless the bot has talked there (a tenant the agent already serves)", () => {
    const v = chatVerdict({ msgs: [msg("2026-10-20T10:00:00Z", true, "Hi, I'm Abdout"), msg("2026-11-22T16:20:00Z", false, "Yeah")], sent: [], seenId: null, botWasHere: true, now: NOW });
    expect(v.act).toBe("answer");
  });
});

describe("the queue drain", () => {
  const row = (id: string, handle: string, hoursAgo: number): OutRow => ({ id, handle, text: "t", label: "broker-answer", at: new Date(NOW.getTime() - hoursAgo * 3_600_000).toISOString() });
  it("sends the rest oldest first, drops the stale, and keeps a held or busy handle waiting", () => {
    const plan = drainPlan([row("a", "ann", 1), row("b", "bob", 2), row("c", "cy", 50), row("d", "dee", 3), row("e", "ann", 4)], { now: NOW, held: new Set(["bob"]), busy: new Set(["dee"]) });
    expect(plan.send.map((r) => r.id)).toEqual(["e", "a"]);
    expect(plan.wait.map((r) => r.id).sort()).toEqual(["b", "d"]);
    expect(plan.drop.map((r) => r.id)).toEqual(["c"]);
    expect(OUT_STALE_MS).toBe(48 * 3_600_000);
  });
  it("sends at most OUT_PER_RUN per pass, the rest waits", () => {
    const rows = Array.from({ length: OUT_PER_RUN + 3 }, (_, i) => row(`m${i}`, `h${i}`, 1 + i / 100));
    const plan = drainPlan(rows, { now: NOW, held: new Set() });
    expect(plan.send).toHaveLength(OUT_PER_RUN);
    expect(plan.wait).toHaveLength(3);
  });
});

describe("the reply is at most two messages", () => {
  it("one paragraph → one message", () => expect(splitReply("Muraho! Ni Mkan 👋 K6972 ni 70k.")).toEqual(["Muraho! Ni Mkan 👋 K6972 ni 70k."]));
  it("a blank line → two; any later blank line stays inside the second", () => {
    expect(splitReply("Here are two homes:\n\n*1. A*\nlink\n\n*2. B*\nlink")).toEqual(["Here are two homes:", "*1. A*\nlink\n\n*2. B*\nlink"]);
  });
  it("empty → nothing", () => expect(splitReply("  \n ")).toEqual([]));
});

describe("when the job acts", () => {
  it("07:00–22:00 Kigali (UTC+2)", () => {
    expect(inDay(new Date("2026-11-22T04:59:00Z"))).toBe(false); // 06:59
    expect(inDay(new Date("2026-11-22T05:00:00Z"))).toBe(true); // 07:00
    expect(inDay(new Date("2026-11-22T19:50:00Z"))).toBe(true); // 21:50
    expect(inDay(new Date("2026-11-22T20:00:00Z"))).toBe(true); // 22:00 — the last tick
    expect(inDay(new Date("2026-11-22T20:10:00Z"))).toBe(false);
  });
  it("only after 120 s of HID idle; an unreadable idle time is a no", () => {
    expect(idleSeconds('    | |   "HIDIdleTime" = 79683660083')).toBe(79);
    expect(mayAct(79)).toBe(false);
    expect(mayAct(120)).toBe(true);
    expect(mayAct(null)).toBe(false);
  });
  it("the inbox's own list times: today, yesterday and older rows", () => {
    const now = new Date("2026-11-22T16:30:00");
    expect(recentRow("18:03", now)).toBe(true);
    expect(recentRow("11/21/2026", now)).toBe(true);
    expect(recentRow("11/3/2026", now)).toBe(false);
    expect(recentRow("Yesterday", now)).toBe(true);
  });
});
