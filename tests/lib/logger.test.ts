import { describe, it, expect, vi, beforeEach } from "vitest";

// Save original NODE_ENV
const originalEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "debug").mockImplementation(() => {});
});

describe("logger", () => {
  it("info logs in development", async () => {
    process.env.NODE_ENV = "development";
    // Re-import to get fresh module with isDev = true
    vi.resetModules();
    const { logger } = await import("@/lib/logger");

    logger.info("test message");
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining("INFO: test message"));
  });

  it("warn always logs (single-line JSON in production)", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { logger } = await import("@/lib/logger");

    logger.warn("warning message");
    const line = (console.warn as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(line);
    expect(parsed.level).toBe("warn");
    expect(parsed.msg).toBe("warning message");
  });

  it("info logs in production and redacts sensitive keys", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();
    const { logger } = await import("@/lib/logger");

    logger.info("payment event", { bookingId: 7, token: "secret-value" });
    const line = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(line);
    expect(parsed.bookingId).toBe(7);
    expect(parsed.token).toBe("[redacted]");
    expect(line).not.toContain("secret-value");
  });

  it("error logs with error details", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { logger } = await import("@/lib/logger");

    const err = new Error("test error");
    logger.error("something failed", err);
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("ERROR: something failed")
    );
  });

  it("error includes Error message in meta", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { logger } = await import("@/lib/logger");

    logger.error("fail", new Error("details"));
    const loggedStr = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(loggedStr).toContain("details");
  });

  it("debug logs in development", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { logger } = await import("@/lib/logger");

    logger.debug("debug info");
    expect(console.debug).toHaveBeenCalledWith(expect.stringContaining("DEBUG: debug info"));
  });

  it("info includes metadata", async () => {
    process.env.NODE_ENV = "development";
    vi.resetModules();
    const { logger } = await import("@/lib/logger");

    logger.info("test", { key: "value" });
    const loggedStr = (console.log as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(loggedStr).toContain('"key":"value"');
  });

  it("error in production with Error instance does not crash (Sentry catch path)", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const { logger } = await import("@/lib/logger");
    const err = new Error("prod error");

    // Should not throw even if Sentry is not installed
    expect(() => logger.error("production failure", err)).not.toThrow();
    const line = (console.error as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const parsed = JSON.parse(line);
    expect(parsed.msg).toBe("production failure");
    expect(parsed.errorMessage).toBe("prod error");
  });

  it("error in production with non-Error value does not crash", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const { logger } = await import("@/lib/logger");

    expect(() => logger.error("production failure", "string error")).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  it("error in production with undefined error does not crash", async () => {
    process.env.NODE_ENV = "production";
    vi.resetModules();

    const { logger } = await import("@/lib/logger");

    expect(() => logger.error("production failure")).not.toThrow();
    expect(console.error).toHaveBeenCalled();
  });

  // Restore NODE_ENV
  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });
});
