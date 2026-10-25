-- WhatsApp on Cloudflare: the bridge's state moves off the Mac, and a
-- WhatsApp profile keeps its number so a broker's later answer reaches it.
ALTER TABLE "AgentProfile" ADD COLUMN "waPhone" TEXT;
CREATE UNIQUE INDEX "AgentProfile_waPhone_key" ON "AgentProfile"("waPhone");

CREATE TABLE "WaState" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WaState_pkey" PRIMARY KEY ("key")
);
