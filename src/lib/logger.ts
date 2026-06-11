// Structured logger. In production every line is single-line JSON so Vercel
// log drains (and `vercel logs --json`) can parse fields; in development the
// output stays human-readable. Values under PII-ish keys are redacted before
// they ever reach stdout. Unlike the previous logger, `info` is emitted in
// production too — payment/audit events must be observable, not dev-only.

const isDev = process.env.NODE_ENV === "development";

const REDACT_KEY = /password|token|secret|authorization|cookie|apikey|api_key/i;
const MAX_DEPTH = 6;

function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || value == null) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = REDACT_KEY.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

type Level = "debug" | "info" | "warn" | "error";

const consoleFor: Record<Level, (...args: unknown[]) => void> = {
  debug: console.debug,
  info: console.log,
  warn: console.warn,
  error: console.error,
};

function emit(level: Level, message: string, meta?: Record<string, unknown>) {
  const safeMeta = meta ? (redact(meta) as Record<string, unknown>) : undefined;

  if (isDev) {
    const metaStr = safeMeta ? ` ${JSON.stringify(safeMeta)}` : "";
    consoleFor[level](`[${new Date().toISOString()}] ${level.toUpperCase()}: ${message}${metaStr}`);
    return;
  }

  let line: string;
  try {
    line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      msg: message,
      ...safeMeta,
    });
  } catch {
    // Circular meta — keep the message rather than dropping the event.
    line = JSON.stringify({ ts: new Date().toISOString(), level, msg: message });
  }
  consoleFor[level](line);
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    emit("info", message, meta);
  },

  warn(message: string, meta?: Record<string, unknown>) {
    emit("warn", message, meta);
  },

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errorMeta =
      error instanceof Error
        ? { ...meta, errorMessage: error.message, stack: error.stack }
        : error !== undefined
          ? { ...meta, error }
          : meta;

    emit("error", message, errorMeta);
  },

  debug(message: string, meta?: Record<string, unknown>) {
    if (isDev) {
      emit("debug", message, meta);
    }
  },
};
