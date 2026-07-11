"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Download } from "lucide-react";
import { getOfficeDashboardStats } from "@/lib/actions/travel-actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";

type Stats = Awaited<ReturnType<typeof getOfficeDashboardStats>>;

export default function TransportHostEarningsPage() {
  const params = useParams();
  const officeId = Number(params.id);
  const [stats, setStats] = useState<Stats | null>(null);
  const dict = useDictionary();
  const t = dict?.transportHost?.earnings;
  const { locale } = useLocale();

  useEffect(() => {
    if (!officeId) return;
    getOfficeDashboardStats(officeId)
      .then(setStats)
      .catch(() => undefined);
  }, [officeId]);

  const onExport = () => {
    const h = t?.csvHeaders;
    const rows: (string | number)[][] = [
      [h?.metric ?? "Metric", h?.value ?? "Value"],
      [h?.totalBookings ?? "Total bookings", stats?.totalBookings ?? 0],
      [h?.confirmedBookings ?? "Confirmed bookings", stats?.confirmedBookings ?? 0],
      [h?.pendingBookings ?? "Pending bookings", stats?.pendingBookings ?? 0],
      [h?.totalRevenueSdg ?? "Total revenue (SDG)", stats?.totalRevenue ?? 0],
      [h?.upcomingTrips ?? "Upcoming trips", stats?.upcomingTrips ?? 0],
      [h?.totalBuses ?? "Total buses", stats?.totalBuses ?? 0],
      [h?.totalRoutes ?? "Total routes", stats?.totalRoutes ?? 0],
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mkan-earnings-${officeId}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-1">{t?.title ?? "Earnings"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Revenue rolled up from confirmed bookings."}
          </p>
        </div>
        <Button variant="outline" onClick={onExport}>
          <Download className="size-4 me-2" />
          {t?.exportCsv ?? "Export CSV"}
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              {t?.totalRevenue ?? "Total revenue"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {stats?.totalRevenue != null
                ? formatCurrency(stats.totalRevenue as number, locale)
                : "—"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {(stats?.confirmedBookings as number | undefined) ?? 0}{" "}
              {t?.confirmedBookingsSuffix ?? "confirmed bookings"}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              {t?.pending ?? "Pending"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {(stats?.pendingBookings as number | undefined) ?? 0}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {t?.awaitingConfirmation ?? "bookings awaiting confirmation"}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t?.notesTitle ?? "Notes"}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            {t?.notesRevenueRule ??
              "Revenue counts only Confirmed bookings. Pending and Cancelled are excluded."}
          </p>
          <p>
            {t?.notesReferencePayments ??
              "Reference-based payments (Bankak, Cashi, etc.) appear after admin verifies them."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
