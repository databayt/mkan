import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Release tracking
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Environment
    environment: process.env.NODE_ENV,

    // Configure tracePropagationTargets
    tracePropagationTargets: process.env.NEXTAUTH_URL
      ? [
          "localhost",
          new RegExp(`^${process.env.NEXTAUTH_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api`),
        ]
      : ["localhost"],

    // Before sending error to Sentry
    beforeSend(event, hint) {
      // Filter out certain errors in production
      if (process.env.NODE_ENV === "production") {
        // Don't send errors in development/test databases
        if (event.exception?.values?.[0]?.value?.includes("ECONNREFUSED")) {
          return null;
        }
      }

      // Remove sensitive data
      if (event.request) {
        // Remove cookies
        delete event.request.cookies;

        // Remove authorization headers
        if (event.request.headers) {
          delete event.request.headers["authorization"];
          delete event.request.headers["cookie"];
        }

        // Remove sensitive query params
        if (event.request.query_string && typeof event.request.query_string === 'string') {
          event.request.query_string = event.request.query_string
            .replace(/token=[^&]+/g, "token=***")
            .replace(/secret=[^&]+/g, "secret=***")
            .replace(/password=[^&]+/g, "password=***");
        }
      }

      // Sanitize user data
      if (event.user) {
        event.user = {
          id: event.user.id,
          email: event.user.email?.replace(/^(.{2}).*@/, "$1***@"),
        };
      }

      // Sanitize database queries
      if (event.extra?.prisma) {
        delete event.extra.prisma;
      }

      return event;
    },

    // Integrations
    integrations: [
      // Automatically instrument Prisma
      Sentry.prismaIntegration(),
    ],

    // Ignore certain errors
    ignoreErrors: [
      // Database connection errors in development
      "ECONNREFUSED",
      "ETIMEDOUT",
      // Expected API errors
      "PrismaClientKnownRequestError",
      // Rate limiting
      "Too many requests",
    ],
  });
}