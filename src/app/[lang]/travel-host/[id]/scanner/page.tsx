"use client";

export const dynamic = "force-dynamic";

// Gate-agent ticket scanner (T-TK.4) — reads signed ticket QRs with the
// device camera (BarcodeDetector, i.e. Chrome/Android which is the operator
// hardware profile) and falls back to manual reference entry everywhere
// else. Validation + check-in run server-side with operator authorization.

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScanLine, CameraOff, CheckCircle2, XCircle, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { validateTicket, checkInTicket } from "@/lib/actions/travel-actions";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { useLocale } from "@/components/internationalization/use-locale";
import { cityLabel } from "@/components/travel/city-names";
import { format } from "date-fns";
import { ar, enUS } from "date-fns/locale";

type ScanResult = Awaited<ReturnType<typeof validateTicket>>;

// Minimal typing for the BarcodeDetector API (not yet in lib.dom).
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export default function ScannerPage() {
  const dict = useDictionary();
  const s = dict?.travel?.scanner;
  const { locale } = useLocale();
  const dateLocale = locale === "ar" ? ar : enUS;

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraSupported, setCameraSupported] = useState(true);
  const [manualRef, setManualRef] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [checkedIn, setCheckedIn] = useState(false);

  const invalidReason = (code: string): string => {
    switch (code) {
      case "notFound":
        return s?.reasonNotFound ?? "No booking matches this ticket";
      case "forged":
        return s?.reasonForged ?? "Signature check failed — this ticket was not issued by us";
      case "cancelled":
        return s?.reasonCancelled ?? "This booking was cancelled";
      case "used":
        return s?.reasonUsed ?? "Ticket already used";
      case "unpaid":
        return s?.reasonUnpaid ?? "Payment not confirmed yet — verify payment first";
      case "auth":
        return s?.reasonAuth ?? "You are not authorized to validate this ticket";
      default:
        return s?.reasonInvalid ?? "Invalid ticket";
    }
  };

  const stopCamera = useCallback(() => {
    if (detectTimerRef.current) {
      clearInterval(detectTimerRef.current);
      detectTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraActive(false);
  }, []);

  useEffect(() => stopCamera, [stopCamera]);

  const runValidation = useCallback(
    async (raw: string) => {
      setChecking(true);
      setCheckedIn(false);
      try {
        const res = await validateTicket(raw);
        setResult(res);
      } catch {
        toast.error(s?.scanFailed ?? "Could not validate the ticket. Try again.");
      } finally {
        setChecking(false);
      }
    },
    [s?.scanFailed],
  );

  const startCamera = useCallback(async () => {
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraSupported(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);

      const detector = new Detector({ formats: ["qr_code"] });
      let busy = false;
      detectTimerRef.current = setInterval(async () => {
        if (busy || !videoRef.current || videoRef.current.readyState < 2) return;
        busy = true;
        try {
          const codes = await detector.detect(videoRef.current);
          const raw = codes[0]?.rawValue;
          if (raw) {
            stopCamera();
            await runValidation(raw);
          }
        } catch {
          // detection errors are transient (tab hidden, frame not ready)
        } finally {
          busy = false;
        }
      }, 400);
    } catch {
      setCameraSupported(false);
      stopCamera();
    }
  }, [runValidation, stopCamera]);

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ref = manualRef.trim();
    if (!ref) return;
    await runValidation(ref);
  };

  const handleCheckIn = async () => {
    if (!result?.valid) return;
    setChecking(true);
    try {
      const res = await checkInTicket(
        result.ticket.bookingId,
        result.ticket.seatScoped ? result.ticket.seat : undefined,
      );
      setCheckedIn(true);
      const boardedTpl = s?.boardedToast ?? "{name} checked in";
      toast.success(boardedTpl.replace("{name}", res.boarded));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check-in failed";
      toast.error(message);
    } finally {
      setChecking(false);
    }
  };

  const resetScan = () => {
    setResult(null);
    setCheckedIn(false);
    setManualRef("");
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold mb-1">{s?.title ?? "Ticket scanner"}</h1>
        <p className="text-muted-foreground">
          {s?.subtitle ?? "Scan passenger QR codes at boarding, or type the booking reference."}
        </p>
      </div>

      {!result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ScanLine className="size-5" />
              {s?.scanTitle ?? "Scan a ticket"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Camera viewport — only rendered while scanning */}
            <div className="relative overflow-hidden rounded-lg bg-muted aspect-video">
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- live camera feed */}
              <video ref={videoRef} className="h-full w-full object-cover" playsInline muted />
              {!cameraActive && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                  {cameraSupported ? (
                    <>
                      <ScanLine className="size-10 opacity-50" />
                      <Button onClick={startCamera} disabled={checking}>
                        {s?.startCamera ?? "Start camera"}
                      </Button>
                    </>
                  ) : (
                    <>
                      <CameraOff className="size-10 opacity-50" />
                      <p className="text-sm text-center px-6">
                        {s?.cameraUnsupported ??
                          "Camera scanning isn't supported on this browser — enter the booking reference below."}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
            {cameraActive && (
              <Button variant="outline" className="w-full" onClick={stopCamera}>
                {s?.stopCamera ?? "Stop camera"}
              </Button>
            )}

            {/* Manual fallback — works without a camera */}
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <Input
                value={manualRef}
                onChange={(e) => setManualRef(e.target.value)}
                placeholder={s?.manualPlaceholder ?? "e.g., BK-1751234567-AB12CD"}
                dir="ltr"
                className="font-mono"
              />
              <Button type="submit" disabled={checking || !manualRef.trim()}>
                {checking ? (s?.checking ?? "Checking…") : (s?.validate ?? "Validate")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card className={result.valid ? "border-green-600/40" : "border-destructive/40"}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.valid ? (
                <>
                  <CheckCircle2 className="size-5 text-green-600" />
                  {s?.validTicket ?? "Valid ticket"}
                </>
              ) : (
                <>
                  <XCircle className="size-5 text-destructive" />
                  {s?.invalidTicket ?? "Invalid ticket"}
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {result.valid ? (
              <>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{s?.passenger ?? "Passenger"}</span>
                    <span className="font-medium">{result.ticket.passengerName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{s?.seat ?? "Seat"}</span>
                    <span className="font-medium" dir="ltr">{result.ticket.seat}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{s?.route ?? "Route"}</span>
                    <span className="font-medium">
                      {cityLabel(result.ticket.origin, locale)} ↔ {cityLabel(result.ticket.destination, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{s?.departure ?? "Departure"}</span>
                    <span className="font-medium">
                      {format(new Date(result.ticket.departureDate), "EEE, MMM d", { locale: dateLocale })}
                      {" · "}
                      <span dir="ltr">{result.ticket.departureTime}</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{s?.reference ?? "Reference"}</span>
                    <span className="font-mono text-xs" dir="ltr">{result.ticket.reference}</span>
                  </div>
                </div>

                {result.ticket.passengers.length > 1 && (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">
                      {s?.groupBooking ?? "Group booking"}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {result.ticket.passengers.map((p) => (
                        <Badge key={p.seatNumber} variant={p.checkedIn ? "default" : "outline"}>
                          {p.seatNumber} · {p.name}
                          {p.checkedIn ? " ✓" : ""}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {checkedIn ? (
                  <div className="flex items-center gap-2 text-green-600 font-medium">
                    <UserCheck className="size-5" />
                    {s?.checkedIn ?? "Checked in"}
                  </div>
                ) : (
                  <Button className="w-full" onClick={handleCheckIn} disabled={checking}>
                    <UserCheck className="size-4 me-2" />
                    {result.ticket.seatScoped
                      ? (s?.checkInPassenger ?? "Check in this passenger")
                      : (s?.checkInAll ?? "Check in booking")}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-destructive">{invalidReason(result.message)}</p>
            )}

            <Button variant="outline" className="w-full" onClick={resetScan}>
              {s?.scanAnother ?? "Scan another ticket"}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
