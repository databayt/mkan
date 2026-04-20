import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Hoisted mocks (vi.mock factories are hoisted, so use vi.hoisted) ---

const {
  mockAuth,
  mockDbTenantFindUnique,
  mockDbTenantCreate,
  mockDbTenantUpdate,
  mockDbUserFindUnique,
  mockDbUserUpdate,
  mockDbLeaseFindMany,
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockDbTenantFindUnique: vi.fn(),
  mockDbTenantCreate: vi.fn(),
  mockDbTenantUpdate: vi.fn(),
  mockDbUserFindUnique: vi.fn(),
  mockDbUserUpdate: vi.fn(),
  mockDbLeaseFindMany: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: {
    tenant: {
      findUnique: mockDbTenantFindUnique,
      create: mockDbTenantCreate,
      update: mockDbTenantUpdate,
    },
    user: {
      findUnique: mockDbUserFindUnique,
      update: mockDbUserUpdate,
    },
    lease: {
      findMany: mockDbLeaseFindMany,
    },
  },
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

import {
  getAuthUser,
  getTenant,
  updateTenantSettings,
  updateManagerSettings,
  getCurrentResidences,
  addFavoriteProperty,
  removeFavoriteProperty,
} from "@/components/auth/actions";

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------- getAuthUser ----------
describe("getAuthUser", () => {
  it("returns user info for a regular (tenant) user", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "u1",
        name: "Alice",
        email: "alice@test.com",
        image: "/img.png",
        role: "USER",
        isTwoFactorEnabled: false,
      },
    });

    const tenantProfile = {
      id: "t1",
      name: "Alice",
      email: "alice@test.com",
      phoneNumber: "555",
    };
    mockDbTenantFindUnique.mockResolvedValue(tenantProfile);

    const result = await getAuthUser();

    expect(result).toMatchObject({
      id: "u1",
      name: "Alice",
      email: "alice@test.com",
      image: "/img.png",
      role: "USER",
      userRole: "user",
    });
    expect(result.userInfo).toEqual(tenantProfile);
  });

  it("creates tenant profile when one does not exist", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "u2",
        name: "Bob",
        email: "bob@test.com",
        image: null,
        role: "USER",
        isTwoFactorEnabled: false,
      },
    });

    mockDbTenantFindUnique.mockResolvedValue(null);
    const created = {
      id: "t2",
      name: "Bob",
      email: "bob@test.com",
      phoneNumber: "",
    };
    mockDbTenantCreate.mockResolvedValue(created);

    const result = await getAuthUser();
    expect(mockDbTenantCreate).toHaveBeenCalled();
    expect(result.userInfo).toEqual(created);
  });

  it("returns manager info directly from session (no tenant lookup)", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "m1",
        name: "Manager Mike",
        email: "mike@test.com",
        image: null,
        role: "MANAGER",
        isTwoFactorEnabled: false,
      },
    });

    const result = await getAuthUser();
    expect(mockDbTenantFindUnique).not.toHaveBeenCalled();
    expect(result.userRole).toBe("manager");
    expect(result.userInfo).toMatchObject({
      id: "m1",
      name: "Manager Mike",
      email: "mike@test.com",
    });
  });

  it("throws when no session exists", async () => {
    mockAuth.mockResolvedValue(null);
    await expect(getAuthUser()).rejects.toThrow("Failed to get authenticated user");
  });

  it("throws when session has no user", async () => {
    mockAuth.mockResolvedValue({ user: null });
    await expect(getAuthUser()).rejects.toThrow("Failed to get authenticated user");
  });

  it("falls back to default userInfo when db fails", async () => {
    mockAuth.mockResolvedValue({
      user: {
        id: "u3",
        name: "Fallback",
        email: "fb@test.com",
        image: null,
        role: "USER",
        isTwoFactorEnabled: false,
      },
    });
    mockDbTenantFindUnique.mockRejectedValue(new Error("DB error"));

    const result = await getAuthUser();
    expect(result.userInfo).toMatchObject({
      id: "u3",
      name: "Fallback",
      email: "fb@test.com",
      phoneNumber: null,
    });
  });
});

// ---------- getTenant ----------
describe("getTenant", () => {
  it("returns existing tenant with includes", async () => {
    const tenant = {
      id: "t1",
      userId: "u1",
      name: "Alice",
      user: { id: "u1", email: "a@t.com", username: "alice", image: null },
      favorites: [],
      applications: [],
      leases: [],
    };
    mockDbTenantFindUnique.mockResolvedValue(tenant);

    const result = await getTenant("u1");
    expect(result).toEqual(tenant);
  });

  it("creates tenant when one does not exist", async () => {
    mockDbTenantFindUnique.mockResolvedValue(null);
    mockDbUserFindUnique.mockResolvedValue({
      id: "u2",
      email: "bob@t.com",
      username: "bob",
    });
    const created = {
      id: "t2",
      userId: "u2",
      name: "bob",
      email: "bob@t.com",
      phoneNumber: "",
      user: { id: "u2", email: "bob@t.com", username: "bob", image: null },
      favorites: [],
      applications: [],
      leases: [],
    };
    mockDbTenantCreate.mockResolvedValue(created);

    const result = await getTenant("u2");
    expect(mockDbTenantCreate).toHaveBeenCalled();
    expect(result).toEqual(created);
  });

  it("throws when user not found and no tenant exists", async () => {
    mockDbTenantFindUnique.mockResolvedValue(null);
    mockDbUserFindUnique.mockResolvedValue(null);

    await expect(getTenant("missing")).rejects.toThrow("Failed to fetch tenant profile");
  });

  it("throws on general db failure", async () => {
    mockDbTenantFindUnique.mockRejectedValue(new Error("DB down"));
    await expect(getTenant("u1")).rejects.toThrow("Failed to fetch tenant profile");
  });
});

// ---------- updateTenantSettings ----------
describe("updateTenantSettings", () => {
  it("updates tenant settings when authorized", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const updated = { id: "t1", name: "New Name", user: { id: "u1" } };
    mockDbTenantUpdate.mockResolvedValue(updated);

    const result = await updateTenantSettings("u1", { name: "New Name" });
    expect(result).toEqual(updated);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/tenants/settings");
  });

  it("throws when session user id doesn't match", async () => {
    mockAuth.mockResolvedValue({ user: { id: "other-user" } });

    await expect(
      updateTenantSettings("u1", { name: "Hack" })
    ).rejects.toThrow("Failed to update tenant settings");
  });

  it("throws when no session exists", async () => {
    mockAuth.mockResolvedValue(null);

    await expect(
      updateTenantSettings("u1", { name: "X" })
    ).rejects.toThrow("Failed to update tenant settings");
  });
});

// ---------- updateManagerSettings ----------
describe("updateManagerSettings", () => {
  it("updates manager user record when authorized", async () => {
    mockAuth.mockResolvedValue({ user: { id: "m1" } });
    const updated = { id: "m1", email: "new@t.com", username: "mgr", role: "MANAGER" };
    mockDbUserUpdate.mockResolvedValue(updated);

    const result = await updateManagerSettings("m1", { username: "mgr", email: "new@t.com" });
    expect(result).toEqual(updated);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/managers/settings");
  });

  it("throws when unauthorized", async () => {
    mockAuth.mockResolvedValue({ user: { id: "other" } });

    await expect(
      updateManagerSettings("m1", { username: "x" })
    ).rejects.toThrow("Failed to update manager settings");
  });
});

// ---------- getCurrentResidences ----------
describe("getCurrentResidences", () => {
  it("returns listings from active leases", async () => {
    const listing = {
      id: 1,
      title: "Apt 1",
      description: "Nice",
      pricePerNight: 100,
      photoUrls: [],
      bedrooms: 2,
      bathrooms: 1,
      location: "NYC",
      host: { id: "h1", email: "h@t.com", username: "host" },
    };
    mockDbLeaseFindMany.mockResolvedValue([{ listing }]);

    const result = await getCurrentResidences("u1");
    expect(result).toEqual([listing]);
  });

  it("returns empty array when no active leases", async () => {
    mockDbLeaseFindMany.mockResolvedValue([]);

    const result = await getCurrentResidences("u1");
    expect(result).toEqual([]);
  });

  it("throws on db failure", async () => {
    mockDbLeaseFindMany.mockRejectedValue(new Error("DB error"));

    await expect(getCurrentResidences("u1")).rejects.toThrow(
      "Failed to fetch current residences"
    );
  });
});

// ---------- addFavoriteProperty ----------
describe("addFavoriteProperty", () => {
  it("adds property to favorites when authorized", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const updated = { id: "t1", favorites: [{ id: 5, title: "Beach House" }] };
    mockDbTenantUpdate.mockResolvedValue(updated);

    const result = await addFavoriteProperty("u1", 5);
    expect(result).toEqual(updated);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/tenants/favorites");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/search");
  });

  it("throws when unauthorized", async () => {
    mockAuth.mockResolvedValue({ user: { id: "other" } });

    await expect(addFavoriteProperty("u1", 5)).rejects.toThrow(
      "Failed to add property to favorites"
    );
  });
});

// ---------- removeFavoriteProperty ----------
describe("removeFavoriteProperty", () => {
  it("removes property from favorites when authorized", async () => {
    mockAuth.mockResolvedValue({ user: { id: "u1" } });
    const updated = { id: "t1", favorites: [] };
    mockDbTenantUpdate.mockResolvedValue(updated);

    const result = await removeFavoriteProperty("u1", 5);
    expect(result).toEqual(updated);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/tenants/favorites");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/search");
  });

  it("throws when unauthorized", async () => {
    mockAuth.mockResolvedValue({ user: { id: "other" } });

    await expect(removeFavoriteProperty("u1", 5)).rejects.toThrow(
      "Failed to remove property from favorites"
    );
  });
});
