"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { districtName } from "@/lib/geo/rwanda-places";
import { getAgentTask, sendAgentMessage } from "./actions";
import { fill } from "./format";
import type { AgentMessage, AgentTaskView } from "./types";

const POLL_MS = 800;
/** A broker may answer hours later; a waiting task is checked gently. */
const WAITING_POLL_MS = 10_000;

/**
 * One rental-agent conversation, shared by /find and the bubble. Both read the
 * same `mkan_agent` cookie, so they show the same task. `lazy` skips the
 * server-provided task and loads the browser's latest one on mount — the
 * bubble mounts on first open, so pages never pay for it.
 */
export function useAgentTask(initialTask: AgentTaskView | null, { lazy = false }: { lazy?: boolean } = {}) {
  const dict = useDictionary();
  const a = dict?.agent;
  const { locale } = useLocale();
  const [task, setTask] = useState<AgentTaskView | null>(initialTask);
  const [loaded, setLoaded] = useState(!lazy);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const running = task?.status === "RUNNING";
  const waiting = task?.status === "WAITING";

  useEffect(() => {
    if (!lazy) return;
    let live = true;
    getAgentTask()
      .catch(() => null)
      .then((t) => {
        if (!live) return;
        if (t) setTask(t);
        setLoaded(true);
      });
    return () => {
      live = false;
    };
  }, [lazy]);

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

  /** Resolves true once the message is accepted, so the composer can clear. */
  const send = useCallback(
    (message: string, fresh = false) =>
      new Promise<boolean>((resolve) => {
        const value = message.trim();
        if (!value) return resolve(false);
        setNotice(null);
        startTransition(async () => {
          const res = await sendAgentMessage({ text: value, lang: locale, taskId: fresh ? undefined : task?.id, fresh });
          if (!res.ok) {
            setNotice(res.error === "rate" ? a?.reply?.rate ?? "Please wait a few minutes." : res.error === "busy" ? a?.reply?.busy ?? "Still working." : null);
            return resolve(false);
          }
          resolve(true);
          const next = await getAgentTask(res.taskId);
          if (next) setTask(next);
        });
      }),
    [locale, task?.id, a],
  );

  const reset = useCallback(() => {
    setTask(null);
    setNotice(null);
  }, []);

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

  return { task, loaded, running, waiting, pending, notice, send, refresh, reset, reply, chips, askingStay, examples };
}
