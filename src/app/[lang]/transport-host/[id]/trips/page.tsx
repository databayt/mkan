"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Route as RouteIcon } from "lucide-react";
import { getTripsByOffice } from "@/lib/actions/transport-actions";
import { formatDate } from "@/lib/i18n/formatters";
import { useLocale } from "@/components/internationalization/use-locale";

type Trip = Awaited<ReturnType<typeof getTripsByOffice>>[number];
type Bucket = "today" | "upcoming" | "past";

export default function TransportHostTripsPage() {
  const params = useParams();
  const { locale: lang } = useLocale();
  const officeId = Number(params.id);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bucket, setBucket] = useState<Bucket>("today");

  useEffect(() => {
    if (!officeId) return;
    getTripsByOffice(officeId)
      .then(setTrips)
      .catch(() => setTrips([]));
  }, [officeId]);

  const filtered = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const tomorrow = new Date(start);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return trips.filter((t) => {
      const dep = new Date(t.departureDate);
      if (bucket === "today") return dep >= start && dep < tomorrow;
      if (bucket === "upcoming") return dep >= tomorrow;
      return dep < start;
    });
  }, [trips, bucket]);

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Trips</h1>
          <p className="text-muted-foreground">All scheduled trips for your office.</p>
        </div>
        <div className="flex gap-2">
          {(["today", "upcoming", "past"] as const).map((b) => (
            <Button
              key={b}
              variant={bucket === b ? "default" : "outline"}
              size="sm"
              onClick={() => setBucket(b)}
            >
              {b.charAt(0).toUpperCase() + b.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RouteIcon className="size-5" />
            {filtered.length} trips
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-muted-foreground">No trips in this bucket.</div>
            )}
            {filtered.map((t: any) => (
              <div key={t.id} className="p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">
                    {t.route?.origin?.city} → {t.route?.destination?.city}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Bus {t.bus?.plateNumber}
                  </div>
                </div>
                <div className="text-sm">
                  <div>{formatDate(t.departureDate, lang)}</div>
                  <div className="text-muted-foreground">{t.departureTime}</div>
                </div>
                <div className="text-sm">
                  {t.availableSeats}/{t.bus?.capacity ?? "?"} seats
                </div>
                <Badge variant={t.isActive ? "default" : "outline"}>
                  {t.isActive ? "Active" : "Cancelled"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
