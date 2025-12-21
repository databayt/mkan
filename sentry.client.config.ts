import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,

    // Performance Monitoring
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,

    // Session Replay
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,

    // Release tracking
    release: process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA,

    // Environment
    environment: process.env.NODE_ENV,

    // Integrations
    integrations: [
      Sentry.replayIntegration({
        // Mask all text and input fields for privacy
        maskAllText: true,
        maskAllInputs: true,
        // Block all media elements
        blockAllMedia: true,
        // Sampling options
        networkDetailAllowUrls: typeof window !== 'undefined' ? [window.location.origin] : [],
      }),
    ],

    // Configure tracePropagationTargets
    tracePropagationTargets: [
      "localhost",
      typeof window !== 'undefined' ? new RegExp(`^${window.location.origin}/api`) : /^\/api/,
    ],

    // Before sending error to Sentry
    beforeSend(event, hint) {
      // Filter out certain errors in production
      if (process.env.NODE_ENV === "production") {
        // Ignore browser extension errors
        if (event.exception?.values?.[0]?.value?.includes("extension://")) {
          return null;
        }

        // Ignore network errors that are expected
        if (event.exception?.values?.[0]?.value?.includes("NetworkError")) {
          return null;
        }
      }

      // Remove sensitive data
      if (event.request?.cookies) {
        delete event.request.cookies;
      }

      if (event.user) {
        // Only keep non-sensitive user data
        event.user = {
          id: event.user.id,
        };
      }

      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      // Browser extensions
      "top.GLOBALS",
      // Facebook related errors
      "fb_xd_fragment",
      // Chrome extensions
      /extensions\//i,
      /^chrome:\/\//i,
      // Other plugins
      /plugin\.js/i,
      // Network errors
      "NetworkError",
      "Failed to fetch",
      // User cancellations
      "Non-Error promise rejection captured",
    ],
  });
}