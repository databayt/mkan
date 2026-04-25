import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db", () => ({
  db: {
    tenant: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    lease: {
      findMany: vi.fn(),
    },
  },
}));

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

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/sanitization", () => ({
  sanitizeInput: vi.fn((s: string) => s.trim()),
  sanitizeEmail: vi.fn((s: string) => s.trim().toLowerCase()),
  sanitizePhone: vi.fn((s: string) => s.replace(/\s/g, "")),
  sanitizeHtml: vi.fn((s: string) => s),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@prisma/client", () => ({
  UserRole: {
    USER: "USER",
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
  },
}));

import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import {
  getAuthUser,
  getTenant,
  updateTenantSettings,
  updateManagerSettings,
  getCurrentResidences,
  addFavoriteProperty,
  removeFavoriteProperty,
} from "@/lib/actions/user-actions";

const mockAuth = vi.mocked(auth);
const mockDb = vi.mocked(db);

const tenantSession = {
  user: { id: "user-1", name: "Test", email: "test@test.com", role: "user" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

const managerSession = {
  user: { id: "mgr-1", name: "Manager", email: "mgr@test.com", role: "manager" },
  expires: new Date(Date.now() + 86400000).toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ============================================
// getAuthUser
// ============================================

describe("getAuthUser", () => {
  it("throws when no session", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getAuthUser()).rejects.toThrow("Failed to get authenticated user");
  });

  it("returns manager info directly from session", async () => {
    mockAuth.mockResolvedValue(managerSession as never);

    const result = await getAuthUser();

    expect(result.userRole).toBe("manager");
    expect(result.userInfo).toHaveProperty("id", "mgr-1");
    expect(result.email).toBe("mgr@test.com");
  });

  it("fetches tenant profile for non-manager user", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.findUnique.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      email: "test@test.com",
      phoneNumber: "123",
    } as never);

    const result = await getAuthUser();

    expect(result.userRole).toBe("user");
    expect(mockDb.tenant.findUnique).toHaveBeenCalledWith({ where: { userId: "user-1" } });
  });

  it("auto-creates tenant profile if not found", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.findUnique.mockResolvedValue(null);
    mockDb.tenant.create.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "Test",
      email: "test@test.com",
      phoneNumber: "",
    } as never);

    const result = await getAuthUser();

    expect(mockDb.tenant.create).toHaveBeenCalled();
    expect(result.userInfo).toBeTruthy();
  });

  it("returns fallback info when db fails", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.findUnique.mockRejectedValue(new Error("DB down"));

    const result = await getAuthUser();

    // Should return gracefully with fallback data
    expect(result.id).toBe("user-1");
    expect(result.userInfo).toBeTruthy();
  });
});

// ============================================
// getTenant
// ============================================

describe("getTenant", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getTenant("user-1")).rejects.toThrow("Unauthorized");
  });

  it("throws for invalid user ID", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(getTenant("")).rejects.toThrow("Invalid user ID");
  });

  it("throws when viewing another user's profile", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(getTenant("other-user")).rejects.toThrow("Unauthorized");
  });

  it("returns existing tenant profile", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    const tenant = { id: 1, userId: "user-1", name: "Test", favorites: [], applications: [], leases: [] };
    mockDb.tenant.findUnique.mockResolvedValue(tenant as never);

    const result = await getTenant("user-1");

    expect(result).toEqual(tenant);
  });

  it("auto-creates tenant when not found", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.findUnique.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({
      id: "user-1",
      email: "test@test.com",
      username: "testuser",
    } as never);
    mockDb.tenant.create.mockResolvedValue({
      id: 1,
      userId: "user-1",
      name: "testuser",
    } as never);

    const result = await getTenant("user-1");

    expect(mockDb.tenant.create).toHaveBeenCalled();
    expect(result).toHaveProperty("userId", "user-1");
  });
});

// ============================================
// updateTenantSettings
// ============================================

describe("updateTenantSettings", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(updateTenantSettings("user-1", { name: "New" })).rejects.toThrow();
  });

  it("throws when updating another user's settings", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(updateTenantSettings("other-user", { name: "New" })).rejects.toThrow(
      "Failed to update tenant settings"
    );
  });

  it("throws for invalid settings data", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(
      updateTenantSettings("user-1", { email: "not-an-email" })
    ).rejects.toThrow("Failed to update tenant settings");
  });

  it("updates tenant settings with sanitized input", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.update.mockResolvedValue({ id: 1, name: "New Name" } as never);

    await updateTenantSettings("user-1", { name: "  New Name  " });

    expect(mockDb.tenant.update).toHaveBeenCalled();
  });
});

// ============================================
// updateManagerSettings
// ============================================

describe("updateManagerSettings", () => {
  it("throws when updating another user's settings", async () => {
    mockAuth.mockResolvedValue(managerSession as never);

    await expect(updateManagerSettings("other-user", { username: "x" })).rejects.toThrow(
      "Failed to update manager settings"
    );
  });

  it("updates manager user record", async () => {
    mockAuth.mockResolvedValue(managerSession as never);
    mockDb.user.update.mockResolvedValue({ id: "mgr-1", username: "newname" } as never);

    const result = await updateManagerSettings("mgr-1", { username: "newname" });

    expect(mockDb.user.update).toHaveBeenCalled();
    expect(result).toHaveProperty("username", "newname");
  });
});

// ============================================
// addFavoriteProperty / removeFavoriteProperty
// ============================================

describe("addFavoriteProperty", () => {
  it("throws for invalid input", async () => {
    await expect(addFavoriteProperty("", 1)).rejects.toThrow("Invalid input");
    await expect(addFavoriteProperty("user-1", -1)).rejects.toThrow("Invalid input");
  });

  it("throws when adding for another user", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(addFavoriteProperty("other-user", 1)).rejects.toThrow(
      "Failed to add property to favorites"
    );
  });

  it("connects property to tenant favorites", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.update.mockResolvedValue({ id: 1, favorites: [{ id: 5 }] } as never);

    const result = await addFavoriteProperty("user-1", 5);

    expect(mockDb.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { favorites: { connect: { id: 5 } } },
      })
    );
    expect(result).toBeTruthy();
  });
});

describe("removeFavoriteProperty", () => {
  it("throws for invalid input", async () => {
    await expect(removeFavoriteProperty("", 1)).rejects.toThrow("Invalid input");
  });

  it("disconnects property from tenant favorites", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.tenant.update.mockResolvedValue({ id: 1, favorites: [] } as never);

    await removeFavoriteProperty("user-1", 5);

    expect(mockDb.tenant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { favorites: { disconnect: { id: 5 } } },
      })
    );
  });
});

// ============================================
// getCurrentResidences
// ============================================

describe("getCurrentResidences", () => {
  it("throws when not authenticated", async () => {
    mockAuth.mockResolvedValue(null as never);

    await expect(getCurrentResidences("user-1")).rejects.toThrow("Unauthorized");
  });

  it("throws when viewing another user's residences", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);

    await expect(getCurrentResidences("other-user")).rejects.toThrow("Unauthorized");
  });

  it("returns current active leases as listings", async () => {
    mockAuth.mockResolvedValue(tenantSession as never);
    mockDb.lease.findMany.mockResolvedValue([
      { listing: { id: 1, title: "Flat A" } },
      { listing: { id: 2, title: "Flat B" } },
    ] as never);

    const result = await getCurrentResidences("user-1");

    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty("title", "Flat A");
  });
});
