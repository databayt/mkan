"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { districtName } from "@/lib/geo/rwanda-places";
import { getAgentTask, sendAgentMessage } from "./actions";
import { requirementChips } from "./chips";
import { fill } from "./format";
import type { Requirements } from "./requirements";
import type { Relaxed } from "./relax";
import type { AgentMessage, AgentTaskView } from "./types";

const POLL_MS = 800;
/** A turn is 2–3 s; past that, a slow one is checked less often. */
const FAST_POLL_FOR_MS = 4_000;
const SLOW_POLL_MS = 2_000;
/** A broker may answer hours later: 10 s, then 30 s, then once a minute. */
const WAITING_POLL_MS = [10_000, 30_000, 60_000];

/**
 * The chat this browser was last in, so the bubble on another page reopens
 * it. Per device and stale after a few days — older chats live in the ☰ list.
 */
const POINTER_KEY = "mkan:agent:active";
const POINTER_DAYS = 3;

function readPointer(): string | null {
  try {
    const p = JSON.parse(window.localStorage.getItem(POINTER_KEY) ?? "null") as { id?: string; at?: number } | null;
    return p?.id && p.at && Date.now() - p.at < POINTER_DAYS * 86_400_000 ? p.id : null;
  } catch {
    return null;
  }
}

function writePointer(id: string | null) {
  try {
    if (id) window.localStorage.setItem(POINTER_KEY, JSON.stringify({ id, at: Date.now() }));
    else window.localStorage.removeItem(POINTER_KEY);
  } catch {
    // Private mode: the bubble just opens empty.
  }
}

/** This page's URL with `?c=` set to the chat (or dropped for a new one). */
function chatUrl(id: string | null): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("c", id);
  else url.searchParams.delete("c");
  return `${url.pathname}${url.search}${url.hash}`;
}

type HistoryMode = "push" | "replace" | "none";

/**
 * Keep the previous objects where nothing changed, so memoised turns and
 * cards (compared by reference) skip the render a new poll would cause.
 */
function mergeTask(prev: AgentTaskView | null, next: AgentTaskView): AgentTaskView {
  if (!prev || prev.id !== next.id) return next;
  const messages = next.messages.map((m, i) => {
    const old = prev.messages[i];
    return old && old.role === m.role && old.at === m.at ? old : m;
  });
  const before = new Map(prev.shortlist.map((item) => [item.id, item]));
  const shortlist = next.shortlist.map((item) => {
    const old = before.get(item.id);
    return old && JSON.stringify(old) === JSON.stringify(item) ? old : item;
  });
  return { ...next, messages, shortlist };
}

/**
 * One poll over GET (`/api/agent/task`). `v` is the version held: the route
 * answers 204 when nothing moved, so an unchanged task costs no render.
 */
async function pollTask(id: string, version?: string): Promise<AgentTaskView | "same" | null> {
  const qs = new URLSearchParams({ id, ...(version ? { v: version } : {}) });
  const res = await fetch(`/api/agent/task?${qs}`, { cache: "no-store" }).catch(() => null);
  if (!res) return null;
  if (res.status === 204) return "same";
  return res.ok ? ((await res.json()) as AgentTaskView) : null;
}

/**
 * One rental-agent conversation, for /find and the bubble. A chat is addressed
 * by id: /find keeps it in the URL (`?c=`, so reload, back and forward work),
 * and both remember it as this browser's last chat, so the bubble on another
 * page picks it up. `lazy` (the bubble) loads that chat on mount instead of
 * taking one from the server — the bubble mounts on first open, so pages never
 * pay for it.
 */
export function useAgentTask(initialTask: AgentTaskView | null, { lazy = false, syncUrl = false }: { lazy?: boolean; syncUrl?: boolean } = {}) {
  const dict = useDictionary();
  const a = dict?.agent;
  const { locale } = useLocale();
  const [task, setTask] = useState<AgentTaskView | null>(initialTask);
  const [loaded, setLoaded] = useState(!lazy);
  const [notice, setNotice] = useState<string | null>(null);
  /** The chat being opened from the ☰ list or the address bar, until it arrives. */
  const [opening, setOpening] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const running = task?.status === "RUNNING";
  const waiting = task?.status === "WAITING";

  useEffect(() => {
    if (!lazy) return;
    let live = true;
    const id = readPointer();
    (id ? getAgentTask(id).catch(() => null) : Promise.resolve(null)).then((t) => {
      if (!live) return;
      if (t) setTask(t);
      else if (id) writePointer(null);
      setLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [lazy]);

  // `full` re-reads after an action of our own (a viewing pick) that moves no version.
  const taskRef = useRef(task);
  useEffect(() => {
    taskRef.current = task;
  }, [task]);
  const refresh = useCallback(async (full = true) => {
    const current = taskRef.current;
    if (!current) return;
    const next = await pollTask(current.id, full ? undefined : current.version);
    if (next && next !== "same" && taskRef.current?.id === next.id) setTask((prev) => mergeTask(prev, next));
  }, []);

  // The chat in view is the one the bubble reopens.
  useEffect(() => {
    if (task?.id) writePointer(task.id);
  }, [task?.id]);

  /** Open a chat from the ☰ list (or the address bar). False when it is gone or not this browser's. */
  const open = useCallback(
    async (id: string, history: HistoryMode = "push"): Promise<boolean> => {
      if (taskRef.current?.id === id) return true;
      setOpening(id);
      const next = await getAgentTask(id).catch(() => null);
      setOpening(null);
      if (!next) return false;
      setTask(next);
      setNotice(null);
      if (syncUrl && history !== "none") window.history[history === "push" ? "pushState" : "replaceState"](null, "", chatUrl(id));
      return true;
    },
    [syncUrl],
  );

  // Poll while the task runs or waits on a broker. The events are rows in the
  // database, so a reload resumes exactly here.
  // Every 800 ms for the first few seconds of a turn, then every 2 s; a task
  // waiting on a broker backs off to once a minute. Keyed on the task and its
  // state, not on each poll's result, so the clock keeps running across polls.
  // A hidden tab stops polling and catches up the moment it is shown again.
  const taskId = task?.id;
  useEffect(() => {
    if (!taskId || (!running && !waiting)) return;
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let live = true;
    let polls = 0;
    const tick = (wait?: number) => {
      clearTimeout(timer);
      if (document.visibilityState === "hidden") return;
      const next = waiting
        ? WAITING_POLL_MS[Math.min(polls, WAITING_POLL_MS.length - 1)]!
        : Date.now() - started < FAST_POLL_FOR_MS
          ? POLL_MS
          : SLOW_POLL_MS;
      timer = setTimeout(() => {
        polls++;
        void refresh(false).finally(() => live && tick());
      }, wait ?? next);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") tick(0);
      else clearTimeout(timer);
    };
    tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      live = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [taskId, running, waiting, refresh]);

  /** Resolves true once the message is accepted, so the composer can clear. */
  const send = useCallback(
    (message: string, fresh = false, filters?: Partial<Requirements>, clear?: string[]) =>
      new Promise<boolean>((resolve) => {
        const value = message.trim();
        if (!value) return resolve(false);
        setNotice(null);
        startTransition(async () => {
          const res = await sendAgentMessage({ text: value, lang: locale, taskId: fresh ? undefined : task?.id, fresh, filters, clear });
          if (!res.ok) {
            setNotice(res.error === "rate" ? a?.reply?.rate ?? "Please wait a few minutes." : res.error === "busy" ? a?.reply?.busy ?? "Still working." : null);
            return resolve(false);
          }
          resolve(true);
          if (res.task) setTask((prev) => mergeTask(prev, res.task!));
          // A new chat takes its address now; replace, so Back skips the empty page.
          if (syncUrl && res.taskId !== task?.id) window.history.replaceState(null, "", chatUrl(res.taskId));
        });
      }),
    [locale, task?.id, a, syncUrl],
  );

  /** A new chat: the screen empties and the address drops `?c=`; nothing is stored until the first message. */
  const reset = useCallback(
    (history: HistoryMode = "push") => {
      setTask(null);
      setNotice(null);
      writePointer(null);
      const inUrl = syncUrl && new URL(window.location.href).searchParams.has("c");
      if (inUrl && history !== "none") window.history[history === "push" ? "pushState" : "replaceState"](null, "", chatUrl(null));
    },
    [syncUrl],
  );

  // Back and forward move between chats: follow the address bar.
  useEffect(() => {
    if (!syncUrl) return;
    // A `?c=` the server could not open (another browser's chat, or deleted): drop it.
    if (!taskRef.current && new URL(window.location.href).searchParams.has("c")) window.history.replaceState(null, "", chatUrl(null));
    const onPop = () => {
      const id = new URL(window.location.href).searchParams.get("c");
      if (id === (taskRef.current?.id ?? null)) return;
      if (!id) reset("none");
      else void open(id, "none").then((ok) => !ok && window.history.replaceState(null, "", chatUrl(null)));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [syncUrl, open, reset]);

  const money = useCallback((n: number) => formatCurrency(n, locale, "RWF"), [locale]);
  /** "Nothing matched every detail, so I widened: all of Kicukiro, up to RWF 390,000." */
  const relaxedLine = useCallback(
    (steps: Relaxed[]): string => {
      const items = a?.relaxed?.items as Record<string, string> | undefined;
      const changes = steps.map((s) =>
        fill(items?.[s.key] ?? s.key, {
          place: typeof s.to === "string" ? districtName(s.to, locale) : "",
          price: typeof s.to === "number" ? money(s.to) : "",
        }),
      );
      return fill(a?.relaxed?.lead ?? "{changes}", { changes: changes.join(locale === "ar" ? "، " : ", ") });
    },
    [a, locale, money],
  );

  const anyAsked = task?.shortlist.some((s) => s.availability === "asked") ?? false;
  // Stable across polls that change nothing it reads, so memoised turns skip.
  const reply = useCallback(
    (m: Extract<AgentMessage, { role: "agent" }>): string => {
      if (m.kind === "ask") return a?.ask?.[m.field] ?? "";
      if (m.kind === "shortlist") {
        const found = fill(a?.reply?.shortlist ?? "I found {count} homes.", { count: m.count });
        const lines = [m.relaxed?.length ? relaxedLine(m.relaxed) : null, found, anyAsked ? a?.reply?.waiting : null];
        return lines.filter(Boolean).join("\n");
      }
      if (m.kind === "none") return (m.stay === "long" ? a?.reply?.noneLong : a?.reply?.none) ?? "";
      return a?.reply?.error ?? "";
    },
    [a, anyAsked, relaxedLine],
  );

  const req = task?.requirements;
  const chips = useMemo(() => requirementChips(req, a, locale, money), [req, a, locale, money]);

  /** Re-run the last tenant message as it was sent (its picks and clears too). */
  const regenerate = useCallback(() => {
    const last = task?.messages.findLast((m) => m.role === "user");
    if (!last || last.role !== "user") return Promise.resolve(false);
    return send(last.text, false, last.filters as Partial<Requirements> | undefined, last.clear);
  }, [task?.messages, send]);

  const lastAgent = [...(task?.messages ?? [])].reverse().find((m) => m.role === "agent");
  const askingStay = !running && lastAgent?.role === "agent" && lastAgent.kind === "ask" && lastAgent.field === "stay";
  const examples = [a?.examples?.long, a?.examples?.short, a?.examples?.studio].filter((x): x is string => !!x);

  return { task, loaded, running, waiting, pending, notice, send, refresh, reset, open, opening, regenerate, reply, chips, askingStay, examples, money };
}
