import type { Locale } from "@/components/internationalization/config";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { markDealPaid, sendMomoShareRequest, sendShareRequest } from "@/lib/actions/monetize-actions";
import { formatNumber } from "@/lib/i18n/formatters";
import { nextStepOf, type DealRow } from "@/lib/monetize/deal-pipeline";
import type { HeldIntro } from "@/lib/monetize/deals";
import { cn } from "@/lib/utils";

import { fill, type MonetizeLabels } from "./format";
import { GRADIENT, INK, LINE, MUTED } from "./listing-ui";

/**
 * The deals and their next step, for an admin only (page.tsx loads them for admins): who Mkan waits
 * on, for how long, and the two taps that move the money — send the share request once a lease is
 * signed, mark it paid once the money is in. Plain forms on server actions: no client bundle.
 */
const RWF = (n: number, locale: Locale) => `${formatNumber(Math.round(n), locale)} RWF`;
const SUBMIT = "h-10 rounded-[10px] border-0 px-4 text-sm font-semibold text-white hover:opacity-95";

export function DealsSection({ deals, labels, locale, payoutSet, held = [], momoMode = null }: { deals: DealRow[]; labels: MonetizeLabels; locale: Locale; payoutSet: boolean; held?: HeldIntro[]; momoMode?: "sandbox" | "production" | null }) {
  const L = labels.deals;
  const now = new Date();
  return (
    <section id="deals" aria-labelledby="deals-title" className="scroll-mt-28 pb-10">
      <h2 id="deals-title" className={cn("text-[22px] font-semibold leading-tight", INK)}>
        {L.title}
      </h2>
      <p className={cn("mt-1 text-sm", MUTED)}>{L.subtitle}</p>
      {held.length > 0 && (
        <div className="mt-4 rounded-xl border border-[#C13515] p-4">
          <p className={cn("text-base font-semibold", INK)}>{L.held.title}</p>
          <ul className="mt-2 flex flex-col gap-3">
            {held.map((h) => (
              <li key={`${h.ref}-${h.since}`}>
                <p className={cn("text-sm font-medium", INK)}>{fill(L.held.line, { ref: h.ref, broker: h.broker, n: formatNumber(h.tenants.length, locale), who: h.tenants.join(", ") || L.none })}</p>
                <p className={cn("mt-1 text-xs", MUTED)}>{h.why === "off" ? L.held.off : L.held.tries}</p>
                <a href={h.chat} className="mt-1 inline-block text-xs underline" target="_blank" rel="noreferrer">
                  {L.held.send}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
      {deals.length === 0 ? (
        <p className={cn("mt-4 rounded-xl border px-4 py-3 text-sm", LINE, MUTED)}>{L.empty}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {deals.map((d) => {
            const next = nextStepOf(d, now);
            const money = next.key === "sendShare" || next.key === "askCommission" || next.key === "awaitPayment";
            return (
              <li key={d.id} className={cn("rounded-xl border p-4", money ? "border-[#222222] dark:border-foreground" : LINE)}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className={cn("text-base font-semibold", INK)}>
                    K{d.listingId} · {d.title}
                  </p>
                  <p className={cn("text-xs", MUTED)}>
                    {d.intro ? L.intro : L.relay} · {L.status[d.status]} · {fill(L.waited, { n: formatNumber(next.days, locale) })}
                  </p>
                </div>
                <p className={cn("mt-1 text-sm font-medium", money ? "text-[#C13515]" : INK)}>{L.next[next.key]}</p>
                <p className={cn("mt-1 text-xs tabular-nums", MUTED)}>
                  {L.tenant}: {d.tenantPhone ?? L.none} · {L.broker}: {d.broker ?? L.none}
                  {d.brokerPhone ? ` (${d.brokerPhone})` : ""} · {L.share}: {d.mkanShare ? RWF(d.mkanShare, locale) : L.shareUnknown}
                </p>
                {(next.key === "sendShare" || next.key === "askCommission") && (
                  <form action={sendShareRequest} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="dealId" value={d.id} />
                    <Input
                      name="amountRwf"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      required={!d.mkanShare}
                      defaultValue={d.mkanShare ?? undefined}
                      aria-label={L.amount}
                      placeholder={L.amount}
                      className="h-10 w-40 rounded-[10px] text-sm"
                    />
                    <Button type="submit" className={SUBMIT} style={{ background: GRADIENT }}>
                      {L.sendShare}
                    </Button>
                  </form>
                )}
                {momoMode && (next.key === "sendShare" || next.key === "askCommission" || next.key === "awaitPayment") && (
                  <form action={sendMomoShareRequest} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="dealId" value={d.id} />
                    <Input name="amountRwf" type="number" inputMode="numeric" min={1} defaultValue={d.mkanShare ?? undefined} aria-label={L.amount} placeholder={L.amount} className="h-10 w-40 rounded-[10px] text-sm" />
                    <Button type="submit" variant="outline" className="h-10 rounded-[10px] px-4 text-sm font-semibold">
                      {L.momoRequest}
                    </Button>
                    {momoMode === "sandbox" && <span className={cn("text-xs", MUTED)}>{L.momoSandbox}</span>}
                  </form>
                )}
                {(next.key === "awaitPayment" || next.key === "sendShare") && (
                  <form action={markDealPaid} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="dealId" value={d.id} />
                    <Input
                      name="amountRwf"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      defaultValue={d.mkanShare ?? undefined}
                      aria-label={L.amount}
                      placeholder={L.amount}
                      className="h-10 w-40 rounded-[10px] text-sm"
                    />
                    <Button type="submit" variant="outline" className="h-10 rounded-[10px] px-4 text-sm font-semibold">
                      {L.markPaid}
                    </Button>
                  </form>
                )}
                {(next.key === "sendShare" || next.key === "askCommission") && !payoutSet && <p className={cn("mt-2 text-xs", MUTED)}>{L.payoutMissing}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
