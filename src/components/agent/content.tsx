"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { ArrowDown, Loader2, MessageCircle, MoreHorizontal, SlidersHorizontal, SquarePen, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { cn } from "@/lib/utils";
import { Wizard, type Picks } from "./wizard";
import { ActivityRows, QuestionsRow, StatusLine, WaitingRow } from "./activity";
import { deleteAgentChat } from "./actions";
import { AskCard } from "./ask-card";
import { ClarifyCard } from "./clarify-card";
import { Composer } from "./composer";
import { DemandCard } from "./demand-card";
import { noteHomeFeedback } from "./feedback-actions";
import { roundPrice } from "./fields";
import { ChatHeader, headerButton, MenuGlyph } from "./header";
import { Refine, Retry, ShowMonthly, ToWhatsApp } from "./refine";
import { focusComposer, useQuestionContext } from "./question-card";
import { describeAnswers } from "./questions";
import { ShortlistCard, type NotForMe } from "./shortlist-card";
import { Suggestions } from "./suggestions";
import { AgentTurn, AnsweredTurn, PastAgentTurn, Prose, TurnActions, UserTurn } from "./turn";
import { handsToWhatsApp, homesTurn, type AgentTaskView, type QuestionAnswer } from "./types";
import { useAgentTask } from "./use-agent-task";
import { continueOnWhatsApp } from "./wa-link";
import { useStickToBottom } from "./use-stick-to-bottom";
import { Welcome } from "./welcome";

// The ☰ sheet loads on its first open; a tenant who never opens it never pays for it.
const ChatsSheet = dynamic(() => import("./chats-sheet").then((m) => m.ChatsSheet), { ssr: false });

/**
 * /find — the rental agent in ChatGPT's iOS shell (a slim bar, the greeting
 * mid-screen with starter cards above a pill composer pinned to the bottom) with
 * the Claude iOS app's way of showing its work (2026-11-07): Claude's user
 * bubbles and plain agent text, the finished steps of a turn folded into one row
 * with the step running now beside it, an orange line while it works, and its
 * questions on one card docked in the composer's place. Homes render inline as a
 * swipeable card row.
 */
export function AgentContent({ initialTask }: { initialTask: AgentTaskView | null }) {
  const dict = useDictionary();
  const a = dict?.agent;
  const c = a?.chat;
  const { task, running, pending, notice, lostText, send, refresh, reset, open, opening, regenerate, reply, chips } = useAgentTask(initialTask, { syncUrl: true });
  const [sheet, setSheet] = useState<"closed" | "open" | "never">("never");
  const [guided, setGuided] = useState(false);
  const [returning, setReturning] = useState(false);
  /** Answers picked on a clarify card: a message typed instead goes out with them. */
  const [draft, setDraft] = useState<Picks>({});
  /** The clarify card closed with × (its message's time): a row in the chat opens it again. */
  const [dismissed, setDismissed] = useState<string | null>(null);
  const questionContext = useQuestionContext();

  const messages = task?.messages ?? [];
  const growth = `${messages.length}.${task?.shortlist.length ?? 0}.${running}`;
  const { ref: scrollRef, onScroll, away, scrolled, scrollToBottom } = useStickToBottom(growth);

  // Sending always brings the conversation back to its end, as ChatGPT does.
  const say = useCallback(
    async (text: string, fresh = false, filters?: Picks, clear?: string[], answers?: QuestionAnswer[]) => {
      const ok = await send(text, fresh, filters, clear, answers);
      if (ok) {
        setDraft({});
        requestAnimationFrame(() => scrollToBottom());
      }
      return ok;
    },
    [send, scrollToBottom],
  );
  // The guided search's "Show homes" starts a new search with exactly what was picked.
  const search = async (text: string, filters?: Picks, answers?: QuestionAnswer[]) => {
    const ok = await say(text, true, filters, undefined, answers);
    if (ok) setGuided(false);
    return ok;
  };
  // A question card closed with ×: the composer is back, ready to type.
  const closeCard = (close: () => void) => {
    close();
    requestAnimationFrame(focusComposer);
  };
  const newChat = () => {
    reset();
    setGuided(false);
    setSheet((v) => (v === "never" ? v : "closed"));
  };
  // "Not for me": the home is passed on (never shown again), then one tap moves the search.
  // Stable across polls, so the memoised cards do not re-render on every change to the task.
  const taskId = task?.id;
  const stay = task?.requirements?.stay;
  const notForMe: NotForMe = useCallback(async (item, reason) => {
    // Not while a turn is running: its write would overwrite the change (2026-11-06).
    if (running) return;
    const period = item.cost.period === "month" ? "month" : "night";
    if (reason === "like") {
      // Same district and size, priced around this home: the tenant points instead of describing.
      const like: Picks = {
        ...(item.district ? { district: item.district as Picks["district"] } : {}),
        ...(item.bedrooms != null ? { bedrooms: item.bedrooms } : {}),
        maxPrice: roundPrice(item.cost.headline * 1.15, period),
        pricePeriod: period,
        stay: period === "month" ? "long" : "short",
      };
      void say(a?.card?.moreLike ?? "More like this", false, like);
      return;
    }
    await noteHomeFeedback({ taskId: taskId ?? "", listingId: item.id, kind: "dismiss", reason }).catch(() => {});
    const label = (a?.card?.notReasons as Record<string, string> | undefined)?.[reason] ?? reason;
    const filters: Picks =
      reason === "expensive"
        ? // Similar but cheaper: the ranker centres on 85% of the new ceiling — "cheapest" would jump to the floor.
          { maxPrice: roundPrice(item.cost.headline * 0.85, period), pricePeriod: period }
        : reason === "small"
          ? { bedrooms: Math.min(10, (item.bedrooms ?? 1) + 1) }
          : { stay: stay ?? "long" };
    void say(label, false, filters);
  }, [taskId, stay, a, say, running]);
  // ⋯ in the bar: delete the chat on screen, after the browser's own confirm.
  const deleteChat = async () => {
    if (!task || !window.confirm(a?.chats?.deleteConfirm ?? "Delete this chat?")) return;
    const res = await deleteAgentChat(task.id).catch(() => ({ ok: false }));
    if (res.ok) reset("replace");
  };
  const openChat = (id: string) => {
    setSheet("closed");
    setGuided(false);
    void open(id).then((ok) => ok && requestAnimationFrame(() => scrollToBottom()));
  };

  const lastAgentIndex = messages.findLastIndex((m) => m.role === "agent");
  const homesIndex = homesTurn(messages);
  const homesMessage = messages[homesIndex];
  // While a turn runs, its steps sit on a pending agent turn after the user's message.
  const pendingTurn = running && messages.at(-1)?.role === "user";
  // The question card docks in the composer's place: the guided search, or the agent's clarify until closed.
  const lastAgent = messages[lastAgentIndex];
  const clarify = !running && lastAgentIndex === messages.length - 1 && lastAgent?.role === "agent" && lastAgent.kind === "clarify" ? lastAgent : null;
  const dock: "guided" | "clarify" | null = guided ? "guided" : clarify && dismissed !== clarify.at ? "clarify" : null;

  return (
    <div className="flex h-dvh flex-col overflow-x-clip bg-background">
      <ChatHeader
        title={c?.name ?? "Mkan"}
        scrolled={scrolled}
        start={
          <button type="button" onClick={() => setSheet("open")} aria-label={a?.chats?.menu ?? "Chats"} title={a?.chats?.menu ?? "Chats"} className={headerButton}>
            <MenuGlyph />
          </button>
        }
        end={
          <>
            <button type="button" onClick={newChat} disabled={!task || running} aria-label={c?.newChat ?? "New chat"} title={c?.newChat ?? "New chat"} className={headerButton}>
              <SquarePen aria-hidden />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className={headerButton} aria-label={c?.moreActions ?? "More"} title={c?.moreActions ?? "More"}>
                <MoreHorizontal aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52 rounded-2xl p-1.5">
                <DropdownMenuItem onSelect={() => setGuided((g) => !g)} className="gap-2.5 rounded-xl px-3 py-2.5 text-[15px]">
                  <SlidersHorizontal className="size-4" aria-hidden />
                  {c?.guided ?? "Guided search"}
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="gap-2.5 rounded-xl px-3 py-2.5 text-[15px]">
                  <a href={continueOnWhatsApp(task?.id, c?.whatsappText ?? "Continue my Mkan search")} target="_blank" rel="noopener noreferrer">
                    <MessageCircle className="size-4" aria-hidden />
                    {c?.whatsapp ?? "Continue on WhatsApp"}
                  </a>
                </DropdownMenuItem>
                {task && (
                  <DropdownMenuItem disabled={running} onSelect={() => void deleteChat()} className="gap-2.5 rounded-xl px-3 py-2.5 text-[15px] text-destructive focus:text-destructive">
                    <Trash2 className="size-4 text-current" aria-hidden />
                    {c?.deleteChat ?? "Delete chat"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        aria-busy={!!opening}
        className={cn("relative flex-1 overflow-y-auto overflow-x-hidden overscroll-contain transition-opacity", opening && task && "opacity-40")}
      >
        {!task && opening ? (
          <Loader2 className="mx-auto mt-[30vh] size-5 animate-spin text-muted-foreground" aria-hidden />
        ) : !task ? (
          <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col items-center justify-center px-4 py-6">
            <Welcome onContinue={(text, filters) => void say(text, true, filters)} onReady={setReturning} disabled={pending} />
            {!returning && (
              <h1 className="text-balance text-center text-[26px] font-semibold leading-tight tracking-tight sm:text-3xl">
                {a?.greeting ?? "Where do you want to live in Kigali?"}
              </h1>
            )}
          </div>
        ) : (
          <ol className="mx-auto w-full max-w-3xl list-none space-y-7 px-4 pb-6 pt-4">
            {messages.map((m, i) => {
              if (m.role === "user") {
                // Sent from the question card: drawn as that card, its questions and the answers.
                const answered = m.answers?.length ? describeAnswers(m.answers, questionContext) : [];
                return answered.length ? <AnsweredTurn key={`${i}.${m.at}`} items={answered} /> : <UserTurn key={`${i}.${m.at}`} text={m.text} />;
              }
              const latest = i === lastAgentIndex && !pendingTurn;
              const homes = i === homesIndex && m.kind === "shortlist" && task.shortlist.length > 0;
              if (!latest && !homes) return <PastAgentTurn key={`${i}.${m.at}`} text={reply(m)} />;
              return (
                <AgentTurn key={`${i}.${m.at}`} steps={latest ? <ActivityRows task={task} chips={chips} /> : undefined}>
                  {m.kind === "ask" && !running ? (
                    <AskCard field={m.field} requirements={task.requirements} onPick={(text, filters) => void say(text, false, filters)} disabled={pending} />
                  ) : m.kind === "clarify" && !running ? (
                    <>
                      <Prose text={reply(m)} />
                      {/* The card docks below; closed with ×, one row here opens it again. */}
                      {!dock && <QuestionsRow count={m.fields.length} onOpen={() => setDismissed(null)} disabled={pending} />}
                    </>
                  ) : latest && m.kind === "shortlist" && m.pendingText && !m.text && running ? (
                    // Claude is writing the reply; the cards are already up below.
                    <span aria-hidden className="block h-5 w-3/4 animate-pulse rounded bg-muted" />
                  ) : (
                    <Prose text={reply(m)} />
                  )}

                  {homes && (
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
                      <ul className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-3 pt-1 no-scrollbar">
                        {task.shortlist.map((item, index) => (
                          <li key={item.id} className="w-[58%] max-w-[220px] shrink-0 snap-start">
                            <ShortlistCard item={item} taskId={task.id} onChange={refresh} best={index === 0} onNotForMe={notForMe} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {latest && !running && (
                    <>
                      {m.kind === "shortlist" && (
                        <Refine message={m} requirements={task.requirements} onPick={(text, filters, clear) => void say(text, false, filters, clear)} disabled={pending} />
                      )}
                      {/* A line under the homes: its next step on WhatsApp, or the same one-tap changes as under the homes. */}
                      {m.kind === "followUp" &&
                        (handsToWhatsApp(m.say) ? (
                          <ToWhatsApp taskId={task.id} listingId={m.listingId} />
                        ) : (
                          homesMessage?.role === "agent" &&
                          homesMessage.kind === "shortlist" && (
                            <Refine message={homesMessage} requirements={task.requirements} onPick={(text, filters, clear) => void say(text, false, filters, clear)} disabled={pending} />
                          )
                        ))}

                      {m.kind === "error" && <Retry onRetry={() => void regenerate().then((ok) => ok && scrollToBottom())} disabled={pending} />}
                      {m.kind === "monthlyOnly" && <ShowMonthly onPick={(text, filters, clear) => void say(text, false, filters, clear)} disabled={pending} />}

                      {(m.kind === "none" || m.kind === "shortlist") && m.demand && task.demand && (
                        <DemandCard taskId={task.id} optedIn={task.demand.optedIn} onDone={refresh} />
                      )}

                      {task.status === "WAITING" && <WaitingRow count={task.shortlist.filter((s) => s.availability === "asked").length} />}

                      <TurnActions text={reply(m)} onRegenerate={() => void regenerate().then((ok) => ok && scrollToBottom())} disabled={pending} taskId={task.id} at={m.at} />
                    </>
                  )}
                  {/* The cards are up and the turn runs on (the writer, broker asks): the orange line stays. */}
                  {latest && running && <StatusLine task={task} />}
                </AgentTurn>
              );
            })}
            {pendingTurn && (
              <AgentTurn steps={<ActivityRows task={task} chips={chips} />}>
                <StatusLine task={task} />
              </AgentTurn>
            )}
          </ol>
        )}
      </div>
        {/* A docked question veils the chat, as Claude's card does; the chat still scrolls under it. */}
        {dock && <div aria-hidden className="pointer-events-none absolute inset-0 bg-background/75 animate-in fade-in duration-300 motion-reduce:animate-none" />}
      </div>

      <div className="relative mx-auto w-full max-w-3xl px-3 pb-[max(env(safe-area-inset-bottom),10px)] sm:px-4">
        {away && (
          <button
            type="button"
            onClick={() => scrollToBottom()}
            aria-label={c?.scrollDown ?? "Scroll to the latest message"}
            className="absolute -top-14 start-1/2 flex size-10 -translate-x-1/2 items-center justify-center rounded-full border border-border/60 bg-background shadow-[0_2px_10px_rgba(0,0,0,0.12)] rtl:translate-x-1/2"
          >
            <ArrowDown className="size-5" aria-hidden />
          </button>
        )}
        {notice && <p className="mb-2 text-center text-sm text-muted-foreground">{notice}</p>}
        {dock === "guided" ? (
          <div className="pb-2">
            <Wizard onSubmit={(text, filters, answers) => void search(text, filters, answers)} onClose={() => closeCard(() => setGuided(false))} disabled={pending} />
          </div>
        ) : dock === "clarify" && clarify ? (
          <div className="pb-2">
            <ClarifyCard
              key={clarify.at}
              fields={clarify.fields}
              onSubmit={(text, filters, answers) => void say(text, false, filters, undefined, answers)}
              onDraft={setDraft}
              onClose={() => closeCard(() => setDismissed(clarify.at))}
              disabled={pending}
            />
          </div>
        ) : (
          <>
            {!task && (
              <div className="pb-5">
                <Suggestions onPick={(text) => void say(text, true)} onGuided={() => setGuided(true)} disabled={pending} />
              </div>
            )}
            <Composer
              onSend={!task ? (t) => say(t, true) : (t) => say(t, false, Object.keys(draft).length ? draft : undefined)}
              onPlus={() => setGuided(true)}
              disabled={pending || running}
              busy={running}
              autoFocus={!task}
              restore={lostText}
            />
            {/* ChatGPT's conversation has no footer line; the safety note shows before the first message. */}
            {!task ? (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">{a?.disclaimer ?? "Mkan checks with brokers, but always see a home before you pay."}</p>
            ) : (
              <div className="h-2" aria-hidden />
            )}
          </>
        )}
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
