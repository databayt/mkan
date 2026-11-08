import { describe, expect, it } from "vitest";

import en from "@/components/internationalization/en.json";
import ar from "@/components/internationalization/ar.json";
import rw from "@/components/internationalization/rw.json";
import { buildSamples, growth, type ScoreRaw } from "@/lib/monetize/score-samples";
import { judgePart, PARTS, progressOf, scorecard, scoreMetrics, wordOf } from "@/lib/monetize/scorecard";

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-07T12:00:00Z");

function raw(over: Partial<ScoreRaw> = {}): ScoreRaw {
  return {
    now: NOW,
    post: [
      { at: NOW - 4 * DAY, posts: 5, views: 1000, followers: 10 },
      { at: NOW - 2 * DAY, posts: 11, views: 1800, followers: 16 },
      { at: NOW, posts: 17, views: 2248, followers: 20 },
    ],
    post30: null,
    people30: 20,
    returning30: 2,
    tiktokPeople30: 20,
    asks: { sent: 125, answered: 30, tasks: 18, yes: 12 },
    picks: { shown: 10, picked: 2 },
    told: { asked: 18, told3h: 4, answers: 15, told1h: 12 },
    deals: { booked: 0, viewed: 0, paid: 0 },
    brokers: { asked: 18, optOut: 0, saidYes: 12, agreed: 0, replyMedianMin: 95, replyN: 6 },
    feedback: { tenantAvg: null, tenantN: 0, brokerAvg: null, brokerN: 0, up: 0, down: 0 },
    messagesToAsk: { median: 3, n: 12 },
    stops: 0,
    waTenants: 12,
    week: { people: 10, shortlisted: 9, tasks: 15, failed: 0, p50: 1200, turns: 9, messages: 40, handoffs: 2, evalReader: 0.93 },
    ...over,
  };
}

describe("scorecard", () => {
  it("measures progress toward a target either way", () => {
    expect(progressOf(">=", 15, 30)).toBe(0.5);
    expect(progressOf(">=", 60, 30)).toBe(1);
    expect(progressOf("<=", 1200, 3000)).toBe(1);
    expect(progressOf("<=", 6000, 3000)).toBe(0.5);
    expect(wordOf(85)).toBe("strong");
    expect(wordOf(60)).toBe("ok");
    expect(wordOf(10)).toBe("weak");
    expect(wordOf(null)).toBe("thin");
  });

  it("leaves a part with too little sample out of its tile, and a tile with none says so", () => {
    const def = PARTS.find((p) => p.key === "tenantRating")!;
    expect(judgePart(def, { value: 5, n: 1 }).status).toBe("thin");
    const view = scorecard(buildSamples(raw()).samples);
    const tenants = view.tiles.find((t) => t.key === "tenants")!;
    // Ratings and thumbs are empty; returning (20 people), no STOP (12) and answered in 3 h (18 chats) count.
    expect(tenants.parts.filter((p) => p.status !== "thin").map((p) => p.key)).toEqual(["returning", "noStop", "answeredIn3h"]);
    const empty = scorecard({});
    expect(empty.tiles.every((t) => t.score == null && t.word === "thin")).toBe(true);
    expect(empty.weakest).toBeNull();
  });

  it("names yes → viewing as the weak arrow when brokers say yes and nothing is booked", () => {
    const { samples, counts } = buildSamples(raw());
    const view = scorecard(samples, counts);
    expect(view.funnel.weakest).toBe("viewing");
    expect(view.weakest).toEqual({ tile: "doing", part: "yesToViewing" });
    const doing = view.tiles.find((t) => t.key === "doing")!;
    expect(doing.weakest).toBe("yesToViewing");
    // A chain: one hand-off at 0% means no deals, whatever the other steps do.
    expect(doing.score).toBe(0);
    expect(doing.word).toBe("weak");
    expect(view.funnel.steps.map((s) => s.count)).toEqual([17, 2248, 20, 18, 12, 0, 0, 0]);
  });

  it("reads posts a day and followers a week from the hourly post snapshots", () => {
    const r = raw();
    // 12 posts over 4 days: 3 a day; 10 followers over 4 days: 17.5 a week.
    expect(growth(r.post, (p) => p.posts, NOW, 7, 1)).toEqual({ value: 3, n: 4 });
    expect(growth(r.post, (p) => p.followers, NOW, 7, 7)).toEqual({ value: 17.5, n: 4 });
    expect(growth([r.post[0]!], (p) => p.posts, NOW, 7, 1)).toEqual({ value: null, n: 0 });
    // A page older than the window: the base is the point nearest before 7 days ago.
    const old = [{ at: NOW - 10 * DAY, posts: 2, views: 0, followers: 0 }, { at: NOW - 7 * DAY, posts: 3, views: 0, followers: 0 }, ...r.post];
    expect(growth(old, (p) => p.posts, NOW, 7, 1).value).toBeCloseTo(14 / 7);
  });

  it("gives the loop flat keys: the four scores, the weakest part, each counted part", () => {
    const m = scoreMetrics(scorecard(buildSamples(raw()).samples));
    expect(m["score.weakest"]).toBe("yesToViewing");
    expect(typeof m["score.doing"]).toBe("number");
    expect(m["part.yesToViewing"]).toBe(0);
    expect(m["part.tenantRating"]).toBeNull();
  });

  it("has a label, a meaning and a fix for every part, in every language", () => {
    for (const dict of [en, ar, rw]) {
      const L = (dict as typeof en).monetize.score;
      for (const p of PARTS) {
        const part = (L.parts as Record<string, { t: string; means: string; fix: string }>)[p.key];
        expect(part?.t, p.key).toBeTruthy();
        expect(part?.means, p.key).toBeTruthy();
        expect(part?.fix, p.key).toBeTruthy();
      }
    }
  });
});

describe("the chatbot is judged on real renters' outcomes (2026-11-08)", () => {
  it("counts picks and hearing back; homes shown is an aside that never counts or leads", () => {
    const view = scorecard(buildSamples(raw()).samples);
    const bot = view.tiles.find((t) => t.key === "chatbot")!;
    const part = (k: string) => bot.parts.find((p) => p.key === k)!;
    // 2 of 10 tenants who got homes picked one: half the 40% target. 12 of 15 answers reached them within the hour.
    expect(part("pickRate").value).toBeCloseTo(0.2);
    expect(part("pickRate").progress).toBeCloseTo(0.5);
    expect(part("toldIn1h").value).toBeCloseTo(0.8);
    expect(bot.weakest).toBe("pickRate");
    // 9 of 10 got homes: shown, but out of the score and never the weakest.
    expect(part("peopleToHomes").aside).toBe(true);
    const withoutAside = scorecard(buildSamples(raw({ week: { ...raw().week, shortlisted: 1 } })).samples).tiles.find((t) => t.key === "chatbot")!;
    expect(withoutAside.score).toBe(bot.score);
    expect(withoutAside.weakest).toBe("pickRate");
  });

  it("has no percentage until real renters got homes: fast and error-free for us is not effective", () => {
    // 11-08 on production: no real WhatsApp tenant had got homes, while speed, errors and the quality test were all on target.
    const view = scorecard(buildSamples(raw({ picks: { shown: 0, picked: 0 } })).samples);
    const bot = view.tiles.find((t) => t.key === "chatbot")!;
    expect(bot.parts.find((p) => p.key === "replyP50")!.status).toBe("met");
    expect(bot.score).toBeNull();
    expect(bot.word).toBe("thin");
    expect(scoreMetrics(view)["score.chatbot"]).toBeNull();
  });

  it("hears back = the tenant was told within 3 h of their pick, not the broker answering", () => {
    const tenants = scorecard(buildSamples(raw()).samples).tiles.find((t) => t.key === "tenants")!;
    const heard = tenants.parts.find((p) => p.key === "answeredIn3h")!;
    expect(heard.value).toBeCloseTo(4 / 18);
    expect(heard.n).toBe(18);
  });

  it("reads TikTok viewers who write from TikTok's own chats: 0% when none came from a post, and that leads the road", () => {
    const { samples, counts } = buildSamples(raw({ tiktokPeople30: 0 }));
    expect(samples.viewsToChats).toEqual({ value: 0, n: 2248 });
    // 0% at the top of the road ties 0% at yes → viewing; the road's order puts the first break first.
    const view = scorecard(samples, counts);
    expect(view.weakest).toEqual({ tile: "doing", part: "viewsToChats" });
    expect(view.funnel.weakest).toBe("chats");
    expect(buildSamples(raw({ tiktokPeople30: 22 })).samples.viewsToChats.value).toBeCloseTo(22 / 2248);
  });
});

describe("the chain and the averages", () => {
  it("multiplies the road's hand-offs, and averages the other tiles", () => {
    const view = scorecard({
      viewsPerPost: { value: 100, n: 10 }, // 50%
      viewsToChats: { value: 0.01, n: 1000 },
      chatsToAsked: { value: 0.15, n: 20 }, // 50%
      brokerAnswerRate: { value: 0.15, n: 50 }, // 50%
      brokerStayed: { value: 1, n: 50 },
    });
    const doing = view.tiles.find((t) => t.key === "doing")!;
    expect(doing.score).toBe(25);
    expect(view.tiles.find((t) => t.key === "brokers")!.score).toBe(75);
  });

  it("puts TikTok first: posting, followers, views, likes, interactions and the follow rate", () => {
    const { samples } = buildSamples(
      raw({
        post: [
          { at: NOW - 4 * DAY, posts: 5, views: 1000, followers: 10, likes: 30, talk: 2 },
          { at: NOW, posts: 17, views: 2248, followers: 20, likes: 56, talk: 4 },
        ],
      }),
    );
    const tiktok = scorecard(samples).tiles[0]!;
    expect(tiktok.key).toBe("tiktok");
    const part = (k: string) => tiktok.parts.find((p) => p.key === k)!;
    expect(part("likeRate").value).toBeCloseTo(56 / 2248);
    expect(part("engageRate").value).toBeCloseTo(60 / 2248);
    // 10 followers over 1,248 views in the same 4 days.
    expect(part("followRate").value).toBeCloseTo(10 / 1248);
    expect(part("viewsWeek").value).toBeCloseTo((1248 / 4) * 7);
    expect(tiktok.score).toBeGreaterThan(0);
  });
});
