import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { headers } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

// Create Redis client with fallback to in-memory if Redis not configured
const redis = process.env.REDIS_URL
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
};

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
  // Skip rate limiting in development or if Redis not configured
  if (process.env.NODE_ENV === "development" || !redis) {
    return null;
  }

  const limiter = rateLimiters[limiterType];
  if (!limiter) {
    return null;
  }

  const identifier = await getClientId(request);
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

  // In Edge Runtime or when Redis is not available, skip rate limiting
  // In-memory rate limiting doesn't work well in serverless/edge environments
  // since each request may hit a different instance
  return {
    success: true,
    limit: 100,
    remaining: 99,
    reset: Date.now() + 60000,
  };
}