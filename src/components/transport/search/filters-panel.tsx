"use client";

import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useCallback, useMemo, useState, useTransition } from "react";
import { BusAmenity } from "@prisma/client";
import {
  Armchair,
  Check,
  Clock,
  Coffee,
  Filter,
  Luggage,
  MonitorPlay,
  Plug,
  Snowflake,
  Toilet,
  Wifi,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  mergeSearchParams,
  parseSearchParams,
  type SearchParamsShape,
  type SortOption,
  type TimeOfDay,
} from "./url-state";

const AMENITY_ICON: Record<BusAmenity, React.ComponentType<{ className?: string }>> = {
  AirConditioning: Snowflake,
  WiFi: Wifi,
  USB: Plug,
  LegRoom: Armchair,
  Toilet: Toilet,
  Refreshments: Coffee,
  Entertainment: MonitorPlay,
  Luggage: Luggage,
  Reclining: Armchair,
};

const TIME_WINDOWS: { key: TimeOfDay; rangeEn: string; rangeAr: string }[] = [
  { key: "morning", rangeEn: "4am – 12pm", rangeAr: "٤ص – ١٢ظ" },
  { key: "afternoon", rangeEn: "12pm – 5pm", rangeAr: "١٢ظ – ٥م" },
  { key: "evening", rangeEn: "5pm – 9pm", rangeAr: "٥م – ٩م" },
  { key: "night", rangeEn: "9pm – 4am", rangeAr: "٩م – ٤ص" },
];

type FacetOffice = { id: number; name: string; nameAr: string | null };

interface FiltersPanelProps {
  facets: {
    priceMin: number;
    priceMax: number;
    offices: FacetOffice[];
  };
  totalTrips: number;
  dict: {
    filters: {
      title: string;
      clearAll: string;
      showResults: string;
    };
    sort: {
      label: string;
      priceAsc: string;
      priceDesc: string;
      departureAsc: string;
      durationAsc: string;
    };
    timeOfDay: {
      label: string;
      morning: string;
      afternoon: string;
      evening: string;
      night: string;
    };
    price: {
      label: string;
      currency: string;
    };
    amenitiesLabel: string;
    officesLabel: string;
    amenities?: Partial<Record<BusAmenity, string>>;
    mobileTriggerLabel: string;
  };
}

export function FiltersPanel({ facets, totalTrips, dict }: FiltersPanelProps) {
  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block w-72 flex-shrink-0">
        <div className="sticky top-4 rounded-xl border bg-card p-5">
          <FilterControls facets={facets} dict={dict} />
        </div>
      </aside>

      {/* Mobile trigger + Sheet */}
      <div className="lg:hidden">
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
              <FilterControls facets={facets} dict={dict} />
            </ScrollArea>
            <div className="border-t px-5 py-3">
              <p className="text-sm text-muted-foreground text-center">
                {dict.filters.showResults.replace(
                  "{count}",
                  String(totalTrips),
                )}
              </p>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

function FilterControls({
  facets,
  dict,
}: Pick<FiltersPanelProps, "facets" | "dict">) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams<{ lang: string }>();
  const lang = params?.lang === "ar" ? "ar" : "en";
  const [isPending, startTransition] = useTransition();

  const current = useMemo(
    () => parseSearchParams(searchParams),
    [searchParams],
  );

  // Snap slider bounds to facets. Empty when there are no results.
  const [minBound, maxBound] = useMemo(() => {
    const lo = Math.floor(facets.priceMin || 0);
    const hi = Math.ceil(facets.priceMax || 0);
    return [lo, hi > lo ? hi : lo + 1];
  }, [facets.priceMin, facets.priceMax]);

  const [priceRange, setPriceRange] = useState<[number, number]>([
    current.priceMin ?? minBound,
    current.priceMax ?? maxBound,
  ]);

  const updateUrl = useCallback(
    (updates: Partial<SearchParamsShape>) => {
      const qs = mergeSearchParams(current, updates);
      const href = qs.toString() ? `?${qs.toString()}` : window.location.pathname;
      startTransition(() => {
        router.replace(href, { scroll: false });
      });
    },
    [current, router],
  );

  const clearAll = () => {
    setPriceRange([minBound, maxBound]);
    const qs = new URLSearchParams();
    if (current.originId) qs.set("originId", String(current.originId));
    if (current.destinationId) qs.set("destinationId", String(current.destinationId));
    if (current.origin) qs.set("origin", current.origin);
    if (current.destination) qs.set("destination", current.destination);
    if (current.date) qs.set("date", current.date);
    startTransition(() => {
      router.replace(`?${qs.toString()}`, { scroll: false });
    });
  };

  const toggleAmenity = (amenity: BusAmenity) => {
    const existing = new Set(current.amenities ?? []);
    if (existing.has(amenity)) existing.delete(amenity);
    else existing.add(amenity);
    updateUrl({ amenities: Array.from(existing) });
  };

  const toggleOffice = (id: number) => {
    const existing = new Set(current.officeIds ?? []);
    if (existing.has(id)) existing.delete(id);
    else existing.add(id);
    updateUrl({ officeIds: Array.from(existing) });
  };

  const hasPriceFilter =
    current.priceMin != null || current.priceMax != null;
  const hasAnyFilter =
    !!current.when ||
    hasPriceFilter ||
    (current.amenities && current.amenities.length > 0) ||
    (current.officeIds && current.officeIds.length > 0) ||
    current.sort !== undefined;

  const currentSort: SortOption = current.sort ?? "departure-asc";

  return (
    <div
      className={cn("space-y-6", isPending && "opacity-70 pointer-events-none")}
    >
      {/* Header */}
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

      {/* Sort */}
      <div className="space-y-2">
        <Label htmlFor="filter-sort" className="text-sm font-medium">
          {dict.sort.label}
        </Label>
        <Select
          value={currentSort}
          onValueChange={(v) =>
            updateUrl({ sort: v === "departure-asc" ? undefined : (v as SortOption) })
          }
        >
          <SelectTrigger id="filter-sort" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="departure-asc">{dict.sort.departureAsc}</SelectItem>
            <SelectItem value="price-asc">{dict.sort.priceAsc}</SelectItem>
            <SelectItem value="price-desc">{dict.sort.priceDesc}</SelectItem>
            <SelectItem value="duration-asc">{dict.sort.durationAsc}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Time of day */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <Label className="text-sm font-medium">{dict.timeOfDay.label}</Label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {TIME_WINDOWS.map((tw) => {
            const active = current.when === tw.key;
            const label =
              tw.key === "morning"
                ? dict.timeOfDay.morning
                : tw.key === "afternoon"
                  ? dict.timeOfDay.afternoon
                  : tw.key === "evening"
                    ? dict.timeOfDay.evening
                    : dict.timeOfDay.night;
            return (
              <button
                key={tw.key}
                type="button"
                onClick={() =>
                  updateUrl({ when: active ? undefined : tw.key })
                }
                className={cn(
                  "rounded-lg border px-3 py-2 text-left text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
                aria-pressed={active}
              >
                <div className="font-medium">{label}</div>
                <div className="text-[11px] opacity-70 mt-0.5">
                  {lang === "ar" ? tw.rangeAr : tw.rangeEn}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Price range */}
      {maxBound > minBound && (
        <div className="space-y-3">
          <Label className="text-sm font-medium">{dict.price.label}</Label>
          <div className="px-1">
            <Slider
              min={minBound}
              max={maxBound}
              step={Math.max(1000, Math.round((maxBound - minBound) / 100))}
              value={priceRange}
              onValueChange={(value) =>
                setPriceRange([
                  value[0] ?? minBound,
                  value[1] ?? maxBound,
                ])
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
              {priceRange[0].toLocaleString()} {dict.price.currency}
            </span>
            <span>
              {priceRange[1].toLocaleString()} {dict.price.currency}
            </span>
          </div>
        </div>
      )}

      {/* Amenities */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{dict.amenitiesLabel}</Label>
        <div className="space-y-2">
          {Object.values(BusAmenity).map((amenity) => {
            const Icon = AMENITY_ICON[amenity];
            const checked = current.amenities?.includes(amenity) ?? false;
            const label = dict.amenities?.[amenity] ?? amenity;
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

      {/* Operators */}
      {facets.offices.length > 1 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">{dict.officesLabel}</Label>
          <div className="space-y-2 max-h-64 overflow-y-auto pe-1">
            {facets.offices.map((office) => {
              const checked = current.officeIds?.includes(office.id) ?? false;
              const label =
                lang === "ar" && office.nameAr ? office.nameAr : office.name;
              return (
                <label
                  key={office.id}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-muted cursor-pointer"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleOffice(office.id)}
                  />
                  <span className="text-sm truncate">{label}</span>
                  {checked && <Check className="h-3.5 w-3.5 ms-auto text-primary" />}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
