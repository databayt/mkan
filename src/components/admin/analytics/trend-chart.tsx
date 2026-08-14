"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { TrendPoint } from "@/lib/actions/analytics-actions";
import type { AnalyticsLabels } from "./types";

/**
 * Daily views and inquiries.
 *
 * Only these two are plotted. Visits and rentals are low-volume by nature —
 * a handful per month at best — so a daily series of them is a flat line at
 * zero that makes the chart look broken rather than informative. They are shown
 * as period totals in the cards instead.
 *
 * The axis is pinned `dir="ltr"`: a time axis runs left-to-right regardless of
 * the page's text direction, and mirroring it in Arabic would put the future on
 * the left, which no chart convention does.
 */
export function TrendChart({
  trend,
  labels,
  locale,
}: {
  trend: TrendPoint[];
  labels: AnalyticsLabels;
  locale: "en" | "ar";
}) {
  const config = {
    views: { label: labels.stageViews, color: "var(--chart-1)" },
    inquiries: { label: labels.stageInquiries, color: "var(--chart-2)" },
  } satisfies ChartConfig;

  const hasData = trend.some((p) => p.views > 0 || p.inquiries > 0);

  const tickFormatter = (value: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar-SD" : "en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    }).format(new Date(value));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold">{labels.trendTitle}</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <div dir="ltr">
            <ChartContainer config={config} className="h-[260px] w-full">
              <AreaChart data={trend} margin={{ left: 4, right: 4, top: 4 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={tickFormatter}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={32}
                  allowDecimals={false}
                />
                <ChartTooltip
                  content={<ChartTooltipContent labelFormatter={(v) => tickFormatter(String(v))} />}
                />
                <Area
                  dataKey="views"
                  type="monotone"
                  stroke="var(--color-views)"
                  fill="var(--color-views)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
                <Area
                  dataKey="inquiries"
                  type="monotone"
                  stroke="var(--color-inquiries)"
                  fill="var(--color-inquiries)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ChartContainer>
          </div>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">{labels.noData}</p>
        )}
      </CardContent>
    </Card>
  );
}
