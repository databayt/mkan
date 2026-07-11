/**
 * Warms the Neon compute by issuing a single lightweight query before the
 * dev server or build starts. Cold Neon compute takes 5-10s on first query —
 * that latency cascades into sitemap compile, home page first paint, and
 * E2E test startup. This runs under a 2s deadline and exits 0 even on
 * failure so it never blocks development.
 */
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

loadEnv();

const DEADLINE_MS = Number(process.env.WAKE_DB_DEADLINE_MS ?? 2000);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log("[wake-db] DATABASE_URL not set — skipping.");
    return;
  }

  const started = Date.now();
  const adapterKind = (process.env.DATABASE_URL_ADAPTER ?? "pg").toLowerCase();
  let adapter;
  if (adapterKind === "neon") {
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    adapter = new PrismaNeon({ connectionString: url });
  } else {
    adapter = new PrismaPg({ connectionString: url });
  }

  const client = new PrismaClient({
    adapter,
    log: ["error"],
  });

  try {
    const query = client.$queryRaw`SELECT 1`;
    const deadline = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(`wake-db timeout after ${DEADLINE_MS}ms`)),
        DEADLINE_MS
      )
    );
    await Promise.race([query, deadline]);
    const elapsed = Date.now() - started;
    console.log(`[wake-db] Neon ready in ${elapsed}ms`);
  } catch (err) {
    const elapsed = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    console.log(`[wake-db] skipped (${elapsed}ms): ${message}`);
  } finally {
    client.$disconnect().catch(() => {});
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    // Never block the parent command.
    console.log(
      `[wake-db] unexpected error: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(0);
  });
