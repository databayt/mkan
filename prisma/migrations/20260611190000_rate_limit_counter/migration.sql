-- Postgres-backed rate limiting (fallback when Upstash Redis is absent).
CREATE TABLE IF NOT EXISTS "RateLimitCounter" (
  "key"       TEXT NOT NULL,
  "count"     INTEGER NOT NULL DEFAULT 1,
  "expiresAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RateLimitCounter_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimitCounter_expiresAt_idx" ON "RateLimitCounter"("expiresAt");
