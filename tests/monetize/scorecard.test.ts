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
    asks: { sent: 125, answered: 30, tasks: 18, yes: 12, fast: 4 },
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

describe("the chain and the averages", () => {
  it("multiplies the road's hand-offs, keeps followers aside, and averages the other tiles", () => {
    const view = scorecard({
      postsPerDay: { value: 3, n: 7 },
      followersWeek: { value: 2, n: 7 }, // 10% of target, aside: shown, not in the percentage
      viewsPerPost: { value: 100, n: 10 }, // 50%
      viewsToChats: { value: 0.01, n: 1000 },
      chatsToAsked: { value: 0.15, n: 20 }, // 50%
      brokerAnswerRate: { value: 0.15, n: 50 }, // 50%
      brokerStayed: { value: 1, n: 50 },
    });
    const doing = view.tiles.find((t) => t.key === "doing")!;
    expect(doing.score).toBe(25);
    expect(doing.weakest).toBe("followersWeek");
    expect(view.tiles.find((t) => t.key === "brokers")!.score).toBe(75);
  });
});
