import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// Create Redis client with fallback to in-memory if Redis not configured
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
  ? Redis.fromEnv()
  : null;

// Define rate limit tiers
export const rateLimiters = {
  // Default rate limiter for general API routes
  api: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "10 s"), // 10 requests per 10 seconds
    analytics: true,
    prefix: "@upstash/ratelimit",
  }) : null,

  // Auth endpoints (more restrictive)
  auth: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "10 m"), // 5 attempts per 10 minutes
    analytics: true,
    prefix: "@upstash/ratelimit/auth",
  }) : null,

  // Upload endpoints
  upload: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "1 m"), // 5 uploads per minute
    analytics: true,
    prefix: "@upstash/ratelimit/upload",
  }) : null,

  // Search endpoints (less restrictive)
  search: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "10 s"), // 30 searches per 10 seconds
    analytics: true,
    prefix: "@upstash/ratelimit/search",
  }) : null,

  // Payment endpoints (very restrictive)
  payment: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(3, "1 h"), // 3 payment attempts per hour
    analytics: true,
    prefix: "@upstash/ratelimit/payment",
  }) : null,

  // Mutating server actions: createBooking, createApplication, updateProfile,
  // createListing, createReview, etc. Tuned to prevent spam without getting
  // in the way of legitimate use (e.g., a host publishing 5 listings in a row).
  mutation: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(10, "1 m"), // 10 per minute per user
    analytics: true,
    prefix: "@upstash/ratelimit/mutation",
  }) : null,

  // Report-an-issue submissions: 5 per 10 minutes per reporter (user or IP).
  // Tight enough to defeat flood spam, loose enough that a frustrated
  // legitimate user can file a few related reports back to back.
  report: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(5, "10 m"),
    analytics: true,
    prefix: "@upstash/ratelimit/report",
  }) : null,

  // Per-tenant aggregate to catch coordinated abuse across many reporters.
  "report-tenant": redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(30, "1 h"),
    analytics: true,
    prefix: "@upstash/ratelimit/report-tenant",
  }) : null,

  // Analytics beacons. Deliberately the loosest tier: one fires per listing
  // page view, a browsing session hits many listings a minute, and Sudanese
  // mobile traffic is heavily CGNAT-ed, so a whole neighbourhood can share one
  // IP. Too tight here would silently delete real demand data — the failure
  // mode is undercounting, which is invisible. Still bounded so a single host
  // cannot flood the table.
  track: redis ? new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(300, "1 m"),
    analytics: true,
    prefix: "@upstash/ratelimit/track",
  }) : null,
};

// ─── Postgres fallback ───────────────────────────────────────────────────────
// When Upstash isn't configured, production rate limiting falls back to a
// fixed-window counter in Postgres instead of failing open. One upsert per
// guarded request; the window start is part of the key so a window rollover
// naturally starts a fresh row. DB errors fail open — rate limiting must
// never be the thing that takes the API down.

const TIER_CONFIG: Record<keyof typeof rateLimiters, { limit: number; windowMs: number }> = {
  api: { limit: 10, windowMs: 10_000 },
  auth: { limit: 5, windowMs: 600_000 },
  upload: { limit: 5, windowMs: 60_000 },
  search: { limit: 30, windowMs: 10_000 },
  payment: { limit: 3, windowMs: 3_600_000 },
  mutation: { limit: 10, windowMs: 60_000 },
  report: { limit: 5, windowMs: 600_000 },
  "report-tenant": { limit: 30, windowMs: 3_600_000 },
  track: { limit: 300, windowMs: 60_000 },
};

async function pgRateLimit(
  tier: keyof typeof rateLimiters,
  identifier: string
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  const { limit, windowMs } = TIER_CONFIG[tier];
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  const reset = windowStart + windowMs;

  try {
    // Lazy import keeps pg/Prisma out of any future edge bundle of this module.
    const { db } = await import("@/lib/db");
    const key = `${tier}:${identifier}:${windowStart}`;
    const rows = await db.$queryRaw<{ count: number }[]>`
      INSERT INTO "RateLimitCounter" ("key", "count", "expiresAt")
      VALUES (${key}, 1, ${new Date(reset)})
      ON CONFLICT ("key") DO UPDATE SET "count" = "RateLimitCounter"."count" + 1
      RETURNING "count"`;
    const count = Number(rows[0]?.count ?? 1);

    // Opportunistic sweep of expired windows (~1 in 50 calls).
    if (Math.random() < 0.02) {
      db.$executeRaw`DELETE FROM "RateLimitCounter" WHERE "expiresAt" < now()`.catch(() => {});
    }

    return {
      success: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      reset,
    };
  } catch {
    return { success: true, limit, remaining: limit, reset };
  }
}

// Get client identifier for rate limiting
export async function getClientId(request?: NextRequest): Promise<string> {
  if (request) {
    // Try to get IP from various headers (for proxied requests)
    const forwardedFor = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const cfConnectingIp = request.headers.get("cf-connecting-ip");

    return forwardedFor?.split(",")[0]?.trim() ||
           realIp ||
           cfConnectingIp ||
           "unknown";
  } else {
    // For server components/actions
    const headersList = await headers();
    const forwardedFor = headersList.get("x-forwarded-for");
    const realIp = headersList.get("x-real-ip");
    const cfConnectingIp = headersList.get("cf-connecting-ip");

    return forwardedFor?.split(",")[0]?.trim() ||
           realIp ||
           cfConnectingIp ||
           "unknown";
  }
}

// Rate limit middleware for API routes
export async function rateLimit(
  request: NextRequest,
  limiterType: keyof typeof rateLimiters = "api"
): Promise<{ success: boolean; limit?: number; remaining?: number; reset?: number } | null> {
  // Skip rate limiting in development
  if (process.env.NODE_ENV === "development") {
    return null;
  }

  const identifier = await getClientId(request);

  // Without Redis, production still enforces limits via the Postgres window.
  if (!redis) {
    return pgRateLimit(limiterType, identifier);
  }

  const limiter = rateLimiters[limiterType];
  if (!limiter) {
    return null;
  }

  const result = await limiter.limit(identifier);

  return {
    success: result.success,
    limit: result.limit,
    remaining: result.remaining,
    reset: result.reset,
  };
}

// Rate limit response helper
export function rateLimitResponse(
  message: string = "Too many requests",
  retryAfter?: number
): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 429,
      headers: {
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": new Date(Date.now() + (retryAfter || 10000)).toISOString(),
        "Retry-After": String(retryAfter ? retryAfter / 1000 : 10),
      },
    }
  );
}

// In-memory rate limiter fallback for when Redis is not available
// Edge Runtime compatible - no setInterval for cleanup
class InMemoryRateLimiter {
  private requests: Map<string, { count: number; resetTime: number }> = new Map();
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;

    // Note: No setInterval cleanup in Edge Runtime
    // Cleanup happens inline during limit() calls to avoid memory leaks
  }

  async limit(identifier: string): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
    const now = Date.now();

    // Inline cleanup: remove expired entries during normal operation
    // This avoids using setInterval which is not supported in Edge Runtime
    if (this.requests.size > 1000) { // Only cleanup if map gets large
      for (const [key, value] of this.requests.entries()) {
        if (value.resetTime < now) {
          this.requests.delete(key);
        }
      }
    }

    const record = this.requests.get(identifier);

    if (!record || record.resetTime < now) {
      // New window
      const resetTime = now + this.windowMs;
      this.requests.set(identifier, { count: 1, resetTime });
      return { success: true, limit: this.maxRequests, remaining: this.maxRequests - 1, reset: resetTime };
    }

    if (record.count >= this.maxRequests) {
      // Rate limit exceeded
      return { success: false, limit: this.maxRequests, remaining: 0, reset: record.resetTime };
    }

    // Increment count
    record.count++;
    return { success: true, limit: this.maxRequests, remaining: this.maxRequests - record.count, reset: record.resetTime };
  }
}

// Note: In-memory rate limiters removed due to Edge Runtime incompatibility
// In serverless/edge environments, in-memory state doesn't persist across requests
// Use Redis (Upstash) for production rate limiting instead

// Enhanced rate limit function that uses in-memory fallback
export async function rateLimitWithFallback(
  request: NextRequest,
  limiterType: keyof typeof rateLimiters = "api"
): Promise<{ success: boolean; limit: number; remaining: number; reset: number }> {
  // Try Redis-based rate limiter first
  if (redis && rateLimiters[limiterType]) {
    const identifier = await getClientId(request);
    const result = await rateLimiters[limiterType]!.limit(identifier);
    return {
      success: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    };
  }

  // Development fails open; production without Redis enforces via Postgres.
  if (process.env.NODE_ENV === "development") {
    return {
      success: true,
      limit: 100,
      remaining: 99,
      reset: Date.now() + 60000,
    };
  }

  const identifier = await getClientId(request);
  return pgRateLimit(limiterType, identifier);
}

// ─── Server-action rate limiting ─────────────────────────────────────────────
// Mutating server actions (createBooking, createApplication, etc.) are not
// HTTP routes, so the middleware-based limiter doesn't apply to them. Use
// `assertRateLimit` at the top of mutating actions. It throws a typed
// RateLimitError if exceeded so the caller can surface a Retry-After hint.
// In development it fails open (no Redis required locally).

export class RateLimitError extends Error {
  readonly code = "rate_limited" as const;
  readonly retryAfter: number; // seconds
  constructor(retryAfter: number) {
    super("Too many requests");
    this.retryAfter = retryAfter;
  }
}

/**
 * Throws RateLimitError if the (limiter, identifier) tuple is over budget.
 * `identifier` is typically a userId for authenticated flows, or the IP for
 * anonymous ones. Always combine with a prefix via `limiterType` so different
 * actions don't share a bucket.
 */
export async function assertRateLimit(
  limiterType: keyof typeof rateLimiters,
  identifier: string
): Promise<void> {
  if (process.env.NODE_ENV === "development") return;

  // No Redis → Postgres fixed-window fallback, same throw contract.
  if (!redis) {
    const res = await pgRateLimit(limiterType, identifier);
    if (!res.success) {
      throw new RateLimitError(Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)));
    }
    return;
  }

  const limiter = rateLimiters[limiterType];
  if (!limiter) return;
  const res = await limiter.limit(identifier);
  if (!res.success) {
    throw new RateLimitError(Math.max(1, Math.ceil((res.reset - Date.now()) / 1000)));
  }
}