"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, TriangleAlert } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

import type { Bar, BlockFlow, CardData, PanelKey } from "./card-data";
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

/**
 * A block's steps as a flow chart: boxes joined by arrows, in run order. The step the block's light
 * blames carries a "!" and the reason under it; the steps after it wait on it, so they fade.
 */
function StepFlow({ flow, title, ok }: { flow: BlockFlow; title: string; ok: string }) {
  const bad = flow.problem;
  return (
    <div>
      <p className={cn("mb-3 text-sm", MUTED)}>{title}</p>
      <ol className="my-0 ms-0 list-none [&>li]:mt-0">
        {flow.steps.map((label, i) => {
          const isBad = i === bad;
          const after = bad != null && i > bad;
          return (
            <li key={i}>
              {i > 0 && (
                <div className="flex h-5 justify-center" aria-hidden>
                  <svg viewBox="0 0 10 20" className={cn("h-5 w-2.5", after ? "text-[#DDDDDD] dark:text-border" : "text-[#B0B0B0]")}>
                    <path d="M5 0v15" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M1.5 12 5 17l3.5-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
              <div
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                  isBad ? "border-[#C13515] bg-[#FFF0F0] dark:bg-destructive/10" : "border-[#DDDDDD] dark:border-border",
                  after && "opacity-50",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                    isBad ? "bg-[#C13515] text-white" : "bg-[#F7F7F7] dark:bg-muted " + INK,
                  )}
                  aria-hidden={!isBad}
                >
                  {isBad ? "!" : i + 1}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", isBad ? "font-semibold text-[#C13515]" : INK)}>{label}</span>
              </div>
              {isBad && flow.reason && <p className="mt-1.5 ps-1 text-xs leading-4 text-[#C13515]">{flow.reason}</p>}
            </li>
          );
        })}
      </ol>
      {bad == null && (
        <p className="mt-4 flex items-center gap-1.5 text-sm text-[#008A05]">
          <Check className="size-4" aria-hidden />
          {ok}
        </p>
      )}
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
    case "enhance":
    case "post":
    case "chat":
      return <StepFlow flow={d.flows[k]} title={P.flowTitle} ok={P.flowOk} />;
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
