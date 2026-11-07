import { SUCCESS } from "./success";
import { scoreMetrics } from "./scorecard";
import type { MonetizeOverview } from "./load";

/**
 * The /monetize numbers as one flat map — what the sprint loop measures prompts against
 * (scripts/sprint-cycle.ts, scripts/sprint.ts) and what an `unblockWhen` condition reads.
 * Pure: it takes the page model (`loadMonetize()`), never the database.
 *
 * Keys: every block KPI by its own key (chats, paidDeals, postedDays7, viewsPerPost, …), plus
 * the gates (brokerSends, capped), money (revenueMonthRwf, revenueEntry, …), the funnel stages
 * (stage.<key>), the bottleneck, and the first-share funnel when the model carries it
 * (postsFeatured7, postsClean7, postsPosted7, tiktokContacts7, signed7, paidShareRwf, …).
 */
export type MetricValue = number | string | null;
export type Metrics = Record<string, MetricValue>;

/** The parts of the page model the reader needs — everything optional, so a half-loaded model still reads. */
export type MetricsModel = Partial<Pick<MonetizeOverview, "blocks" | "money" | "gates" | "stages" | "bottleneck" | "experiments" | "nextSteps" | "adChats" | "funnel" | "fixedEstimated" | "score" | "intro">> & {
  firstShare?: Partial<Record<string, unknown>> | null;
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** firstShare totals → their metric keys (the 7-day window the page reads). */
const FIRST_SHARE_KEYS: Record<string, string> = {
  featured: "postsFeatured7",
  clean: "postsClean7",
  rejected: "postsRejected7",
  posted: "postsPosted7",
  failedUploads: "failedUploads7",
  views: "tiktokViews7",
  contacts: "tiktokContacts7",
  chats: "tiktokChats7",
  shortlisted: "shortlisted7",
  asked: "brokersAsked7",
  answered: "brokersAnswered7",
  failedChats: "failedChats7",
  viewings: "viewings7",
  signed: "signed7",
  paid: "paid7",
  paidShareRwf: "paidShareRwf",
  unattributedChats: "unattributedChats7",
};

/** Second names for KPIs a plan or a condition may use. */
const ALIASES: Record<string, string> = { readyNew7: "readyNew", masteredWeek: "mastered" };

export function readMetrics(model: MetricsModel): Metrics {
  const out: Metrics = {};
  for (const b of model.blocks ?? []) {
    out[`${b.key}.health`] = b.health;
    for (const k of b.kpis) out[k.key] = num(k.value);
  }
  for (const [alias, key] of Object.entries(ALIASES)) if (key in out) out[alias] = out[key]!;

  if (model.gates) {
    out.brokerSends = model.gates.brokerSends;
    out.capped = model.gates.capped ? "true" : "false";
  }
  if (model.money) {
    const m = model.money;
    out.revenueMonthRwf = m.revenueRwf;
    // Null until money is recorded, so `revenueEntry exists` reads "some money came in this month".
    out.revenueEntry = m.revenueRwf > 0 ? m.revenueRwf : null;
    out.breakEvenRwf = m.breakEvenRwf;
    out.netRwf = m.netRwf;
    out.unrecordedRwf = m.unrecordedRwf;
    out.costMonthRwf = m.costRwf;
  }
  if (model.funnel) {
    const f = model.funnel;
    out.brokersAsked = f.asked;
    out.brokersAnswered = f.answered;
    out.brokersAvailable = f.available;
    out.viewingsBooked = f.booked;
    out.shortlisted = f.shortlisted;
  }
  if (model.fixedEstimated != null) out.fixedEstimated = model.fixedEstimated ? "true" : "false";
  if (model.adChats != null) out.adChats = model.adChats;
  for (const s of model.stages ?? []) out[`stage.${s.key}`] = s.count;
  if (model.bottleneck) {
    const bn = model.bottleneck;
    out.bottleneck = bn.kind === "step" ? `${bn.from}>${bn.to}` : "insufficient";
    out.bottleneckRate = num(bn.rate);
  }
  if (model.experiments) out.experimentsRunning = model.experiments.filter((e) => e.verdict === "running").length;
  if (model.nextSteps) out.openSteps = model.nextSteps.length;

  // The scorecard: score.doing / brokers / tenants / chatbot (0–100), score.weakest, part.<key>.
  if (model.score) Object.assign(out, scoreMetrics(model.score));
  // Direct intros until 10 deals are paid: how many so far, and how many paid deals until Mkan stays in the middle.
  if (model.intro) {
    out.intros = model.intro.intros;
    out.introsLeft = Math.max(0, model.intro.cap - model.intro.paid);
    out.connectionMode = model.intro.mode;
  }

  const fs = model.firstShare;
  if (fs && typeof fs === "object") {
    for (const [k, key] of Object.entries(FIRST_SHARE_KEYS)) if (k in fs) out[key] = num(fs[k]);
  }
  return out;
}

/** Which way is better for a metric: success.ts first, then the known lower-is-better ones, else up. */
const LOWER_BETTER = new Set(["videoRejectRate", "failedUploads7", "failedChats7", "unattributedChats7", "failRate", "p50", "p95", "rejectRate", "backlog", "skipRate", "postsRejected7", "costMonthRwf", "unrecordedRwf", "openSteps"]);
export function metricDirection(key: string): ">=" | "<=" {
  for (const targets of Object.values(SUCCESS)) {
    const t = targets.find((x) => x.kpi === key || x.kpi === ALIASES[key]);
    if (t) return t.op;
  }
  return LOWER_BETTER.has(key) ? "<=" : ">=";
}

/** moved | flat | worse — a lesson's verdict from the metric's before and after. */
export function verdictOf(key: string, before: number | null, after: number | null): "moved" | "flat" | "worse" | "unknown" {
  if (before == null || after == null) return "unknown";
  const eps = Math.max(1e-9, Math.abs(before) * 0.02); // under 2% is noise
  const d = after - before;
  if (Math.abs(d) <= eps) return "flat";
  const better = metricDirection(key) === ">=" ? d > 0 : d < 0;
  return better ? "moved" : "worse";
}

// ── conditions ─────────────────────────────────────────────────────────

export type CondOp = "==" | "!=" | ">=" | "<=" | ">" | "<" | "exists";
export interface Condition {
  key: string;
  op: CondOp;
  value: number | string | null;
}

const COND = /^\s*([A-Za-z][\w.]*)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/;
const EXISTS = /^\s*([A-Za-z][\w.]*)\s+exists\s*$/;

/** "brokerSends == gated" · "masteredWeek > 0" · "revenueEntry exists"; null when malformed. Parts join with "&&". */
export function parseCondition(text: string): Condition[] | null {
  const parts = text.split(/\s*&&\s*|\s+and\s+/i).filter((p) => p.trim());
  if (!parts.length) return null;
  const out: Condition[] = [];
  for (const p of parts) {
    const ex = EXISTS.exec(p);
    if (ex) {
      out.push({ key: ex[1]!, op: "exists", value: null });
      continue;
    }
    const m = COND.exec(p);
    if (!m) return null;
    const raw = m[3]!.replace(/^["']|["']$/g, "");
    const n = Number(raw);
    out.push({ key: m[1]!, op: m[2] as CondOp, value: raw !== "" && Number.isFinite(n) ? n : raw });
  }
  return out;
}

/**
 * True when every part holds against the metrics. An unknown metric never holds (not even for
 * `!=`): a prompt waits until the number exists, so a missing snapshot never unblocks anything.
 */
export function evalCondition(text: string, metrics: Metrics): boolean {
  const conds = parseCondition(text);
  if (!conds) return false;
  return conds.every((c) => {
    const v = metrics[c.key];
    if (v === undefined || v === null) return false;
    if (c.op === "exists") return v !== "" && v !== "off";
    const bothNum = typeof v === "number" && typeof c.value === "number";
    switch (c.op) {
      case "==":
        return bothNum ? v === c.value : String(v) === String(c.value);
      case "!=":
        return bothNum ? v !== c.value : String(v) !== String(c.value);
      default: {
        if (!bothNum) return false;
        const a = v as number;
        const b = c.value as number;
        return c.op === ">=" ? a >= b : c.op === "<=" ? a <= b : c.op === ">" ? a > b : a < b;
      }
    }
  });
}
