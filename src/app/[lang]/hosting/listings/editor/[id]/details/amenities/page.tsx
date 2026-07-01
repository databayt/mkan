"use client";
export const dynamic = "force-dynamic";

import React from "react";
import {
  Wifi,
  WashingMachine,
  AirVent,
  Utensils,
  Router,
  Grid3x3,
  DoorOpen,
  Microwave,
  Refrigerator,
  Waves,
  Dumbbell,
  Car,
  PawPrint,
  Check,
  type LucideIcon,
} from "lucide-react";
import { Amenity } from "@prisma/client";
import { EditorSection, SaveBar } from "@/components/hosting/listing/editor-section";
import { useEditorField } from "@/components/hosting/listing/editor-controls";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import { cn } from "@/lib/utils";

const AMENITIES: { id: Amenity; optKey: string; fallback: string; Icon: LucideIcon }[] = [
  { id: Amenity.WiFi, optKey: "wifi", fallback: "WiFi", Icon: Wifi },
  { id: Amenity.HighSpeedInternet, optKey: "highSpeedInternet", fallback: "High-speed internet", Icon: Router },
  { id: Amenity.AirConditioning, optKey: "airConditioning", fallback: "Air conditioning", Icon: AirVent },
  { id: Amenity.WasherDryer, optKey: "washerDryer", fallback: "Washer & dryer", Icon: WashingMachine },
  { id: Amenity.Dishwasher, optKey: "dishwasher", fallback: "Dishwasher", Icon: Utensils },
  { id: Amenity.Microwave, optKey: "microwave", fallback: "Microwave", Icon: Microwave },
  { id: Amenity.Refrigerator, optKey: "refrigerator", fallback: "Refrigerator", Icon: Refrigerator },
  { id: Amenity.Parking, optKey: "parking", fallback: "Free parking", Icon: Car },
  { id: Amenity.Pool, optKey: "pool", fallback: "Pool", Icon: Waves },
  { id: Amenity.Gym, optKey: "gym", fallback: "Gym", Icon: Dumbbell },
  { id: Amenity.HardwoodFloors, optKey: "hardwoodFloors", fallback: "Hardwood floors", Icon: Grid3x3 },
  { id: Amenity.WalkInClosets, optKey: "walkInClosets", fallback: "Walk-in closets", Icon: DoorOpen },
  { id: Amenity.PetsAllowed, optKey: "petsAllowed", fallback: "Pets allowed", Icon: PawPrint },
];

export default function AmenitiesPage() {
  const dict = useDictionary();
  const nav = dict?.listingEditor?.nav;
  const am = dict?.listingEditor?.amenities;
  const options = (am?.options ?? {}) as Record<string, string>;
  const { value, setValue, dirty, saving, save } = useEditorField<Amenity[]>(
    (l) => (l.amenities as Amenity[]) ?? [],
    []
  );

  const toggle = (id: Amenity) =>
    setValue(value.includes(id) ? value.filter((a) => a !== id) : [...value, id]);

  return (
    <EditorSection
      title={nav?.amenities ?? "Amenities"}
      subtitle={am?.subtitle ?? "Select everything your place offers. Guests filter by these."}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {AMENITIES.map(({ id, optKey, fallback, Icon }) => {
          const selected = value.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              data-selected={selected}
              className={cn(
                "relative flex flex-col items-start gap-3 rounded-2xl border border-border p-4 text-start transition",
                "hover:border-foreground",
                "data-[selected=true]:border-foreground data-[selected=true]:ring-1 data-[selected=true]:ring-foreground"
              )}
            >
              <Icon className="size-7 text-foreground" strokeWidth={1.5} />
              <span className="text-sm font-medium leading-snug">
                {options[optKey] ?? fallback}
              </span>
              {selected ? (
                <span className="absolute end-3 top-3 flex size-5 items-center justify-center rounded-full bg-foreground text-background">
                  <Check className="size-3.5" strokeWidth={3} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        onSave={() => save({ amenities: value })}
        saveLabel={nav?.save}
        savingLabel={nav?.saving}
      />
    </EditorSection>
  );
}
