import { ArrowDown, ArrowRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { formatNumber } from "@/lib/i18n/formatters";
import { cn } from "@/lib/utils";
import type { SectionProps } from "./types";

/**
 * The funnel itself: five stage counts with the conversion between each pair.
 *
 * The conversions sit BETWEEN the stages rather than in their own table,
 * because the drop between two numbers is the finding — a table of five counts
 * makes the reader do that subtraction in their head, every time.
 *
 * A null rate renders as "—", never 0%. With no traffic yet those are different
 * facts and conflating them makes an empty dashboard look like a failing one.
 */
export function FunnelStrip({ data, labels, locale }: SectionProps) {
  const { counts, rates } = data;

  const stages = [
    { key: "listings", label: labels.stageListings, value: counts.listings },
    { key: "views", label: labels.stageViews, value: counts.views },
    { key: "inquiries", label: labels.stageInquiries, value: counts.inquiries },
    { key: "visits", label: labels.stageVisits, value: counts.visits },
    { key: "rentals", label: labels.stageRentals, value: counts.rentals },
  ];

  // One fewer than the stages: the gaps between them.
  const links: (number | null)[] = [
    rates.viewsPerListing,
    rates.viewToInquiry,
    rates.inquiryToVisit,
    rates.visitToRental,
  ];

  const linkText = (i: number): string => {
    const v = links[i];
    if (v === null || v === undefined) return "—";
    // The first link is a ratio (views per listing), the rest are percentages.
    return i === 0
      ? `${formatNumber(Math.round(v * 10) / 10, locale)}×`
      : `${formatNumber(Math.round(v * 10) / 10, locale)}%`;
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-stretch">
          {stages.map((s, i) => (
            <div key={s.key} className="flex flex-1 flex-col gap-2 md:flex-row md:items-center">
              <div className="flex-1 rounded-lg border bg-muted/30 p-4 text-center">
                <div className="text-2xl font-semibold tabular-nums">
                  {formatNumber(s.value, locale)}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{s.label}</div>
              </div>

              {i < links.length && (
                <div
                  className={cn(
                    "flex shrink-0 items-center justify-center gap-1 text-xs font-medium text-muted-foreground",
                    "md:w-16 md:flex-col",
                  )}
                >
                  {/* Logical rotation, so the arrow points down the funnel in
                      both directions of text. */}
                  <ArrowDown className="h-3.5 w-3.5 md:hidden" aria-hidden />
                  <ArrowRight className="hidden h-3.5 w-3.5 rtl:rotate-180 md:block" aria-hidden />
                  <span className="tabular-nums">{linkText(i)}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
