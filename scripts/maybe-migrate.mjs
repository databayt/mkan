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
 * The detection is conservative: we only run if the URL looks
 * unmistakably real. Anything containing "placeholder" or pointing
 * at the localhost placeholder host is skipped.
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
try {
  execSync("pnpm exec prisma migrate deploy", { stdio: "inherit" });
} catch (err) {
  console.error("❌ prisma migrate deploy failed:", err.message);
  process.exit(1);
}
