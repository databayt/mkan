import { PrismaClient } from "@prisma/client";

// Connection pool configuration
const connectionPoolConfig = {
  connection_limit: parseInt(process.env.DATABASE_CONNECTION_LIMIT || "10"),
  pool_timeout: parseInt(process.env.DATABASE_POOL_TIMEOUT || "10"),
};

// Build connection URL with pooling parameters for production
function getConnectionUrl(): string | undefined {
  if (process.env.NODE_ENV !== "production") {
    return process.env.DATABASE_URL;
  }

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) return undefined;

  try {
    const url = new URL(baseUrl);

    // Add connection pooling parameters for production
    url.searchParams.set("connection_limit", connectionPoolConfig.connection_limit.toString());
    url.searchParams.set("pool_timeout", connectionPoolConfig.pool_timeout.toString());

    // Add pgbouncer mode if using PgBouncer
    if (process.env.DATABASE_POOLING_MODE) {
      url.searchParams.set("pgbouncer", process.env.DATABASE_POOLING_MODE);
    }

    // Ensure SSL for production
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

// Configure Prisma based on environment
const createPrismaClient = () => {
  const isProduction = process.env.NODE_ENV === "production";

  return new PrismaClient({
    datasources: {
      db: {
        url: getConnectionUrl(),
      },
    },
    log: isProduction
      ? ["error", "warn"]
      : ["query", "error", "warn"],
    errorFormat: isProduction ? "minimal" : "pretty",
  });
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

// Cache the Prisma client in all environments
// In serverless environments like Vercel, this prevents creating new connections
// for each request within the same container/lambda instance
globalForPrisma.prisma = db;

// Note: Graceful shutdown is handled by Vercel's serverless environment
// Edge Runtime does not support process.on() for signal handling 