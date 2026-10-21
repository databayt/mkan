/**
 * The ☰ list's day groups, as ChatGPT draws them: Today, Yesterday, the
 * previous 7 days, then older. Days are the viewer's own, so the groups come
 * from the browser's clock and timezone, not the server's.
 */
export type ChatGroup = "today" | "yesterday" | "week" | "older";

export const CHAT_GROUPS: readonly ChatGroup[] = ["today", "yesterday", "week", "older"];

export function chatGroup(updatedAt: string, now: Date = new Date()): ChatGroup {
  const at = new Date(updatedAt).getTime();
  const day = (offset: number) => new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset).getTime();
  if (at >= day(0)) return "today";
  if (at >= day(1)) return "yesterday";
  if (at >= day(7)) return "week";
  return "older";
}

/** Rows already come newest first; this only cuts them into groups, keeping the order. */
export function groupChats<T extends { updatedAt: string }>(rows: T[], now: Date = new Date()): { group: ChatGroup; rows: T[] }[] {
  const by = new Map<ChatGroup, T[]>();
  for (const row of rows) {
    const g = chatGroup(row.updatedAt, now);
    by.set(g, [...(by.get(g) ?? []), row]);
  }
  return CHAT_GROUPS.filter((g) => by.has(g)).map((g) => ({ group: g, rows: by.get(g)! }));
}
