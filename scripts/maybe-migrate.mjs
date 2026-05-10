#!/usr/bin/env node
/**
 * Conditional `prisma migrate deploy` for the build script.
 *
 * Runs on Vercel (real DATABASE_URL) so production deploys apply
 * pending migrations. Skips in CI (placeholder DATABASE_URL) and
 * skips when DATABASE_URL is unset, so:
 *   - GitHub Actions builds don't try to connect to a fake DB
 *   - `pnpm build` from a workstation without a real DB still works
 *   - Vercel builds always migrate
 *
 * Tolerates P3005 ("schema is not empty") — that's the classic
 * "production was set up with `prisma db push`, no migration history"
 * state. Running migrate deploy in that state would refuse without a
 * baseline; instead of failing the deploy, we log a warning and
 * continue with the rest of the build. Migrations can be applied
 * manually via `pnpm migrate:resolve-baseline && pnpm migrate:deploy`
 * once an operator is ready to take ownership of the migration table.
 */

import { execSync } from "node:child_process";

const url = process.env.DATABASE_URL || "";

const looksReal =
  url.length > 0 &&
  !url.includes("placeholder") &&
  !url.includes("localhost:5432/placeholder");

if (!looksReal) {
  const reason = !url
    ? "unset"
    : url.includes("placeholder")
    ? "placeholder"
    : "non-real";
  console.log(`⏭️  Skipping prisma migrate deploy — DATABASE_URL is ${reason}`);
  process.exit(0);
}

console.log("▶️  Running prisma migrate deploy...");
// Pipe stdout+stderr so we can both inspect them on failure (to detect
// P3005) AND echo them to the parent build log so operators see what
// happened. `stdio: "inherit"` would print directly but leaves
// err.stderr/err.stdout empty on failure, which is why an earlier
// version of this script silently fell through.
try {
  const out = execSync("pnpm exec prisma migrate deploy 2>&1", {
    stdio: ["inherit", "pipe", "pipe"],
    encoding: "utf8",
  });
  // Echo successful output for visibility in build logs.
  if (out) process.stdout.write(out);
} catch (err) {
  // P3005 = "The database schema is not empty." Happens when the DB was
  // populated by `prisma db push` and `_prisma_migrations` is missing or
  // doesn't reflect the current schema. The fix is a one-time baseline
  // (mark every pre-existing migration as applied via `prisma migrate
  // resolve --applied <name>`); doing that automatically here is too
  // dangerous because we'd be guessing which migrations are already in
  // the schema. Until baselined, skip gracefully so deploys still ship.
  const stderr = (err.stderr ?? "").toString();
  const stdout = (err.stdout ?? "").toString();
  const combined = stderr + stdout + (err.message ?? "");

  // Always echo the captured output so the operator sees the real error.
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);

  if (combined.includes("P3005")) {
    console.warn(
      "\n⚠️  P3005: production schema is not baselined — skipping migrate deploy.\n" +
        "    Pending migrations will NOT be applied automatically.\n" +
        "    To baseline (one-time): for each existing migration directory, run\n" +
        "      pnpm exec prisma migrate resolve --applied <migration_name>\n" +
        "    against production DATABASE_URL, then redeploy."
    );
    process.exit(0);
  }

  // P1002 = "Database server reached but timed out." Most often surfaces
  // here as a stuck advisory lock when a previous deploy crashed without
  // releasing it, or two deploys race for the same lock. Skipping is
  // safe — the next deploy retries, and Prisma's _prisma_migrations
  // table prevents double-application.
  if (combined.includes("P1002")) {
    console.warn(
      "\n⚠️  P1002: migration lock timeout — skipping migrate deploy this build.\n" +
        "    The next successful deploy will retry. If this persists, manually\n" +
        "    release the advisory lock against production DATABASE_URL:\n" +
        "      SELECT pg_advisory_unlock(72707369);"
    );
    process.exit(0);
  }

  console.error("\n❌ prisma migrate deploy failed:", err.message);
  process.exit(1);
}
