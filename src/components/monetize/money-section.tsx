import { Apple, Banknote, Bot, Building2, Cloud, Cpu, Database, FlaskConical, Handshake, Laptop, MessageSquareText, PenLine, Phone, Receipt, ScanText, Server, Sparkles, Ticket } from "lucide-react";

import type { Locale } from "@/components/internationalization/config";
import { formatNumber, formatPercentage } from "@/lib/i18n/formatters";
import type { CostKind, CostLine } from "@/lib/monetize/cost-lines";
import type { MonetizeOverview } from "@/lib/monetize/load";
import { REVENUE_LINES } from "@/lib/monetize/money";
import { BLOCKS } from "@/lib/monetize/types";
import { cn } from "@/lib/utils";

import { fill, formatValue, type MonetizeLabels } from "./format";
import { INK, LINE, MUTED, Pill, Section } from "./listing-ui";

type Props = { data: MonetizeOverview; labels: MonetizeLabels; locale: Locale };
type IconT = React.ComponentType<{ className?: string; strokeWidth?: number }>;

const LINE_ICON: Record<string, IconT> = {
  cloudflare: Cloud,
  whatsappLine: Phone,
  macAndInternet: Laptop,
  "agent-read": MessageSquareText,
  "agent-write": PenLine,
  "agent-eval": FlaskConical,
  tiktokReader: ScanText,
  claudeMax: Sparkles,
  neon: Database,
  waBridge: Server,
  groq: Cpu,
  appleOcr: Apple,
};
const EARN_ICON: Record<string, IconT> = { COMMISSION: Handshake, VIEWING_FEE: Ticket, SUBSCRIPTION: Receipt, LICENSE: Bot };

function Detail({ line, labels, locale }: { line: CostLine; labels: MonetizeLabels; locale: Locale }) {
  const S = labels.spend;
  const n = (v: number) => formatNumber(v, locale);
  const bits: string[] = [];
  if (line.calls) bits.push(fill(S.calls, { n: n(line.calls) }));
  if (line.tokensIn || line.tokensOut) bits.push(fill(S.tokens, { in: n(line.tokensIn ?? 0), out: n(line.tokensOut ?? 0) }));
  if (line.usd != null && line.usd > 0) bits.push(fill(S.usd, { v: formatNumber(line.usd, locale, { maximumFractionDigits: 4 }) }));
  return bits.length ? <p className={cn("mt-1 text-xs tabular-nums leading-4", MUTED)}>{bits.join(" · ")}</p> : null;
}

/** Where the money goes: amenity-style rows, one per line, grouped by kind; then cost per block. */
export function SpendSection({ data, labels, locale }: Props) {
  const S = labels.spend;
  const rwf = (v: number) => formatValue(v, "rwf", locale, labels.currency);
  const copy = S.lines as Record<string, { name: string; what: string }>;
  const kinds: CostKind[] = ["fixed", "metered", "free"];
  return (
    <Section id="spend" title={S.title} aside={<Pill>{fill(S.elapsed, { pct: formatPercentage(data.monthElapsed, locale) })}</Pill>}>
      <p className={cn("-mt-3 mb-8 text-sm leading-5", MUTED)}>{S.desc}</p>
      <div className="space-y-10">
        {kinds.map((kind) => {
          const lines = data.costLines.filter((l) => l.kind === kind);
          if (!lines.length) return null;
          return (
            <div key={kind}>
              <h3 className={cn("text-lg font-semibold leading-6 tracking-normal", INK)}>{S.kinds[kind]}</h3>
              <p className={cn("mt-1 text-sm leading-5", MUTED)}>{fill(S.kindHelp[kind], { rate: formatNumber(data.usdToRwf, locale) })}</p>
              <ul className="mt-5 space-y-6">
                {lines.map((l) => {
                  const c = copy[l.key] ?? { name: l.key, what: copy.other?.what ?? "" };
                  const Icon = LINE_ICON[l.key] ?? Banknote;
                  return (
                    <li key={l.key} className="flex items-start gap-4">
                      <Icon className={cn("mt-0.5 size-6 shrink-0", INK)} strokeWidth={1.5} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-4">
                          <p className={cn("text-base font-medium leading-5", INK)}>{c.name}</p>
                          <p className={cn("shrink-0 text-base font-semibold tabular-nums leading-5", kind === "free" ? MUTED : INK)}>{rwf(l.soFarRwf)}</p>
                        </div>
                        <div className="mt-1 flex items-start justify-between gap-4">
                          <p className={cn("text-sm leading-5", MUTED)}>{c.what}</p>
                          {kind !== "free" && <p className={cn("shrink-0 text-xs tabular-nums leading-5", MUTED)}>{fill(S.perMonth, { v: rwf(l.monthlyRwf) })}</p>}
                        </div>
                        <p className={cn("mt-1 text-xs leading-4", MUTED)}>
                          {S.serves}: {l.blocks.map((b) => labels.blocks[b].title).join(" · ")}
                        </p>
                        <Detail line={l} labels={labels} locale={locale} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}

        <div>
          <h3 className={cn("text-lg font-semibold leading-6 tracking-normal", INK)}>{S.byBlockTitle}</h3>
          <p className={cn("mt-1 text-sm leading-5", MUTED)}>{S.byBlockHint}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {BLOCKS.map((b) => (
              <a key={b} href={`#${b}`} className={cn("rounded-xl border p-4 hover:border-[#222222]", LINE)}>
                <p className={cn("text-sm font-semibold leading-tight", INK)}>{labels.blocks[b].title}</p>
                <p className={cn("mt-4 text-lg font-semibold tabular-nums", INK)}>{rwf(data.costByBlock[b].soFarRwf)}</p>
                <p className={cn("text-[13px] tabular-nums", MUTED)}>{fill(S.perMonth, { v: rwf(data.costByBlock[b].monthlyRwf) })}</p>
              </a>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

/** How Mkan earns: the four lines as highlights, amount on the right. */
export function EarnSection({ data, labels, locale }: Props) {
  const E = labels.earn;
  const rwf = (v: number) => formatValue(v, "rwf", locale, labels.currency);
  return (
    <Section id="earn" title={E.title}>
      <p className={cn("-mt-3 mb-6 text-sm leading-5", MUTED)}>{E.desc}</p>
      <ul className="space-y-6">
        {REVENUE_LINES.map((l) => {
          const Icon = EARN_ICON[l] ?? Building2;
          return (
            <li key={l} className="flex items-start gap-4">
              <Icon className={cn("mt-0.5 size-6 shrink-0", INK)} strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-4">
                  <p className={cn("text-base font-medium leading-5", INK)}>{labels.lines[l]}</p>
                  <p className={cn("shrink-0 text-base font-semibold tabular-nums leading-5", INK)}>{rwf(data.money.byLine[l])}</p>
                </div>
                <p className={cn("mt-1 text-sm leading-5", MUTED)}>{E.what[l]}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
