import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn() }));

vi.mock("../../auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({
  db: {
    user: { findUnique: mocks.findUnique },
    sprintPrompt: { create: mocks.create, update: mocks.update, count: mocks.count, findUniqueOrThrow: vi.fn() },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), unstable_cache: (f: unknown) => f }));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

import { addSprintPrompt } from "@/lib/actions/monetize-actions";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

describe("/monetize writes are admin-only, by the database", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.count.mockResolvedValue(0);
    mocks.create.mockResolvedValue({ id: "p1" });
    mocks.update.mockResolvedValue({});
  });

  it("refuses an anonymous caller", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(addSprintPrompt(form({ sprintId: "s1", text: "In ~/mkan: anything" }))).rejects.toThrow("Unauthorized");
  });

  it("refuses a token that says admin when the database no longer does (a demoted admin)", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "ADMIN" } });
    mocks.findUnique.mockResolvedValue({ role: "USER", isSuspended: false });
    await expect(addSprintPrompt(form({ sprintId: "s1", text: "In ~/mkan: anything" }))).rejects.toThrow("Unauthorized");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("stores an admin's prompt marked as web text and blocked until the Mac approves it", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "u1", role: "SUPER_ADMIN" } });
    mocks.findUnique.mockResolvedValue({ role: "SUPER_ADMIN", isSuspended: false });
    await addSprintPrompt(form({ sprintId: "s1", text: "In ~/mkan: do the thing" }));
    const data = mocks.create.mock.calls[0]![0].data;
    expect(data.status).toBe("blocked");
    expect(data.text.startsWith("⏸ web · ")).toBe(true);
    expect(mocks.update.mock.calls[0]![0].data.result).toContain("pnpm sprint:approve p1");
  });
});
