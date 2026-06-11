// Next.js instrumentation — loaded once per server boot (nodejs + edge).
// `onRequestError` fires for every uncaught error in App Router rendering,
// Server Actions, and Route Handlers, giving production error observability
// through structured logs (Vercel captures stderr; add a log drain for
// retention/alerting). If a dedicated APM (Sentry/BetterStack) is adopted
// later, wire its SDK in `register()` and forward errors here — remember
// `serverExternalPackages` in next.config.ts for ESM-only SDKs.

export async function register() {
  // No SDK to boot yet. Kept so adding one later is a one-file change.
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
