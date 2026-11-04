import type { Locale } from "@/components/internationalization/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addRevenueEntry, saveExperiment } from "@/lib/actions/monetize-actions";
import { formatDate, formatNumber } from "@/lib/i18n/formatters";
import type { ExperimentView } from "@/lib/monetize/load";
import { REVENUE_LINES } from "@/lib/monetize/money";
import { BLOCKS } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import type { MonetizeLabels } from "./format";
import { GRADIENT, INK, LINE, MUTED } from "./listing-ui";

// Plain <form action={serverAction}>: works before hydration and needs no client bundle.
const SELECT = "h-12 w-full rounded-[12px] border border-[#B0B0B0] bg-background px-3 text-base dark:border-border";
const INPUT = "h-12 rounded-[12px] border-[#B0B0B0] text-base dark:border-border";
const SUBMIT = "h-12 w-full rounded-[12px] border-0 text-base font-semibold text-white hover:opacity-95 sm:w-auto sm:px-8";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={cn("text-[10px] font-bold uppercase tracking-wide", INK)}>
        {label}
      </Label>
      {children}
    </div>
  );
}

export function RevenueForm({ labels }: { labels: MonetizeLabels }) {
  const L = labels.revenueForm;
  return (
    <div id="record" className={cn("scroll-mt-28 rounded-xl border p-6 shadow-[0_6px_16px_rgba(0,0,0,0.12)]", LINE)}>
      <h3 className={cn("mb-5 text-lg font-semibold leading-6 tracking-normal", INK)}>{L.title}</h3>
      <div>
        <form action={addRevenueEntry} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field id="rev-line" label={L.line}>
            <select id="rev-line" name="line" className={SELECT} required>
              {REVENUE_LINES.map((l) => (
                <option key={l} value={l}>
                  {labels.lines[l]}
                </option>
              ))}
            </select>
          </Field>
          <Field id="rev-amount" label={L.amount}>
            <Input className={INPUT} id="rev-amount" name="amountRwf" type="number" min={1} step={1} inputMode="numeric" required dir="ltr" />
          </Field>
          <Field id="rev-at" label={L.receivedAt}>
            <Input className={INPUT} id="rev-at" name="receivedAt" type="date" dir="ltr" />
          </Field>
          <Field id="rev-customer" label={L.customer}>
            <Input className={INPUT} id="rev-customer" name="customer" maxLength={120} />
          </Field>
          <Field id="rev-deal" label={L.dealId}>
            <Input className={INPUT} id="rev-deal" name="dealId" maxLength={40} dir="ltr" />
          </Field>
          <Field id="rev-note" label={L.note}>
            <Input className={INPUT} id="rev-note" name="note" maxLength={500} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" className={SUBMIT} style={{ background: GRADIENT }}>
              {L.save}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const VERDICT_TONE: Record<string, string> = {
  running: "text-primary",
  won: "text-emerald-600",
  lost: "text-destructive",
  inconclusive: "text-muted-foreground",
};

export function Experiments({ items, labels, locale, editable = false }: { items: ExperimentView[]; labels: MonetizeLabels; locale: Locale; editable?: boolean }) {
  const L = labels.experiments;
  const verdicts = L.verdicts as Record<string, string>;
  const num = (v: number | null) => (v == null ? "—" : formatNumber(v, locale));
  const blockTitle = (b: string) => (labels.blocks as Record<string, { title: string }>)[b]?.title ?? b;
  return (
    <div className={cn("space-y-4 rounded-xl border p-6", LINE)}>
      <div className="space-y-4">
        {items.length === 0 ? (
          <p className={cn("text-base", MUTED)}>{L.empty}</p>
        ) : (
          <ul className="divide-y">
            {items.map((e) => (
              <li key={e.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className={cn("text-base font-medium", INK)}>{e.hypothesis}</p>
                  <span className={cn("text-xs font-medium", VERDICT_TONE[e.verdict])}>{verdicts[e.verdict] ?? e.verdict}</span>
                </div>
                <p className={cn("text-sm", MUTED)}>
                  {blockTitle(e.block)} · {e.metric} · {L.baseline} {num(e.baseline)} · {L.target}{" "}
                  {num(e.target)} · {L.result} {num(e.result)} · {formatDate(new Date(e.startedAt), locale)}
                </p>
                {editable && e.verdict === "running" && (
                  <form action={saveExperiment} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="block" value={e.block} />
                    <input type="hidden" name="hypothesis" value={e.hypothesis} />
                    <input type="hidden" name="metric" value={e.metric} />
                    {e.baseline != null && <input type="hidden" name="baseline" value={e.baseline} />}
                    {e.target != null && <input type="hidden" name="target" value={e.target} />}
                    <Field id={`res-${e.id}`} label={L.result}>
                      <Input id={`res-${e.id}`} name="result" type="number" step="any" className="w-28" dir="ltr" />
                    </Field>
                    <Field id={`ver-${e.id}`} label={L.verdict}>
                      <select id={`ver-${e.id}`} name="verdict" className={SELECT} defaultValue="running">
                        {Object.keys(verdicts).map((v) => (
                          <option key={v} value={v}>
                            {verdicts[v]}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Button type="submit" size="sm" variant="outline">
                      {L.update}
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {editable && (
        <form action={saveExperiment} className="grid grid-cols-1 gap-3 border-t pt-4 sm:grid-cols-2">
          <Field id="exp-block" label={L.block}>
            <select id="exp-block" name="block" className={SELECT} required>
              {BLOCKS.map((b) => (
                <option key={b} value={b}>
                  {labels.blocks[b].title}
                </option>
              ))}
            </select>
          </Field>
          <Field id="exp-metric" label={L.metric}>
            <select id="exp-metric" name="metric" className={SELECT} required>
              {Object.entries(labels.kpis).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Field>
          <div className="sm:col-span-2">
            <Field id="exp-hyp" label={L.hypothesis}>
              <Input className={INPUT} id="exp-hyp" name="hypothesis" minLength={5} maxLength={500} required />
            </Field>
          </div>
          <Field id="exp-base" label={L.baseline}>
            <Input className={INPUT} id="exp-base" name="baseline" type="number" step="any" dir="ltr" />
          </Field>
          <Field id="exp-target" label={L.target}>
            <Input className={INPUT} id="exp-target" name="target" type="number" step="any" dir="ltr" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit" className={SUBMIT} style={{ background: GRADIENT }}>
              {L.save}
            </Button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
