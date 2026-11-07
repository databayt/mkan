import { describe, expect, it } from "vitest";

import { ROADMAP, roadmapAhead, roadmapNext, roadmapWeek, roadTaskPrompt, rungsView } from "@/lib/monetize/roadmap";
import { mentionsGated, monthTitle, roadmapPlan, validatePlan, weekWindow } from "@/lib/monetize/sprint-auto";

// The live metric keys (scripts/sprint/live.ts → readMetrics, read 2026-11-07): a task on any other key
// could never be measured by the loop.
const LIVE_KEYS =
  "newHomes found read skipRate newBrokers brokersTotal brokersNewWeek videosClean videosFeatured videoRejectRate readyNew mastered backlog viewsPerPost postedDays7 likeRate followers engageRate postsListing contactsPerPost chatToPaid chats waChats webChats shortlistRate p50 brokerAnswerRate viewings paidDeals failRate people peopleToHomes peopleToViewing revenueMonthRwf breakEvenRwf netRwf costMonthRwf brokersAsked brokersAnswered brokersAvailable viewingsBooked shortlisted adChats paid7 signed7 viewings7 intros introsLeft score.doing score.brokers score.tenants score.chatbot".split(
    " ",
  );
const metrics = Object.fromEntries(LIVE_KEYS.map((k) => [k, 0]));

describe("the road to money", () => {
  it("is a chain of Monday → Monday weeks with no gaps", () => {
    for (let i = 0; i < ROADMAP.length; i++) {
      const s = ROADMAP[i]!;
      expect(new Date(`${s.startsAt}T00:00:00Z`).getUTCDay(), s.key).toBe(1);
      expect(weekWindow(new Date(`${s.startsAt}T12:00:00Z`))).toEqual({ startsAt: s.startsAt, endsAt: s.endsAt });
      if (i > 0) expect(s.startsAt, s.key).toBe(ROADMAP[i - 1]!.endsAt);
    }
  });

  it("names a live metric for every sprint and task, and never tells a run to send", () => {
    for (const s of ROADMAP) {
      expect(LIVE_KEYS, s.key).toContain(s.metric);
      for (const t of s.tasks) {
        expect(LIVE_KEYS, `${s.key} ${t.title}`).toContain(t.metric);
        expect(mentionsGated(roadTaskPrompt(t, s)), `${s.key} ${t.title}`).toBe(false);
      }
    }
  });

  it("finds this week's sprint and the ones after it", () => {
    const now = new Date("2026-11-10T09:00:00Z");
    expect(roadmapWeek(now)?.key).toBe("S2");
    expect(roadmapNext(now, 2).map((s) => s.key)).toEqual(["S3", "S4"]);
    expect(roadmapAhead(now)).toBe(ROADMAP.length - 2);
    expect(roadmapWeek(new Date("2027-03-01T00:00:00Z"))).toBeNull();
  });

  it("plans a week from its roadmap entry, and the plan passes the planner's own checks", () => {
    const now = new Date("2026-11-10T09:00:00Z");
    const plan = roadmapPlan(now)!;
    expect(plan.title).toBe("First intros");
    expect(plan.tasks.length).toBe(plan.prompts.length);
    const v = validatePlan({ sprints: [plan] }, metrics, now);
    expect(v.ok ? [] : v.errors).toEqual([]);
    // A gated task still runs: it prepares and stops blocked with the ask.
    expect(plan.prompts.some((p) => /stop and report blocked/.test(p.text))).toBe(true);
    expect(roadmapPlan(new Date("2026-11-04T09:00:00Z"))).toBeNull(); // S1 has no roadmap tasks: the hand-made sprint stands
  });

  it("titles the month from the live break-even", () => {
    expect(monthTitle(53943, new Date("2026-11-20T00:00:00Z"))).toBe("Break even — 54,000 RWF a month");
    expect(monthTitle(53943, new Date("2026-12-05T00:00:00Z"))).toBe("2× break-even — 108,000 RWF a month");
    expect(monthTitle(null, new Date("2026-11-20T00:00:00Z"))).toBe("Break even");
  });

  it("measures the ladder against the month's money", () => {
    const none = rungsView(0, 53943);
    expect(none.map((r) => r.reached)).toEqual([false, false, false, false]);
    expect(none[1]!.targetRwf).toBe(53943);
    const some = rungsView(60000, 53943);
    expect(some.map((r) => r.reached)).toEqual([true, true, false, false]);
    expect(some[2]!.progress).toBeCloseTo(60000 / 145000, 3);
  });
});
