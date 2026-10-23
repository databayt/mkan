"use client";

import { useState, useTransition } from "react";
import { BadgeCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDictionary } from "@/components/internationalization/use-dictionary";
import { submitDemandHome } from "./demand-actions";
import { fill } from "./format";

export type OfferPageState = { kind: "invalid" } | { kind: "expired" } | { kind: "ask"; need: string; sent: number };

/** The broker's side of "do you have a home for this tenant?": price, rooms, place — one form, no account. */
export function BrokerOffer({ token, state }: { token: string; state: OfferPageState }) {
  const d = useDictionary()?.agent?.offer;
  const [sent, setSent] = useState(state.kind === "ask" ? state.sent : 0);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [furnished, setFurnished] = useState<boolean | undefined>(undefined);
  const [homeType, setHomeType] = useState<"apartment" | "house" | "room" | undefined>(undefined);
  const [water, setWater] = useState<boolean | undefined>(undefined);
  const [electricity, setElectricity] = useState<boolean | undefined>(undefined);

  if (state.kind !== "ask") {
    return <p className="text-muted-foreground">{state.kind === "expired" ? d?.expired ?? "This tenant has found a home or the request has closed. Thank you." : d?.invalid ?? "This link is no longer valid."}</p>;
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 font-medium">
          <BadgeCheck className="size-5" aria-hidden />
          {d?.thanks ?? "Thank you — the tenant can see your home now."}
        </p>
        {sent < 3 && (
          <Button variant="outline" onClick={() => setDone(false)}>
            {d?.another ?? "Send another home"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        start(async () => {
          const res = await submitDemandHome(token, {
            priceMonth: Number(f.get("price")),
            bedrooms: Number(f.get("bedrooms")),
            bathrooms: f.get("bathrooms") ? Number(f.get("bathrooms")) : undefined,
            place: String(f.get("place") ?? ""),
            furnished,
            note: String(f.get("note") ?? "") || undefined,
            homeType,
            viewingFee: f.get("visitFee") ? Number(f.get("visitFee")) : undefined,
            depositMonths: f.get("deposit") ? Number(f.get("deposit")) : undefined,
            commissionPct: f.get("commission") ? Number(f.get("commission")) : undefined,
            waterIncluded: water,
            electricityIncluded: electricity,
          }).catch(() => ({ ok: false as const, error: "invalid" as const }));
          if (res.ok) {
            setSent((n) => n + 1);
            setDone(true);
            setError(null);
          } else setError(res.error === "form" ? d?.formError ?? "Please check the price, rooms and place." : res.error === "limit" ? d?.limit ?? "You have sent 3 homes for this tenant. Thank you." : d?.invalid ?? "This link is no longer valid.");
        });
      }}
    >
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">{d?.title ?? "Do you have a home for this tenant?"}</h1>
        <p className="text-muted-foreground">{fill(d?.intro ?? "A tenant on Mkan is looking for {need}.", { need: state.need })}</p>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{d?.price ?? "Rent per month (RWF)"}</span>
        <Input name="price" type="number" inputMode="numeric" min={10000} step={1000} required dir="ltr" placeholder="400000" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{d?.bedrooms ?? "Bedrooms"}</span>
          <Input name="bedrooms" type="number" inputMode="numeric" min={0} max={10} required dir="ltr" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{d?.bathrooms ?? "Bathrooms"}</span>
          <Input name="bathrooms" type="number" inputMode="numeric" min={1} max={10} dir="ltr" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{d?.place ?? "Neighbourhood"}</span>
        {/* i18n-exempt — Kigali place names read the same in every language */}
        <Input name="place" required minLength={2} maxLength={80} placeholder="Kicukiro, Niboye" />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{d?.furnished ?? "Furnished?"}</legend>
        <div className="flex gap-2">
          {[true, false].map((v) => (
            <Button key={String(v)} type="button" variant={furnished === v ? "default" : "outline"} size="sm" onClick={() => setFurnished(furnished === v ? undefined : v)}>
              {v ? d?.yes ?? "Yes" : d?.no ?? "No"}
            </Button>
          ))}
        </div>
      </fieldset>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{d?.type ?? "Type of home"}</legend>
        <div className="flex flex-wrap gap-2">
          {(["apartment", "house", "room"] as const).map((v) => (
            <Button key={v} type="button" variant={homeType === v ? "default" : "outline"} size="sm" onClick={() => setHomeType(homeType === v ? undefined : v)}>
              {d?.[v] ?? { apartment: "Apartment", house: "Self compound", room: "Room" }[v]}
            </Button>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{d?.visitFee ?? "Visit fee (RWF)"}</span>
          <Input name="visitFee" type="number" inputMode="numeric" min={0} max={100000} step={500} dir="ltr" placeholder="5000" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{d?.deposit ?? "Deposit (months)"}</span>
          <Input name="deposit" type="number" inputMode="decimal" min={0} max={12} step={0.5} dir="ltr" placeholder="1" />
        </label>
      </div>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{d?.commission ?? "Commission (% of first rent)"}</span>
        <Input name="commission" type="number" inputMode="numeric" min={0} max={100} dir="ltr" placeholder="0" />
      </label>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">{d?.included ?? "Included in the rent"}</legend>
        <div className="flex gap-2">
          {(
            [
              ["water", water, setWater],
              ["electricity", electricity, setElectricity],
            ] as const
          ).map(([key, value, set]) => (
            <Button key={key} type="button" variant={value ? "default" : "outline"} size="sm" onClick={() => set(value ? undefined : true)}>
              {d?.[key] ?? (key === "water" ? "Water" : "Electricity")}
            </Button>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5">
        <span className="text-sm font-medium">{d?.note ?? "Anything else (optional)"}</span>
        <Textarea name="note" maxLength={500} rows={3} />
      </label>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="w-full">
        {d?.send ?? "Send to the tenant"}
      </Button>
      <p className="text-xs text-muted-foreground">{d?.photos ?? "Photos: reply to our WhatsApp message with them and we'll add them."}</p>
    </form>
  );
}
