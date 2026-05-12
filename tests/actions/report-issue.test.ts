/**
 * Smoke tests for the report-issue server action.
 *
 * The action is now a thin wrapper around {@link runReportPipeline}. Heavy
 * logic (scoring, hard filters, AI triage) is covered in the canonical
 * `src/lib/report/__tests__` suite (mirrored from /Users/abdout/codebase).
 *
 * These tests only check that the action:
 *   1. Forwards the input shape to the pipeline
 *   2. Returns the expected discriminated-union result
 *   3. Surfaces issueNumber only when bucket === "verified-report"
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock next/headers (the action calls this for IP resolution).
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Map([["x-forwarded-for", "203.0.113.42"]])),
}));

// Mock the pipeline so we can assert on the action's wiring.
const mockRunPipeline = vi.fn();
vi.mock("@/lib/report", () => ({
  runReportPipeline: (...args: unknown[]) => mockRunPipeline(...args),
}));
vi.mock("@/lib/report/adapter", () => ({
  mkanReportAdapter: { repo: "databayt/mkan" },
}));

import { reportIssue } from "@/lib/actions/report-issue";

const validInput = {
  description:
    "Button is broken on the search page. Clicking Search does nothing.",
  pageUrl: "https://mkan.com.sa/en/search",
  category: "broken" as const,
  viewport: "1440x900",
  direction: "ltr" as const,
  browser: "Mozilla/5.0 Chrome/120.0",
  hasScreenshot: false as const,
};

describe("reportIssue (action wiring)", () => {
  beforeEach(() => {
    mockRunPipeline.mockReset();
  });

  it("returns { ok: true, issueNumber } when pipeline yields verified-report", async () => {
    mockRunPipeline.mockResolvedValueOnce({
      ok: true,
      bucket: "verified-report",
      issueNumber: 42,
      score: 78,
    });

    const result = await reportIssue(validInput);

    expect(result).toEqual({ ok: true, issueNumber: 42 });
    expect(mockRunPipeline).toHaveBeenCalledTimes(1);
  });

  it("returns { ok: true } without issueNumber for silent-reject", async () => {
    mockRunPipeline.mockResolvedValueOnce({ ok: true, bucket: "silent-reject" });

    const result = await reportIssue(validInput);

    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: true } without issueNumber for needs-human", async () => {
    mockRunPipeline.mockResolvedValueOnce({
      ok: true,
      bucket: "needs-human",
      issueNumber: 99,
      score: 60,
    });

    const result = await reportIssue(validInput);

    expect(result).toEqual({ ok: true });
  });

  it("returns { ok: false } when pipeline reports failure", async () => {
    mockRunPipeline.mockResolvedValueOnce({ ok: false, error: "internal" });

    const result = await reportIssue(validInput);

    expect(result).toEqual({ ok: false });
  });

  it("forwards every input field to the pipeline", async () => {
    mockRunPipeline.mockResolvedValueOnce({ ok: true, bucket: "silent-reject" });

    await reportIssue({
      ...validInput,
      reproSteps: "1. open page 2. click search",
      expected: "results appear",
      actual: "nothing",
      severityHint: "high",
      captchaToken: "tok-abc",
    });

    const [input, , opts] = mockRunPipeline.mock.calls[0]!;
    expect(input).toMatchObject({
      description: validInput.description,
      pageUrl: validInput.pageUrl,
      category: "broken",
      reproSteps: "1. open page 2. click search",
      expected: "results appear",
      actual: "nothing",
      severityHint: "high",
      captchaToken: "tok-abc",
    });
    expect(opts).toMatchObject({ ip: "203.0.113.42" });
  });
});
