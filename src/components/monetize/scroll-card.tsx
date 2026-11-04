"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronDown, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { Bar, CardData, PanelKey, TrendPoint } from "./card-data";
import type { MonetizeLabels } from "./format";

/**
 * The sticky card, like a listing's Reserve card — but it follows the page. As you scroll, it turns
 * to the section beside it: the money at the top, then the sprint, the to-do list, the costs, the
 * earnings and each block, each with its own small chart. The dots switch panels by hand too.
 * Single-series charts in one brand hue; values and labels stay in ink; hover reads a trend.
 */

export interface ScrollCardLabels {
  panels: MonetizeLabels["panels"];
  card: MonetizeLabels["card"];
  cta: string;
  ctaHref: string;
}

const SECTIONS: { panel: PanelKey; id: string }[] = [
  { panel: "sprint", id: "sprint" },
  { panel: "todo", id: "todo" },
  { panel: "spend", id: "spend" },
  { panel: "earn", id: "earn" },
  { panel: "scrape", id: "scrape" },
  { panel: "enhance", id: "enhance" },
  { panel: "post", id: "post" },
  { panel: "chat", id: "chat" },
];
const ORDER: PanelKey[] = ["overview", ...SECTIONS.map((s) => s.panel)];
const GRADIENT = "linear-gradient(to right, #E61E4D 0%, #E31C5F 50%, #D70466 100%)";
const INK = "text-[#222222] dark:text-foreground";
const MUTED = "text-[#6A6A6A] dark:text-muted-foreground";

/** The section whose top has passed 35% of the viewport; none yet → the money overview. */
function useActivePanel(): [PanelKey, (p: PanelKey) => void] {
  const [active, setActive] = useState<PanelKey>("overview");
  const frame = useRef(0);
  useEffect(() => {
    const read = () => {
      frame.current = 0;
      const line = window.innerHeight * 0.35;
      let next: PanelKey = "overview";
      for (const s of SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= line) next = s.panel;
      }
      setActive((cur) => (cur === next ? cur : next));
    };
    const onScroll = () => {
      if (!frame.current) frame.current = requestAnimationFrame(read);
    };
    read();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, []);
  const jump = (p: PanelKey) => {
    const id = p === "overview" ? "top-task" : SECTIONS.find((s) => s.panel === p)?.id;
    if (id) document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setActive(p);
  };
  return [active, jump];
}

// ── the charts ─────────────────────────────────────────────────────────────

/** Ranked bars: label and value in ink above a thin bar; the longest bar sets the scale. */
function BarList({ bars, target }: { bars: Bar[]; target?: { value: number; label: string } }) {
  const max = Math.max(1, target?.value ?? 0, ...bars.map((b) => b.value));
  return (
    <ul className="space-y-3">
      {bars.map((b) => (
        <li key={b.key} className="group" title={`${b.label}: ${b.display}`}>
          <div className={cn("mb-1 flex items-baseline justify-between gap-3 text-sm", INK)}>
            <span className="truncate">{b.label}</span>
            <span className="shrink-0 font-semibold tabular-nums">{b.display}</span>
          </div>
          <div className="relative h-2 rounded-full bg-[#EBEBEB] dark:bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-500 group-hover:opacity-80"
              style={{ width: `${b.value > 0 ? Math.max(2, (b.value / max) * 100) : 0}%`, background: GRADIENT }}
            />
            {target && <div className="absolute inset-y-[-3px] w-0.5 rounded bg-[#222222] dark:bg-foreground" style={{ insetInlineStart: "calc(100% - 2px)" }} aria-hidden />}
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A flow: each step's bar sized to the first step, the step-to-step rate between them. */
function Flow({ steps }: { steps: Bar[] }) {
  const top = Math.max(1, steps[0]?.value ?? 1, ...steps.map((s) => s.value));
  return (
    <ol className="my-0 ms-0 list-none space-y-1 [&>li]:mt-0">
      {steps.map((s, i) => {
        const prev = steps[i - 1];
        // A rate only where the step is a true subset of the one before (≤ 100%): brokers are asked per
        // home, so "Shortlisted → Brokers asked" can pass 100% and is not a conversion.
        const rate = prev && prev.value > 0 && s.value <= prev.value ? s.value / prev.value : null;
        return (
          <li key={s.key}>
            {i > 0 && (
              <p className={cn("flex h-4 items-center gap-1 ps-1 text-[11px] tabular-nums", MUTED)}>
                <ChevronDown className="size-3" aria-hidden />
                {rate != null && `${Math.round(rate * 100)}%`}
              </p>
            )}
            <div className="group" title={`${s.label}: ${s.display}`}>
              <div className={cn("mb-1 flex items-baseline justify-between gap-3 text-sm", INK)}>
                <span className="truncate">{s.label}</span>
                <span className="font-semibold tabular-nums">{s.display}</span>
              </div>
              <div className="h-2 rounded-full bg-[#EBEBEB] dark:bg-muted">
                <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${s.value > 0 ? Math.max(2, (s.value / top) * 100) : 0}%`, background: GRADIENT }} />
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One progress ring: the share done, the label under it. */
function Ring({ value, display, label, sub }: { value: number; display: string; label: string; sub: string }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <svg viewBox="0 0 76 76" className="size-[76px] -rotate-90" role="img" aria-label={`${label}: ${display}`}>
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="6" className="stroke-[#EBEBEB] dark:stroke-muted" />
        {value > 0 && <circle cx="38" cy="38" r={r} fill="none" strokeWidth="6" strokeLinecap="round" stroke="#E31C5F" strokeDasharray={`${Math.max(value * c, 4)} ${c}`} className="transition-[stroke-dasharray] duration-700" />}
        <text x="38" y="38" textAnchor="middle" dominantBaseline="central" className="rotate-90 fill-[#222222] text-[14px] font-semibold dark:fill-foreground" style={{ transformOrigin: "38px 38px" }}>
          {display}
        </text>
      </svg>
      <p className={cn("text-sm font-semibold", INK)}>{label}</p>
      <p className={cn("text-xs", MUTED)}>{sub}</p>
    </div>
  );
}

const STATUS_FILL: Record<string, string> = {
  processed: "bg-[#222222] dark:bg-foreground",
  running: "bg-[#E31C5F] animate-pulse",
  blocked: "border-2 border-[#C13515] bg-white dark:bg-background",
  pending: "bg-[#DDDDDD] dark:bg-muted",
  skipped: "bg-[#EBEBEB] dark:bg-muted",
};

/** A daily trend: area + 2px line, a crosshair and a value readout under the pointer. */
function Trend({ points, empty }: { points: TrendPoint[]; empty: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  if (points.length < 2) return <p className={cn("rounded-xl bg-[#F7F7F7] p-4 text-sm dark:bg-muted", MUTED)}>{empty}</p>;
  const W = 300;
  const H = 96;
  const max = Math.max(1, ...points.map((p) => p.value));
  const x = (i: number) => (i / (points.length - 1)) * W;
  const y = (v: number) => H - 4 - (v / max) * (H - 12);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const pick = (clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    let f = (clientX - box.left) / box.width;
    if (getComputedStyle(el).direction === "rtl") f = 1 - f; // the chart is mirrored in RTL
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(f * (points.length - 1)))));
  };
  const h = hover == null ? points.length - 1 : hover;
  return (
    <div>
      <div className={cn("mb-2 flex items-baseline justify-between text-sm", INK)}>
        <span className={MUTED}>{points[h]!.label}</span>
        <span className="font-semibold tabular-nums">{points[h]!.display}</span>
      </div>
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${H}`}
        className="h-24 w-full touch-none rtl:-scale-x-100"
        role="img"
        aria-label={points.map((p) => `${p.label} ${p.display}`).join(", ")}
        onPointerMove={(e) => pick(e.clientX)}
        onPointerDown={(e) => pick(e.clientX)}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="mk-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E31C5F" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#E31C5F" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} className="stroke-[#DDDDDD] dark:stroke-border" strokeWidth="1" />
        <path d={area} fill="url(#mk-area)" />
        <path d={line} fill="none" stroke="#E31C5F" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={x(h)} x2={x(h)} y1="0" y2={H} className="stroke-[#B0B0B0]" strokeWidth="1" strokeDasharray="3 3" />
        <circle cx={x(h)} cy={y(points[h]!.value)} r="4.5" fill="#E31C5F" className="stroke-white dark:stroke-background" strokeWidth="2" />
      </svg>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "neg" }) {
  return (
    <div className="min-w-0">
      <p className={cn("text-[10px] font-bold uppercase tracking-wide", INK)}>{label}</p>
      <p className={cn("text-sm tabular-nums", tone === "neg" ? "text-[#C13515]" : INK)}>{value}</p>
    </div>
  );
}

// ── the panels ─────────────────────────────────────────────────────────────

function Panel({ k, d, L }: { k: PanelKey; d: CardData; L: ScrollCardLabels }) {
  const P = L.panels;
  const C = L.card;
  const o = d.overview;
  switch (k) {
    case "overview":
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-x-1.5">
            <span className={cn("text-[22px] font-semibold tabular-nums", INK)}>{o.price}</span>
            <span className={cn("text-sm", INK)}>{C.toBreakEven}</span>
          </div>
          <div className="overflow-hidden rounded-[12px] border border-[#B0B0B0] dark:border-border">
            <div className="grid grid-cols-2">
              <div className="border-e border-[#B0B0B0] px-3 py-2.5 dark:border-border">
                <Stat label={C.revenue} value={o.revenue} />
              </div>
              <div className="px-3 py-2.5">
                <Stat label={C.cost} value={o.cost} />
              </div>
            </div>
            <div className="border-t border-[#B0B0B0] px-3 py-2.5 dark:border-border">
              <Stat label={C.net} value={o.net} tone={o.netNeg ? "neg" : undefined} />
            </div>
          </div>
          <div className={cn("space-y-2.5 text-[15px]", INK)}>
            <div className="flex justify-between gap-4">
              <span className="underline underline-offset-2">{C.fixed}</span>
              <span className="whitespace-nowrap tabular-nums">{o.fixed}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="underline underline-offset-2">{C.metered}</span>
              <span className="whitespace-nowrap tabular-nums">{o.metered}</span>
            </div>
            <div className="flex justify-between gap-4 border-t border-[#DDDDDD] pt-2.5 font-semibold dark:border-border">
              <span>{C.needed}</span>
              <span className="whitespace-nowrap tabular-nums">{o.needed}</span>
            </div>
            <div>
              <div className="mb-1.5 flex justify-between text-sm">
                <span className={MUTED}>{C.progress}</span>
                <span className="tabular-nums">{o.progressDisplay}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#EBEBEB] dark:bg-muted">
                <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${o.progress * 100}%`, background: GRADIENT }} />
              </div>
            </div>
            <div className="flex justify-between gap-4 text-sm">
              <span className={MUTED}>{C.projected}</span>
              <span className={cn("whitespace-nowrap tabular-nums", o.projectedNeg ? "text-[#C13515]" : "text-[#008A05]")}>{o.projected}</span>
            </div>
          </div>
        </div>
      );
    case "sprint":
      if (!d.sprint) return <p className={cn("text-sm", MUTED)}>—</p>;
      return (
        <div className="space-y-5">
          <div className="flex justify-around">
            {d.sprint.rings.map((r) => (
              <Ring key={r.key} value={r.value} display={r.display} label={r.label} sub={r.sub} />
            ))}
          </div>
          <div>
            <p className={cn("mb-2 text-sm font-semibold", INK)}>{P.promptsLegend}</p>
            <div className="flex flex-wrap gap-1.5" aria-hidden>
              {d.sprint.prompts.map((st, i) => (
                <span key={i} className={cn("h-3 w-5 rounded-[4px]", STATUS_FILL[st])} />
              ))}
            </div>
            <ul className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs", MUTED)}>
              {d.sprint.counts.map((c) => (
                <li key={c.status} className="flex items-center gap-1.5">
                  <span className={cn("h-2.5 w-3.5 rounded-[3px]", STATUS_FILL[c.status])} aria-hidden />
                  <span className={INK}>{c.n}</span> {c.label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      );
    case "todo":
      return (
        <div>
          <p className={cn("mb-3 text-sm", MUTED)}>{P.todoBy}</p>
          <BarList bars={d.todo} />
        </div>
      );
    case "spend":
      return (
        <div>
          <p className={cn("mb-3 text-sm", MUTED)}>{P.spendTop}</p>
          <BarList bars={d.spend.bars} />
          <div className={cn("mt-4 flex justify-between border-t border-[#DDDDDD] pt-3 text-[15px] font-semibold dark:border-border", INK)}>
            <span>{P.spendTotal}</span>
            <span className="tabular-nums">{d.spend.total}</span>
          </div>
        </div>
      );
    case "earn":
      return (
        <div>
          <p className={cn("mb-3 text-sm", MUTED)}>{d.earn.targetDisplay}</p>
          <BarList bars={d.earn.bars} target={{ value: d.earn.target, label: d.earn.targetDisplay }} />
          {d.earn.empty && <p className={cn("mt-4 rounded-xl bg-[#F7F7F7] p-3 text-sm dark:bg-muted", INK)}>{P.earnNone}</p>}
        </div>
      );
    case "scrape":
      return (
        <div className="space-y-5">
          <div>
            <p className={cn("mb-2 text-sm", MUTED)}>{P.scrapeFlow}</p>
            <Flow steps={d.scrape.funnel} />
          </div>
          <div>
            <p className={cn("mb-1 text-sm font-semibold", INK)}>{P.homesPerDay}</p>
            <Trend points={d.scrape.trend} empty={P.noTrend} />
          </div>
        </div>
      );
    case "enhance":
      return (
        <div className="space-y-5">
          <div>
            <p className={cn("mb-2 text-sm", MUTED)}>{P.enhanceFlow}</p>
            <Flow steps={d.enhance.funnel} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#DDDDDD] p-3 dark:border-border">
              <p className={cn("text-[22px] font-semibold tabular-nums", INK)}>{d.enhance.backlog}</p>
              <p className={cn("text-xs", MUTED)}>{P.backlog}</p>
            </div>
            <div className="rounded-xl border border-[#DDDDDD] p-3 dark:border-border">
              <p className={cn("text-[22px] font-semibold tabular-nums", INK)}>{d.enhance.reject}</p>
              <p className={cn("text-xs", MUTED)}>{d.enhance.rejectLabel}</p>
            </div>
          </div>
        </div>
      );
    case "post":
      return (
        <div className="space-y-5">
          <div>
            <p className={cn("mb-1 text-sm font-semibold", INK)}>{P.viewsPerDay}</p>
            <Trend points={d.post.trend} empty={P.noTrend} />
          </div>
          {d.post.postedDays != null && (
            <div>
              <p className={cn("mb-2 text-sm", MUTED)}>{P.postedDays}</p>
              <div className="flex gap-1.5" role="img" aria-label={`${d.post.postedDays}/7`}>
                {Array.from({ length: 7 }, (_, i) => (
                  <span key={i} className={cn("h-3 flex-1 rounded-[4px]", i < (d.post.postedDays ?? 0) ? "bg-[#E31C5F]" : "bg-[#EBEBEB] dark:bg-muted")} />
                ))}
              </div>
              <p className={cn("mt-1.5 text-sm font-semibold tabular-nums", INK)}>{d.post.postedDays}/7</p>
            </div>
          )}
        </div>
      );
    case "chat":
      return (
        <div>
          <p className={cn("mb-2 text-sm", MUTED)}>{P.chatFlow}</p>
          <Flow steps={d.chat.funnel} />
        </div>
      );
  }
}

export function ScrollCard({ data, labels }: { data: CardData; labels: ScrollCardLabels }) {
  const [active, jump] = useActivePanel();
  const reduce = useReducedMotion();
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[#DDDDDD] bg-white p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)] dark:border-border dark:bg-card">
        <div className="mb-5 flex items-center justify-between gap-3">
          <p className={cn("text-xs font-bold uppercase tracking-wide", MUTED)}>{labels.panels[active]}</p>
          <div className="flex items-center gap-1" role="tablist" aria-label={labels.panels.overview}>
            {ORDER.map((p) => (
              <button
                key={p}
                type="button"
                role="tab"
                aria-selected={p === active}
                aria-label={labels.panels.jump.replace("{name}", labels.panels[p])}
                title={labels.panels[p]}
                onClick={() => jump(p)}
                className="flex size-4 items-center justify-center"
              >
                <span className={cn("block rounded-full transition-all", p === active ? "h-1.5 w-3.5 bg-[#222222] dark:bg-foreground" : "size-1.5 bg-[#DDDDDD] hover:bg-[#B0B0B0] dark:bg-muted")} />
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-[300px]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={active}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              <Panel k={active} d={data} L={labels} />
            </motion.div>
          </AnimatePresence>
        </div>

        <a href={labels.ctaHref} style={{ background: GRADIENT }} className="mt-6 flex h-12 w-full items-center justify-center rounded-[12px] text-base font-semibold text-white hover:opacity-95">
          {labels.cta}
        </a>
        <p className={cn("mt-3 text-center text-sm", MUTED)}>{labels.card.refresh}</p>
        {data.overview.sprintLine && (
          <button type="button" onClick={() => jump("sprint")} className={cn("mt-3 block w-full rounded-[10px] bg-[#F7F7F7] px-3 py-2 text-center text-sm hover:underline dark:bg-muted", INK)}>
            {data.overview.sprintLine}
          </button>
        )}
      </div>

      {data.overview.weakest && (
        <a href="#funnel" className={cn("flex items-center justify-center gap-2 rounded-xl border border-[#DDDDDD] px-4 py-4 text-sm hover:bg-[#F7F7F7] dark:border-border dark:hover:bg-muted", INK)}>
          <TriangleAlert className="size-4 shrink-0 text-[#E31C5F]" aria-hidden />
          <span>{data.overview.weakest}</span>
        </a>
      )}
    </div>
  );
}
