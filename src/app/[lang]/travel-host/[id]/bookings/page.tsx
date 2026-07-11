"use client";

export const dynamic = "force-dynamic";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ListChecks, ScanLine, ArrowRight, X } from "lucide-react";
import { toast } from "sonner";
import {
  getOfficeBookings,
  updateBookingStatus,
  cancelBookingSeats,
} from "@/lib/actions/travel-actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { formatCurrency } from "@/lib/i18n/formatters";
import { cityLabel } from "@/components/travel/city-names";

type BookingsResult = Awaited<ReturnType<typeof getOfficeBookings>>;
type Booking = BookingsResult extends { bookings: infer B } ? (B extends Array<infer I> ? I : never) : never;

export default function TransportHostBookingsPage() {
  const params = useParams();
  const officeId = Number(params.id);
  const lang = (params.lang as string) ?? "en";
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");
  const dict = useDictionary();
  const t = dict?.transportHost?.bookings;
  const { locale } = useLocale();

  const load = React.useCallback(() => {
    if (!officeId) return;
    setLoading(true);
    getOfficeBookings(officeId, { page: 1, limit: 50, status: filter || undefined })
      .then((r) => setBookings((r?.bookings ?? []) as Booking[]))
      .catch(() => setBookings([]))
      .finally(() => setLoading(false));
  }, [officeId, filter]);

  useEffect(() => {
    load();
  }, [load]);

  const onConfirm = async (id: number) => {
    await updateBookingStatus(id, "Confirmed");
    setBookings((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status: "Confirmed" as const } : b)),
    );
  };

  // Partial cancellation (T-MP.4): free one seat of a group booking while the
  // rest keep travelling. Confirm inline — gate agents work fast on phones.
  const onCancelSeat = async (booking: Booking, seatNumber: string) => {
    const confirmTpl =
      t?.cancelSeatConfirm ?? "Release seat {seat} from booking {ref}? The fare total is reduced.";
    const ok = window.confirm(
      confirmTpl.replace("{seat}", seatNumber).replace("{ref}", booking.bookingReference),
    );
    if (!ok) return;
    try {
      await cancelBookingSeats(booking.id, [seatNumber]);
      toast.success((t?.seatCancelled ?? "Seat {seat} released").replace("{seat}", seatNumber));
      load();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed";
      toast.error(message);
    }
  };

  const statusLabel = (status: string): string => {
    switch (status) {
      case "Pending":
        return t?.statusPending ?? "Pending";
      case "Confirmed":
        return t?.statusConfirmed ?? "Confirmed";
      case "Cancelled":
        return t?.statusCancelled ?? "Cancelled";
      case "Completed":
        return t?.statusCompleted ?? "Completed";
      default:
        return status;
    }
  };

  const filters = [
    { key: "", label: t?.filterAll ?? "All" },
    { key: "Pending", label: t?.filterPending ?? "Pending" },
    { key: "Confirmed", label: t?.filterConfirmed ?? "Confirmed" },
    { key: "Cancelled", label: t?.filterCancelled ?? "Cancelled" },
  ];

  const countLabelTpl = t?.countLabel ?? "{count} bookings";

  return (
    <div className="max-w-6xl mx-auto py-8">
      <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-semibold mb-1">{t?.title ?? "Bookings"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "Manage all reservations for your office."}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link href={`/${lang}/travel-host/${officeId}/scanner`}>
              <ScanLine className="size-4 me-1.5" />
              {t?.scanTickets ?? "Scan tickets"}
            </Link>
          </Button>
          {filters.map((f) => (
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
            {loading
              ? (t?.loading ?? "Loading…")
              : countLabelTpl.replace("{count}", String(bookings.length))}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {bookings.length === 0 && !loading && (
              <div className="p-6 text-center text-muted-foreground">
                {t?.empty ?? "No bookings yet."}
              </div>
            )}
            {bookings.map((b) => {
              const seatCancellable =
                (b.status === "Pending" || b.status === "Confirmed") && b.seats.length > 1;
              return (
                <div key={b.id} className="p-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="font-medium">{b.passengerName}</div>
                    <div className="text-sm text-muted-foreground">
                      {t?.ref ?? "Ref"}: <span dir="ltr">{b.bookingReference}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {b.seats.map((seat) => {
                        const passenger = b.passengers.find(
                          (p) => p.seatNumber === seat.seatNumber,
                        );
                        return (
                          <Badge
                            key={seat.seatNumber}
                            variant="outline"
                            className="gap-1 font-normal"
                          >
                            <span dir="ltr">{seat.seatNumber}</span>
                            {passenger && b.passengers.length > 1 ? ` · ${passenger.name}` : ""}
                            {seatCancellable && (
                              <button
                                type="button"
                                aria-label={(t?.cancelSeat ?? "Cancel seat {seat}").replace(
                                  "{seat}",
                                  seat.seatNumber,
                                )}
                                className="ms-0.5 text-muted-foreground hover:text-destructive"
                                onClick={() => onCancelSeat(b, seat.seatNumber)}
                              >
                                <X className="size-3" />
                              </button>
                            )}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                  <div className="text-sm">
                    <div className="inline-flex items-center gap-1">
                      {cityLabel(b.trip?.route?.origin?.city ?? "", locale)}
                      <ArrowRight className="h-3 w-3 rtl:rotate-180" />
                      {cityLabel(b.trip?.route?.destination?.city ?? "", locale)}
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(b.trip?.departureDate).toLocaleDateString(
                        locale === "ar" ? "ar-EG" : "en-US",
                      )}{" "}
                      · <span dir="ltr">{b.trip?.departureTime}</span>
                    </div>
                  </div>
                  <div className="text-sm font-medium">
                    {formatCurrency(Number(b.totalAmount), locale)}
                  </div>
                  <Badge variant={b.status === "Confirmed" ? "default" : "outline"}>
                    {statusLabel(b.status)}
                  </Badge>
                  {b.status === "Pending" && (
                    <Button size="sm" onClick={() => onConfirm(b.id)}>
                      {t?.confirm ?? "Confirm"}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
