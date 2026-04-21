const isDev = process.env.NODE_ENV === "development";

function formatMessage(level: string, message: string, meta?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : "";
  return `[${timestamp}] ${level}: ${message}${metaStr}`;
}

export const logger = {
  info(message: string, meta?: Record<string, unknown>) {
    if (isDev) {
      console.log(formatMessage("INFO", message, meta));
    }
  },

  warn(message: string, meta?: Record<string, unknown>) {
    console.warn(formatMessage("WARN", message, meta));
  },

  error(message: string, error?: unknown, meta?: Record<string, unknown>) {
    const errorMeta = error instanceof Error
      ? { ...meta, errorMessage: error.message, stack: error.stack }
      : { ...meta, error };

    console.error(formatMessage("ERROR", message, errorMeta));
  },

  debug(message: string, meta?: Record<string, unknown>) {
    if (isDev) {
      console.debug(formatMessage("DEBUG", message, meta));
    }
  },
};
