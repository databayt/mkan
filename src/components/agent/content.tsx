"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown, Loader2, Menu, SquarePen } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";
import { usePicksLabel, Wizard, type Picks } from "./wizard";
import { AskCard } from "./ask-card";
import { Composer } from "./composer";
import { ChatHeader, headerButton } from "./header";
import { Refine } from "./refine";
import { ShortlistCard } from "./shortlist-card";
import { Steps } from "./steps";
import { Suggestions } from "./suggestions";
import { AgentTurn, PastAgentTurn, TurnActions, UserTurn } from "./turn";
import type { AgentTaskView } from "./types";
import { useAgentTask } from "./use-agent-task";
import { useStickToBottom } from "./use-stick-to-bottom";

// The ☰ sheet loads on its first open; a tenant who never opens it never pays for it.
const ChatsSheet = dynamic(() => import("./chats-sheet").then((m) => m.ChatsSheet), { ssr: false });

/**
 * /find — the rental agent laid out like ChatGPT on iOS: a slim bar with the
 * name in the middle, the greeting alone mid-screen when empty with starter
 * cards above a pill composer pinned to the bottom, then a single column of
 * grey user bubbles and plain agent text. Homes render inline as a swipeable
 * card row; the agent's work folds into one line on its turn.
 */
export function AgentContent({ initialTask }: { initialTask: AgentTaskView | null }) {
  const dict = useDictionary();
  const a = dict?.agent;
  const c = a?.chat;
  const { task, running, pending, notice, send, refresh, reset, open, opening, regenerate, reply, chips } = useAgentTask(initialTask, { syncUrl: true });
  const [sheet, setSheet] = useState<"closed" | "open" | "never">("never");
  const [picks, setPicks] = useState<Picks>({});
  const [guided, setGuided] = useState(false);
  const picksLabel = usePicksLabel();
  const picked = Object.keys(picks).length > 0;

  const messages = task?.messages ?? [];
  const growth = `${messages.length}.${task?.shortlist.length ?? 0}.${running}`;
  const { ref: scrollRef, onScroll, away, scrolled, scrollToBottom } = useStickToBottom(growth);

  // Sending always brings the conversation back to its end, as ChatGPT does.
  const say = useCallback(
    async (text: string, fresh = false, filters?: Picks, clear?: string[]) => {
      const ok = await send(text, fresh, filters, clear);
      if (ok) requestAnimationFrame(() => scrollToBottom());
      return ok;
    },
    [send, scrollToBottom],
  );
  // The guided search and a composer under it start a new search with the picks.
  const search = async (text: string) => {
    const ok = await say(text.trim() || picksLabel(picks) || "…", true, picks);
    if (ok) {
      setPicks({});
      setGuided(false);
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
    void open(id).then((ok) => ok && requestAnimationFrame(() => scrollToBottom()));
  };

  const lastAgentIndex = messages.findLastIndex((m) => m.role === "agent");
  // While a turn runs, its steps sit on a pending agent turn after the user's message.
  const pendingTurn = running && messages.at(-1)?.role === "user";

  return (
    <div className="flex h-dvh flex-col bg-background">
      <ChatHeader
        title={c?.name ?? "Mkan"}
        scrolled={scrolled}
        start={
          <button type="button" onClick={() => setSheet("open")} aria-label={a?.chats?.menu ?? "Chats"} title={a?.chats?.menu ?? "Chats"} className={headerButton}>
            <Menu aria-hidden />
          </button>
        }
        end={
          <button type="button" onClick={newChat} disabled={!task || running} aria-label={c?.newChat ?? "New chat"} title={c?.newChat ?? "New chat"} className={headerButton}>
            <SquarePen aria-hidden />
          </button>
        }
      />

      <div
        ref={scrollRef}
        onScroll={onScroll}
        aria-busy={!!opening}
        className={cn("relative flex-1 overflow-y-auto overscroll-contain transition-opacity", opening && task && "opacity-40")}
      >
        {!task && opening ? (
          <Loader2 className="mx-auto mt-[30vh] size-5 animate-spin text-muted-foreground" aria-hidden />
        ) : !task ? (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-6">
            {guided ? (
              <Wizard picks={picks} onChange={setPicks} onFinish={() => void search("")} disabled={pending} />
            ) : (
              <h1 className="text-balance text-center text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl">
                {a?.greeting ?? "Where do you want to live in Kigali?"}
              </h1>
            )}
          </div>
        ) : (
          <ol className="mx-auto w-full max-w-3xl list-none space-y-7 px-4 pb-6 pt-4">
            {messages.map((m, i) => {
              if (m.role === "user") return <UserTurn key={`${i}.${m.at}`} text={m.text} />;
              const latest = i === lastAgentIndex && !pendingTurn;
              if (!latest) return <PastAgentTurn key={`${i}.${m.at}`} text={reply(m)} />;
              return (
                <AgentTurn key={`${i}.${m.at}`} steps={<Steps task={task} />}>
                  {m.kind === "ask" && !running ? (
                    <AskCard field={m.field} requirements={task.requirements} onPick={(text, filters) => void say(text, false, filters)} disabled={pending} />
                  ) : (
                    <p className="whitespace-pre-wrap leading-[inherit] text-foreground">{reply(m)}</p>
                  )}

                  {m.kind === "shortlist" && task.shortlist.length > 0 && (
                    <div className="space-y-3 pt-1">
                      {chips.length > 0 && (
                        <ul className="flex flex-wrap items-center gap-1.5 text-xs">
                          <li className="text-muted-foreground">{a?.lookingFor ?? "Looking for"}</li>
                          {chips.map((chip) => (
                            <li key={chip} className="rounded-full bg-muted px-2.5 py-1">
                              {chip}
                            </li>
                          ))}
                        </ul>
                      )}
                      {/* ChatGPT's inline product row: swipe sideways at every width. */}
                      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {task.shortlist.map((item) => (
                          <li key={item.id} className="w-[78%] max-w-[300px] shrink-0 snap-start">
                            <ShortlistCard item={item} taskId={task.id} onChange={refresh} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {m.kind === "shortlist" && !running && (
                    <Refine message={m} requirements={task.requirements} onPick={(text, filters, clear) => void say(text, false, filters, clear)} disabled={pending} />
                  )}

                  {!running && (
                    <TurnActions text={reply(m)} onRegenerate={() => void regenerate().then((ok) => ok && scrollToBottom())} disabled={pending} taskId={task.id} at={m.at} />
                  )}
                </AgentTurn>
              );
            })}
            {pendingTurn && <AgentTurn steps={<Steps task={task} />} />}
            {task && guided && (
              <li>
                <Wizard picks={picks} onChange={setPicks} onFinish={() => void search("")} disabled={pending} />
              </li>
            )}
          </ol>
        )}
      </div>

      <div className="relative mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),10px)] sm:px-4">
        {away && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label={c?.scrollDown ?? "Scroll to the latest message"}
            className="absolute -top-12 start-1/2 flex size-9 -translate-x-1/2 items-center justify-center rounded-full border bg-background shadow-md rtl:translate-x-1/2"
          >
            <ArrowDown className="size-4" aria-hidden />
          </button>
        )}
        {!task && !guided && (
          <div className="pb-3">
            <Suggestions onPick={(text) => void say(text, true)} onGuided={() => setGuided(true)} disabled={pending} />
          </div>
        )}
        {notice && <p className="mb-2 text-center text-sm text-muted-foreground">{notice}</p>}
        <Composer
          onSend={guided || !task ? search : (t) => say(t)}
          onPlus={() => setGuided((g) => !g)}
          plusActive={guided}
          disabled={pending || running}
          canSendEmpty={guided && picked}
          autoFocus={!task}
        />
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {a?.disclaimer ?? "Mkan checks with brokers, but always see a home before you pay."}
        </p>
      </div>

      {sheet !== "never" && (
        <ChatsSheet
          open={sheet === "open"}
          onOpenChange={(o) => setSheet(o ? "open" : "closed")}
          activeId={task?.id ?? null}
          onOpenChat={openChat}
          onNewChat={newChat}
          onDeleted={(id) => id === task?.id && reset("replace")}
        />
      )}
    </div>
  );
}
