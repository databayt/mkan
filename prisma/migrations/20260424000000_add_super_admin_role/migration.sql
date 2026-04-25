-- AlterEnum: Add SUPER_ADMIN value to UserRole.
-- NOTE: Postgres forbids using an ADDed enum value in the same transaction it is added,
-- so this migration only adds the enum value and new User columns. Any code/data that
-- references 'SUPER_ADMIN' ships in a subsequent migration or at runtime.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';

-- AlterTable: moderation / suspension tracking.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isSuspended"      BOOLEAN      NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspendedAt"      TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "suspensionReason" TEXT;
