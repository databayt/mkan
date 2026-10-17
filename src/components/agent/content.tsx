"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { usePicksLabel, Wizard, type Picks } from "./wizard";
import { AskCard } from "./ask-card";
import { Composer } from "./composer";
import { Refine } from "./refine";
import { ShortlistCard } from "./shortlist-card";
import { Steps } from "./steps";
import { AgentTurn, UserTurn } from "./turn";
import type { AgentTaskView } from "./types";
import { useAgentTask } from "./use-agent-task";

const LATEST_TURN_ID = "agent-latest-turn";

/**
 * /find — the full-screen rental agent, laid out like the assistant apps
 * (ChatGPT, Claude, Gemini): a centred greeting and composer when empty; a
 * single conversation column with the composer pinned to the bottom after.
 * The agent's work folds into a steps block on its turn; homes render inline.
 */
export function AgentContent({ initialTask }: { initialTask: AgentTaskView | null }) {
  const dict = useDictionary();
  const a = dict?.agent;
  const { task, running, pending, notice, send, refresh, reset, reply, chips } = useAgentTask(initialTask);
  const [picks, setPicks] = useState<Picks>({});
  const picksLabel = usePicksLabel();
  const picked = Object.keys(picks).length > 0;
  // The composer and the wizard's last step both search with what was picked.
  const search = async (text: string) => {
    const ok = await send(text.trim() || picksLabel(picks) || "…", true, picks);
    if (ok) setPicks({});
    return ok;
  };
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCount = task?.messages.length ?? 0;

  const shortlistCount = task?.shortlist.length ?? 0;

  // A new message scrolls to the bottom; arriving homes scroll to the start of
  // the agent's reply, so it is read from its first line (as assistants do).
  useEffect(() => {
    if (messageCount) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount]);
  useEffect(() => {
    if (shortlistCount) document.getElementById(LATEST_TURN_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [shortlistCount]);

  if (!task) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-3xl flex-col items-center justify-center px-4 pb-[12vh]">
        <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          {a?.greeting ?? "Where do you want to live in Kigali?"}
        </h1>
        <p className="mt-3 max-w-xl text-center text-muted-foreground">{a?.subtitle}</p>
        <div className="mt-8 w-full space-y-3">
          <Wizard picks={picks} onChange={setPicks} onFinish={() => void search("")} disabled={pending} />
          <Composer onSend={search} disabled={pending} canSendEmpty={picked} autoFocus />
        </div>
        {notice && <p className="mt-4 text-sm text-muted-foreground">{notice}</p>}
      </div>
    );
  }

  const messages = task.messages;
  const lastAgentIndex = messages.findLastIndex((m) => m.role === "agent");
  // While a turn runs, its steps sit on a pending agent turn after the user's message.
  const pendingTurn = running && messages.at(-1)?.role === "user";

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-3xl flex-col px-4">
      <ol className="flex-1 space-y-8 py-8">
        {messages.map((m, i) => {
          if (m.role === "user") return <UserTurn key={i} text={m.text} />;
          const latest = i === lastAgentIndex && !pendingTurn;
          return (
            <AgentTurn key={i} id={latest ? LATEST_TURN_ID : undefined} steps={latest ? <Steps task={task} /> : null}>
              {latest && m.kind === "ask" && !running ? (
                <AskCard field={m.field} requirements={task.requirements} onPick={(text, filters) => void send(text, false, filters)} disabled={pending} />
              ) : (
                <p className="whitespace-pre-wrap">{reply(m)}</p>
              )}

              {latest && m.kind === "shortlist" && task.shortlist.length > 0 && (
                <div className="mt-4 space-y-3">
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
                  {/* A swipeable row on phones, a grid from sm up. */}
                  <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0">
                    {task.shortlist.map((item) => (
                      <div key={item.id} className="w-[85%] shrink-0 snap-start sm:w-auto">
                        <ShortlistCard item={item} taskId={task.id} onChange={refresh} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {latest && m.kind === "shortlist" && !running && (
                <Refine message={m} requirements={task.requirements} onPick={(text, filters, clear) => void send(text, false, filters, clear)} disabled={pending} />
              )}

              {latest && !running && (
                <div className="mt-3 flex gap-1">
                  <button
                    type="button"
                    onClick={reset}
                    className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <RotateCcw className="size-3.5" aria-hidden />
                    {a?.newSearch ?? "New search"}
                  </button>
                </div>
              )}
            </AgentTurn>
          );
        })}
        {pendingTurn && <AgentTurn steps={<Steps task={task} />} />}
      </ol>
      <div ref={bottomRef} />

      <div className="sticky bottom-0 bg-gradient-to-t from-background from-70% to-transparent pb-3 pt-6">
        {notice && <p className="mb-2 text-center text-sm text-muted-foreground">{notice}</p>}
        <Composer onSend={(t) => send(t)} disabled={pending || running} />
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {a?.disclaimer ?? "Mkan checks with brokers, but always see a home before you pay."}
        </p>
      </div>
    </div>
  );
}
