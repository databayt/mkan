"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Route as RouteIcon } from "lucide-react";
import { getTripsByOffice } from "@/lib/actions/travel-actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";

type Trip = Awaited<ReturnType<typeof getTripsByOffice>>[number];
type Bucket = "today" | "upcoming" | "past";

export default function TransportHostTripsPage() {
  const params = useParams();
  const officeId = Number(params.id);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [bucket, setBucket] = useState<Bucket>("today");
  const dict = useDictionary();
  const t = dict?.transportHost?.trips;

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

  const bucketLabel = (b: Bucket) => {
    if (b === "today") return t?.bucketToday ?? "Today";
    if (b === "upcoming") return t?.bucketUpcoming ?? "Upcoming";
    return t?.bucketPast ?? "Past";
  };

  const countLabelTpl = t?.countLabel ?? "{count} trips";

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-1">{t?.title ?? "Trips"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "All scheduled trips for your office."}
          </p>
        </div>
        <div className="flex gap-2">
          {(["today", "upcoming", "past"] as const).map((b) => (
            <Button
              key={b}
              variant={bucket === b ? "default" : "outline"}
              size="sm"
              onClick={() => setBucket(b)}
            >
              {bucketLabel(b)}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RouteIcon className="size-5" />
            {countLabelTpl.replace("{count}", String(filtered.length))}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {filtered.length === 0 && (
              <div className="p-6 text-center text-muted-foreground">
                {t?.empty ?? "No trips in this bucket."}
              </div>
            )}
            {filtered.map((trip: any) => (
              <div key={trip.id} className="p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">
                    {trip.route?.origin?.city} → {trip.route?.destination?.city}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t?.busLabel ?? "Bus"} {trip.bus?.plateNumber}
                  </div>
                </div>
                <div className="text-sm">
                  <div>{new Date(trip.departureDate).toLocaleDateString()}</div>
                  <div className="text-muted-foreground">{trip.departureTime}</div>
                </div>
                <div className="text-sm">
                  {trip.availableSeats}/{trip.bus?.capacity ?? "?"} {t?.seatsSuffix ?? "seats"}
                </div>
                <Badge variant={trip.isActive ? "default" : "outline"}>
                  {trip.isActive ? (t?.statusActive ?? "Active") : (t?.statusCancelled ?? "Cancelled")}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
