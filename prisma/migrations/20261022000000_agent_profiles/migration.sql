-- Rental agent (/find): who a chat belongs to (an anonymous browser or an
-- account), what the agent remembers across chats, titles for the ☰ chat
-- list, and the Claude API spend ledger behind its hard monthly cap.
-- Additive only: one nullable column relaxed, nothing dropped.

CREATE TABLE IF NOT EXISTS "AgentProfile" (
    "id" TEXT NOT NULL,
    "keyHash" TEXT,
    "userId" TEXT,
    "memory" JSONB,
    "lastSearchAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentProfile_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgentProfile_keyHash_key" ON "AgentProfile"("keyHash");
CREATE UNIQUE INDEX IF NOT EXISTS "AgentProfile_userId_key" ON "AgentProfile"("userId");
CREATE INDEX IF NOT EXISTS "AgentProfile_updatedAt_idx" ON "AgentProfile"("updatedAt");
DO $$ BEGIN
  ALTER TABLE "AgentProfile" ADD CONSTRAINT "AgentProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tasks from before profiles keep their raw cookie in "sessionKey" until that
-- browser returns and they are adopted (src/components/agent/profile.ts).
ALTER TABLE "AgentTask" ALTER COLUMN "sessionKey" DROP NOT NULL;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "profileId" TEXT;
ALTER TABLE "AgentTask" ADD COLUMN IF NOT EXISTS "title" VARCHAR(80);
CREATE INDEX IF NOT EXISTS "AgentTask_profileId_updatedAt_idx" ON "AgentTask"("profileId", "updatedAt");
DO $$ BEGIN
  ALTER TABLE "AgentTask" ADD CONSTRAINT "AgentTask_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "AgentProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE "AgentTask" SET "title" = left("messages"->0->>'text', 80)
WHERE "title" IS NULL AND jsonb_typeof("messages") = 'array' AND jsonb_array_length("messages") > 0;

CREATE TABLE IF NOT EXISTS "ApiSpend" (
    "day" TEXT NOT NULL,
    "lane" TEXT NOT NULL,
    "usd" DECIMAL(10,5) NOT NULL DEFAULT 0,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ApiSpend_pkey" PRIMARY KEY ("day", "lane")
);
