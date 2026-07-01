-- Reconcile the UserRole enum with the Prisma schema.
--
-- Background: migration 20260424000000_add_super_admin_role declares
-- `ALTER TYPE "UserRole" ADD VALUE 'SUPER_ADMIN'`, but on environments whose
-- DATABASE_URL points at a PgBouncer-pooled Neon host the ADD VALUE did not take
-- effect even though the migration committed (its sibling column adds did) and
-- was recorded as applied. The result is a live drift: the generated Prisma
-- client (and code) reference UserRole.SUPER_ADMIN / UserRole.DRIVER, but the
-- database enum lacks them — every query/insert touching those labels throws
-- `invalid input value for enum "UserRole"`, which breaks admin sign-in,
-- role management, and `pnpm tsx scripts/seed-admin.ts`.
--
-- `DRIVER` is declared in schema.prisma but never had its own migration, so it
-- is reconciled here too.
--
-- This migration is idempotent (IF NOT EXISTS) and therefore safe to deploy to
-- any environment, including ones already patched by hand.
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'SUPER_ADMIN';
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'DRIVER';
