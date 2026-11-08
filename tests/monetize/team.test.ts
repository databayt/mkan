import { describe, expect, it } from "vitest";

import { idList, isAutomatedBrowser, REAL_PERSON } from "@/lib/monetize/team";

describe("who counts as a real person (2026-11-08)", () => {
  it("knows our own films and QA by their browser: headless Chrome, a driver that says so, a crawler", () => {
    // kun's shoot flows launch Playwright's headless Chromium.
    expect(isAutomatedBrowser("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.6778.33 Safari/537.36")).toBe(true);
    expect(isAutomatedBrowser("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isAutomatedBrowser("Mozilla/5.0 (Linux; Android 14; SM-A145F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe(false);
    expect(isAutomatedBrowser("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1")).toBe(false);
    expect(isAutomatedBrowser(null)).toBe(false);
  });

  it("leaves out chats with no profile, Abdout's contacts, team numbers and browsers, and admins", () => {
    const sql = REAL_PERSON.sql;
    expect(sql).toContain("p.id IS NOT NULL");
    for (const key of ["'personal:'", "'test-phones'", "'team-profiles'", "'ADMIN'", "'SUPER_ADMIN'"]) expect(sql).toContain(key);
    expect(REAL_PERSON.values).toEqual([]);
  });

  it("reads a stored id list cleanly", () => {
    expect(idList(["a", " b ", "a", 3, ""])).toEqual(["a", "b"]);
    expect(idList(null)).toEqual([]);
  });
});
