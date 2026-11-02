/**
 * An error's own words, for the log and #mkan. Pure, so every script can use it.
 *
 * The failures that matter on the Mac are connection failures, and they are the ones whose
 * message is empty:
 * - a connection that fails on every address (Node's happy-eyeballs connect) throws an
 *   AggregateError with no message (the 10-24..10-28 renders logged a bare "❌");
 * - the database driver's WebSocket fails with an ErrorEvent that carries the real error
 *   inside (11-02: the post logged "[object ErrorEvent]", and the broker directory and the
 *   demand match both logged "❌ " with nothing after it);
 * - a wrapped error keeps the real one in `cause`.
 */
export function errorText(e: unknown): string {
  const err = e as { message?: unknown; errors?: unknown; code?: unknown; error?: unknown; cause?: unknown; type?: unknown } | null | undefined;
  if (err && typeof err.message === 'string' && err.message.trim()) return err.message;
  if (err && Array.isArray(err.errors) && err.errors.length) return [...new Set(err.errors.map((x) => errorText(x)))].join('; ');
  if (err && err.error && typeof err.error === 'object') return `database connection: ${errorText(err.error)}`;
  if (err && err.cause && typeof err.cause === 'object') return errorText(err.cause);
  if (err && typeof err.code === 'string' && err.code) return err.code;
  if (err && typeof err.type === 'string' && err.type) return `${err.type} event (no detail)`;
  return String(e);
}
