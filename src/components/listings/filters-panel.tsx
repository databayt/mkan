"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { Amenity, PropertyType } from "@prisma/client";
import {
  Bath,
  BedDouble,
  Building2,
  Car,
  Dumbbell,
  Filter,
  Home,
  PawPrint,
  Refrigerator,
  ShowerHead,
  Snowflake,
  Sparkles,
  TreePine,
  Waves,
  Wifi,
  WashingMachine,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import {
  mergeListingsParams,
  parseListingsParams,
  type ListingsFilterShape,
} from "./url-state";

const PROPERTY_TYPES: { value: PropertyType; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: PropertyType.Apartment, icon: Building2 },
  { value: PropertyType.Villa, icon: Home },
  { value: PropertyType.Townhouse, icon: Home },
  { value: PropertyType.Cottage, icon: TreePine },
  { value: PropertyType.Rooms, icon: BedDouble },
  { value: PropertyType.Tinyhouse, icon: Home },
];

const AMENITY_ICON: Record<Amenity, React.ComponentType<{ className?: string }>> = {
  AirConditioning: Snowflake,
  WiFi: Wifi,
  Parking: Car,
  WasherDryer: WashingMachine,
  Dishwasher: Sparkles,
  HighSpeedInternet: Wifi,
  HardwoodFloors: Home,
  WalkInClosets: Home,
  Microwave: Refrigerator,
  Refrigerator: Refrigerator,
  Pool: Waves,
  Gym: Dumbbell,
  PetsAllowed: PawPrint,
};

interface FiltersPanelProps {
  priceBounds: { min: number; max: number };
  totalListings: number;
  dict: {
    filters: { title: string; clearAll: string; showResults: string };
    price: { label: string; currency: string };
    bedrooms: string;
    bathrooms: string;
    propertyType: string;
    amenitiesLabel: string;
    anyLabel: string;
    mobileTriggerLabel: string;
    propertyTypes?: Partial<Record<PropertyType, string>>;
    amenityLabels?: Partial<Record<Amenity, string>>;
  };
}

export function ListingsFiltersPanel({ priceBounds, totalListings, dict }: FiltersPanelProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0">
        <div className="sticky top-28 rounded-xl border bg-card p-5">
          <FilterControls priceBounds={priceBounds} dict={dict} />
        </div>
      </aside>

      {/* Mobile trigger + Sheet */}
      <div className="lg:hidden mb-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 me-2" />
              {dict.mobileTriggerLabel}
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] p-0 flex flex-col">
            <SheetHeader className="border-b px-5 py-4">
              <SheetTitle>{dict.filters.title}</SheetTitle>
              <SheetDescription className="sr-only">
                {dict.filters.title}
              </SheetDescription>
            </SheetHeader>
            <ScrollArea className="flex-1 px-5 py-4">
              <FilterControls priceBounds={priceBounds} dict={dict} />
            </ScrollArea>
            <div className="border-t px-5 py-3">
              <p className="text-sm text-muted-foreground text-center">
                {dict.filters.showResults.replace("{count}", String(totalListings))}
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function FilterControls({
  priceBounds,
  dict,
}: Pick<FiltersPanelProps, "priceBounds" | "dict">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const current = useMemo(() => parseListingsParams(searchParams), [searchParams]);

  const [minBound, maxBound] = useMemo(() => {
    const lo = Math.floor(priceBounds.min || 0);
    const hi = Math.ceil(priceBounds.max || 0);
    return [lo, hi > lo ? hi : lo + 1];
  }, [priceBounds.min, priceBounds.max]);

  const [priceRange, setPriceRange] = useState<[number, number]>([
    current.priceMin ?? minBound,
    current.priceMax ?? maxBound,
  ]);

  const updateUrl = useCallback(
    (updates: Partial<ListingsFilterShape>) => {
      const qs = mergeListingsParams(current, updates);
      const href = qs.toString() ? `?${qs.toString()}` : window.location.pathname;
      startTransition(() => router.replace(href, { scroll: false }));
    },
    [current, router],
  );

  const clearAll = () => {
    setPriceRange([minBound, maxBound]);
    const qs = new URLSearchParams();
    // Preserve search essentials (location/dates/guests); drop everything else.
    if (current.location) qs.set("location", current.location);
    if (current.checkIn) qs.set("checkIn", current.checkIn);
    if (current.checkOut) qs.set("checkOut", current.checkOut);
    if (current.guests) qs.set("guests", String(current.guests));
    startTransition(() => {
      router.replace(qs.toString() ? `?${qs.toString()}` : window.location.pathname, {
        scroll: false,
      });
    });
  };

  const toggleAmenity = (amenity: Amenity) => {
    const existing = new Set(current.amenities ?? []);
    if (existing.has(amenity)) existing.delete(amenity);
    else existing.add(amenity);
    updateUrl({ amenities: Array.from(existing) });
  };

  const setPropertyType = (type: PropertyType | undefined) => {
    updateUrl({ propertyType: type });
  };

  const setBedroomCount = (count: number | undefined) => {
    updateUrl({ beds: count });
  };

  const setBathroomCount = (count: number | undefined) => {
    updateUrl({ baths: count });
  };

  const hasAnyFilter =
    current.priceMin != null ||
    current.priceMax != null ||
    (current.beds != null && current.beds > 0) ||
    (current.baths != null && current.baths > 0) ||
    current.propertyType !== undefined ||
    (current.amenities && current.amenities.length > 0);

  return (
    <div className={cn("space-y-6", isPending && "opacity-70 pointer-events-none")}>
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">{dict.filters.title}</h3>
        {hasAnyFilter && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline"
          >
            {dict.filters.clearAll}
          </button>
        )}
      </div>

      {/* Price range */}
      {maxBound > minBound && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">{dict.price.label}</Label>
          <div className="px-1">
            <Slider
              min={minBound}
              max={maxBound}
              step={Math.max(1, Math.round((maxBound - minBound) / 100))}
              value={priceRange}
              onValueChange={(value) =>
                setPriceRange([value[0] ?? minBound, value[1] ?? maxBound])
              }
              onValueCommit={(value) => {
                const [lo, hi] = [value[0] ?? minBound, value[1] ?? maxBound];
                updateUrl({
                  priceMin: lo === minBound ? undefined : lo,
                  priceMax: hi === maxBound ? undefined : hi,
                });
              }}
            />
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>
              {dict.price.currency} {priceRange[0].toLocaleString()}
            </span>
            <span>
              {dict.price.currency} {priceRange[1].toLocaleString()}
            </span>
          </div>
        </div>
      )}

      {/* Property type */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{dict.propertyType}</Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setPropertyType(undefined)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
              !current.propertyType
                ? "border-primary bg-primary/5 text-foreground"
                : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
            aria-pressed={!current.propertyType}
          >
            <div className="font-medium">{dict.anyLabel}</div>
          </button>
          {PROPERTY_TYPES.map(({ value, icon: Icon }) => {
            const active = current.propertyType === value;
            const label = dict.propertyTypes?.[value] ?? value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => setPropertyType(active ? undefined : value)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-xs transition-colors flex items-center gap-2",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
                aria-pressed={active}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bedrooms */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BedDouble className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">{dict.bedrooms}</Label>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((n) => {
            const active = (current.beds ?? 0) === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setBedroomCount(n === 0 ? undefined : n)}
                className={cn(
                  "rounded-md border px-0 py-1.5 text-center text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30",
                )}
                aria-pressed={active}
              >
                {n === 0 ? dict.anyLabel : n === 5 ? "5+" : n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Bathrooms */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Bath className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">{dict.bathrooms}</Label>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {[0, 1, 2, 3, 4, 5].map((n) => {
            const active = (current.baths ?? 0) === n;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setBathroomCount(n === 0 ? undefined : n)}
                className={cn(
                  "rounded-md border px-0 py-1.5 text-center text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30",
                )}
                aria-pressed={active}
              >
                {n === 0 ? dict.anyLabel : n === 5 ? "5+" : n}
              </button>
            );
          })}
        </div>
      </div>

      {/* Amenities */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{dict.amenitiesLabel}</Label>
        <div className="space-y-2 max-h-56 overflow-y-auto pe-1">
          {Object.values(Amenity).map((amenity) => {
            const Icon = AMENITY_ICON[amenity] ?? ShowerHead;
            const checked = current.amenities?.includes(amenity) ?? false;
            const label = dict.amenityLabels?.[amenity] ?? amenity;
            return (
              <label
                key={amenity}
                className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleAmenity(amenity)}
                />
                <Icon className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">{label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
