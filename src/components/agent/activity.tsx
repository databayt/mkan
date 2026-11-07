"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  CalendarClock,
  ChevronRight,
  CircleAlert,
  ClipboardCheck,
  Clock,
  Expand,
  Funnel,
  House,
  Layers,
  List,
  ListChecks,
  ListOrdered,
  MessageCircle,
  PenLine,
  Search,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { cn } from "@/lib/utils";
import { playfulWord, turnActivity, type DonePart, type LiveStep } from "./activity-pure";
import { fill } from "./format";
import { joiner } from "./questions";
import type { AgentEventView, AgentTaskView, EventKind } from "./types";

/**
 * The agent's work in the Claude iOS app's shape (2026-11-07):
 *  - one grey row for the finished steps — "Read your message, searched 120
 *    homes, ranked 8…" with a `+8 −112` badge (homes on the list, searched homes
 *    that did not fit) — that opens the full trace;
 *  - a live row for the step running now, its name shimmering ("Searching homes ›");
 *  - at the bottom, the orange line: tumbling dots and a word that changes every
 *    few seconds ("Weighing it up…", never an action), the seconds, and the broker
 *    checks still running in blue.
 * Every row is an `AgentEvent` row — nothing here is invented for show.
 */

const LIVE_ICON: Record<LiveStep, LucideIcon> = { read: BookOpen, search: Search, widen: Expand, write: PenLine };

const EVENT_ICON: Partial<Record<EventKind, LucideIcon>> = {
  requirements_extracted: BookOpen,
  asked: ListChecks,
  memory_used: Brain,
  memory_updated: Brain,
  search_done: Search,
  dedup_grouped: Layers,
  filtered: Funnel,
  relaxed: Expand,
  ranked: ListOrdered,
  needs_confirmation: ClipboardCheck,
  shortlist_ready: House,
  reply_written: PenLine,
  broker_contact_started: MessageCircle,
  availability_asked: MessageCircle,
  broker_replied: MessageCircle,
  viewing_proposed: CalendarClock,
  viewing_confirmed: CalendarClock,
  outcome_recorded: ClipboardCheck,
  failed: CircleAlert,
};

/** Claude's thinking mark, our own: three dots in the line's colour that tumble (globals.css `.agent-dots`). */
export function Dots({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("agent-dots", className)}>
      <i />
      <i />
      <i />
    </span>
  );
}

const rowText = (compact: boolean) => (compact ? "text-[14px] leading-5" : "text-[17px] leading-7 md:text-base");
const rowIcon = (compact: boolean) => (compact ? "size-[17px]" : "size-[21px]");

/** The rows above an agent turn: its finished steps folded into one line, and the step running now. */
export function ActivityRows({ task, chips = [], compact = false }: { task: AgentTaskView; chips?: string[]; compact?: boolean }) {
  const dict = useDictionary();
  const { locale } = useLocale();
  const t = dict?.agent?.activity;
  const p = dict?.agent?.panel;
  const [open, setOpen] = useState(false);
  const act = useMemo(() => turnActivity(task), [task]);

  if (act.parts.length === 0 && !act.live) return null;

  const done = t?.done as Record<string, string> | undefined;
  const phrase = (part: DonePart) => fill(done?.[part.key] ?? part.key, "count" in part ? { count: part.count } : {});
  const sentence = act.parts.map(phrase).join(joiner(locale));
  // "Read your message, …" leads with a capital; a row that starts elsewhere gets one too.
  const headline = sentence ? sentence.charAt(0).toLocaleUpperCase(locale) + sentence.slice(1) : "";
  const live = act.live ? ((t?.live as Record<string, string> | undefined)?.[act.live] ?? act.live) : null;
  const LiveIcon = act.live ? LIVE_ICON[act.live] : null;
  const toggleLabel = open ? (p?.hideSteps ?? "Hide steps") : (p?.showSteps ?? "Show steps");
  const chevron = <ChevronRight className={cn("shrink-0 opacity-70 transition-transform", compact ? "size-4" : "size-[18px]", open ? "rotate-90" : "rtl:rotate-180")} aria-hidden />;
  const row = cn("group flex max-w-full items-center text-start text-agent-ink-3 transition-colors hover:text-agent-ink-2", compact ? "gap-2" : "gap-3", rowText(compact));

  return (
    <div className={cn("space-y-2", compact ? "text-[14px]" : undefined)}>
      {headline && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={row}>
          <List className={cn("shrink-0", rowIcon(compact), act.failed && "text-destructive")} aria-hidden />
          <span className="min-w-0 truncate">{headline}</span>
          {act.badge && (
            <span
              className={cn("inline-flex shrink-0 overflow-hidden rounded-md font-medium tabular-nums", compact ? "text-[11px]" : "text-[13px]")}
              aria-label={fill(t?.badge ?? "{kept} homes on the list, {ruledOut} ruled out", { kept: act.badge.kept, ruledOut: act.badge.ruledOut })}
              dir="ltr"
            >
              {act.badge.kept > 0 && <span className="bg-agent-add-bg px-1.5 py-0.5 text-agent-add">+{act.badge.kept}</span>}
              {act.badge.ruledOut > 0 && <span className="bg-agent-del-bg px-1.5 py-0.5 text-agent-del">−{act.badge.ruledOut}</span>}
            </span>
          )}
          {chevron}
          <span className="sr-only">{toggleLabel}</span>
        </button>
      )}

      {live && LiveIcon && (
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={row}>
          <LiveIcon className={cn("shrink-0", rowIcon(compact))} aria-hidden />
          <span className="min-w-0 truncate bg-[linear-gradient(90deg,var(--agent-ink-3)_30%,var(--agent-ink-off)_50%,var(--agent-ink-3)_70%)] bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer motion-reduce:text-agent-ink-3">
            {live}
          </span>
          {chevron}
          <span className="sr-only">{toggleLabel}</span>
        </button>
      )}

      {open && <Trace task={task} events={act.events} chips={chips} compact={compact} />}
    </div>
  );
}

/** The opened row: what the agent understood (its reading — the model's own thinking is off), then one line per step. */
function Trace({ task, events, chips, compact }: { task: AgentTaskView; events: AgentEventView[]; chips: string[]; compact: boolean }) {
  const dict = useDictionary();
  const { locale } = useLocale();
  const t = dict?.agent?.activity;
  const p = dict?.agent?.panel;
  const start = events[0]?.at ?? task.startedAt;

  const summary = (e: AgentEventView): string => {
    const texts = p?.events as Record<string, string> | undefined;
    if (e.kind === "broker_contact_started") {
      if (e.payload.reused) return `${texts?.broker_contact_reused ?? ""}${e.payload.title ? ` · ${e.payload.title}` : ""}`;
      const channel = (p?.channel as Record<string, string> | undefined)?.[String(e.payload.channel)];
      const text = fill(texts?.broker_contact_started ?? "{broker}", { broker: String(e.payload.broker ?? "—"), count: Number(e.payload.count ?? 1) });
      return channel ? `${text} · ${channel}` : text;
    }
    if (e.kind === "broker_replied") {
      const answer = (p?.answers as Record<string, string> | undefined)?.[String(e.payload.answer)] ?? String(e.payload.answer);
      const text = fill(texts?.broker_replied ?? "{answer}", { answer });
      return e.payload.title ? `${text} · ${e.payload.title}` : text;
    }
    if (e.kind === "memory_used") {
      // The remembered fields by name, once each ("budget" covers price and period).
      const names = ((e.payload.fields as string[] | undefined) ?? []).map((k) => (p?.fields as Record<string, string> | undefined)?.[k] ?? k);
      return fill(texts?.memory_used ?? "{fields}", { fields: [...new Set(names)].join(joiner(locale)) });
    }
    const text = fill(texts?.[e.kind] ?? e.kind, e.payload as Record<string, string | number>);
    if (e.kind === "requirements_extracted" && e.payload.reader) {
      const reader = (p?.reader as Record<string, string> | undefined)?.[String(e.payload.reader)];
      return reader ? `${text} · ${reader}` : text;
    }
    return text;
  };

  // "+1.2s" from the turn's first row; a broker's answer hours later shows its Kigali time instead.
  const when = (iso: string): string => {
    const ms = Date.parse(iso) - Date.parse(start);
    if (!Number.isFinite(ms) || ms < 0) return "";
    if (ms < 60_000) return `+${fill(t?.secs ?? "{s}s", { s: (ms / 1000).toFixed(ms < 10_000 ? 1 : 0) })}`;
    return new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" }).format(new Date(iso));
  };

  const unconfirmed = events.some((e) => e.kind === "needs_confirmation" && e.status === "uncertain") && !events.some((e) => e.kind === "broker_contact_started");
  const item = cn("flex items-start", compact ? "gap-2" : "gap-2.5");
  const icon = cn("mt-[0.2em] shrink-0", compact ? "size-3.5" : "size-4");

  return (
    <ol className={cn("ms-[10px] list-none space-y-2 border-s border-agent-line ps-4 text-agent-ink-3", compact ? "text-[12.5px] leading-5" : "text-[15px] leading-6 md:text-sm")}>
      {chips.length > 0 && events.some((e) => e.kind === "requirements_extracted") && (
        <li className={item}>
          <Sparkles className={cn(icon, "text-agent-orange")} aria-hidden />
          <span className="min-w-0">
            <span className="font-medium text-agent-ink-2">{t?.understood ?? "Understood"}</span>
            {": "}
            {chips.join(" · ")}
          </span>
        </li>
      )}
      {events.map((e) => {
        const Icon = EVENT_ICON[e.kind] ?? List;
        return (
          <li key={e.seq} className={item}>
            <Icon
              className={cn(
                icon,
                e.status === "failed" && e.kind !== "relaxed" && e.kind !== "broker_replied" && "text-destructive",
                (e.status === "waiting_person" || e.status === "uncertain") && "text-amber-600 dark:text-amber-500",
                e.status === "running" && "animate-pulse text-agent-orange",
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1">
              {summary(e)}
              <span className="sr-only"> — {(p?.status as Record<string, string> | undefined)?.[e.status] ?? e.status}</span>
            </span>
            <span className="shrink-0 tabular-nums opacity-80">{when(e.at)}</span>
          </li>
        );
      })}
      {unconfirmed && <li className="ps-6">{p?.confirmLater ?? "Availability is not confirmed yet."}</li>}
    </ol>
  );
}

/**
 * The orange line under a running turn. The word claims no action — the rows
 * above name the real step — and changes every 2.5 s; the seconds show from 3 s;
 * broker checks still running are counted in blue. Screen readers hear
 * "Working" once, not every word.
 */
export function StatusLine({ task, compact = false }: { task: AgentTaskView; compact?: boolean }) {
  const dict = useDictionary();
  const t = dict?.agent?.activity;
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(id);
  }, []);
  const words = (t?.words as string[] | undefined) ?? ["Thinking…"];
  const seed = task.messages.findLast((m) => m.role === "user")?.at ?? task.startedAt;
  const word = playfulWord(words, seed, Math.floor(tick / 5));
  const seconds = Math.floor(tick / 2);
  const brokers = task.shortlist.filter((s) => s.availability === "asked").length;

  return (
    <div role="status" className={cn("flex min-w-0 items-center text-agent-orange", compact ? "gap-2 text-[14px] leading-5" : "gap-2.5 text-[17px] leading-7 md:text-base")}>
      <Dots className="text-[1.05em]" />
      <span className="sr-only">{t?.working ?? "Working"}</span>
      <span className="min-w-0 truncate">
        <span aria-hidden key={word} className="inline-block animate-in fade-in duration-500 motion-reduce:animate-none">
          {word}
        </span>
        {seconds >= 3 && (
          <span aria-hidden className="tabular-nums text-agent-ink-3">
            {" · "}
            {fill(t?.secs ?? "{s}s", { s: seconds })}
          </span>
        )}
        {brokers > 0 && (
          <span className="text-agent-link">
            {" · "}
            {fill(t?.brokersRunning ?? "{count} broker checks running", { count: brokers })}
          </span>
        )}
      </span>
    </div>
  );
}

/** Under a turn waiting on brokers: how many homes they were asked about. Their answers land in the chat. */
export function WaitingRow({ count, compact = false }: { count: number; compact?: boolean }) {
  const dict = useDictionary();
  if (count <= 0) return null;
  return (
    <p className={cn("flex items-center text-agent-ink-3", compact ? "gap-2" : "gap-3", rowText(compact))}>
      <Clock className={cn("shrink-0", rowIcon(compact))} aria-hidden />
      <span className="min-w-0">{fill(dict?.agent?.activity?.waiting ?? "Asked brokers about {count} homes — their answers appear here", { count })}</span>
    </p>
  );
}

/** A question card closed with ×: one row in the chat that opens it again. */
export function QuestionsRow({ count, onOpen, disabled, compact = false }: { count: number; onOpen: () => void; disabled?: boolean; compact?: boolean }) {
  const dict = useDictionary();
  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={disabled}
      className={cn("flex max-w-full items-center text-start text-agent-ink-3 transition-colors hover:text-agent-ink-2 disabled:opacity-50", compact ? "gap-2" : "gap-3", rowText(compact))}
    >
      <ListChecks className={cn("shrink-0", rowIcon(compact))} aria-hidden />
      <span className="min-w-0 truncate">{fill(dict?.agent?.activity?.questions ?? "{count} questions", { count })}</span>
      <ChevronRight className={cn("shrink-0 opacity-70 rtl:rotate-180", compact ? "size-4" : "size-[18px]")} aria-hidden />
    </button>
  );
}
