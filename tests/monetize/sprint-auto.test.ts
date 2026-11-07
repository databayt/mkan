import { describe, expect, it } from "vitest";

import { fallbackPlan, mentionsGated, monthWindow, parseRetro, repairPlan, retroText, stepOf, stepPrompt, validatePlan, weekWindow } from "@/lib/monetize/sprint-auto";
import type { NextStep } from "@/lib/monetize/next-steps";

const now = new Date("2026-11-05T10:00:00Z"); // a Thursday
const step = (key: string, vars: Record<string, string | number> = {}, block: NextStep["block"] = "chat"): NextStep => ({ key, priority: 1, block, vars });
const metrics = { chats: 12, brokersAsked: 64, viewingsBooked: 0, postedDays7: 7, "stage.posted": 7, brokerSends: "off", openSteps: 5 };

describe("windows", () => {
  it("week is Monday → Monday, month 1st → 1st", () => {
    expect(weekWindow(now)).toEqual({ startsAt: "2026-11-02", endsAt: "2026-11-09" });
    expect(weekWindow(new Date("2026-11-09T00:00:00Z"))).toEqual({ startsAt: "2026-11-09", endsAt: "2026-11-16" });
    expect(weekWindow(new Date("2026-11-08T23:00:00Z"))).toEqual({ startsAt: "2026-11-02", endsAt: "2026-11-09" });
    expect(monthWindow(new Date("2026-12-31T10:00:00Z"))).toEqual({ startsAt: "2026-12-01", endsAt: "2027-01-01" });
  });
});

describe("step prompts", () => {
  it("a runnable step names its metric, the done-when and the lesson, and carries its tag", () => {
    const p = stepPrompt(step("bottleneck", { from: "ready", to: "posted", rate: 9, floor: 50 }, "post"))!;
    expect(p).toMatchObject({ step: "bottleneck", metric: "stage.posted", unblockWhen: null });
    expect(p.text).toMatch(/^In ~\/mkan: /);
    expect(p.text).toContain("Done when");
    expect(p.text).toContain("--metric=stage.posted --lesson=");
    expect(stepOf(p.text)).toBe("bottleneck");
  });
  it("a gated step becomes needs-you with the condition that resumes it", () => {
    const p = stepPrompt(step("brokerSends", { mode: "off" }))!;
    expect(p.unblockWhen).toBe("brokerSends == gated");
    expect(p.needsYou).toMatch(/wa:brokers gated/);
    expect(mentionsGated(p.text)).toBe(false); // the session is never told to run it
  });
  it("one step per failing job; none for break even", () => {
    expect(stepPrompt(step("jobFailed", { job: "mkan-master-sweep", detail: "" }, "enhance"))).toMatchObject({ step: "jobFailed:mkan-master-sweep", metric: "readyNew7" });
    expect(stepPrompt(step("breakEven", { need: 1, have: 0 }))).toBeNull();
  });
});

describe("plans", () => {
  it("the fallback plan is valid, auto, money first, gated steps blocked", () => {
    const fb = fallbackPlan("WEEK", [step("brokerSends", { mode: "off" }), step("firstDeal", { n: 12 }), step("breakEven"), step("postDaily", { n: 5 }, "post")], now);
    expect(fb).toMatchObject({ kind: "WEEK", startsAt: "2026-11-02", endsAt: "2026-11-09", auto: true });
    expect(fb.tasks.map((t) => t.key)).toEqual(["brokerSends", "firstDeal", "postDaily"]);
    expect(fb.prompts.filter((p) => p.unblockWhen).length).toBe(2);
    expect(validatePlan({ sprints: [fb] }, metrics, now)).toMatchObject({ ok: true });
  });
  it("an empty to-do list still rolls a sprint", () => {
    const fb = fallbackPlan("MONTH", [], now);
    expect(fb.prompts).toHaveLength(1);
    expect(validatePlan({ sprints: [fb] }, metrics, now).ok).toBe(true);
  });
  it("rejects unknown metrics, wrong windows, gated commands without a condition, bad conditions", () => {
    const base = { kind: "WEEK", title: "First share", startsAt: "2026-11-02", endsAt: "2026-11-09", tasks: [{ key: "a", title: "Task a" }] };
    const p = (o: object) => ({ task: "a", text: "In ~/mkan: do the thing properly and report.", metric: "chats", ...o });
    const bad = (o: object, sprint: object = {}) => validatePlan({ sprints: [{ ...base, ...sprint, prompts: [p(o)] }] }, metrics, now);
    expect(bad({}).ok).toBe(true);
    expect(bad({ metric: "nope" })).toMatchObject({ ok: false });
    expect(bad({}, { startsAt: "2026-11-03" })).toMatchObject({ ok: false });
    expect(bad({ text: "In ~/mkan: run pnpm deal:book for the top tenant now." })).toMatchObject({ ok: false });
    expect(bad({ text: "In ~/mkan: run pnpm deal:book for the top tenant now.", unblockWhen: "brokerSends == gated", needsYou: "Turn sends on" }).ok).toBe(true);
    expect(bad({ unblockWhen: "brokerSends gated", needsYou: "x" })).toMatchObject({ ok: false });
    expect(bad({ task: "zzz" })).toMatchObject({ ok: false });
    expect(validatePlan({ sprints: [] }, metrics, now).ok).toBe(false);
  });
  it("drops only the prompts that break a rule, and sets the window, instead of throwing the plan away", () => {
    const base = { kind: "WEEK", title: "First intros", startsAt: "2026-11-03", endsAt: "2026-11-10", tasks: [{ key: "a", title: "Task a" }] };
    const good = { task: "a", text: "In ~/mkan: read the intro answers and fix any misread one.", metric: "chats" };
    const gated = { task: "a", text: "In ~/mkan: run pnpm deal:book for the top tenant now.", metric: "chats" };
    const r = repairPlan({ sprints: [{ ...base, prompts: [good, gated, { ...good, metric: "nope" }] }] }, metrics, now);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.plan.sprints[0]!.prompts).toEqual([good]);
    expect(r.plan.sprints[0]!.startsAt).toBe("2026-11-02");
    expect(r.dropped).toEqual(['WEEK prompt 2: a gated command needs an unblockWhen', 'WEEK prompt 3: unknown metric "nope"']);
    expect(repairPlan({ sprints: [{ ...base, prompts: [gated] }] }, metrics, now).ok).toBe(false);
  });
});

describe("retro", () => {
  it("names what moved, and reads JSON or plain text", () => {
    const t = retroText('WEEK "x"', { start: { chats: 4, paidDeals: 0 }, end: { chats: 12, paidDeals: 0 }, tasks: { done: 2, total: 5 }, prompts: { processed: 3, blocked: 2 } });
    expect(t).toBe('WEEK "x": tasks 2/5; prompts 3 processed, 2 blocked. Moved: chats 4 → 12.');
    expect(retroText("y", { tasks: { done: 0, total: 1 }, prompts: {} })).toContain("No start snapshot");
    expect(parseRetro('{"start":{"chats":1}}').start).toEqual({ chats: 1 });
    expect(parseRetro("plain words").text).toBe("plain words");
    expect(parseRetro(null)).toEqual({});
  });
});
