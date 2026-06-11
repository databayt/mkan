// Next.js instrumentation — loaded once per server boot (nodejs + edge).
// `onRequestError` fires for every uncaught error in App Router rendering,
// Server Actions, and Route Handlers, giving production error observability
// through structured logs (Vercel captures stderr; add a log drain for
// retention/alerting). If a dedicated APM (Sentry/BetterStack) is adopted
// later, wire its SDK in `register()` and forward errors here — remember
// `serverExternalPackages` in next.config.ts for ESM-only SDKs.

export async function register() {
  // Env validation at boot — logs every invalid/missing var once per cold
  // start instead of failing silently at first use. Node runtime only;
  // the edge runtime gets a separate, dependency-free pass.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("@/lib/env-check");
    validateEnv();

    // Rate limiting silently no-ops without Redis (fail-open). That's fine
    // in dev; in production it means brute-force protection is OFF — make
    // that impossible to miss in the logs.
    if (
      process.env.NODE_ENV === "production" &&
      (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN)
    ) {
      console.error(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "error",
          msg: "rate_limit_disabled",
          detail:
            "UPSTASH_REDIS_REST_URL/TOKEN not set — all rate limiting fails open in production. Configure Upstash before public launch.",
        }),
      );
    }
  }
}

type RequestErrorContext = {
  routerKind: string;
  routePath: string;
  routeType: string;
  renderSource?: string;
  revalidateReason?: string;
};

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: RequestErrorContext,
) {
  const e = err as { message?: string; stack?: string; digest?: string; name?: string };

  // Single-line JSON on stderr — same shape as src/lib/logger.ts (which we
  // don't import here: instrumentation also runs on the edge runtime where
  // we want zero module baggage).
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      msg: "request_error",
      name: e?.name,
      errorMessage: e?.message,
      digest: e?.digest,
      stack: e?.stack,
      path: request.path,
      method: request.method,
      requestId: request.headers["x-request-id"],
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
      renderSource: context.renderSource,
      revalidateReason: context.revalidateReason,
      runtime: process.env.NEXT_RUNTIME,
    }),
  );
}
