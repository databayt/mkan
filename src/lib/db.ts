import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

/**
 * Prisma client factory.
 *
 * Adapter selection is controlled by `DATABASE_URL_ADAPTER`:
 *   - `pg`    → `@prisma/adapter-pg`, node-postgres over TCP. The Cloudflare
 *               container sets it (wrangler.jsonc `vars`), like hogwarts' lane:
 *               one long-lived process keeps warm pooled sockets to Neon's
 *               `-pooler` host.
 *   - `neon`  → `@neondatabase/serverless` over WebSockets, for networks where
 *               direct TCP to Neon is blocked (local dev, Mac scripts).
 *   - default → `pg`.
 *
 * The pool is bounded so a stalled connection fails instead of hanging a
 * request: a /find turn once sat 27 s on the database and then errored
 * (2026-10-22). The old `connection_limit` / `pool_timeout` URL params belonged
 * to Prisma's Rust engine and did nothing under a driver adapter.
 */
const isProduction = process.env.NODE_ENV === "production";

const POOL = {
  max: Number(process.env.DATABASE_CONNECTION_LIMIT) || 10,
  // Warm between a turn's queries, its polls and the next message.
  idleTimeoutMillis: 60_000,
  // A connection that cannot be opened fails in 5 s, not never.
  connectionTimeoutMillis: 5_000,
  keepAlive: true,
  // PgBouncer (the pooler) refuses a statement_timeout startup option, so the
  // limit is the client's own. Production only: Mac scripts run long backfills.
  ...(isProduction ? { query_timeout: 15_000 } : {}),
};

function getConnectionUrl(): string | undefined {
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl || !isProduction) return baseUrl;
  try {
    const url = new URL(baseUrl);
    if (!url.searchParams.has("sslmode")) url.searchParams.set("sslmode", "require");
    return url.toString();
  } catch {
    return baseUrl;
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const createPrismaClient = () => {
  const connectionString = getConnectionUrl();
  const adapterKind = (process.env.DATABASE_URL_ADAPTER ?? "pg").toLowerCase();

  let adapter;
  if (adapterKind === "neon") {
    // Neon serverless driver — works over HTTPS+WebSockets when TCP is blocked.
    // ws is only needed in Node (Edge runtime provides WebSocket globally).
    if (typeof WebSocket === "undefined") {
      neonConfig.webSocketConstructor = ws;
    }
    adapter = new PrismaNeon({ connectionString, ...POOL });
  } else {
    adapter = new PrismaPg({ connectionString, ...POOL });
  }

  return new PrismaClient({
    adapter,
    // Scripts that run unattended (the TikTok sweep) set PRISMA_QUIET.
    log: isProduction || process.env.PRISMA_QUIET
      ? ["error", "warn"]
      : ["query", "error", "warn"],
    errorFormat: isProduction ? "minimal" : "pretty",
  });
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = db;
