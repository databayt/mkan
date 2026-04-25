"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, Download } from "lucide-react";
import { getOfficeDashboardStats } from "@/lib/actions/transport-actions";

type Stats = Awaited<ReturnType<typeof getOfficeDashboardStats>>;

export default function TransportHostEarningsPage() {
  const params = useParams();
  const officeId = Number(params.id);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!officeId) return;
    getOfficeDashboardStats(officeId)
      .then(setStats)
      .catch(() => undefined);
  }, [officeId]);

  const onExport = () => {
    const rows: (string | number)[][] = [
      ["Metric", "Value"],
      ["Total bookings", stats?.totalBookings ?? 0],
      ["Confirmed bookings", stats?.confirmedBookings ?? 0],
      ["Pending bookings", stats?.pendingBookings ?? 0],
      ["Total revenue (SDG)", stats?.totalRevenue ?? 0],
      ["Upcoming trips", stats?.upcomingTrips ?? 0],
      ["Total buses", stats?.totalBuses ?? 0],
      ["Total routes", stats?.totalRoutes ?? 0],
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
          <h1 className="text-3xl font-semibold mb-1">Earnings</h1>
          <p className="text-muted-foreground">Revenue rolled up from confirmed bookings.</p>
        </div>
        <Button variant="outline" onClick={onExport}>
          <Download className="size-4 me-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              Total revenue
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {(stats?.totalRevenue as number | undefined)?.toLocaleString() ?? "—"} SDG
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              {(stats?.confirmedBookings as number | undefined) ?? 0} confirmed bookings
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="size-5" />
              Pending
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold">
              {(stats?.pendingBookings as number | undefined) ?? 0}
            </div>
            <div className="text-sm text-muted-foreground mt-1">bookings awaiting confirmation</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Notes</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Revenue counts only Confirmed bookings. Pending and Cancelled are excluded.</p>
          <p>Reference-based payments (Bankak, Cashi, etc.) appear after admin verifies them.</p>
        </CardContent>
      </Card>
    </div>
  );
}
