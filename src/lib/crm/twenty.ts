/**
 * The Worker-safe Twenty client (2026-11-15): fetch only — no execSync, no Keychain, no throttle timers.
 * The Mac scripts keep scripts/crm/twenty-rest.ts (Keychain fallback, 700 ms spacing); the Worker gets
 * its credentials from env (TWENTY_API_URL, TWENTY_API_KEY — scripts/cf-secrets.sh) and is paced by the
 * drain's own call budget (crm-ops.ts), not by sleeping.
 *
 * No env → `twentyConfigured()` is false and every CrmOp stays QUEUED; the line never waits on Twenty.
 */
import { isTransientTwenty } from "./transient";

export { isTransientTwenty };

const TIMEOUT_MS = 10_000;

export class TwentyError extends Error {
  constructor(
    readonly status: number | null,
    message: string,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "TwentyError";
  }
}

const clean = (v: string | undefined) => (v ?? "").trim(); // an env value with a trailing newline breaks the Bearer header

export function twentyConfigured(): boolean {
  return !!clean(process.env.TWENTY_API_URL) && !!clean(process.env.TWENTY_API_KEY);
}

let warned = false;
/** Said once per process, so a missing key is visible in the logs without flooding them. */
export function warnUnconfiguredOnce(): void {
  if (warned) return;
  warned = true;
  console.warn("[crm] TWENTY_API_URL / TWENTY_API_KEY not set — CRM ops stay QUEUED");
}

/** Calls made by this process since start (the drain reads the delta to keep to its per-minute budget). */
let calls = 0;
export const twentyCalls = () => calls;

export async function twentyRest<T = Record<string, any>>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  if (!twentyConfigured()) throw new TwentyError(null, "Twenty is not configured", true);
  const base = clean(process.env.TWENTY_API_URL).replace(/\/+$/, "");
  calls += 1;
  let res: Response;
  try {
    res = await fetch(`${base}/rest/${path}`, {
      method,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${clean(process.env.TWENTY_API_KEY)}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new TwentyError(null, `${method} ${path.slice(0, 40)} dropped: ${(e as Error).message}`, true);
  }
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    // 429 is Twenty's 100-a-minute limit: wait for the next pass, never sleep inside a request.
    throw new TwentyError(res.status, `REST ${method} ${path.slice(0, 60)} → ${res.status}: ${text.slice(0, 200)}`, res.status === 429 || isTransientTwenty(res.status, text));
  }
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return {} as T;
  }
}

/** The records in a list answer ({ data: { deals: [...] } }). */
export function recordsOf(res: unknown, plural: string): Record<string, any>[] {
  const data = (res as { data?: Record<string, unknown> })?.data ?? (res as Record<string, unknown>);
  const v = data?.[plural];
  return Array.isArray(v) ? (v as Record<string, any>[]) : [];
}

/** The record a create/update answers with ({ data: { createDeal: { id… } } }). */
export function createdOf(res: unknown): Record<string, any> | null {
  const data = (res as { data?: Record<string, unknown> })?.data ?? (res as Record<string, unknown>);
  const first = data && typeof data === "object" ? Object.values(data)[0] : null;
  return first && typeof first === "object" && !Array.isArray(first) ? (first as Record<string, any>) : null;
}

/** Find one record by a TEXT field, e.g. findOne("deals", "mkanKey", key). The value is quoted: keys carry ":" (Twenty's own docs quote timestamps the same way). */
export async function findOne(plural: string, field: string, value: string): Promise<Record<string, any> | null> {
  const res = await twentyRest("GET", `${plural}?filter=${field}[eq]:${encodeURIComponent(`"${value.replace(/"/g, "")}"`)}&limit=1&depth=0`);
  return recordsOf(res, plural)[0] ?? null;
}
