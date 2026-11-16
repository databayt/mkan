"use client";

import { useState, useTransition } from "react";

import type { Locale } from "@/components/internationalization/config";
import { Button } from "@/components/ui/button";
import { markProfileOurs, markThisBrowserTeam } from "@/lib/actions/monetize-actions";
import { formatDate } from "@/lib/i18n/formatters";
import type { InboundPerson } from "@/lib/monetize/inbound-pure";
import { cn } from "@/lib/utils";

import type { MonetizeLabels } from "./format";
import { INK, LINE, MUTED } from "./listing-ui";

/**
 * The people behind the inbound number, for the admin (2026-11-16): the last 30 days' new people with
 * their first words, and an "Ours" tap each — launch week was mostly the team testing from anonymous
 * browsers, and a number decided on has to be clean. Plus one button that marks this browser as the team's.
 */
export function InboundPeople({ people, L, stage, locale }: { people: InboundPerson[]; L: MonetizeLabels["inbound"]; stage: Record<string, string>; locale: Locale }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState<Set<string>>(new Set());
  const [browser, setBrowser] = useState(false);
  const P = L.people;
  const mark = (id: string) =>
    start(async () => {
      await markProfileOurs(id);
      setDone((d) => new Set(d).add(id));
    });
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className={cn("text-sm font-semibold", INK)}>{P.title}</h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending || browser}
          onClick={() =>
            start(async () => {
              await markThisBrowserTeam();
              setBrowser(true);
            })
          }
        >
          {browser ? P.browserDone : P.browser}
        </Button>
      </div>
      <p className={cn("mt-1 text-xs", MUTED)}>{P.note}</p>
      {people.length === 0 ? (
        <p className={cn("mt-3 text-sm", MUTED)}>{P.empty}</p>
      ) : (
        <ul className={cn("mx-0 mb-0 mt-3 flex list-none flex-col divide-y rounded-xl border [&>li]:mt-0", LINE, "divide-[#DDDDDD] dark:divide-border")}>
          {people.map((p) => (
            <li key={p.profileId + p.taskId} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className={cn("text-xs tabular-nums", MUTED)}>
                  {formatDate(new Date(`${p.day}T12:00:00Z`), locale, { year: undefined, month: "short", day: "numeric" })} · {p.channel === "web" ? L.web : L.wa} · {p.source}
                  {p.movedToWa ? ` · ${P.moved}` : ""} · {stage[p.stage] ?? p.stage}
                </p>
                <p dir="auto" className={cn("truncate text-sm", INK)}>
                  {p.firstWords || P.noWords}
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={pending || done.has(p.profileId)} onClick={() => mark(p.profileId)}>
                {done.has(p.profileId) ? P.oursDone : P.ours}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
