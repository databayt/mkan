"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Clock, Loader2, Maximize2, RotateCcw, X } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { Badges, usePicksLabel, type Picks } from "../badges";
import { Composer } from "../composer";
import { fill } from "../format";
import { Steps } from "../steps";
import { AgentTurn, UserTurn } from "../turn";
import type { ShortlistItem } from "../types";
import { useAgentTask } from "../use-agent-task";

const MINI_CARDS = 3;

function MiniCard({ item }: { item: ShortlistItem }) {
  const dict = useDictionary();
  const c = dict?.agent?.card;
  const { locale } = useLocale();
  const external = !!item.lead;
  return (
    <Link
      href={item.path}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex gap-3 rounded-xl border p-2 transition-colors hover:bg-muted"
    >
      <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {item.photo && <BlurImage src={item.photo} alt="" fill sizes="64px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        <span className="block truncate text-sm font-medium">{item.title}</span>
        <span className="block text-xs">
          <span className="font-semibold">{formatCurrency(item.cost.headline, locale, item.currency)}</span>{" "}
          <span className="text-muted-foreground">{item.cost.period === "month" ? c?.perMonth ?? "/ month" : c?.perNight ?? "/ night"}</span>
        </span>
        {item.availability === "confirmed" ? (
          <span className="flex items-center gap-1 text-xs text-emerald-700">
            <BadgeCheck className="size-3" aria-hidden />
            {c?.confirmed ?? "Availability confirmed"}
          </span>
        ) : item.availability === "asked" ? (
          <span className="flex items-center gap-1 text-xs text-amber-700">
            <Clock className="size-3" aria-hidden />
            {c?.asked ?? "Asked the broker"}
          </span>
        ) : null}
      </span>
    </Link>
  );
}

/**
 * The agent's side panel: the /find conversation at full height. From md up it
 * takes 40% of the width and pushes the page aside (the `data-agent-panel`
 * rule in globals.css), like Claude in Chrome; on phones it is a full screen.
 */
export default function AgentPanel({ open, onClose, onWaiting }: { open: boolean; onClose: () => void; onWaiting: (waiting: boolean) => void }) {
  const dict = useDictionary();
  const a = dict?.agent;
  const b = a?.bubble;
  const { locale } = useLocale();
  const { task, loaded, running, waiting, pending, notice, send, reset, reply, askingStay } = useAgentTask(null, { lazy: true });
  const [picks, setPicks] = useState<Picks>({});
  const picksLabel = usePicksLabel();

  useEffect(() => onWaiting(waiting), [waiting, onWaiting]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const messages = task?.messages ?? [];
  const lastAgentIndex = messages.findLastIndex((m) => m.role === "agent");
  const pendingTurn = running && messages.at(-1)?.role === "user";
  const fullPage = `/${locale}/find`;

  return (
    <section
      role="dialog"
      aria-label={b?.title ?? "Mkan rental agent"}
      inert={!open}
      className={cn(
        "fixed inset-y-0 end-0 z-[55] flex h-dvh w-full flex-col bg-background transition-transform duration-200 ease-out motion-reduce:transition-none",
        "md:w-[max(40vw,360px)] md:border-s",
        open ? "translate-x-0" : "pointer-events-none translate-x-full rtl:-translate-x-full",
      )}
    >
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <p className="flex-1 font-semibold">{b?.title ?? "Mkan rental agent"}</p>
        {task && !running && (
          <button type="button" onClick={reset} aria-label={a?.newSearch ?? "New search"} title={a?.newSearch ?? "New search"} className="rounded-md p-1.5 hover:bg-muted">
            <RotateCcw className="size-4" aria-hidden />
          </button>
        )}
        <Link href={fullPage} onClick={onClose} aria-label={b?.expand ?? "Open full screen"} title={b?.expand ?? "Open full screen"} className="rounded-md p-1.5 hover:bg-muted">
          <Maximize2 className="size-4" aria-hidden />
        </Link>
        <button type="button" onClick={onClose} aria-label={b?.close ?? "Close"} className="rounded-md p-1.5 hover:bg-muted">
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {!loaded ? (
          <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" aria-hidden />
        ) : !task ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold">{a?.greeting ?? "Where do you want to live in Kigali?"}</p>
            <p className="text-sm text-muted-foreground">{a?.subtitle}</p>
            <Badges picks={picks} onChange={setPicks} compact />
          </div>
        ) : (
          <ol className="space-y-5">
            {messages.map((m, i) => {
              if (m.role === "user") return <UserTurn key={i} text={m.text} compact />;
              const latest = i === lastAgentIndex && !pendingTurn;
              return (
                <AgentTurn key={i} compact steps={latest ? <Steps task={task} compact /> : null}>
                  <p className="whitespace-pre-wrap">{reply(m)}</p>
                  {latest && askingStay && (
                    <div className="flex flex-wrap gap-2">
                      {[a?.stayShort ?? "Short stay", a?.stayLong ?? "Monthly rent"].map((label) => (
                        <button key={label} type="button" onClick={() => void send(label)} disabled={pending} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                  {latest && m.kind === "shortlist" && task.shortlist.length > 0 && (
                    <div className="space-y-2">
                      {task.shortlist.slice(0, MINI_CARDS).map((item) => (
                        <MiniCard key={item.id} item={item} />
                      ))}
                      <Link href={fullPage} onClick={onClose} className="block text-xs font-medium underline-offset-4 hover:underline">
                        {fill(b?.seeAll ?? "See all {count} homes and every step", { count: task.shortlist.length })}
                      </Link>
                    </div>
                  )}
                </AgentTurn>
              );
            })}
            {pendingTurn && <AgentTurn compact steps={<Steps task={task} compact />} />}
          </ol>
        )}
      </div>

      <footer className="border-t p-3">
        {notice && <p className="mb-2 text-xs text-muted-foreground">{notice}</p>}
        <Composer
          size="sm"
          onSend={async (t) => {
            const fresh = !task;
            const ok = await send(t.trim() || picksLabel(picks), fresh, fresh ? picks : undefined);
            if (ok) setPicks({});
            return ok;
          }}
          canSendEmpty={!task && Object.keys(picks).length > 0}
          disabled={pending || running || !loaded}
        />
      </footer>
    </section>
  );
}
