import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Bed, BedDouble, Bath } from "lucide-react";
import { getDictionary } from "@/components/internationalization/dictionaries";
import type { Locale } from "@/components/internationalization/config";

interface PageProps {
  params: Promise<{ id: string; lang: string }>;
}

interface CounterFieldProps {
  icon: React.ReactNode;
  label: string;
  hint: string;
  defaultValue: number;
  min: number;
  decreaseLabel: string;
  increaseLabel: string;
}

function CounterField({ icon, label, hint, defaultValue, min, decreaseLabel, increaseLabel }: CounterFieldProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-4 border-b last:border-b-0">
      <div className="flex items-start gap-3">
        <div className="text-muted-foreground mt-1">{icon}</div>
        <div>
          <p className="font-medium">{label}</p>
          <p className="text-sm text-muted-foreground">{hint}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="icon" aria-label={decreaseLabel}>
          –
        </Button>
        <span className="w-8 text-center font-medium">{defaultValue}</span>
        <Button type="button" variant="outline" size="icon" aria-label={increaseLabel}>
          +
        </Button>
      </div>
    </div>
  );
}

const NumberOfGuestsPage = async ({ params }: PageProps) => {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const t = dict?.listingEditor?.numberOfGuests;
  const fmt = (tpl: string | undefined, fallback: string, label: string) =>
    (tpl ?? fallback).replace("{label}", label);
  const decrease = (label: string) => fmt(t?.decreaseLabel, "Decrease {label}", label);
  const increase = (label: string) => fmt(t?.increaseLabel, "Increase {label}", label);
  const guests = t?.guests ?? "Guests";
  const bedrooms = t?.bedrooms ?? "Bedrooms";
  const beds = t?.beds ?? "Beds";
  const bathrooms = t?.bathrooms ?? "Bathrooms";

  return (
    <div className="lg:col-span-2">
      <div className="max-w-3xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">{t?.heading ?? "Capacity"}</h1>
          <p className="text-muted-foreground">
            {t?.subtitle ?? "How many guests can your place accommodate? Set the limits guests will see at search."}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-5" />
              {t?.cardTitle ?? "Guests, bedrooms, beds, and baths"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <CounterField
              icon={<Users className="size-5" />}
              label={guests}
              hint={t?.guestsHint ?? "Max overnight guests including children"}
              defaultValue={2}
              min={1}
              decreaseLabel={decrease(guests)}
              increaseLabel={increase(guests)}
            />
            <CounterField
              icon={<Bed className="size-5" />}
              label={bedrooms}
              hint={t?.bedroomsHint ?? "Separate sleeping rooms"}
              defaultValue={1}
              min={0}
              decreaseLabel={decrease(bedrooms)}
              increaseLabel={increase(bedrooms)}
            />
            <CounterField
              icon={<BedDouble className="size-5" />}
              label={beds}
              hint={t?.bedsHint ?? "All beds including sofa beds"}
              defaultValue={1}
              min={1}
              decreaseLabel={decrease(beds)}
              increaseLabel={increase(beds)}
            />
            <CounterField
              icon={<Bath className="size-5" />}
              label={bathrooms}
              hint={t?.bathroomsHint ?? "Full or shared bathrooms"}
              defaultValue={1}
              min={0}
              decreaseLabel={decrease(bathrooms)}
              increaseLabel={increase(bathrooms)}
            />
          </CardContent>
        </Card>

        <div className="mt-8 flex justify-between">
          <Button variant="outline">{dict?.common?.back ?? "Back"}</Button>
          <Button>{dict?.common?.save ?? "Save"}</Button>
        </div>
      </div>
    </div>
  );
};

export default NumberOfGuestsPage;
