import { describe, expect, it } from "vitest";

import type { MonetizeOverview } from "@/lib/monetize/load";
import { toPublic } from "@/lib/monetize/public";
import { maskPhone, redactPublic, scrubTitle } from "@/lib/redact";

// Fake numbers only (public repo): +25072000001x is the team's test range.
const TENANT = "+250720000015";
const LEAK = /\+?2(50|49)[\d ]{9,}|\b07\d{8}\b|@[a-z0-9_.]{4,}|\/Users\/|[a-z0-9._-]+@[a-z0-9-]+\.[a-z]{2,}/i;

const prompt = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  sprintId: "s1",
  kind: "WEEK",
  taskId: "t1",
  taskTitle: `Call ${TENANT}`,
  text: `In ~/mkan: book the viewing for ${TENANT} (K6041), broker @mossa_real_estate_rwanda`,
  status: "blocked",
  processedAt: null,
  result: `Needs you: 0 picks. Closest: ${TENANT} (K6041, 40k). Log at /Users/abdout/mkan/scripts/crm/.data/x.log; mail abdout@example.com`,
  metric: "viewingsBooked",
  baseline: 0,
  unblockWhen: null,
  blockedAt: null,
  retries: 0,
  auto: true,
  ...over,
});

const sprint = {
  id: "s1",
  kind: "WEEK",
  title: `Win back ${TENANT}`,
  goal: "First paid deal",
  startsAt: "2026-11-02",
  endsAt: "2026-11-09",
  auto: false,
  tasks: [{ id: "t1", title: `Re-ask @kigalistudentlife1 for ${TENANT}`, block: "chat", done: false, doneAt: null }],
  prompts: [prompt()],
  doneTasks: 0,
  processedPrompts: 0,
};

const data = {
  sprints: { week: sprint, month: null, prompts: [prompt()], startIndex: 0 },
  lessons: [{ id: "l1", promptId: "p1", sprintId: "s1", metric: "viewingsBooked", before: 0, after: 0, verdict: "flat", text: `no tenant time from ${TENANT}`, measureAt: null, createdAt: "2026-11-05" }],
  blocks: [{ key: "chat", health: "green", reason: "ok", kpis: [], jobs: [{ job: "mkan-demand-match", status: "ok", at: null, summary: `matched ${TENANT} via wa.me/250720000015` }], snapshotAt: null, trend: [] }],
  experiments: [{ id: "e1", block: "chat", hypothesis: `Ask @rwandarealestate about ${TENANT}`, metric: "viewingsBooked", baseline: 0, target: 1, result: null, verdict: "running", startedAt: "2026-11-05", endedAt: null }],
  firstShare: { posts: [{ id: "x", ref: "K6516", listingId: 6516, brokerHandle: "kigalistudentlife1", status: "POSTED", reason: null, pickedAt: "2026-11-06", postedAt: "2026-11-06", tiktokUrl: null, views: null, likes: null }] },
  money: { revenueRwf: 0 },
} as unknown as MonetizeOverview;

describe("toPublic — the numbers stay, the people go", () => {
  it("leaves no phone, handle, email or Mac path anywhere in what reaches the browser", () => {
    const out = JSON.stringify(toPublic(data));
    expect(out).not.toMatch(LEAK);
    // The work stays readable: codes, numbers and the shape of the sentence.
    expect(out).toContain("K6041");
    expect(out).toContain("…015");
  });

  it("drops the broker's handle from a posted home (a reader could go round Mkan)", () => {
    expect(toPublic(data).firstShare!.posts[0]!.brokerHandle).toBeNull();
  });

  it("does not touch the numbers", () => {
    expect(toPublic(data).money).toBe(data.money);
    expect(toPublic(data).sprints.week!.prompts[0]!.baseline).toBe(0);
  });
});

describe("redact", () => {
  it("masks a phone to its last 3 digits, in any spacing", () => {
    expect(maskPhone("+250 720 000 015")).toBe("…015");
    expect(redactPublic("call +250 720 000 015 or 0720000015")).toBe("call …015 or …015");
  });

  it("keeps dates, prices and K-codes", () => {
    expect(redactPublic("K6041 at RWF 400,000 on 2026-11-06")).toBe("K6041 at RWF 400,000 on 2026-11-06");
  });

  it("masks emails before handles, and links to their host", () => {
    expect(redactPublic("abdout@example.com and @mossa_real")).toBe("[email] and @…");
    expect(redactPublic("see https://www.tiktok.com/@x/video/1")).toBe("see tiktok.com");
  });

  it("is idempotent", () => {
    const once = redactPublic(prompt().result as string);
    expect(redactPublic(once)).toBe(once);
  });

  it("scrubs a broker's contact out of a tenant-facing title", () => {
    expect(scrubTitle("2-bed in Remera call 0788123456")).toBe("2-bed in Remera call");
    expect(scrubTitle("Studio Kimihurura @house_rw")).toBe("Studio Kimihurura");
    expect(scrubTitle("4-bedroom house for rent in Kabeza")).toBe("4-bedroom house for rent in Kabeza");
  });
});
