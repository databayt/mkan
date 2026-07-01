import { describe, it, expect, vi, beforeEach } from "vitest";

// The host onboarding layout is the route-boundary ownership gate added to stop
// a logged-in user from walking another host's listing flow (and only failing
// at the final "Create"). These tests exercise that gate in isolation.

const mockRequireAuth = vi.fn();
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}));

// Real canOverride logic (owner-id match OR admin/super), mirroring @/lib/auth
// without importing the heavy NextAuth chain.
vi.mock("@/lib/auth", () => ({
  canOverride: (
    session: { user?: { id?: string; role?: string } } | null | undefined,
    ownerId: string | null | undefined
  ) =>
    (!!session?.user?.id && session.user.id === ownerId) ||
    session?.user?.role === "ADMIN" ||
    session?.user?.role === "SUPER_ADMIN",
}));

vi.mock("@/lib/db", () => ({
  db: { listing: { findUnique: vi.fn() } },
}));

// redirect() throws NEXT_REDIRECT in Next.js — replicate so we can assert it.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const e = new Error("NEXT_REDIRECT") as Error & { url: string };
    e.url = url;
    throw e;
  }),
}));

// The layout returns <HostLayoutClient> but never renders it here; stub it so we
// don't pull the whole client component tree into the unit test.
vi.mock("@/app/[lang]/host/[id]/layout-client", () => ({
  default: ({ children }: { children: unknown }) => children,
}));

import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import HostLayout from "@/app/[lang]/host/[id]/layout";

const mockFindUnique = vi.mocked(db.listing.findUnique);
const mockRedirect = vi.mocked(redirect);

const ownerSession = { user: { id: "owner-1", role: "USER" } };

function invoke(id: string, lang = "en") {
  return (
    HostLayout as unknown as (a: {
      children: React.ReactNode;
      params: Promise<{ lang: string; id: string }>;
    }) => Promise<unknown>
  )({ children: null, params: Promise.resolve({ lang, id }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue(ownerSession);
});

describe("host [id] layout — ownership gate", () => {
  it("lets the owner through (no redirect)", async () => {
    mockFindUnique.mockResolvedValue({ hostId: "owner-1" } as never);

    const result = await invoke("485");

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("redirects a non-owner to the locale home", async () => {
    mockFindUnique.mockResolvedValue({ hostId: "someone-else" } as never);

    await expect(invoke("485")).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/en");
  });

  it("redirects when the listing does not exist", async () => {
    mockFindUnique.mockResolvedValue(null as never);

    await expect(invoke("999999")).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/en");
  });

  it("redirects for a non-numeric id without hitting the database", async () => {
    await expect(invoke("abc")).rejects.toThrow("NEXT_REDIRECT");
    expect(mockFindUnique).not.toHaveBeenCalled();
    expect(mockRedirect).toHaveBeenCalledWith("/en");
  });

  it("lets an ADMIN through for a listing they do not own", async () => {
    mockRequireAuth.mockResolvedValue({ user: { id: "admin-9", role: "ADMIN" } });
    mockFindUnique.mockResolvedValue({ hostId: "someone-else" } as never);

    const result = await invoke("485");

    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("preserves the locale in the redirect target (ar)", async () => {
    mockFindUnique.mockResolvedValue({ hostId: "someone-else" } as never);

    await expect(invoke("485", "ar")).rejects.toThrow("NEXT_REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/ar");
  });
});
