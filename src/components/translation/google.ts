import "server-only";
import { GOOGLE_TRANSLATE_API_URL } from "./config";
import type { Lang, TranslateResponse } from "./types";

const TIMEOUT_MS = 2500; // hard cap per request — the read path must not hang renders
const BATCH_MAX_ITEMS = 100; // Google v2 caps 128 q-segments; stay under
const BATCH_MAX_CHARS = 4_000; // keep the query string bounded

class GoogleTranslateError extends Error {
  transient: boolean;
  status?: number;
  constructor(message: string, opts: { transient?: boolean; status?: number } = {}) {
    super(message);
    this.name = "GoogleTranslateError";
    this.transient = opts.transient ?? false;
    this.status = opts.status;
  }
}

// Throttle the degraded-mode log to at most one line every 5 minutes so a
// silently-misconfigured key still leaves a trail without spamming.
let lastDegradedLogAt = 0;
function reportTranslationDegraded(reason: string): void {
  const now = Date.now();
  if (now - lastDegradedLogAt > 5 * 60_000) {
    lastDegradedLogAt = now;
    console.error(`[translation] degraded: ${reason}`);
  }
}

async function requestTranslate(params: URLSearchParams): Promise<TranslateResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${GOOGLE_TRANSLATE_API_URL}?${params}`, {
      method: "POST",
      signal: controller.signal,
    });
  } catch (err) {
    const aborted = controller.signal.aborted || (err instanceof Error && err.name === "AbortError");
    if (aborted) {
      reportTranslationDegraded(`Google Translate timeout after ${TIMEOUT_MS}ms`);
      throw new GoogleTranslateError("Google Translate timeout", { transient: true });
    }
    reportTranslationDegraded(`Google Translate network error: ${err instanceof Error ? err.message : err}`);
    throw new GoogleTranslateError("Google Translate network error", { transient: true });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const error = await response.text();
    reportTranslationDegraded(`Google Translate API ${response.status}: ${error.slice(0, 200)}`);
    const isRateLimit403 = response.status === 403 && /rateLimitExceeded/i.test(error);
    const transient = response.status === 429 || response.status >= 500 || isRateLimit403;
    throw new GoogleTranslateError(`Google Translate API error: ${response.status}`, {
      status: response.status,
      transient,
    });
  }
  return (await response.json()) as TranslateResponse;
}

function apiKeyOrThrow(): string {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    reportTranslationDegraded("GOOGLE_TRANSLATE_API_KEY is not configured");
    throw new GoogleTranslateError("GOOGLE_TRANSLATE_API_KEY not configured");
  }
  return apiKey;
}

/** Translate one string. Throws on failure (callers fall back to source). */
export async function translateRaw(text: string, sourceLang: Lang, targetLang: Lang): Promise<string> {
  const apiKey = apiKeyOrThrow();
  if (!text || text.trim() === "") return "";
  const params = new URLSearchParams({
    q: text,
    source: sourceLang,
    target: targetLang,
    key: apiKey,
    format: "text",
  });
  const result = await requestTranslate(params);
  return result.data.translations[0]?.translatedText ?? "";
}

/**
 * Translate many strings in chunks (under both the item and char limits),
 * results mapped back to original positions (empty strings stay empty).
 * Throws on failure (callers fall back to source).
 */
export async function translateBatch(texts: string[], sourceLang: Lang, targetLang: Lang): Promise<string[]> {
  const apiKey = apiKeyOrThrow();
  const nonEmpty = texts.filter((t) => t && t.trim() !== "");
  if (nonEmpty.length === 0) return texts.map(() => "");

  const chunks: string[][] = [];
  let current: string[] = [];
  let currentChars = 0;
  for (const text of nonEmpty) {
    if (current.length > 0 && (current.length >= BATCH_MAX_ITEMS || currentChars + text.length > BATCH_MAX_CHARS)) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(text);
    currentChars += text.length;
  }
  if (current.length > 0) chunks.push(current);

  const translations: string[] = [];
  for (const chunk of chunks) {
    const params = new URLSearchParams({ source: sourceLang, target: targetLang, key: apiKey, format: "text" });
    for (const text of chunk) params.append("q", text);
    const result = await requestTranslate(params);
    const chunkTranslations = result.data.translations;
    for (let i = 0; i < chunk.length; i++) translations.push(chunkTranslations[i]?.translatedText ?? "");
  }

  let idx = 0;
  return texts.map((text) => (!text || text.trim() === "" ? "" : translations[idx++] ?? ""));
}
