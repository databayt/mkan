import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react";

export const dynamic = "force-dynamic";

export default function HostingCalendarPage() {
  const today = new Date();
  const monthLabel = today.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold mb-1">Calendar</h1>
          <p className="text-muted-foreground">Bookings and blocked dates across your listings.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Previous month">
            <ChevronLeft className="size-4" />
          </Button>
          <span className="font-medium min-w-[140px] text-center">{monthLabel}</span>
          <Button variant="outline" size="icon" aria-label="Next month">
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="size-5" />
            All listings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border p-4">
            <div className="grid grid-cols-7 gap-1 mb-3 text-xs text-muted-foreground text-center">
              {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                <div key={i}>{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => {
                const dayNum = i - 3;
                const isValid = dayNum >= 1 && dayNum <= 30;
                return (
                  <div
                    key={i}
                    className={`aspect-square rounded text-sm flex items-center justify-center ${
                      isValid ? "hover:bg-muted/50 cursor-pointer" : "opacity-30"
                    }`}
                  >
                    {isValid ? dayNum : ""}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-muted" /> Available
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-primary" /> Booked
            </div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-destructive/60" /> Blocked
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
