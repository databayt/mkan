import { describe, expect, it } from "vitest";

import { pickActive, shapeSprints, type SprintRow } from "@/lib/monetize/sprint-shape";

const d = (s: string) => new Date(s);
const row = (over: Partial<SprintRow>): SprintRow => ({
  id: "s",
  kind: "WEEK",
  title: "t",
  goal: null,
  startsAt: d("2026-11-02"),
  endsAt: d("2026-11-09"),
  status: "active",
  tasks: [],
  prompts: [],
  ...over,
});

describe("sprint shaping", () => {
  const week = row({
    id: "w",
    tasks: [
      { id: "t2", title: "second", block: null, order: 1, done: true, doneAt: d("2026-11-03") },
      { id: "t1", title: "first", block: "chat", order: 0, done: false, doneAt: null },
    ],
    prompts: [
      { id: "p2", taskId: "t1", order: 1, text: "b", status: "pending", processedAt: null, result: null },
      { id: "p1", taskId: "t2", order: 0, text: "a", status: "processed", processedAt: d("2026-11-03"), result: "ok" },
    ],
  });
  const month = row({ id: "m", kind: "MONTH", startsAt: d("2026-11-01"), endsAt: d("2026-12-01"), prompts: [{ id: "p3", taskId: null, order: 0, text: "c", status: "pending", processedAt: null, result: null }] });

  it("orders tasks and prompts, counts progress, names each prompt's task", () => {
    const s = shapeSprints([week, month], d("2026-11-04"));
    expect(s.week!.tasks.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(s.week!.doneTasks).toBe(1);
    expect(s.week!.processedPrompts).toBe(1);
    expect(s.week!.prompts[1]).toMatchObject({ id: "p2", taskTitle: "first", kind: "WEEK" });
  });

  it("runs the carousel week then month and opens on the first pending prompt", () => {
    const s = shapeSprints([month, week], d("2026-11-04"));
    expect(s.prompts.map((p) => p.id)).toEqual(["p1", "p2", "p3"]);
    expect(s.startIndex).toBe(1);
  });

  it("prefers the open sprint whose window holds today, never a closed one", () => {
    const old = row({ id: "old", startsAt: d("2026-10-26"), endsAt: d("2026-11-02") });
    const closed = row({ id: "closed", status: "closed" });
    expect(pickActive([old, week, closed], "WEEK", d("2026-11-04"))!.id).toBe("w");
    expect(pickActive([closed], "WEEK", d("2026-11-04"))).toBeNull();
    expect(shapeSprints([], d("2026-11-04"))).toMatchObject({ week: null, month: null, prompts: [], startIndex: 0 });
  });
});
