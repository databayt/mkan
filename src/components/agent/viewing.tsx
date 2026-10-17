"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { chooseViewing, recordViewingOutcome, type ViewingOutcome } from "./broker-actions";
import { fill } from "./format";
import type { ShortlistItem, ViewingView } from "./types";

const OUTCOMES: ViewingOutcome[] = ["rented", "notForMe", "differentFromAd", "notAvailable", "tooExpensive", "brokerNoShow", "iMissedIt"];

/**
 * The viewing on one card: pick a broker-offered time (with consent to share
 * name + phone) → wait for the broker → confirmed → afterwards, how it went.
 */
export function ViewingPanel({ item, viewing, taskId, onChange }: { item: ShortlistItem; viewing: ViewingView; taskId: string; onChange: () => void }) {
  const dict = useDictionary();
  const c = dict?.agent?.card;
  const { locale } = useLocale();
  const [slot, setSlot] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  // Fixed per mount — the card re-mounts on every poll that changes it.
  const [now] = useState(() => Date.now());

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Kigali" }).format(new Date(iso));

  if (viewing.confirmed && viewing.scheduledFor) {
    const past = Date.parse(viewing.scheduledFor) < now;
    return (
      <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-900 dark:bg-emerald-950">
        <p className="flex items-center gap-1.5 font-medium text-emerald-800 dark:text-emerald-300">
          <BadgeCheck className="size-4" aria-hidden />
          {fill(c?.viewingConfirmed ?? "Viewing confirmed: {when}", { when: when(viewing.scheduledFor) })}
        </p>
        {past && !viewing.outcome && !saved && (
          <>
            <p>{c?.howDidItGo ?? "How did the viewing go?"}</p>
            <div className="flex flex-wrap gap-1.5">
              {OUTCOMES.map((o) => (
                <Button
                  key={o}
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const res = await recordViewingOutcome(taskId, item.id, o);
                      if (res.ok) {
                        setSaved(true);
                        onChange();
                      } else setError(true);
                    })
                  }
                >
                  {(c?.outcomes as Record<string, string> | undefined)?.[o] ?? o}
                </Button>
              ))}
            </div>
          </>
        )}
        {(viewing.outcome || saved) && <p className="text-muted-foreground">{c?.outcomeThanks ?? "Thanks — noted."}</p>}
        {error && <p className="text-destructive">{c?.saveError ?? "Couldn't save."}</p>}
      </div>
    );
  }

  if (viewing.chosen) {
    return (
      <p className="flex items-center gap-1.5 rounded-lg bg-muted p-3 text-sm">
        <Clock className="size-4 shrink-0" aria-hidden />
        {fill(c?.viewingWaiting ?? "Waiting for the broker to confirm {when}", { when: when(viewing.chosen) })}
      </p>
    );
  }

  const upcoming = viewing.slots.filter((s) => Date.parse(s) > now);
  if (upcoming.length === 0) return <p className="rounded-lg bg-muted p-3 text-sm">{c?.noSlots ?? "Available. The broker hasn't offered viewing times yet."}</p>;

  const submit = () =>
    startTransition(async () => {
      setError(false);
      if (!slot || !consent) return setError(true);
      const res = await chooseViewing({ taskId, listingId: item.id, slot, name, phone, consent: true });
      if (res.ok) onChange();
      else setError(true);
    });

  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <p className="font-medium">{c?.pickSlot ?? "Pick a viewing time"}</p>
      <div className="flex flex-wrap gap-1.5" role="radiogroup">
        {upcoming.map((s) => (
          <Button key={s} size="sm" type="button" role="radio" aria-checked={slot === s} variant={slot === s ? "default" : "outline"} onClick={() => setSlot(s)}>
            {when(s)}
          </Button>
        ))}
      </div>
      {slot && (
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={`name-${item.id}`}>{c?.name ?? "Your name"}</Label>
            <Input id={`name-${item.id}`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={80} />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`phone-${item.id}`}>{c?.phone ?? "Your phone (WhatsApp)"}</Label>
            <Input id={`phone-${item.id}`} dir="ltr" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={16} />
          </div>
          <div className="flex items-start gap-2">
            <Checkbox id={`consent-${item.id}`} checked={consent} onCheckedChange={(v) => setConsent(v === true)} />
            <Label htmlFor={`consent-${item.id}`} className="font-normal leading-snug">
              {c?.consent ?? "Share my name and phone with this broker so they can arrange the viewing."}
            </Label>
          </div>
          <Button className="w-full" onClick={submit} disabled={pending || !consent || name.trim().length < 2 || phone.trim().length < 9}>
            {c?.requestViewing ?? "Request viewing"}
          </Button>
        </div>
      )}
      {error && <p className="text-destructive">{c?.saveError ?? "Couldn't save. Check the details and try again."}</p>}
    </div>
  );
}
