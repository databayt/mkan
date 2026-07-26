/**
 * Non-destructive transport-trip top-up (manual entry point).
 *
 * The full `seed-transport.ts` WIPES bookings/payments before reseeding — never
 * run it against a live DB. This wrapper delegates to src/lib/transport-topup.ts
 * (also run daily in prod by /api/cron/topup-trips). Idempotent: re-running is
 * a no-op until days roll over.
 *
 * Run: set -a && source .env && set +a && npx tsx scripts/topup-transport-trips.ts
 */
import { config } from 'dotenv';
config({ override: true });

async function main() {
  // Deferred import — a static `@/lib/transport-topup` import would build the
  // Prisma client before dotenv loads. See [[feedback_tsx_script_dotenv_esm_order]].
  const { topUpTrips } = await import('@/lib/transport-topup');
  const { db } = await import('@/lib/db');

  const started = Date.now();
  const result = await topUpTrips();
  console.log(
    `✅ ${result.routes} routes, ${result.existingFutureTrips} future trips already present — ` +
      `created ${result.tripsCreated} trips + ${result.seatsCreated} seats in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
