import { vi } from "vitest";

type MockUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  isTwoFactorEnabled: boolean;
  isOAuth: boolean;
};

type MockSession = {
  user: MockUser;
  expires: string;
};

const defaultUser: MockUser = {
  id: "user-1",
  name: "Test User",
  email: "test@example.com",
  role: "USER",
  isTwoFactorEnabled: false,
  isOAuth: false,
};

export function createMockSession(overrides?: Partial<MockUser>): MockSession {
  return {
    user: { ...defaultUser, ...overrides },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function mockAuthenticatedUser(
  roleOrOverrides?: string | Partial<MockUser>
): MockSession {
  const overrides =
    typeof roleOrOverrides === "string"
      ? { role: roleOrOverrides }
      : roleOrOverrides;
  return createMockSession(overrides);
}

export function mockUnauthenticated(): null {
  return null;
}

/**
 * Helper to set up auth mock for a test file.
 *
 * Usage at top of test file:
 *   const mockAuth = vi.fn();
 *   vi.mock('@/lib/auth', () => ({ auth: mockAuth }));
 *
 * In tests:
 *   mockAuth.mockResolvedValue(mockAuthenticatedUser('ADMIN'));
 *   mockAuth.mockResolvedValue(mockUnauthenticated());
 */
export { defaultUser };
