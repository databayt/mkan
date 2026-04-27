"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListChecks } from "lucide-react";
import {
  getOfficeBookings,
  updateBookingStatus,
} from "@/lib/actions/transport-actions";
import { formatDate } from "@/lib/i18n/formatters";
import { useLocale } from "@/components/internationalization/use-locale";

type BookingsResult = Awaited<ReturnType<typeof getOfficeBookings>>;
type Booking = BookingsResult extends { bookings: infer B } ? (B extends Array<infer I> ? I : never) : never;

export default function TransportHostBookingsPage() {
  const params = useParams();
  const { locale: lang } = useLocale();
  const officeId = Number(params.id);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  useEffect(() => {
    if (!officeId) return;
    setLoading(true);
    getOfficeBookings(officeId, { page: 1, limit: 50, status: filter || undefined })
      .then((r) => setBookings((r?.bookings ?? []) as Booking[]))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [officeId, filter]);

  const onConfirm = async (id: number) => {
    await updateBookingStatus(id, "Confirmed");
    setBookings((prev) =>
      prev.map((b: any) => (b.id === id ? { ...b, status: "Confirmed", confirmedAt: new Date() } : b)),
    );
  };

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Bookings</h1>
          <p className="text-muted-foreground">Manage all reservations for your office.</p>
        </div>
        <div className="flex gap-2">
          {[
            { key: "", label: "All" },
            { key: "Pending", label: "Pending" },
            { key: "Confirmed", label: "Confirmed" },
            { key: "Cancelled", label: "Cancelled" },
          ].map((f) => (
            <Button
              key={f.label}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListChecks className="size-5" />
            {loading ? "Loading…" : `${bookings.length} bookings`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {bookings.length === 0 && !loading && (
              <div className="p-6 text-center text-muted-foreground">No bookings yet.</div>
            )}
            {bookings.map((b: any) => (
              <div key={b.id} className="p-4 flex items-center gap-4 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="font-medium">{b.passengerName}</div>
                  <div className="text-sm text-muted-foreground">
                    Ref: {b.bookingReference}
                  </div>
                </div>
                <div className="text-sm">
                  <div>
                    {b.trip?.route?.origin?.city} → {b.trip?.route?.destination?.city}
                  </div>
                  <div className="text-muted-foreground">
                    {b.trip?.departureDate ? formatDate(b.trip.departureDate, lang) : '—'} ·{" "}
                    {b.trip?.departureTime}
                  </div>
                </div>
                <div className="text-sm font-medium">
                  {Number(b.totalAmount).toLocaleString()} SDG
                </div>
                <Badge variant={b.status === "Confirmed" ? "default" : "outline"}>
                  {b.status}
                </Badge>
                {b.status === "Pending" && (
                  <Button size="sm" onClick={() => onConfirm(b.id)}>
                    Confirm
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
