"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { ArrowUp, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { districtName } from "@/lib/geo/rwanda-places";
import { getAgentTask, sendAgentMessage } from "./actions";
import { ExecutionPanel } from "./execution-panel";
import { fill } from "./format";
import { ShortlistCard } from "./shortlist-card";
import type { AgentMessage, AgentTaskView } from "./types";

const POLL_MS = 800;
/** A broker may answer hours later; a waiting task is checked gently. */
const WAITING_POLL_MS = 10_000;

export function AgentContent({ initialTask }: { initialTask: AgentTaskView | null }) {
  const dict = useDictionary();
  const a = dict?.agent;
  const { locale } = useLocale();
  const [task, setTask] = useState<AgentTaskView | null>(initialTask);
  const [text, setText] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);

  const running = task?.status === "RUNNING";
  const waiting = task?.status === "WAITING";

  const refresh = useCallback(async () => {
    if (!task) return;
    const next = await getAgentTask(task.id).catch(() => null);
    if (next) setTask(next);
  }, [task]);

  // Poll while the task runs or waits on a broker. The events are rows in the
  // database, so a reload resumes exactly here.
  useEffect(() => {
    if (!task || (!running && !waiting)) return;
    const id = setInterval(refresh, running ? POLL_MS : WAITING_POLL_MS);
    return () => clearInterval(id);
  }, [task, running, waiting, refresh]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [task?.messages.length]);

  const send = useCallback(
    (message: string, fresh = false) => {
      const value = message.trim();
      if (!value) return;
      setNotice(null);
      startTransition(async () => {
        const res = await sendAgentMessage({ text: value, lang: locale, taskId: fresh ? undefined : task?.id, fresh });
        if (!res.ok) {
          setNotice(res.error === "rate" ? a?.reply?.rate ?? "Please wait a few minutes." : res.error === "busy" ? a?.reply?.busy ?? "Still working." : null);
          return;
        }
        setText("");
        const next = await getAgentTask(res.taskId);
        if (next) setTask(next);
      });
    },
    [locale, task?.id, a],
  );

  const reply = (m: Extract<AgentMessage, { role: "agent" }>): string => {
    if (m.kind === "ask") return a?.ask?.[m.field] ?? "";
    if (m.kind === "shortlist") {
      const found = fill(a?.reply?.shortlist ?? "I found {count} homes.", { count: m.count });
      const asked = task?.shortlist.some((s) => s.availability === "asked");
      return asked ? `${found}\n${a?.reply?.waiting ?? ""}` : found;
    }
    if (m.kind === "none") return (m.stay === "long" ? a?.reply?.noneLong : a?.reply?.none) ?? "";
    return a?.reply?.error ?? "";
  };

  const req = task?.requirements;
  const money = (n: number) => formatCurrency(n, locale, "RWF");
  const chips = req
    ? [
        req.stay === "short" ? a?.req?.short : req.stay === "long" ? a?.req?.long : null,
        req.district ? districtName(req.district, locale) : null,
        req.bedrooms === 0 ? a?.req?.studio : req.bedrooms != null ? fill(a?.req?.beds ?? "{n} bedrooms", { n: req.bedrooms }) : null,
        req.furnished === true ? a?.req?.furnished : req.furnished === false ? a?.req?.unfurnished : null,
        req.maxPrice
          ? fill((req.pricePeriod === "night" ? a?.req?.maxNight : a?.req?.maxMonth) ?? "{price}", { price: money(req.maxPrice) })
          : null,
        req.nights ? fill(a?.req?.nights ?? "{n} nights", { n: req.nights }) : null,
        req.guests ? fill(a?.req?.guests ?? "{n} guests", { n: req.guests }) : null,
        req.maxUpfront ? fill(a?.req?.upfront ?? "{price}", { price: money(req.maxUpfront) }) : null,
      ].filter((x): x is string => !!x)
    : [];

  const lastAgent = [...(task?.messages ?? [])].reverse().find((m) => m.role === "agent");
  const askingStay = !running && lastAgent?.role === "agent" && lastAgent.kind === "ask" && lastAgent.field === "stay";
  const examples = [a?.examples?.long, a?.examples?.short, a?.examples?.studio].filter((x): x is string => !!x);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-10">
      <header className="max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">{a?.title ?? "Find a home in Kigali"}</h1>
        <p className="mt-2 text-muted-foreground">{a?.subtitle}</p>
      </header>

      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <section className="rounded-xl border p-4">
            <ol className="space-y-4">
              {(task?.messages ?? []).map((m, i) => (
                <li key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      m.role === "user"
                        ? "max-w-[85%] rounded-2xl bg-foreground px-4 py-2 text-background"
                        : "max-w-[85%] rounded-2xl bg-muted px-4 py-2"
                    }
                  >
                    <p className="text-xs opacity-70">{m.role === "user" ? a?.you ?? "You" : a?.agent ?? "Mkan agent"}</p>
                    <p className="whitespace-pre-wrap">{m.role === "user" ? m.text : reply(m)}</p>
                  </div>
                </li>
              ))}
            </ol>

            {!task && (
              <ul className="flex flex-wrap gap-2">
                {examples.map((ex) => (
                  <li key={ex}>
                    <button
                      type="button"
                      onClick={() => send(ex, true)}
                      className="rounded-full border px-3 py-1.5 text-start text-sm hover:bg-muted"
                    >
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {askingStay && (
              <div className="mt-3 flex gap-2">
                <Button variant="outline" size="sm" onClick={() => send(a?.stayShort ?? "Short stay")}>
                  {a?.stayShort ?? "Short stay"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => send(a?.stayLong ?? "Monthly rent")}>
                  {a?.stayLong ?? "Monthly rent"}
                </Button>
              </div>
            )}

            {chips.length > 0 && (
              <ul className="mt-4 flex flex-wrap gap-1.5 border-t pt-3">
                {chips.map((chip) => (
                  <li key={chip} className="rounded-full bg-muted px-2.5 py-1 text-xs">
                    {chip}
                  </li>
                ))}
              </ul>
            )}

            <div ref={bottomRef} />

            <form
              className="mt-4 flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send(text);
              }}
            >
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(text);
                  }
                }}
                placeholder={a?.placeholder ?? "Describe the home you need"}
                rows={2}
                maxLength={600}
                className="min-h-[52px] resize-none"
                disabled={pending || running}
              />
              <Button type="submit" size="icon" aria-label={a?.send ?? "Send"} disabled={pending || running || !text.trim()}>
                <ArrowUp className="size-4" />
              </Button>
              {task && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={a?.newSearch ?? "New search"}
                  title={a?.newSearch ?? "New search"}
                  onClick={() => setTask(null)}
                  disabled={pending || running}
                >
                  <RotateCcw className="size-4" />
                </Button>
              )}
            </form>
            {notice && <p className="mt-2 text-sm text-muted-foreground">{notice}</p>}
          </section>

          {(task?.shortlist.length ?? 0) > 0 && (
            <section className="grid gap-4 sm:grid-cols-2">
              {task!.shortlist.map((item) => (
                <ShortlistCard key={item.id} item={item} taskId={task!.id} onChange={refresh} />
              ))}
            </section>
          )}
        </div>

        <div className="order-first lg:order-none">
          <ExecutionPanel task={task} />
        </div>
      </div>
    </div>
  );
}
