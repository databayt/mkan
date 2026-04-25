import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next/navigation - redirect throws to halt execution like the real one
const REDIRECT_ERROR = "NEXT_REDIRECT";
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error(REDIRECT_ERROR);
    (error as any).url = url;
    throw error;
  }),
}));

// Mock @/lib/auth
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

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { requireAuth, requireRole } from "@/lib/auth-guard";

const mockAuth = vi.mocked(auth);
const mockRedirect = vi.mocked(redirect);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requireAuth", () => {
  it("returns session when user is authenticated", async () => {
    const mockSession = {
      user: { id: "1", name: "Test", email: "test@example.com", role: "USER" },
      expires: "2026-12-31",
    };
    mockAuth.mockResolvedValue(mockSession as any);

    const result = await requireAuth("en");
    expect(result).toEqual(mockSession);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to login when no session", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireAuth("en")).rejects.toThrow(REDIRECT_ERROR);
    expect(mockRedirect).toHaveBeenCalledWith("/en/login");
  });

  it("redirects to login when session has no user", async () => {
    mockAuth.mockResolvedValue({ expires: "2026-12-31" } as any);

    await expect(requireAuth("en")).rejects.toThrow(REDIRECT_ERROR);
    expect(mockRedirect).toHaveBeenCalledWith("/en/login");
  });

  it("uses correct locale in redirect", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireAuth("ar")).rejects.toThrow(REDIRECT_ERROR);
    expect(mockRedirect).toHaveBeenCalledWith("/ar/login");
  });
});

describe("requireRole", () => {
  it("returns session when user has required role", async () => {
    const mockSession = {
      user: { id: "1", name: "Admin", email: "admin@example.com", role: "ADMIN" },
      expires: "2026-12-31",
    };
    mockAuth.mockResolvedValue(mockSession as any);

    const result = await requireRole("en", ["ADMIN", "MANAGER"]);
    expect(result).toEqual(mockSession);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to home when user lacks required role", async () => {
    const mockSession = {
      user: { id: "1", name: "User", email: "user@example.com", role: "USER" },
      expires: "2026-12-31",
    };
    mockAuth.mockResolvedValue(mockSession as any);

    await expect(requireRole("en", ["ADMIN", "MANAGER"])).rejects.toThrow(REDIRECT_ERROR);
    expect(mockRedirect).toHaveBeenCalledWith("/en");
  });

  it("redirects to login when not authenticated", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(requireRole("en", ["ADMIN"])).rejects.toThrow(REDIRECT_ERROR);
    expect(mockRedirect).toHaveBeenCalledWith("/en/login");
  });

  it("uses correct locale for role redirect", async () => {
    const mockSession = {
      user: { id: "1", name: "User", email: "user@example.com", role: "TENANT" },
      expires: "2026-12-31",
    };
    mockAuth.mockResolvedValue(mockSession as any);

    await expect(requireRole("ar", ["ADMIN"])).rejects.toThrow(REDIRECT_ERROR);
    expect(mockRedirect).toHaveBeenCalledWith("/ar");
  });
});
