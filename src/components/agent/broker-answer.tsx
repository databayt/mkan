"use client";

import { useState, useTransition } from "react";
import { BadgeCheck, MessageCircle, Phone } from "lucide-react";
import { BlurImage } from "@/components/atom/blur-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { useLocale } from "@/components/internationalization/use-locale";
import { answerAvailability, confirmViewing } from "./broker-actions";
import { fill } from "./format";

interface HomeSummary {
  title: string;
  photo: string | null;
  place: string | null;
  price: string | null;
  period: "month" | "night";
}

export type BrokerPageState =
  | { kind: "invalid" }
  | { kind: "ask"; home: HomeSummary; need: string }
  | { kind: "answered"; home: HomeSummary }
  | { kind: "chosen"; home: HomeSummary; when: string }
  | { kind: "confirmed"; home: HomeSummary; when: string; tenantName: string | null; tenantPhone: string | null };

const KIGALI = "Africa/Kigali";

export function BrokerAnswer({ token, state: initial }: { token: string; state: BrokerPageState }) {
  const dict = useDictionary();
  const b = dict?.agent?.broker;
  const { locale } = useLocale();
  const [state, setState] = useState(initial);
  const [done, setDone] = useState<"available" | "rented" | null>(null);
  const [showSlots, setShowSlots] = useState(false);
  const [slots, setSlots] = useState(["", "", ""]);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale === "ar" ? "ar" : "en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: KIGALI }).format(new Date(iso));

  if (state.kind === "invalid") return <p className="text-center text-muted-foreground">{b?.invalid ?? "This link has expired or is no longer valid."}</p>;

  const home = state.home;
  const header = (
    <div className="overflow-hidden rounded-xl border">
      {home.photo && (
        <div className="relative aspect-[4/3] bg-muted">
          <BlurImage src={home.photo} alt={home.title} fill sizes="448px" className="object-cover" />
        </div>
      )}
      <div className="space-y-1 p-4">
        <p className="font-medium">{home.title}</p>
        {home.place && <p className="text-sm text-muted-foreground">{home.place}</p>}
        {home.price && (
          <p>
            <span className="font-semibold">{home.price}</span>{" "}
            <span className="text-sm text-muted-foreground">{home.period === "month" ? b?.perMonth ?? "/ month" : b?.perNight ?? "/ night"}</span>
          </p>
        )}
      </div>
    </div>
  );

  const answer = (kind: "available" | "rented") =>
    startTransition(async () => {
      setError(false);
      const res = await answerAvailability(token, kind, kind === "available" ? slots : []);
      if (res.ok) setDone(kind);
      else if (res.error === "answered") setState({ kind: "answered", home });
      else setError(true);
    });

  const confirm = () =>
    startTransition(async () => {
      setError(false);
      const res = await confirmViewing(token);
      if (res.ok) window.location.reload();
      else setError(true);
    });

  let body: React.ReactNode;
  if (done) {
    body = <p className="text-center">{done === "available" ? b?.thanks ?? "Thank you." : b?.rentedThanks ?? "Thank you."}</p>;
  } else if (state.kind === "ask") {
    body = (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{b?.title ?? "Is this home still available?"}</h1>
        <p className="text-muted-foreground">{fill(b?.intro ?? "A tenant on Mkan is looking for {need}.", { need: state.need })}</p>
        {showSlots ? (
          <div className="space-y-2">
            <p className="text-sm font-medium">{b?.slotsLabel ?? "Offer up to 3 viewing times (optional)"}</p>
            {slots.map((s, i) => (
              <Input
                key={i}
                type="datetime-local"
                dir="ltr"
                value={s}
                onChange={(e) => setSlots((prev) => prev.map((p, j) => (j === i ? e.target.value : p)))}
                aria-label={`${b?.slotsLabel ?? "Viewing time"} ${i + 1}`}
              />
            ))}
            <Button className="w-full" size="lg" onClick={() => answer("available")} disabled={pending}>
              {b?.send ?? "Send answer"}
            </Button>
          </div>
        ) : (
          <div className="grid gap-2">
            <Button size="lg" onClick={() => setShowSlots(true)} disabled={pending}>
              {b?.yes ?? "Yes, it's available"}
            </Button>
            <Button size="lg" variant="outline" onClick={() => answer("rented")} disabled={pending}>
              {b?.no ?? "No, it's rented"}
            </Button>
          </div>
        )}
        <p className="text-xs text-muted-foreground">{b?.privacy}</p>
      </div>
    );
  } else if (state.kind === "chosen") {
    body = (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold">{b?.chosenTitle ?? "A tenant wants to view this home"}</h1>
        <p className="text-muted-foreground">{fill(b?.chosenBody ?? "They chose {when}.", { when: when(state.when) })}</p>
        <Button className="w-full" size="lg" onClick={confirm} disabled={pending}>
          {b?.confirm ?? "Confirm viewing"}
        </Button>
      </div>
    );
  } else if (state.kind === "confirmed") {
    const phone = state.tenantPhone ?? "";
    body = (
      <div className="space-y-4">
        <p className="flex items-center gap-2 font-medium text-emerald-700">
          <BadgeCheck className="size-5" aria-hidden />
          {fill(b?.confirmed ?? "Viewing confirmed for {when}", { when: when(state.when) })}
        </p>
        <div className="rounded-lg bg-muted p-3">
          <p className="text-sm text-muted-foreground">{b?.tenant ?? "Tenant"}</p>
          <p className="font-medium">{state.tenantName}</p>
          <p dir="ltr" className="text-start">{phone}</p>
        </div>
        {phone && (
          <div className="grid grid-cols-2 gap-2">
            <Button asChild variant="outline">
              <a href={`tel:${phone}`}>
                <Phone className="size-4" aria-hidden />
                {phone}
              </a>
            </Button>
            <Button asChild>
              <a href={`https://wa.me/${phone.replace(/[^\d]/g, "")}`} target="_blank" rel="noreferrer">
                <MessageCircle className="size-4" aria-hidden />
                {b?.whatsapp ?? "WhatsApp the tenant"}
              </a>
            </Button>
          </div>
        )}
      </div>
    );
  } else {
    body = <p className="text-center text-muted-foreground">{b?.answered ?? "You have already answered. Thank you."}</p>;
  }

  return (
    <div className="space-y-6">
      {header}
      {body}
      {error && <p className="text-sm text-destructive">{b?.error ?? "Something went wrong. Please try again."}</p>}
    </div>
  );
}
