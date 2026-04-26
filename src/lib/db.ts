import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Prisma client factory.
 *
 * Adapter selection is controlled by `DATABASE_URL_ADAPTER`:
 *   - `neon`  → `@neondatabase/serverless` driver over HTTPS + WebSockets.
 *               Works from networks where direct TCP to Neon is blocked and
 *               shaves ~300ms off cold-start.
 *   - default → `@prisma/adapter-pg` (direct TCP). Used for local Postgres,
 *               CI, and any environment where HTTPS is slower than TCP.
 *
 * Production deployments on Vercel should set `DATABASE_URL_ADAPTER=neon`.
 */

const connectionPoolConfig = {
  connection_limit: parseInt(process.env.DATABASE_CONNECTION_LIMIT || "10"),
  pool_timeout: parseInt(process.env.DATABASE_POOL_TIMEOUT || "10"),
};

function getConnectionUrl(): string | undefined {
  if (process.env.NODE_ENV !== "production") {
    return process.env.DATABASE_URL;
  }

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);

    url.searchParams.set("connection_limit", connectionPoolConfig.connection_limit.toString());
    url.searchParams.set("pool_timeout", connectionPoolConfig.pool_timeout.toString());

    if (process.env.DATABASE_POOLING_MODE) {
      url.searchParams.set("pgbouncer", process.env.DATABASE_POOLING_MODE);
    }

    if (!url.searchParams.has("sslmode")) {
      url.searchParams.set("sslmode", "require");
    }

    return url.toString();
  } catch {
    return process.env.DATABASE_URL;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const isNeonUrl = (url: string | undefined): boolean =>
  typeof url === "string" && /\.neon\.tech/i.test(url);

const createPrismaClient = () => {
  const isProduction = process.env.NODE_ENV === "production";
  const connectionString = getConnectionUrl();
  // Default to the neon serverless adapter when the URL points at Neon.
  // The pg adapter holds long-lived TCP connections that Neon drops when
  // its serverless compute scales to zero — the next query then fails with
  // "Server has closed the connection" (issue #4). The neon adapter speaks
  // HTTPS+WS and wakes the compute on demand.
  const adapterKind = (
    process.env.DATABASE_URL_ADAPTER ??
    (isNeonUrl(connectionString) ? "neon" : "pg")
  ).toLowerCase();

  let adapter;
  if (adapterKind === "neon") {
    // Neon serverless driver — works over HTTPS+WebSockets when TCP is blocked.
    // ws is only needed in Node (Edge runtime provides WebSocket globally).
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    adapter = new PrismaNeon({ connectionString });
  } else {
    adapter = new PrismaPg({ connectionString });
  }

  return new PrismaClient({
    adapter,
    log: isProduction
      ? ["error", "warn"]
      : ["query", "error", "warn"],
    errorFormat: isProduction ? "minimal" : "pretty",
  });
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = db;
