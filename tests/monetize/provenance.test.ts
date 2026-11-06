import { describe, expect, it } from "vitest";

import { approvalHint, isWebText, markWeb, unmarkWeb, WEB_MARK } from "@/lib/monetize/provenance";

describe("web provenance (the guard between /monetize's forms and the unattended runner)", () => {
  it("marks web text once, at the start", () => {
    const marked = markWeb("In ~/mkan: do the thing");
    expect(marked.startsWith(WEB_MARK)).toBe(true);
    expect(markWeb(marked)).toBe(marked);
  });

  it("sees the mark anywhere — a title folded into a retro or a lesson still counts", () => {
    expect(isWebText(markWeb("x"))).toBe(true);
    expect(isWebText(`WEEK "${markWeb("My sprint")}" closed: 3/5 tasks`)).toBe(true);
    expect(isWebText("In ~/mkan: plain Mac text")).toBe(false);
    expect(isWebText(null)).toBe(false);
    expect(isWebText(undefined)).toBe(false);
  });

  it("takes the mark off on approval, and only the mark", () => {
    expect(unmarkWeb(markWeb("In ~/mkan: approved text"))).toBe("In ~/mkan: approved text");
    expect(unmarkWeb("no mark here")).toBe("no mark here");
  });

  it("tells Abdout the exact command", () => {
    expect(approvalHint("cmx1")).toContain("pnpm sprint:approve cmx1");
  });
});
