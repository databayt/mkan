import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({ id: "msg-1" }),
}));

vi.mock("resend", () => ({
  Resend: class MockResend {
    emails = { send: mockSend };
  },
}));

import {
  sendTwoFactorTokenEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@/lib/mail";

beforeEach(() => {
  mockSend.mockClear();
});

describe("sendTwoFactorTokenEmail", () => {
  it("sends 2FA code email with correct params", async () => {
    await sendTwoFactorTokenEmail("user@test.com", "123456");

    expect(mockSend).toHaveBeenCalledWith({
      from: "onboarding@resend.dev",
      to: "user@test.com",
      subject: "2FA Code",
      html: expect.stringContaining("123456"),
    });
  });
});

describe("sendPasswordResetEmail", () => {
  it("sends reset email with link containing token", async () => {
    await sendPasswordResetEmail("user@test.com", "reset-token-123");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Reset your password",
        html: expect.stringContaining("reset-token-123"),
      })
    );
  });

  it("includes correct reset link format", async () => {
    await sendPasswordResetEmail("user@test.com", "token-abc");

    const html = mockSend.mock.calls[0][0].html;
    expect(html).toContain("/new-password?token=token-abc");
  });
});

describe("sendVerificationEmail", () => {
  it("sends verification email with link containing token", async () => {
    await sendVerificationEmail("user@test.com", "verify-token-456");

    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "user@test.com",
        subject: "Confirm your email",
        html: expect.stringContaining("verify-token-456"),
      })
    );
  });

  it("includes correct verification link format", async () => {
    await sendVerificationEmail("user@test.com", "token-xyz");

    const html = mockSend.mock.calls[0][0].html;
    expect(html).toContain("/new-verification?token=token-xyz");
  });
});
