import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories must not reference top-level variables — use inline objects
vi.mock("@/lib/db", () => ({
  db: {
    twoFactorToken: { delete: vi.fn(), create: vi.fn() },
    passwordResetToken: { delete: vi.fn(), create: vi.fn() },
    verificationToken: { delete: vi.fn(), create: vi.fn() },
  },
}));

vi.mock("@/components/auth/verification/2f-token", () => ({
  getTwoFactorTokenByEmail: vi.fn(),
}));
vi.mock("@/components/auth/reset/password-reset-token", () => ({
  getPasswordResetTokenByEmail: vi.fn(),
}));
vi.mock("@/components/auth/verification/verificiation-token", () => ({
  getVerificationTokenByEmail: vi.fn(),
}));

import { db } from "@/lib/db";
import { getTwoFactorTokenByEmail } from "@/components/auth/verification/2f-token";
import { getPasswordResetTokenByEmail } from "@/components/auth/reset/password-reset-token";
import { getVerificationTokenByEmail } from "@/components/auth/verification/verificiation-token";

import {
  generateTwoFactorToken,
  generatePasswordResetToken,
  generateVerificationToken,
} from "@/lib/tokens";

const mockDb = vi.mocked(db);
const mockGetTwoFactor = vi.mocked(getTwoFactorTokenByEmail);
const mockGetPasswordReset = vi.mocked(getPasswordResetTokenByEmail);
const mockGetVerification = vi.mocked(getVerificationTokenByEmail);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateTwoFactorToken", () => {
  it("creates a 6-digit token with 5-minute expiry", async () => {
    mockGetTwoFactor.mockResolvedValue(null);
    const created = { id: "1", email: "test@test.com", token: "123456", expires: new Date() };
    mockDb.twoFactorToken.create.mockResolvedValue(created);

    const result = await generateTwoFactorToken("test@test.com");

    expect(mockDb.twoFactorToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        email: "test@test.com",
        token: expect.stringMatching(/^\d{6}$/),
      }),
    });
    const expiresArg = (mockDb.twoFactorToken.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data.expires;
    const diffMs = expiresArg.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(4 * 60 * 1000);
    expect(diffMs).toBeLessThan(6 * 60 * 1000);
    expect(result).toBe(created);
  });

  it("deletes existing token before creating new one", async () => {
    mockGetTwoFactor.mockResolvedValue({ id: "old-id", email: "test@test.com", token: "000000", expires: new Date() });
    mockDb.twoFactorToken.create.mockResolvedValue({} as never);

    await generateTwoFactorToken("test@test.com");

    expect(mockDb.twoFactorToken.delete).toHaveBeenCalledWith({
      where: { id: "old-id" },
    });
  });

  it("skips delete when no existing token", async () => {
    mockGetTwoFactor.mockResolvedValue(null);
    mockDb.twoFactorToken.create.mockResolvedValue({} as never);

    await generateTwoFactorToken("test@test.com");

    expect(mockDb.twoFactorToken.delete).not.toHaveBeenCalled();
  });
});

describe("generatePasswordResetToken", () => {
  it("creates a UUID token with 1-hour expiry", async () => {
    mockGetPasswordReset.mockResolvedValue(null);
    const created = { id: "1", email: "test@test.com", token: "uuid-token", expires: new Date() };
    mockDb.passwordResetToken.create.mockResolvedValue(created);

    const result = await generatePasswordResetToken("test@test.com");

    const callData = (mockDb.passwordResetToken.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(callData.email).toBe("test@test.com");
    expect(callData.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    const diffMs = callData.expires.getTime() - Date.now();
    expect(diffMs).toBeGreaterThan(55 * 60 * 1000);
    expect(diffMs).toBeLessThan(65 * 60 * 1000);
    expect(result).toBe(created);
  });

  it("deletes existing token before creating new one", async () => {
    mockGetPasswordReset.mockResolvedValue({ id: "old-id", email: "t@t.com", token: "x", expires: new Date() });
    mockDb.passwordResetToken.create.mockResolvedValue({} as never);

    await generatePasswordResetToken("t@t.com");

    expect(mockDb.passwordResetToken.delete).toHaveBeenCalledWith({
      where: { id: "old-id" },
    });
  });
});

describe("generateVerificationToken", () => {
  it("creates a UUID token with 1-hour expiry", async () => {
    mockGetVerification.mockResolvedValue(null);
    const created = { id: "1", email: "test@test.com", token: "uuid-token", expires: new Date() };
    mockDb.verificationToken.create.mockResolvedValue(created);

    const result = await generateVerificationToken("test@test.com");

    const callData = (mockDb.verificationToken.create as ReturnType<typeof vi.fn>).mock.calls[0][0].data;
    expect(callData.email).toBe("test@test.com");
    expect(callData.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
    expect(result).toBe(created);
  });

  it("deletes existing token before creating new one", async () => {
    mockGetVerification.mockResolvedValue({ id: "old-id", email: "t@t.com", token: "x", expires: new Date() });
    mockDb.verificationToken.create.mockResolvedValue({} as never);

    await generateVerificationToken("t@t.com");

    expect(mockDb.verificationToken.delete).toHaveBeenCalledWith({
      where: { id: "old-id" },
    });
  });
});
