import type { Health, JobState, JobStatus } from "./types";

/**
 * The health rule, the same one `kun/.claude/scripts/runs.sh` judges jobs by:
 * a failed last run is red; a run older than twice its cadence is stale (red);
 * otherwise the block is green unless its lever metric fell more than 20%
 * against the previous window (yellow). No evidence at all is "unknown" —
 * never a quiet green.
 */
export const STALE_FACTOR = 2;
export const YELLOW_DROP = 0.2;

export function jobStatus(
  raw: { status?: string | null; at?: string | null },
  cadenceHours: number,
  now: number = Date.now(),
): JobStatus {
  if (!raw.status) return "missing";
  if (raw.status === "fail") return "fail";
  const at = raw.at ? Date.parse(raw.at) : NaN;
  if (!Number.isFinite(at)) return "missing";
  if (now - at > STALE_FACTOR * cadenceHours * 3_600_000) return "stale";
  return raw.status === "warn" || raw.status === "defer" ? "warn" : "ok";
}

/** Relative change, or null when there is no baseline to compare against. */
export function change(cur: number | null | undefined, prev: number | null | undefined): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}

export function blockHealth(input: {
  jobs: JobState[];
  lever: number | null;
  leverPrev: number | null;
  /** Block-specific hard stops (a cap hit, a gate closed) that make it red regardless of jobs. */
  blockers?: string[];
}): { health: Health; reason: string } {
  const { jobs, lever, leverPrev, blockers = [] } = input;
  if (blockers.length) return { health: "red", reason: blockers[0]! };
  const failed = jobs.find((j) => j.status === "fail");
  if (failed) return { health: "red", reason: "jobFailed" };
  const stale = jobs.find((j) => j.status === "stale");
  if (stale) return { health: "red", reason: "jobStale" };
  const known = jobs.some((j) => j.status !== "missing") || lever != null;
  if (!known) return { health: "unknown", reason: "noEvidence" };
  const delta = change(lever, leverPrev);
  if (delta != null && delta < -YELLOW_DROP) return { health: "yellow", reason: "leverDown" };
  if (jobs.some((j) => j.status === "warn")) return { health: "yellow", reason: "jobWarn" };
  if (lever === 0) return { health: "yellow", reason: "leverZero" };
  return { health: "green", reason: "healthy" };
}

/** Worst-first ordering, so a summary light is the worst of its parts. */
export const HEALTH_RANK: Record<Health, number> = { red: 0, yellow: 1, unknown: 2, green: 3 };
export const worst = (hs: Health[]): Health =>
  hs.reduce<Health>((w, h) => (HEALTH_RANK[h] < HEALTH_RANK[w] ? h : w), "green");

/** Day-over-day growth of a cumulative counter (homes in the CRM) — "new per day". */
export function deltas(cumulative: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < cumulative.length; i++) out.push(Math.max(0, cumulative[i]! - cumulative[i - 1]!));
  return out;
}
