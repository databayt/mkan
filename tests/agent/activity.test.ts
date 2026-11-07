import { describe, expect, it } from "vitest";
import { latestTurn, playfulWord, turnActivity } from "@/components/agent/activity-pure";
import type { AgentEventView, AgentMessage, AgentTaskView, EventKind, ShortlistItem, StepStatus } from "@/components/agent/types";

type TaskBits = Pick<AgentTaskView, "events" | "messages" | "status" | "shortlist">;

const at = (s: number) => new Date(Date.UTC(2026, 10, 7, 10, 0, s)).toISOString();
const ev = (seq: number, kind: EventKind, status: StepStatus = "done", payload: Record<string, unknown> = {}): AgentEventView => ({ seq, kind, status, payload, at: at(seq) });
const user = (s: number, text = "2 bedrooms in Kicukiro"): AgentMessage => ({ role: "user", text, at: at(s) });
const task = (over: Partial<TaskBits>): TaskBits => ({ events: [], messages: [], status: "DONE", shortlist: [], ...over });
const home = (availability: ShortlistItem["availability"]) => ({ availability }) as ShortlistItem;

describe("turnActivity — the folded row of a finished turn", () => {
  const search = [
    ev(1, "requirements_extracted", "done", { reader: "claude" }),
    ev(2, "memory_used", "done", { fields: ["maxPrice"] }),
    ev(3, "search_done", "done", { candidates: 120 }),
    ev(4, "dedup_grouped", "done", { removed: 14 }),
    ev(5, "filtered", "done", { matching: 20 }),
    ev(6, "ranked", "done", { top: 8 }),
    ev(7, "needs_confirmation", "uncertain", { count: 3 }),
    ev(8, "shortlist_ready", "done", { count: 8 }),
  ];

  it("names each step once, in order, with its numbers", () => {
    const a = turnActivity(task({ events: search, messages: [user(0)] }));
    expect(a.parts).toEqual([{ key: "read" }, { key: "memory" }, { key: "search", count: 120 }, { key: "group", count: 14 }, { key: "rank", count: 8 }]);
    expect(a.live).toBeNull();
    expect(a.failed).toBe(false);
  });

  it("badges the homes kept and the searched homes that did not fit", () => {
    expect(turnActivity(task({ events: search, messages: [user(0)] })).badge).toEqual({ kept: 8, ruledOut: 100 });
  });

  it("counts every searched home as ruled out when the search had to widen", () => {
    const widened = [
      ev(1, "requirements_extracted"),
      ev(2, "search_done", "done", { candidates: 40 }),
      ev(3, "filtered", "done", { matching: 0 }),
      ev(4, "relaxed", "done", { count: 2, matching: 5 }),
      ev(5, "ranked", "done", { top: 5 }),
    ];
    const a = turnActivity(task({ events: widened, messages: [user(0)] }));
    expect(a.parts).toContainEqual({ key: "widen", count: 2 });
    expect(a.badge).toEqual({ kept: 5, ruledOut: 40 });
  });

  it("says nothing fits when the ranking is empty, and a search that could not widen is no failure", () => {
    const empty = [ev(1, "requirements_extracted"), ev(2, "search_done", "done", { candidates: 3 }), ev(3, "relaxed", "failed", { count: 0 }), ev(4, "ranked", "done", { top: 0 })];
    const a = turnActivity(task({ events: empty, messages: [user(0)] }));
    expect(a.parts.at(-1)).toEqual({ key: "none" });
    expect(a.failed).toBe(false);
    expect(a.badge).toEqual({ kept: 0, ruledOut: 3 });
  });

  it("reads a clarify turn as the questions it asked", () => {
    const a = turnActivity(task({ events: [ev(1, "requirements_extracted"), ev(2, "asked", "waiting_person", { fields: "homeType, furnished, purpose" })], messages: [user(0)] }));
    expect(a.parts).toEqual([{ key: "read" }, { key: "asked", count: 3 }]);
    expect(a.badge).toBeNull();
  });

  it("counts brokers once each and their answers", () => {
    const events = [
      ...search,
      ev(9, "broker_contact_started", "waiting_person", { broker: "@a" }),
      ev(10, "broker_contact_started", "waiting_person", { broker: "@b" }),
      ev(11, "broker_contact_started", "waiting_person", { broker: "@a", reused: true }),
      ev(12, "broker_replied", "done", { answer: "confirmed" }),
    ];
    const a = turnActivity(task({ events, messages: [user(0)], status: "WAITING", shortlist: [home("asked"), home("confirmed"), home("asked")] }));
    expect(a.parts).toContainEqual({ key: "brokers", count: 2 });
    expect(a.parts).toContainEqual({ key: "replied", count: 1 });
    expect(a.brokersPending).toBe(2);
  });

  it("keeps the tenant's own taps out, and flags a real failure", () => {
    const a = turnActivity(task({ events: [...search, ev(9, "feedback", "done", { kind: "good" }), ev(10, "failed", "failed")], messages: [user(0)] }));
    expect(a.events.some((e) => e.kind === "feedback")).toBe(false);
    expect(a.parts.at(-1)).toEqual({ key: "failed" });
    expect(a.failed).toBe(true);
  });
});

describe("turnActivity — a turn still running", () => {
  it("shows the step whose running row is up, and no finished part for it", () => {
    const a = turnActivity(task({ status: "RUNNING", messages: [user(0)], events: [ev(1, "requirements_extracted", "running")] }));
    expect(a.live).toBe("read");
    expect(a.parts).toEqual([]);
  });

  it("moves to the search once reading is done", () => {
    const a = turnActivity(task({ status: "RUNNING", messages: [user(0)], events: [ev(1, "requirements_extracted"), ev(2, "search_done", "running")] }));
    expect(a.live).toBe("search");
    expect(a.parts).toEqual([{ key: "read" }]);
  });

  it("shows the writer while the cards are up and the reply is being written", () => {
    const shortlist: AgentMessage = { role: "agent", kind: "shortlist", count: 3, pendingText: true, at: at(9) };
    const a = turnActivity(task({ status: "RUNNING", messages: [user(0), shortlist], events: [ev(1, "requirements_extracted"), ev(2, "ranked", "done", { top: 3 })] }));
    expect(a.live).toBe("write");
  });

  it("shows nothing of the last turn for a message sent after it — its own rows have not come yet", () => {
    const old = [ev(1, "requirements_extracted"), ev(2, "search_done", "done", { candidates: 50 }), ev(3, "ranked", "done", { top: 4 })];
    const a = turnActivity(task({ status: "RUNNING", messages: [user(0), { role: "agent", kind: "shortlist", count: 4, at: at(4) }, user(30, "cheaper")], events: old }));
    expect(a.events).toEqual([]);
    expect(a.parts).toEqual([]);
    expect(a.live).toBeNull();
    expect(a.badge).toBeNull();
  });
});

describe("latestTurn", () => {
  it("starts at the last reading", () => {
    const events = [ev(1, "requirements_extracted"), ev(2, "ranked"), ev(3, "requirements_extracted"), ev(4, "search_done")];
    expect(latestTurn(events).map((e) => e.seq)).toEqual([3, 4]);
  });
});

describe("playfulWord", () => {
  const words = ["Thinking…", "Mulling it over…", "Weighing it up…"];
  it("is the same word for the same turn and tick, and walks the list", () => {
    const first = playfulWord(words, "2026-11-07T10:00:00.000Z", 0);
    expect(playfulWord(words, "2026-11-07T10:00:00.000Z", 0)).toBe(first);
    const seen = new Set([0, 1, 2].map((t) => playfulWord(words, "2026-11-07T10:00:00.000Z", t)));
    expect(seen.size).toBe(3);
  });
  it("has nothing to say without words", () => {
    expect(playfulWord([], "x", 4)).toBe("");
  });
});
