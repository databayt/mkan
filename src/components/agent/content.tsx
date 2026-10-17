"use client";

import { useEffect, useRef } from "react";
import { RotateCcw } from "lucide-react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { Composer } from "./composer";
import { ShortlistCard } from "./shortlist-card";
import { Steps } from "./steps";
import { AgentTurn, UserTurn } from "./turn";
import type { AgentTaskView } from "./types";
import { useAgentTask } from "./use-agent-task";

/**
 * /find — the full-screen rental agent, laid out like the assistant apps
 * (ChatGPT, Claude, Gemini): a centred greeting and composer when empty; a
 * single conversation column with the composer pinned to the bottom after.
 * The agent's work folds into a steps block on its turn; homes render inline.
 */
export function AgentContent({ initialTask }: { initialTask: AgentTaskView | null }) {
  const dict = useDictionary();
  const a = dict?.agent;
  const { task, running, pending, notice, send, refresh, reset, reply, chips, askingStay, examples } = useAgentTask(initialTask);
  const bottomRef = useRef<HTMLDivElement>(null);
  const messageCount = task?.messages.length ?? 0;

  useEffect(() => {
    if (messageCount) bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messageCount, task?.shortlist.length]);

  if (!task) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-52px)] w-full max-w-3xl flex-col items-center justify-center px-4 pb-[12vh]">
        <h1 className="text-center text-3xl font-semibold tracking-tight sm:text-4xl">
          {a?.greeting ?? "Where do you want to live in Kigali?"}
        </h1>
        <p className="mt-3 max-w-xl text-center text-muted-foreground">{a?.subtitle}</p>
        <div className="mt-8 w-full">
          <Composer onSend={(t) => send(t, true)} disabled={pending} autoFocus />
        </div>
        <ul className="mt-4 flex flex-wrap justify-center gap-2">
          {examples.map((ex) => (
            <li key={ex}>
              <button
                type="button"
                onClick={() => void send(ex, true)}
                disabled={pending}
                className="rounded-full border px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                {ex}
              </button>
            </li>
          ))}
        </ul>
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
            <AgentTurn key={i} steps={latest ? <Steps task={task} /> : null}>
              <p className="whitespace-pre-wrap">{reply(m)}</p>

              {latest && askingStay && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {[a?.stayShort ?? "Short stay", a?.stayLong ?? "Monthly rent"].map((label) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => void send(label)}
                      disabled={pending}
                      className="rounded-full border px-3.5 py-1.5 text-sm hover:bg-muted"
                    >
                      {label}
                    </button>
                  ))}
                </div>
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
