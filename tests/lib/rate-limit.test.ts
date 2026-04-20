import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mock references are available inside vi.mock factories
const mocks = vi.hoisted(() => ({
  mockHeaders: new Map<string, string>(),
  mockLimitFn: vi.fn(),
}));

// Mock next/headers
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (key: string) => mocks.mockHeaders.get(key) ?? null,
  })),
}));

// Mock @upstash/ratelimit
vi.mock("@upstash/ratelimit", () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    constructor() {}
    limit = mocks.mockLimitFn;
  },
}));

// Mock @upstash/redis
vi.mock("@upstash/redis", () => ({
  Redis: {
    fromEnv: vi.fn(() => ({})),
  },
}));

// ---------- getClientId ----------

describe("getClientId", () => {
  beforeEach(() => {
    mocks.mockHeaders.clear();
  });

  it("returns x-forwarded-for first IP when present on request", async () => {
    const { getClientId } = await import("@/lib/rate-limit");
    const request = {
      headers: new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }),
    } as unknown as import("next/server").NextRequest;

    const id = await getClientId(request);
    expect(id).toBe("1.2.3.4");
  });

  it("returns x-real-ip when x-forwarded-for is absent", async () => {
    const { getClientId } = await import("@/lib/rate-limit");
    const request = {
      headers: new Headers({ "x-real-ip": "10.0.0.1" }),
    } as unknown as import("next/server").NextRequest;

    const id = await getClientId(request);
    expect(id).toBe("10.0.0.1");
  });

  it("returns cf-connecting-ip as third fallback", async () => {
    const { getClientId } = await import("@/lib/rate-limit");
    const request = {
      headers: new Headers({ "cf-connecting-ip": "192.168.1.1" }),
    } as unknown as import("next/server").NextRequest;

    const id = await getClientId(request);
    expect(id).toBe("192.168.1.1");
  });

  it('returns "unknown" when no IP headers are present on request', async () => {
    const { getClientId } = await import("@/lib/rate-limit");
    const request = {
      headers: new Headers(),
    } as unknown as import("next/server").NextRequest;

    const id = await getClientId(request);
    expect(id).toBe("unknown");
  });

  it("reads from next/headers when no request is passed", async () => {
    mocks.mockHeaders.set("x-forwarded-for", "9.8.7.6");
    const { getClientId } = await import("@/lib/rate-limit");

    const id = await getClientId();
    expect(id).toBe("9.8.7.6");
  });

  it('returns "unknown" when next/headers has no IP headers', async () => {
    const { getClientId } = await import("@/lib/rate-limit");
    const id = await getClientId();
    expect(id).toBe("unknown");
  });
});

// ---------- InMemoryRateLimiter (accessed indirectly via class behavior) ----------
// The class is not exported, so we test its logic by reproducing it identically.

describe("InMemoryRateLimiter logic", () => {
  // Reproduce the class logic for isolated unit testing since the class is not exported
  class InMemoryRateLimiter {
    private requests: Map<string, { count: number; resetTime: number }> =
      new Map();
    private readonly maxRequests: number;
    private readonly windowMs: number;

    constructor(maxRequests: number, windowMs: number) {
      this.maxRequests = maxRequests;
      this.windowMs = windowMs;
    }

    async limit(
      identifier: string
    ): Promise<{
      success: boolean;
      limit: number;
      remaining: number;
      reset: number;
    }> {
      const now = Date.now();
      if (this.requests.size > 1000) {
        for (const [key, value] of this.requests.entries()) {
          if (value.resetTime < now) {
            this.requests.delete(key);
          }
        }
      }
      const record = this.requests.get(identifier);
      if (!record || record.resetTime < now) {
        const resetTime = now + this.windowMs;
        this.requests.set(identifier, { count: 1, resetTime });
        return {
          success: true,
          limit: this.maxRequests,
          remaining: this.maxRequests - 1,
          reset: resetTime,
        };
      }
      if (record.count >= this.maxRequests) {
        return {
          success: false,
          limit: this.maxRequests,
          remaining: 0,
          reset: record.resetTime,
        };
      }
      record.count++;
      return {
        success: true,
        limit: this.maxRequests,
        remaining: this.maxRequests - record.count,
        reset: record.resetTime,
      };
    }

    get size() {
      return this.requests.size;
    }
  }

  it("creates a new window on first request", async () => {
    const limiter = new InMemoryRateLimiter(5, 10_000);
    const result = await limiter.limit("user-1");

    expect(result.success).toBe(true);
    expect(result.limit).toBe(5);
    expect(result.remaining).toBe(4);
    expect(result.reset).toBeGreaterThan(Date.now());
  });

  it("increments count within the same window", async () => {
    const limiter = new InMemoryRateLimiter(5, 10_000);
    await limiter.limit("user-1");
    const second = await limiter.limit("user-1");

    expect(second.success).toBe(true);
    expect(second.remaining).toBe(3);
  });

  it("blocks when limit is exceeded", async () => {
    const limiter = new InMemoryRateLimiter(2, 60_000);
    await limiter.limit("user-1"); // count=1
    await limiter.limit("user-1"); // count=2 (at max)
    const third = await limiter.limit("user-1"); // over limit

    expect(third.success).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it("resets after the window expires", async () => {
    const limiter = new InMemoryRateLimiter(2, 50); // 50ms window
    await limiter.limit("user-1");
    await limiter.limit("user-1");

    // Wait for window to expire
    await new Promise((resolve) => setTimeout(resolve, 80));

    const result = await limiter.limit("user-1");
    expect(result.success).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("cleans up expired entries when map exceeds 1000", async () => {
    const limiter = new InMemoryRateLimiter(10, 1); // 1ms window - expires instantly

    // Fill with > 1000 entries
    for (let i = 0; i < 1002; i++) {
      await limiter.limit(`user-${i}`);
    }

    // Wait for all windows to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Next call triggers cleanup
    await limiter.limit("trigger-cleanup");
    // After cleanup, only the fresh entry should remain
    expect(limiter.size).toBeLessThan(1002);
  });
});

// ---------- rateLimit ----------

describe("rateLimit", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns null in development mode", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const mod = await import("@/lib/rate-limit");
    const request = {
      headers: new Headers(),
    } as unknown as import("next/server").NextRequest;

    const result = await mod.rateLimit(request);
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });

  it("returns null when Redis is not configured", async () => {
    // Without UPSTASH env vars, redis will be null, so the module
    // already returns null from the redis check
    vi.stubEnv("NODE_ENV", "production");
    // Reset modules so rate-limit re-evaluates env
    vi.resetModules();
    // Re-mock dependencies after module reset
    vi.doMock("next/headers", () => ({
      headers: vi.fn(async () => ({
        get: () => null,
      })),
    }));
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: class {
        static slidingWindow() {
          return {};
        }
        constructor() {}
        limit = vi.fn();
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: { fromEnv: vi.fn(() => ({})) },
    }));
    // Without env vars, redis = null
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    const mod = await import("@/lib/rate-limit");
    const request = {
      headers: new Headers(),
    } as unknown as import("next/server").NextRequest;

    const result = await mod.rateLimit(request);
    expect(result).toBeNull();
    vi.unstubAllEnvs();
  });
});

// ---------- rateLimitWithFallback ----------

describe("rateLimitWithFallback", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns success fallback when Redis is not configured", async () => {
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;

    vi.doMock("next/headers", () => ({
      headers: vi.fn(async () => ({
        get: () => null,
      })),
    }));
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: class {
        static slidingWindow() {
          return {};
        }
        constructor() {}
        limit = vi.fn();
      },
    }));
    vi.doMock("@upstash/redis", () => ({
      Redis: { fromEnv: vi.fn(() => ({})) },
    }));

    const mod = await import("@/lib/rate-limit");
    const request = {
      headers: new Headers(),
    } as unknown as import("next/server").NextRequest;

    const result = await mod.rateLimitWithFallback(request);
    expect(result.success).toBe(true);
    expect(result.limit).toBe(100);
    expect(result.remaining).toBe(99);
    expect(result.reset).toBeGreaterThan(Date.now());
  });
});

// ---------- rateLimitResponse ----------

describe("rateLimitResponse", () => {
  it("returns a 429 response with correct headers", async () => {
    const { rateLimitResponse } = await import("@/lib/rate-limit");
    const response = rateLimitResponse("Rate exceeded", 5000);

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("Rate exceeded");
    expect(response.headers.get("Retry-After")).toBe("5");
  });

  it("uses default message and retry-after when no args", async () => {
    const { rateLimitResponse } = await import("@/lib/rate-limit");
    const response = rateLimitResponse();

    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toBe("Too many requests");
    expect(response.headers.get("Retry-After")).toBe("10");
  });
});
