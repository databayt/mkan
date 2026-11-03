import type { Locale } from "@/components/internationalization/config";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addRevenueEntry, saveExperiment } from "@/lib/actions/monetize-actions";
import { formatDate, formatNumber } from "@/lib/i18n/formatters";
import type { ExperimentView } from "@/lib/monetize/load";
import { REVENUE_LINES } from "@/lib/monetize/money";
import { BLOCKS } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import type { MonetizeLabels } from "./format";

// Plain <form action={serverAction}>: works before hydration and needs no client bundle.
const SELECT = "h-10 w-full rounded-lg border bg-background px-3 text-sm";

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function RevenueForm({ labels }: { labels: MonetizeLabels }) {
  const L = labels.revenueForm;
  return (
    <Card className="rounded-2xl shadow-none">
      <CardHeader>
        <CardTitle className="text-base">{L.title}</CardTitle>
      </CardHeader>
      <CardContent>
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
            <Input id="rev-amount" name="amountRwf" type="number" min={1} step={1} inputMode="numeric" required dir="ltr" />
          </Field>
          <Field id="rev-at" label={L.receivedAt}>
            <Input id="rev-at" name="receivedAt" type="date" dir="ltr" />
          </Field>
          <Field id="rev-customer" label={L.customer}>
            <Input id="rev-customer" name="customer" maxLength={120} />
          </Field>
          <Field id="rev-deal" label={L.dealId}>
            <Input id="rev-deal" name="dealId" maxLength={40} dir="ltr" />
          </Field>
          <Field id="rev-note" label={L.note}>
            <Input id="rev-note" name="note" maxLength={500} />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">{L.save}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
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
    <Card className="rounded-2xl shadow-none">
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">{L.empty}</p>
        ) : (
          <ul className="divide-y">
            {items.map((e) => (
              <li key={e.id} className="space-y-2 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">{e.hypothesis}</p>
                  <span className={cn("text-xs font-medium", VERDICT_TONE[e.verdict])}>{verdicts[e.verdict] ?? e.verdict}</span>
                </div>
                <p className="text-xs text-muted-foreground">
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
              <Input id="exp-hyp" name="hypothesis" minLength={5} maxLength={500} required />
            </Field>
          </div>
          <Field id="exp-base" label={L.baseline}>
            <Input id="exp-base" name="baseline" type="number" step="any" dir="ltr" />
          </Field>
          <Field id="exp-target" label={L.target}>
            <Input id="exp-target" name="target" type="number" step="any" dir="ltr" />
          </Field>
          <div className="sm:col-span-2">
            <Button type="submit">{L.save}</Button>
          </div>
        </form>
        )}
      </CardContent>
    </Card>
  );
}
