import { describe, expect, it } from "vitest";

import ar from "@/components/internationalization/ar.json";
import en from "@/components/internationalization/en.json";
import rw from "@/components/internationalization/rw.json";
import { firstBlock, FLOWS, flowIds, flowNumbers, handoffs } from "@/lib/monetize/flows";
import { liveView, publicLive } from "@/lib/monetize/live-shape";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { shapeSprints } from "@/lib/monetize/sprint-shape";
import { BLOCKS } from "@/lib/monetize/types";

describe("the four flowcharts", () => {
  it("label every node and exit in English, Arabic and Kinyarwanda", () => {
    for (const dict of [en, ar, rw]) {
      for (const b of BLOCKS) {
        const texts = (dict.monetize.flows as unknown as Record<string, Record<string, { t: string; n?: string }>>)[b]!;
        for (const id of flowIds(b)) {
          expect(texts[id]?.t, `${b}.${id}`).toBeTruthy();
          const node = FLOWS[b].find((x) => x.id === id || x.exit?.id === id)!;
          const num = node.id === id ? node.num : node.exit?.num;
          // A node that shows a number has the words to put it in.
          if (num) expect(texts[id]?.n, `${b}.${id}.n`).toContain("{v}");
        }
      }
    }
  });

  it("start with a start, end with an end, and give every decision a way out", () => {
    for (const b of BLOCKS) {
      const nodes = FLOWS[b];
      expect(nodes[0]!.kind).toBe("start");
      expect(nodes.at(-1)!.kind).toBe("end");
      for (const d of nodes.filter((x) => x.kind === "decision")) expect(d.exit, `${b}.${d.id}`).toBeTruthy();
    }
  });

  it("read their numbers from the live metrics, and never throw on missing ones", () => {
    const empty = { blocks: [], stages: [], bottleneck: { kind: "insufficient" }, money: { revenueRwf: 0, breakEvenRwf: 0, netRwf: 0, unrecordedRwf: 0, costRwf: 0 }, gates: { brokerSends: "off", capped: false }, experiments: [], nextSteps: [], firstShare: null } as unknown as MonetizeOverview;
    const v = flowNumbers(empty);
    expect(Object.values(v).every((x) => x === null)).toBe(true);
    const some = {
      ...empty,
      blocks: [{ key: "scrape", health: "green", reason: "healthy", kpis: [{ key: "found", value: 77, unit: "count" }, { key: "skipRate", value: 0.42, unit: "pct" }], jobs: [], snapshotAt: null, trend: [] }],
      stages: [{ key: "chats", block: "chat", count: 15 }],
    } as unknown as MonetizeOverview;
    const w = flowNumbers(some);
    expect(w.found).toBe(77);
    expect(w.skipRate).toBe(0.42);
    expect(w["stage.chats"]).toBe(15);
  });

  it("name the hand-offs between blocks, mark the weakest, and open on its block", () => {
    const data = {
      stages: [
        { key: "homes", block: "scrape", count: 259 },
        { key: "ready", block: "enhance", count: 70 },
        { key: "posted", block: "post", count: 2 },
        { key: "views", block: "post", count: 2166 },
        { key: "chats", block: "chat", count: 15 },
      ],
      bottleneck: { kind: "step", from: "ready", to: "posted", block: "post", rate: 2 / 70, floor: 0.5 },
    } as unknown as MonetizeOverview;
    const h = handoffs(data);
    expect(h.map((x) => [x.from, x.to])).toEqual([["scrape", "enhance"], ["enhance", "post"], ["post", "chat"]]);
    expect(h[0]!.rate).toBeCloseTo(70 / 259, 4);
    expect(h.find((x) => x.weakest)?.to).toBe("post");
    expect(firstBlock(data)).toBe("post");
    expect(firstBlock({ bottleneck: { kind: "insufficient" } } as unknown as MonetizeOverview)).toBe("chat");
  });
});

describe("the loop, live", () => {
  const sprints = shapeSprints(
    [
      {
        id: "w",
        kind: "WEEK",
        title: "First paid deal",
        goal: null,
        startsAt: new Date("2026-11-02"),
        endsAt: new Date("2026-11-09"),
        status: "active",
        tasks: [{ id: "t1", title: "Book a viewing", block: "chat", order: 0, done: false, doneAt: null }],
        prompts: [
          { id: "a", taskId: "t1", order: 0, text: "In ~/mkan: book it.", status: "running", processedAt: new Date("2026-11-07T09:40:00Z"), result: null },
          { id: "b", taskId: null, order: 1, text: "In ~/mkan: next thing.\nmore", status: "pending", processedAt: null, result: null },
          { id: "c", taskId: null, order: 2, text: "In ~/mkan: done thing.", status: "processed", processedAt: new Date("2026-11-07T08:00:00Z"), result: "ok" },
          { id: "d", taskId: null, order: 3, text: "In ~/mkan: ask him.", status: "blocked", processedAt: new Date("2026-11-07T07:00:00Z"), result: "Call +250 780 984 777 back" },
        ],
      },
    ],
    new Date("2026-11-07T10:00:00Z"),
  );
  const now = new Date("2026-11-07T10:00:00Z");

  it("says what runs now, what's next, what finished, and what waits on Abdout", () => {
    const v = liveView(sprints, { state: "running", since: "2026-11-07T09:40:00Z", at: "2026-11-07T09:40:00Z", promptId: "a" }, "2026-11-07T09:55:00Z", now);
    expect(v.state).toBe("running");
    expect(v.running?.title).toBe("Book a viewing");
    expect(v.running?.block).toBe("chat");
    expect(v.next?.title).toBe("next thing.");
    expect(v.last?.id).toBe("c");
    expect(v.needsYou.map((x) => x.id)).toEqual(["d"]);
    expect(v.doneToday).toBe(1);
  });

  it("reads a silent Mac as offline, but a park or a pause stands until it changes", () => {
    const stale = "2026-11-07T08:00:00Z";
    expect(liveView(sprints, { state: "running", at: stale }, stale, now).state).toBe("offline");
    // At night the loop and the Mac beat only on the hour: an hour-old beat is still a live Mac.
    const hourAgo = "2026-11-07T09:00:00Z";
    expect(liveView(sprints, { state: "waiting", at: hourAgo }, hourAgo, now).state).toBe("waiting");
    expect(liveView(sprints, { state: "parked", at: stale, until: "2026-11-07T15:02:00Z" }, stale, now).state).toBe("parked");
    expect(liveView(sprints, { state: "stopped", at: stale }, stale, now).state).toBe("stopped");
    // A park whose time has long passed is not shown as parked.
    expect(liveView(sprints, { state: "parked", at: "2026-11-07T09:59:00Z", until: "2026-11-07T09:00:00Z" }, "2026-11-07T09:59:00Z", now).state).toBe("checking");
  });

  it("shows the public the state and titles only — no prompt, result, ask or note", () => {
    const v = publicLive(liveView(sprints, { state: "waiting", note: "Mac path /Users/x", at: "2026-11-07T09:59:00Z" }, "2026-11-07T09:59:00Z", now));
    expect(v.note).toBeNull();
    expect(v.needsYou[0]!.result).toBeNull();
    expect(v.running?.text).toBeNull();
    expect(JSON.stringify(v)).not.toMatch(/984 777|\/Users/);
  });
});
