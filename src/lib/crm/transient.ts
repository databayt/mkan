/**
 * A Twenty failure worth repeating — the one copy, used by the Worker's client (src/lib/crm/twenty.ts)
 * and the Mac scripts (scripts/crm/twenty-rest.ts re-exports it). Pure: no node, no env.
 *
 * Twenty answers 400 QUERY_READ_TIMEOUT when its own Postgres is busy (the 11-08 directory run died on it
 * twice), a 5xx when the Hetzner box is down, and a fetch that throws (status null) when the connection
 * drops. A real 400 (bad field, bad cursor) is NOT transient and stays fatal.
 */
export function isTransientTwenty(status: number | null, bodyText: string): boolean {
  if (status === null) return true; // fetch threw: reset, refused, timeout
  if (status >= 500) return true;
  return status === 400 && /QUERY_READ_TIMEOUT|Query read timeout/i.test(bodyText);
}
