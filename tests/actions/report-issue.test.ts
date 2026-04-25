import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
  canOverride: (session: { user?: { id?: string; role?: string } } | null | undefined, ownerId: string | null | undefined) =>
    (!!session?.user?.id && session.user.id === ownerId) ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "SUPER_ADMIN",
  isAdminOrSuper: (session: { user?: { role?: string } } | null | undefined) =>
    session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN",
  isSuperAdmin: (session: { user?: { role?: string } } | null | undefined) =>
    session?.user?.role === "SUPER_ADMIN",
}));

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { auth } from "@/lib/auth";
import { reportIssue } from "@/lib/actions/report-issue";

const mockAuth = vi.mocked(auth);

const baseData = {
  description: "Button is broken on the search page",
  pageUrl: "https://mkan.databayt.org/en/search",
  viewport: "1440x900",
  direction: "ltr",
  browser: "Chrome",
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.GITHUB_PERSONAL_ACCESS_TOKEN = "test-token";
  process.env.GITHUB_REPO = "databayt/mkan";
});

describe("reportIssue", () => {
  it("throws when token is not configured", async () => {
    delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

    await expect(reportIssue(baseData)).rejects.toThrow("not configured");
  });

  it("does not expose env var name in error", async () => {
    delete process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

    await expect(reportIssue(baseData)).rejects.not.toThrow(
      "GITHUB_PERSONAL_ACCESS_TOKEN"
    );
  });

  it("creates GitHub issue via fetch", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", name: "Test User", email: "test@test.com" },
    } as never);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ html_url: "https://github.com/databayt/mkan/issues/1" }),
    });

    await reportIssue(baseData);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("api.github.com/repos/databayt/mkan/issues"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      })
    );
  });

  it("includes reporter info from session", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "1", name: "John", email: "john@test.com" },
    } as never);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ html_url: "url" }),
    });

    await reportIssue(baseData);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.body).toContain("John");
    expect(body.body).toContain("john@test.com");
  });

  it("handles anonymous reporter", async () => {
    mockAuth.mockRejectedValue(new Error("no session"));
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ html_url: "url" }),
    });

    await reportIssue(baseData);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.body).toContain("Anonymous");
  });

  it("truncates long descriptions in title", async () => {
    mockAuth.mockResolvedValue(null as never);
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ html_url: "url" }),
    });

    const longData = { ...baseData, description: "a".repeat(200) };
    await reportIssue(longData);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.title.length).toBeLessThanOrEqual(80);
  });

  it("retries without labels on 422", async () => {
    mockAuth.mockResolvedValue(null as never);
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 422 })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ html_url: "url" }),
      });

    await reportIssue(baseData);

    // First call includes labels
    const firstPayload = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(firstPayload.labels).toEqual(["report"]);

    // Second call (retry) has no labels
    const secondPayload = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(secondPayload.labels).toBeUndefined();
  });

  it("throws on non-422 API error", async () => {
    mockAuth.mockResolvedValue(null as never);
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      text: () => Promise.resolve("Internal Server Error"),
    });

    await expect(reportIssue(baseData)).rejects.toThrow(
      "GitHub API error: 500"
    );
    consoleSpy.mockRestore();
  });

  it("posts acknowledgment comment after issue creation", async () => {
    mockAuth.mockResolvedValue(null as never);
    const commentsUrl =
      "https://api.github.com/repos/databayt/mkan/issues/1/comments";
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ html_url: "url", comments_url: commentsUrl }),
    });

    await reportIssue(baseData);

    // Second fetch call should be the acknowledgment comment
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(mockFetch.mock.calls[1][0]).toBe(commentsUrl);
    const commentBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(commentBody.body).toContain("queued for automated review");
  });
});
