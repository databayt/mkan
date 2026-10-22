"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowDown, BadgeCheck, Clock, Loader2, Maximize2, SquarePen, X } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import { usePicksLabel, Wizard, type Picks } from "../wizard";
import { AskCard } from "../ask-card";
import { Composer } from "../composer";
import { ChatHeader, headerButton, MenuGlyph } from "../header";
import { Refine } from "../refine";
import { fill } from "../format";
import { Steps } from "../steps";
import { Suggestions } from "../suggestions";
import { AgentTurn, PastAgentTurn, Prose, UserTurn } from "../turn";
import type { ShortlistItem } from "../types";
import { useAgentTask } from "../use-agent-task";
import { useStickToBottom } from "../use-stick-to-bottom";
import { Welcome } from "../welcome";
import { listingsQueryFor } from "./listings-query";

// Above the panel (z-55), loaded on its first open.
const ChatsSheet = dynamic(() => import("../chats-sheet").then((m) => m.ChatsSheet), { ssr: false });

const MINI_CARDS = 3;
/** The listings page re-filters once the requirements settle, not on every change. */
const REFILTER_DEBOUNCE_MS = 400;

function MiniCard({ item, best = false }: { item: ShortlistItem; best?: boolean }) {
  const dict = useDictionary();
  const c = dict?.agent?.card;
  const { locale } = useLocale();
  const external = !!item.lead;
  return (
    <Link
      href={item.path}
      {...(external ? { target: "_blank", rel: "noreferrer" } : {})}
      className="flex gap-3 rounded-2xl bg-background p-2 shadow-[0_1px_6px_rgba(0,0,0,0.07)] ring-1 ring-black/5 transition-colors hover:bg-muted dark:ring-white/10"
    >
      <span className="relative h-14 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {item.photo && <BlurImage src={item.photo} alt="" fill sizes="64px" className="object-cover" />}
      </span>
      <span className="min-w-0 flex-1 space-y-0.5">
        {best && <span className="block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{c?.best ?? "Best match"}</span>}
        <span dir="auto" className="block truncate text-start text-sm font-medium">{item.title}</span>
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
 * The agent's panel — the /find conversation in ChatGPT's iOS shell. From md
 * up it takes 40% of the width and pushes the page aside (the
 * `data-agent-panel` rule in globals.css), like Claude in Chrome; on phones it
 * is a full-height sheet that slides up from the bottom.
 */
export default function AgentPanel({ open, onClose, onWaiting }: { open: boolean; onClose: () => void; onWaiting: (waiting: boolean) => void }) {
  const dict = useDictionary();
  const a = dict?.agent;
  const b = a?.bubble;
  const c = a?.chat;
  const { locale } = useLocale();
  const { task, loaded, running, waiting, pending, notice, send, reset, open: openTask, opening, reply } = useAgentTask(null, { lazy: true });
  const [sheet, setSheet] = useState<"closed" | "open" | "never">("never");
  const [picks, setPicks] = useState<Picks>({});
  const [guided, setGuided] = useState(false);
  const [returning, setReturning] = useState(false);
  const picksLabel = usePicksLabel();
  const messages = task?.messages ?? [];
  const { ref: scrollRef, onScroll, away, scrolled, scrollToBottom } = useStickToBottom(`${messages.length}.${task?.shortlist.length ?? 0}.${running}.${open}`);

  // The composer and the wizard's last step both search; a new search carries the picks.
  const search = async (text: string) => {
    const fresh = !task || guided;
    const ok = await send(text.trim() || picksLabel(picks) || "…", fresh, fresh ? picks : undefined);
    if (ok) {
      setPicks({});
      setGuided(false);
      requestAnimationFrame(() => scrollToBottom());
    }
    return ok;
  };
  const newChat = () => {
    reset();
    setPicks({});
    setGuided(false);
    setSheet((v) => (v === "never" ? v : "closed"));
  };
  const openChat = (id: string) => {
    setSheet("closed");
    setGuided(false);
    void openTask(id).then((ok) => ok && requestAnimationFrame(() => scrollToBottom()));
  };

  useEffect(() => onWaiting(waiting), [waiting, onWaiting]);

  // The page behind the panel follows the conversation: while it is the
  // listings index, a change in what the agent knows re-filters it — once the
  // requirements settle, so a burst of polls does not re-fetch the page.
  // A listing's own page is left alone — the visitor is reading it.
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const onListings = /^\/(en|ar|rw)\/listings\/?$/.test(pathname);
  const query = listingsQueryFor(task?.requirements ?? null);
  useEffect(() => {
    if (!open || !onListings || !query) return;
    const id = setTimeout(() => {
      if (window.location.search.replace(/^\?/, "") === query) return;
      router.replace(`${pathname}?${query}`, { scroll: false });
    }, REFILTER_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [open, onListings, query, pathname, router]);

  // Escape closes the ☰ sheet first (Radix), the panel only when the sheet is shut. The
  // listener sits in the capture phase: closing the sheet re-attaches it mid-event, and a
  // bubbling listener would then catch the very Escape that closed the sheet.
  useEffect(() => {
    if (!open || sheet === "open") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, sheet]);

  const lastAgentIndex = messages.findLastIndex((m) => m.role === "agent");
  const pendingTurn = running && messages.at(-1)?.role === "user";
  const fullPage = task ? `/${locale}/find?c=${task.id}` : `/${locale}/find`;

  return (
    <section
      role="dialog"
      aria-label={b?.title ?? "Mkan rental agent"}
      inert={!open}
      className={cn(
        "fixed inset-y-0 end-0 z-[55] flex h-dvh w-full flex-col bg-background transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] motion-reduce:transition-none",
        "md:w-[max(40vw,360px)] md:border-s md:duration-200",
        open ? "translate-0" : "pointer-events-none translate-y-full md:translate-x-full md:translate-y-0 md:rtl:-translate-x-full",
      )}
    >
      <ChatHeader
        title={c?.name ?? "Mkan"}
        scrolled={scrolled}
        start={
          <>
            <button type="button" onClick={onClose} aria-label={b?.close ?? "Close"} title={b?.close ?? "Close"} className={headerButton}>
              <X aria-hidden />
            </button>
            <button type="button" onClick={() => setSheet("open")} aria-label={a?.chats?.menu ?? "Chats"} title={a?.chats?.menu ?? "Chats"} className={headerButton}>
              <MenuGlyph />
            </button>
          </>
        }
        end={
          <>
            <Link href={fullPage} onClick={onClose} aria-label={b?.expand ?? "Open full screen"} title={b?.expand ?? "Open full screen"} className={headerButton}>
              <Maximize2 className="!size-[18px]" aria-hidden />
            </Link>
            <button type="button" onClick={newChat} disabled={!task || running} aria-label={c?.newChat ?? "New chat"} title={c?.newChat ?? "New chat"} className={headerButton}>
              <SquarePen aria-hidden />
            </button>
          </>
        }
      />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        aria-busy={!!opening}
        className={cn("flex-1 overflow-y-auto overscroll-contain px-3 transition-opacity", opening && task && "opacity-40")}
      >
        {!loaded || (!task && opening) ? (
          <Loader2 className="mx-auto mt-10 size-5 animate-spin text-muted-foreground" aria-hidden />
        ) : !task || guided ? (
          <div className="flex min-h-full flex-col justify-center py-4">
            {guided ? (
              <Wizard picks={picks} onChange={setPicks} onFinish={() => void search("")} disabled={pending} compact />
            ) : (
              <div className="flex flex-col items-center">
                <Welcome
                  compact
                  onContinue={(text, filters) => void send(text, true, filters).then((ok) => ok && requestAnimationFrame(() => scrollToBottom()))}
                  onReady={setReturning}
                  disabled={pending}
                />
                {!returning && (
                  <p className="text-balance text-center text-[22px] font-semibold leading-tight tracking-tight">{a?.greeting ?? "Where do you want to live in Kigali?"}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <ol className="list-none space-y-5 py-3">
            {messages.map((m, i) => {
              if (m.role === "user") return <UserTurn key={`${i}.${m.at}`} text={m.text} compact />;
              const latest = i === lastAgentIndex && !pendingTurn;
              if (!latest) return <PastAgentTurn key={`${i}.${m.at}`} text={reply(m)} compact />;
              return (
                <AgentTurn key={`${i}.${m.at}`} compact steps={<Steps task={task} compact />}>
                  {m.kind === "ask" && !running ? (
                    <AskCard field={m.field} requirements={task.requirements} onPick={(text, filters) => void send(text, false, filters)} disabled={pending} compact />
                  ) : (
                    <Prose text={reply(m)} />
                  )}
                  {m.kind === "shortlist" && task.shortlist.length > 0 && (
                    <div className="space-y-2">
                      {task.shortlist.slice(0, MINI_CARDS).map((item, index) => (
                        <MiniCard key={item.id} item={item} best={index === 0} />
                      ))}
                      <Link href={fullPage} onClick={onClose} className="block text-xs font-medium underline-offset-4 hover:underline">
                        {fill(b?.seeAll ?? "See all {count} homes and every step", { count: task.shortlist.length })}
                      </Link>
                    </div>
                  )}
                  {m.kind === "shortlist" && !running && (
                    <Refine
                      message={m}
                      requirements={task.requirements}
                      onPick={(text, filters, clear) => void send(text, false, filters, clear)}
                      disabled={pending}
                      compact
                    />
                  )}
                </AgentTurn>
              );
            })}
            {pendingTurn && <AgentTurn compact steps={<Steps task={task} compact />} />}
          </ol>
        )}
      </div>

      <footer className="relative px-3 pb-[max(env(safe-area-inset-bottom),10px)] pt-1">
        {away && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label={c?.scrollDown ?? "Scroll to the latest message"}
            className="absolute -top-12 start-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border border-border/60 bg-background shadow-[0_2px_10px_rgba(0,0,0,0.12)] rtl:translate-x-1/2"
          >
            <ArrowDown className="size-4" aria-hidden />
          </button>
        )}
        {loaded && !task && !guided && (
          <div className="pb-4">
            <Suggestions onPick={(text) => void search(text)} onGuided={() => setGuided(true)} disabled={pending} compact />
          </div>
        )}
        {notice && <p className="mb-2 text-xs text-muted-foreground">{notice}</p>}
        <Composer
          size="sm"
          onSend={search}
          onPlus={() => setGuided((g) => !g)}
          plusActive={guided}
          canSendEmpty={guided && Object.keys(picks).length > 0}
          disabled={pending || running || !loaded}
          busy={running}
        />
      </footer>

      {sheet !== "never" && (
        <ChatsSheet
          open={sheet === "open" && open}
          onOpenChange={(o) => setSheet(o ? "open" : "closed")}
          activeId={task?.id ?? null}
          onOpenChat={openChat}
          onNewChat={newChat}
          onDeleted={(id) => id === task?.id && reset()}
        />
      )}
    </section>
  );
}
