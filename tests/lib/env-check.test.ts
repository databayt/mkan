import { describe, it, expect, vi, beforeEach } from "vitest";

// Save original env so we can restore per test
const originalEnv = { ...process.env };

describe("validateEnv", () => {
  beforeEach(() => {
    vi.resetModules();
    // Reset env to a clean state
    process.env = { ...originalEnv };
    // Clear build-time flag
    delete process.env.NEXT_PHASE;
  });

  it("passes with all required variables valid", async () => {
    process.env.DATABASE_URL = "https://db.example.com/mydb";
    process.env.NEXTAUTH_SECRET =
      "a-very-long-secret-that-is-at-least-32-chars!!";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.NODE_ENV = "development";

    const { validateEnv } = await import("@/lib/env-check");
    const env = validateEnv();

    expect(env.DATABASE_URL).toBe("https://db.example.com/mydb");
    expect(env.NEXTAUTH_SECRET).toBe(
      "a-very-long-secret-that-is-at-least-32-chars!!"
    );
    expect(env.NEXTAUTH_URL).toBe("http://localhost:3000");
  });

  it("warns in development when variables are missing", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { validateEnv } = await import("@/lib/env-check");
    // Should NOT throw in development, just warn
    const env = validateEnv();

    expect(env).toBeDefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Environment validation warnings")
    );

    warnSpy.mockRestore();
  });

  it("logs an error but does not throw in production when required variables are missing", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnv } = await import("@/lib/env-check");

    // In production, we must NOT throw at module load — it crashes the
    // serverless function before any handler runs. Log loudly instead.
    expect(() => validateEnv()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Environment validation failed")
    );

    errorSpy.mockRestore();
  });

  it("flags NEXTAUTH_SECRET shorter than 32 characters in production (logs, does not throw)", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "https://db.example.com/mydb";
    process.env.NEXTAUTH_SECRET = "short";
    process.env.NEXTAUTH_URL = "https://example.com";

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnv } = await import("@/lib/env-check");

    expect(() => validateEnv()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEXTAUTH_SECRET must be at least 32 characters")
    );

    errorSpy.mockRestore();
  });

  it("flags DATABASE_URL that is not a valid URL in production (logs, does not throw)", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "not-a-url";
    process.env.NEXTAUTH_SECRET =
      "a-very-long-secret-that-is-at-least-32-chars!!";
    process.env.NEXTAUTH_URL = "https://example.com";

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnv } = await import("@/lib/env-check");

    expect(() => validateEnv()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("DATABASE_URL must be a valid URL")
    );

    errorSpy.mockRestore();
  });

  it("skips strict validation during build time", async () => {
    process.env.NEXT_PHASE = "phase-production-build";
    // Leave required vars missing
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { validateEnv } = await import("@/lib/env-check");
    // Should NOT throw even with missing vars
    const env = validateEnv();

    expect(env).toBeDefined();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping strict env validation during build")
    );

    logSpy.mockRestore();
  });

  it("flags non-HTTPS NEXTAUTH_URL in production (logs, does not throw)", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "https://db.example.com/mydb";
    process.env.NEXTAUTH_SECRET =
      "a-very-long-secret-that-is-at-least-32-chars!!";
    process.env.NEXTAUTH_URL = "http://example.com"; // not https

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnv } = await import("@/lib/env-check");

    expect(() => validateEnv()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEXTAUTH_URL must use HTTPS")
    );

    errorSpy.mockRestore();
  });

  it("allows HTTP for NEXTAUTH_URL in development", async () => {
    process.env.NODE_ENV = "development";
    process.env.DATABASE_URL = "https://db.example.com/mydb";
    process.env.NEXTAUTH_SECRET =
      "a-very-long-secret-that-is-at-least-32-chars!!";
    process.env.NEXTAUTH_URL = "http://localhost:3000";

    const { validateEnv } = await import("@/lib/env-check");
    const env = validateEnv();

    expect(env.NEXTAUTH_URL).toBe("http://localhost:3000");
  });

  it("treats empty-string optional URL/email vars as unset", async () => {
    process.env.NODE_ENV = "production";
    process.env.DATABASE_URL = "https://db.example.com/mydb";
    process.env.NEXTAUTH_SECRET =
      "a-very-long-secret-that-is-at-least-32-chars!!";
    process.env.NEXTAUTH_URL = "https://example.com";
    // These empty values previously failed `.url()` / `.email()` validation
    process.env.UPSTASH_REDIS_REST_URL = "";
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = "";
    process.env.EMAIL_FROM = "";

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnv } = await import("@/lib/env-check");
    expect(() => validateEnv()).not.toThrow();
    // No validation errors should be logged for the empty optional fields
    expect(errorSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Environment validation failed")
    );

    errorSpy.mockRestore();
  });
});

describe("validateEnvWithLogging", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PHASE;
  });

  it("logs success when validation passes", async () => {
    process.env.DATABASE_URL = "https://db.example.com/mydb";
    process.env.NEXTAUTH_SECRET =
      "a-very-long-secret-that-is-at-least-32-chars!!";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.NODE_ENV = "development";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const { validateEnvWithLogging } = await import("@/lib/env-check");
    validateEnvWithLogging();

    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Validating environment variables")
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining("Environment validation complete")
    );

    logSpy.mockRestore();
  });

  it("warns and continues in development when validation fails", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { validateEnvWithLogging } = await import("@/lib/env-check");
    // Should not throw in development
    const env = validateEnvWithLogging();
    expect(env).toBeDefined();

    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it("logs an error but does not throw in production when validation fails", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    delete process.env.NEXTAUTH_SECRET;
    delete process.env.NEXTAUTH_URL;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { validateEnvWithLogging } = await import("@/lib/env-check");

    expect(() => validateEnvWithLogging()).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Environment validation failed")
    );

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });
});

describe("serviceStatus", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("detects imageKit as configured when all vars present", async () => {
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = "pub_key";
    process.env.IMAGEKIT_PRIVATE_KEY = "priv_key";
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = "https://ik.io/test";

    // Suppress console.log from module-level logging
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { serviceStatus } = await import("@/lib/env-check");

    expect(serviceStatus.imageKit).toBe(true);
    logSpy.mockRestore();
  });

  it("detects imageKit as not configured when vars missing", async () => {
    delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
    delete process.env.IMAGEKIT_PRIVATE_KEY;
    delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { serviceStatus } = await import("@/lib/env-check");

    expect(serviceStatus.imageKit).toBe(false);
    logSpy.mockRestore();
  });

  it("detects email as configured when both vars present", async () => {
    process.env.RESEND_API_KEY = "re_123";
    process.env.EMAIL_FROM = "test@example.com";

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { serviceStatus } = await import("@/lib/env-check");

    expect(serviceStatus.email).toBe(true);
    logSpy.mockRestore();
  });
});
