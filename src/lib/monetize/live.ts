import "server-only";

import { db } from "@/lib/db";

import { liveView, type Beat, type LiveView } from "./live-shape";
import { loadSprints } from "./sprint";

/** The loop as it is right now — uncached: the open sprints and the two beats. */
export async function loadLive(now = new Date()): Promise<LiveView> {
  const [sprints, rows] = await Promise.all([
    loadSprints(),
    db.waState.findMany({ where: { key: { in: ["sprint-loop", "mac-beat"] } }, select: { key: true, value: true } }).catch(() => []),
  ]);
  const value = (key: string) => (rows.find((r) => r.key === key)?.value ?? null) as Record<string, unknown> | null;
  const mac = value("mac-beat");
  return liveView(sprints, value("sprint-loop") as Beat | null, typeof mac?.at === "string" ? mac.at : null, now);
}
