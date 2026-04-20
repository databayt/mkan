import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @prisma/client — vi.mock factories are hoisted and cannot reference
// outer variables, so define the enum inline.
vi.mock("@prisma/client", () => ({
  UserRole: {
    ADMIN: "ADMIN",
    USER: "USER",
    MANAGER: "MANAGER",
    TENANT: "TENANT",
    DRIVER: "DRIVER",
  },
}));

import {
  LoginSchema,
  RegisterSchema,
  ResetSchema,
  NewPasswordSchema,
  SettingsSchema,
  EmailSchema,
  PhoneSchema,
  UsernameSchema,
  checkPasswordStrength,
} from "@/components/auth/validation";

// ---------------------------------------------------------------------------
// LoginSchema
// ---------------------------------------------------------------------------

describe("LoginSchema", () => {
  it("accepts valid login data", () => {
    const result = LoginSchema.safeParse({
      email: "user@example.com",
      password: "secret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = LoginSchema.safeParse({ password: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects invalid email format", () => {
    const result = LoginSchema.safeParse({
      email: "not-an-email",
      password: "secret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = LoginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts optional code field", () => {
    const result = LoginSchema.safeParse({
      email: "user@example.com",
      password: "secret",
      code: "123456",
    });
    expect(result.success).toBe(true);
  });

  it("accepts login without code field", () => {
    const result = LoginSchema.safeParse({
      email: "user@example.com",
      password: "a",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// RegisterSchema
// ---------------------------------------------------------------------------

describe("RegisterSchema", () => {
  const validRegister = {
    email: "user@example.com",
    password: "Abcdef1!",
    name: "John Doe",
  };

  it("accepts valid registration data", () => {
    const result = RegisterSchema.safeParse(validRegister);
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const { email, ...rest } = validRegister;
    expect(RegisterSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects invalid email", () => {
    expect(
      RegisterSchema.safeParse({ ...validRegister, email: "bad" }).success
    ).toBe(false);
  });

  it("rejects empty name", () => {
    expect(
      RegisterSchema.safeParse({ ...validRegister, name: "" }).success
    ).toBe(false);
  });

  it("rejects name over 100 characters", () => {
    expect(
      RegisterSchema.safeParse({ ...validRegister, name: "a".repeat(101) })
        .success
    ).toBe(false);
  });

  it("rejects name with numbers", () => {
    expect(
      RegisterSchema.safeParse({ ...validRegister, name: "John123" }).success
    ).toBe(false);
  });

  it("allows hyphens and apostrophes in name", () => {
    expect(
      RegisterSchema.safeParse({ ...validRegister, name: "O'Brien-Smith" })
        .success
    ).toBe(true);
  });

  it("rejects short password (< 6 chars in dev)", () => {
    expect(
      RegisterSchema.safeParse({ ...validRegister, password: "Ab1!x" }).success
    ).toBe(false);
  });

  it("rejects password over 100 characters", () => {
    expect(
      RegisterSchema.safeParse({ ...validRegister, password: "A".repeat(101) })
        .success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ResetSchema
// ---------------------------------------------------------------------------

describe("ResetSchema", () => {
  it("accepts valid email", () => {
    expect(
      ResetSchema.safeParse({ email: "user@example.com" }).success
    ).toBe(true);
  });

  it("rejects missing email", () => {
    expect(ResetSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid email format", () => {
    expect(ResetSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// NewPasswordSchema
// ---------------------------------------------------------------------------

describe("NewPasswordSchema", () => {
  it("accepts valid password", () => {
    expect(
      NewPasswordSchema.safeParse({ password: "Abcdef1!" }).success
    ).toBe(true);
  });

  it("rejects short password", () => {
    expect(
      NewPasswordSchema.safeParse({ password: "Ab1!" }).success
    ).toBe(false);
  });

  it("rejects password over 100 characters", () => {
    expect(
      NewPasswordSchema.safeParse({ password: "A".repeat(101) }).success
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// SettingsSchema
// ---------------------------------------------------------------------------

describe("SettingsSchema", () => {
  it("accepts minimal valid settings", () => {
    const result = SettingsSchema.safeParse({ role: "ADMIN" });
    expect(result.success).toBe(true);
  });

  it("accepts full settings", () => {
    const result = SettingsSchema.safeParse({
      name: "Jane",
      isTwoFactorEnabled: true,
      role: "USER",
      email: "jane@example.com",
      password: "OldPass1!",
      newPassword: "NewPass2@",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid role", () => {
    const result = SettingsSchema.safeParse({ role: "SUPERADMIN" });
    expect(result.success).toBe(false);
  });

  it("rejects password without newPassword", () => {
    const result = SettingsSchema.safeParse({
      role: "ADMIN",
      password: "OldPass1!",
    });
    expect(result.success).toBe(false);
  });

  it("rejects newPassword without password", () => {
    const result = SettingsSchema.safeParse({
      role: "ADMIN",
      newPassword: "NewPass2@",
    });
    expect(result.success).toBe(false);
  });

  it("accepts both password and newPassword together", () => {
    const result = SettingsSchema.safeParse({
      role: "USER",
      password: "OldPass1!",
      newPassword: "NewPass2@",
    });
    expect(result.success).toBe(true);
  });

  it("accepts optional email", () => {
    const result = SettingsSchema.safeParse({
      role: "ADMIN",
      email: "admin@example.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email in settings", () => {
    const result = SettingsSchema.safeParse({
      role: "ADMIN",
      email: "not-email",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// EmailSchema
// ---------------------------------------------------------------------------

describe("EmailSchema", () => {
  it("accepts valid email and lowercases it", () => {
    const result = EmailSchema.safeParse("User@Example.COM");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("user@example.com");
    }
  });

  it("rejects invalid email", () => {
    expect(EmailSchema.safeParse("nope").success).toBe(false);
  });

  it("rejects disposable email (mailinator.com)", () => {
    const result = EmailSchema.safeParse("user@mailinator.com");
    expect(result.success).toBe(false);
  });

  it("rejects disposable email (tempmail.com)", () => {
    const result = EmailSchema.safeParse("user@tempmail.com");
    expect(result.success).toBe(false);
  });

  it("accepts non-disposable email", () => {
    expect(EmailSchema.safeParse("user@gmail.com").success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PhoneSchema
// ---------------------------------------------------------------------------

describe("PhoneSchema", () => {
  it("accepts valid international phone number", () => {
    expect(PhoneSchema.safeParse("+1234567890").success).toBe(true);
  });

  it("accepts phone without plus prefix", () => {
    expect(PhoneSchema.safeParse("1234567890").success).toBe(true);
  });

  it("rejects phone starting with 0", () => {
    expect(PhoneSchema.safeParse("0123456789").success).toBe(false);
  });

  it("rejects phone with letters", () => {
    expect(PhoneSchema.safeParse("+1234abc890").success).toBe(false);
  });

  it("allows undefined (optional)", () => {
    expect(PhoneSchema.safeParse(undefined).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// UsernameSchema
// ---------------------------------------------------------------------------

describe("UsernameSchema", () => {
  it("accepts valid username", () => {
    expect(UsernameSchema.safeParse("john_doe-123").success).toBe(true);
  });

  it("rejects username shorter than 3 chars", () => {
    expect(UsernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects username longer than 30 chars", () => {
    expect(UsernameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("rejects username with special characters", () => {
    expect(UsernameSchema.safeParse("user@name").success).toBe(false);
  });

  it("rejects reserved username 'admin'", () => {
    expect(UsernameSchema.safeParse("admin").success).toBe(false);
  });

  it("rejects reserved username 'root' (case-insensitive)", () => {
    expect(UsernameSchema.safeParse("Root").success).toBe(false);
  });

  it("rejects reserved username 'api'", () => {
    expect(UsernameSchema.safeParse("api").success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkPasswordStrength
// ---------------------------------------------------------------------------

describe("checkPasswordStrength", () => {
  it("returns low score for short password", () => {
    const { score, feedback } = checkPasswordStrength("abc");
    expect(score).toBeLessThanOrEqual(2);
    expect(feedback).toContain("Use at least 8 characters");
  });

  it("returns higher score for strong password", () => {
    const { score } = checkPasswordStrength("MyStr0ng!Pass");
    expect(score).toBeGreaterThanOrEqual(4);
  });

  it("provides feedback for missing uppercase", () => {
    const { feedback } = checkPasswordStrength("lowercase1!");
    expect(feedback).toContain("Add uppercase letters");
  });

  it("provides feedback for missing numbers", () => {
    const { feedback } = checkPasswordStrength("NoNumbers!");
    expect(feedback).toContain("Add numbers");
  });

  it("provides feedback for missing special characters", () => {
    const { feedback } = checkPasswordStrength("NoSpecial1");
    expect(feedback).toContain("Add special characters");
  });

  it("caps score at 5", () => {
    const { score } = checkPasswordStrength("V3ryStr0ng!P@ssw0rd");
    expect(score).toBeLessThanOrEqual(5);
  });
});
