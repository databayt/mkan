"use client";

import { useRouter, useSearchParams, useParams } from "next/navigation";
import { useCallback, useMemo, useState, useEffect, useTransition } from "react";
import { BusAmenity } from "@prisma/client";
import { Check, Clock, XIcon } from "lucide-react";
import { busAmenityIcon } from "@/components/travel/amenity-icons";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog as DialogPrimitive } from "radix-ui";
import { createPortal } from "react-dom";

function FilterTriggerIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      style={{ display: "block", fill: "none", stroke: "currentColor", strokeWidth: 2.5, overflow: "visible" }}
    >
      <path
        fill="none"
        d="M7 16H3m26 0H15M29 6h-4m-8 0H3m26 20h-4M7 16a4 4 0 1 0 8 0 4 4 0 0 0-8 0zM17 6a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm0 20a4 4 0 1 0 8 0 4 4 0 0 0-8 0zm0 0H3"
      />
    </svg>
  );
}

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
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/i18n/formatters";
import { useDictionary } from "@/components/internationalization/dictionary-context";
import {
  mergeSearchParams,
  parseSearchParams,
  type SearchParamsShape,
  type SortOption,
  type TimeOfDay,
} from "./url-state";

// Fallback time-range labels (used only if the dictionary entry is missing).
const TIME_WINDOWS: { key: TimeOfDay; rangeFallback: string }[] = [
  { key: "morning", rangeFallback: "4am – 12pm" },
  { key: "afternoon", rangeFallback: "12pm – 5pm" },
  { key: "evening", rangeFallback: "5pm – 9pm" },
  { key: "night", rangeFallback: "9pm – 4am" },
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

const BAR_H = 64;

const SHEET_OPEN = {
  type: "spring" as const,
  stiffness: 420,
  damping: 38,
  mass: 1,
} as const;

const SHEET_CLOSE = { duration: 0.32, ease: [0.32, 0.72, 0, 1] } as const;

export function FiltersPanel({ facets, totalTrips, dict }: FiltersPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [sheetH, setSheetH] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Lock body scroll + allow Escape-to-close while mobile sheet is open.
  useEffect(() => {
    if (!isOpen || !isMobile) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen, isMobile]);

  const searchParams = useSearchParams();
  const current = useMemo(
    () => parseSearchParams(searchParams),
    [searchParams],
  );

  const hasPriceFilter = current.priceMin != null || current.priceMax != null;
  const hasAnyFilter =
    !!current.when ||
    hasPriceFilter ||
    (current.amenities && current.amenities.length > 0) ||
    (current.officeIds && current.officeIds.length > 0) ||
    current.sort !== undefined;

  const filterCount = useMemo(() => {
    let count = 0;
    if (current.priceMin != null || current.priceMax != null) count++;
    if (current.when != null) count++;
    if (current.amenities && current.amenities.length > 0) count += current.amenities.length;
    if (current.officeIds && current.officeIds.length > 0) count += current.officeIds.length;
    if (current.sort !== undefined) count++;
    return count;
  }, [current]);

  const router = useRouter();
  const params = useParams<{ lang: string }>();
  const lang = params?.lang === "ar" ? "ar" : "en";
  const isRTL = lang === "ar";

  const clearAll = () => {
    const qs = new URLSearchParams();
    if (current.originId) qs.set("originId", String(current.originId));
    if (current.destinationId) qs.set("destinationId", String(current.destinationId));
    if (current.origin) qs.set("origin", current.origin);
    if (current.destination) qs.set("destination", current.destination);
    if (current.date) qs.set("date", current.date);
    router.replace(`?${qs.toString()}`, { scroll: false });
  };

  const MobileTrigger = (
    <button
      type="button"
      className="relative flex shrink-0 items-center justify-center rounded-full bg-background text-sm font-medium text-foreground outline-none transition-colors"
      style={{ height: 48, width: 32, touchAction: "manipulation" }}
      onClick={() => {
        setSheetH(Math.round(window.innerHeight * 0.92));
        setIsOpen(true);
      }}
      aria-label={dict.filters.title}
    >
      <FilterTriggerIcon />
      {filterCount > 0 && (
        <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-background">
          {filterCount}
        </span>
      )}
    </button>
  );

  const DesktopTrigger = (
    <button
      type="button"
      className="relative flex shrink-0 items-center gap-2 rounded-full bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-foreground"
      style={{ height: 48, border: "1px solid #DDDDDD", borderRadius: "100px" }}
      aria-label={dict.filters.title}
    >
      <FilterTriggerIcon />
      <span>{dict.filters.title}</span>
      {filterCount > 0 && (
        <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-background">
          {filterCount}
        </span>
      )}
    </button>
  );

  if (isMobile) {
    return (
      <>
        {MobileTrigger}
        {mounted &&
          createPortal(
            <AnimatePresence>
              {isOpen && (
                <>
                  {/* Scrim */}
                  <motion.div
                    key="scrim"
                    className="fixed inset-0 z-[100] bg-black/40"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeOut" } }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    onClick={() => setIsOpen(false)}
                    aria-hidden="true"
                  />

                  {/* Top Dropdown Panel */}
                  <motion.div
                    key="panel"
                    className="fixed inset-x-0 top-0 z-[101] overflow-hidden rounded-b-[28px] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
                    initial={{ height: BAR_H, opacity: 0 }}
                    animate={{
                      height: sheetH,
                      opacity: 1,
                      transition: {
                        height: SHEET_OPEN,
                        opacity: { duration: 0.16, ease: "easeOut" },
                      },
                    }}
                    exit={{
                      height: BAR_H,
                      opacity: 0,
                      transition: {
                        height: SHEET_CLOSE,
                        opacity: { duration: 0.14, delay: 0.26, ease: "easeIn" },
                      },
                    }}
                    role="dialog"
                    aria-modal="true"
                  >
                    <motion.div
                      className="overflow-y-auto no-scrollbar"
                      style={{ height: sheetH, padding: "24px", paddingTop: "40px", paddingBottom: "104px" }}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        transition: { delay: 0.06, duration: 0.32, ease: "easeOut" },
                      }}
                      exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }}
                    >
                      <FilterControls facets={facets} dict={dict} />
                    </motion.div>

                    {/* Footer */}
                    <div
                      className="absolute inset-x-0 bottom-0 z-30 flex items-center justify-between bg-white"
                      style={{
                        padding: "16px 24px 24px",
                        borderTop: "1px solid #ebebeb",
                      }}
                    >
                      <button
                        type="button"
                        onClick={clearAll}
                        style={{
                          fontSize: 14,
                          fontWeight: 500,
                          color: hasAnyFilter ? "#222222" : "#c1c1c1",
                          textDecoration: "underline",
                          textUnderlineOffset: 2,
                        }}
                      >
                        {dict.filters.clearAll}
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsOpen(false)}
                        className="transition-colors"
                        style={{
                          height: 48,
                          padding: "0 24px",
                          borderRadius: 12,
                          backgroundColor: "#222222",
                          color: "#ffffff",
                          fontSize: 16,
                          fontWeight: 500,
                        }}
                      >
                        {dict.filters.showResults.replace(
                          "{count}",
                          String(totalTrips),
                        )}
                      </button>
                    </div>

                    {/* Bottom dismiss grabber */}
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      // i18n-exempt
                      aria-label="Close"
                      className="absolute bottom-0 left-1/2 z-40 flex h-8 w-20 -translate-x-1/2 items-end justify-center pb-2.5"
                    >
                      <span className="h-1 w-9 rounded-full bg-gray-300" />
                    </button>
                  </motion.div>
                </>
              )}
            </AnimatePresence>,
            document.body,
          )}
      </>
    );
  }

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Trigger asChild>
        {DesktopTrigger}
      </DialogPrimitive.Trigger>
      {mounted &&
        createPortal(
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay
              className="fixed inset-0 z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 bg-black/50"
              style={{ backgroundColor: "rgba(0,0,0,0.48)" }}
            />
            <DialogPrimitive.Content
              dir={isRTL ? "rtl" : "ltr"}
              aria-describedby={undefined}
              className="fixed start-[50%] top-[50%] z-[100] flex w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] rtl:translate-x-[50%] flex-col overflow-hidden bg-white duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
              style={{
                maxWidth: 568,
                maxHeight: "min(90vh, 880px)",
                borderRadius: 32,
                boxShadow: "rgba(0,0,0,0.28) 0px 8px 28px 0px",
              }}
            >
              {/* Header */}
              <div className="relative flex shrink-0 items-center justify-center" style={{ height: 64, borderBottom: `1px solid #ebebeb` }}>
                <DialogPrimitive.Title style={{ fontSize: 16, fontWeight: 600, color: "#222222" }}>
                  {dict.filters.title}
                </DialogPrimitive.Title>
                <DialogPrimitive.Close
                  // i18n-exempt
                  aria-label="Close"
                  className="absolute flex items-center justify-center rounded-full transition-colors hover:bg-gray-100 outline-none"
                  style={{ insetInlineEnd: 16, width: 32, height: 32 }}
                >
                  <XIcon size={16} style={{ color: "#222222" }} />
                </DialogPrimitive.Close>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto" style={{ padding: "24px" }}>
                <FilterControls facets={facets} dict={dict} />
              </div>

              {/* Footer */}
              <div className="border-t px-6 py-4 flex items-center justify-between bg-white" style={{ borderTop: "1px solid #ebebeb" }}>
                <button
                  type="button"
                  onClick={clearAll}
                  style={{
                    fontSize: 14,
                    fontWeight: 500,
                    color: hasAnyFilter ? "#222222" : "#c1c1c1",
                    textDecoration: "underline",
                    textUnderlineOffset: 2,
                  }}
                >
                  {dict.filters.clearAll}
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="transition-colors"
                  style={{
                    height: 48,
                    padding: "0 24px",
                    borderRadius: 12,
                    backgroundColor: "#222222",
                    color: "#ffffff",
                    fontSize: 16,
                    fontWeight: 500,
                  }}
                >
                  {dict.filters.showResults.replace(
                    "{count}",
                    String(totalTrips),
                  )}
                </button>
              </div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>,
          document.body,
        )}
    </DialogPrimitive.Root>
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
  const dictionary = useDictionary();
  const timeRanges = dictionary?.travel?.search?.timeOfDay;
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

  useEffect(() => {
    setPriceRange([
      current.priceMin ?? minBound,
      current.priceMax ?? maxBound,
    ]);
  }, [current.priceMin, current.priceMax, minBound, maxBound]);

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

  const currentSort: SortOption = current.sort ?? "departure-asc";

  return (
    <div
      className={cn("space-y-6", isPending && "opacity-70 pointer-events-none")}
    >
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
            const range =
              (tw.key === "morning"
                ? timeRanges?.morningRange
                : tw.key === "afternoon"
                  ? timeRanges?.afternoonRange
                  : tw.key === "evening"
                    ? timeRanges?.eveningRange
                    : timeRanges?.nightRange) ?? tw.rangeFallback;
            return (
              <button
                key={tw.key}
                type="button"
                onClick={() =>
                  updateUrl({ when: active ? undefined : tw.key })
                }
                className={cn(
                  "rounded-lg border px-3 py-2 text-start text-xs transition-colors",
                  active
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:border-foreground/30 hover:text-foreground",
                )}
                aria-pressed={active}
              >
                <div className="font-medium">{label}</div>
                <div className="text-[11px] opacity-70 mt-0.5">
                  {range}
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
            <span>{formatCurrency(priceRange[0], lang)}</span>
            <span>{formatCurrency(priceRange[1], lang)}</span>
          </div>
        </div>
      )}

      {/* Amenities */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">{dict.amenitiesLabel}</Label>
        <div className="space-y-2">
          {Object.values(BusAmenity).map((amenity) => {
            const Icon = busAmenityIcon(amenity);
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
