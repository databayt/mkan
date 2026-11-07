import { describe, expect, it } from "vitest";

import en from "@/components/internationalization/en.json";
import ar from "@/components/internationalization/ar.json";
import rw from "@/components/internationalization/rw.json";
import { readMetrics } from "@/lib/monetize/metrics";
import { mentionsGated } from "@/lib/monetize/sprint-auto";
import { SETUP_KEYS, SETUP_STEPS, setupMetrics, setupOf, setupPromptText, stepsDue, type SetupKey } from "@/lib/monetize/setup";

const at = { at: "2026-11-08T09:00:00Z" };

describe("Mkan's business setup", () => {
  it("follows the guide's order: the company first, MoMo's API last", () => {
    expect(SETUP_STEPS.map((s) => s.key)).toEqual([...SETUP_KEYS]);
    for (const s of SETUP_STEPS) for (const a of s.after) expect(SETUP_KEYS.indexOf(a), `${s.key} after ${a}`).toBeLessThan(SETUP_KEYS.indexOf(s.key));
    // Nothing ticked: only the company waits on Abdout.
    expect(stepsDue({}, new Set()).map((d) => d.step.key)).toEqual(["company"]);
    // The company ticked: its follow-up runs, and the number, the domain and TikTok Business are next.
    const due = stepsDue({ company: at }, new Set());
    expect(due.map((d) => [d.step.key, d.ticked])).toEqual([
      ["company", true],
      ["number", false],
      ["domain", false],
      ["tiktokBusiness", false],
    ]);
    // A step ticked out of order still gets its follow-up; a finished follow-up wants nothing more.
    expect(stepsDue({ domain: at }, new Set()).some((d) => d.step.key === "domain" && d.ticked)).toBe(true);
    expect(stepsDue({ company: at }, new Set<SetupKey>(["company"])).some((d) => d.step.key === "company")).toBe(false);
  });

  it("gives the loop setup.<step> and setup.done", () => {
    expect(setupMetrics({ company: at, domain: at })).toMatchObject({ "setup.company": 1, "setup.domain": 1, "setup.momoApi": 0, "setup.done": 2 });
    const m = readMetrics({ setup: { bioLink: at } });
    expect(m["setup.bioLink"]).toBe(1);
    expect(m["setup.done"]).toBe(1);
  });

  it("writes prompts the runner may run: tagged, no gated command, never a send", () => {
    for (const s of SETUP_STEPS) {
      const text = setupPromptText(s);
      expect(setupOf(text)).toBe(s.key);
      expect(mentionsGated(text), s.key).toBe(false);
      expect(s.ask.length).toBeLessThanOrEqual(300);
    }
  });

  it("has a title and a line for every step, in every language", () => {
    for (const dict of [en, ar, rw]) {
      const steps = (dict as typeof en).monetize.setup.steps as Record<string, { t: string; what: string }>;
      for (const k of SETUP_KEYS) {
        expect(steps[k]?.t, k).toBeTruthy();
        expect(steps[k]?.what, k).toBeTruthy();
      }
    }
  });
});
