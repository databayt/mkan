"use client"

import React, { useEffect, useRef, useState } from "react"
import { SlidersHorizontal } from "lucide-react"
import { PropertyType, Amenity } from "@prisma/client"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import { useSearch, EMPTY_FILTERS, type FilterState } from "./search-provider"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { useLocale } from "@/components/internationalization/use-locale"
import { searchListings } from "@/lib/actions/search-actions"
import { formatNumber } from "@/lib/i18n/formatters"

const MAX_PRICE = 1000
const PROPERTY_TYPES: PropertyType[] = [
  "Apartment", "Villa", "Townhouse", "Cottage", "Tinyhouse", "Rooms",
]
const AMENITIES: Amenity[] = [
  "WiFi", "AirConditioning", "Pool", "Gym", "Parking", "PetsAllowed",
  "WasherDryer", "Dishwasher", "Refrigerator", "Microwave",
  "HighSpeedInternet", "HardwoodFloors", "WalkInClosets",
]
const ROOM_OPTIONS = [1, 2, 3, 4, 5] // rendered after "Any"; 5 means "5+"

const T = {
  en: {
    filters: "Filters", title: "Filters", propertyType: "Property type",
    priceRange: "Price range", priceHint: "Nightly prices before fees",
    bedrooms: "Bedrooms", bathrooms: "Bathrooms", amenities: "Amenities",
    any: "Any", clearAll: "Clear all", show: "Show", places: "places", place: "place",
  },
  ar: {
    filters: "التصفية", title: "عوامل التصفية", propertyType: "نوع العقار",
    priceRange: "نطاق السعر", priceHint: "الأسعار الليلية قبل الرسوم",
    bedrooms: "غرف النوم", bathrooms: "الحمامات", amenities: "وسائل الراحة",
    any: "الكل", clearAll: "مسح الكل", show: "عرض", places: "أماكن", place: "مكان",
  },
} as const

function Pill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-2 text-sm transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border text-foreground hover:border-foreground"
      )}
    >
      {children}
    </button>
  )
}

function RoomRow({
  value, onChange, anyLabel,
}: { value: number | undefined; onChange: (v: number | undefined) => void; anyLabel: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Pill active={value === undefined} onClick={() => onChange(undefined)}>{anyLabel}</Pill>
      {ROOM_OPTIONS.map((n) => (
        <Pill key={n} active={value === n} onClick={() => onChange(n)}>
          {n}{n === 5 ? "+" : ""}
        </Pill>
      ))}
    </div>
  )
}

export function SearchFilters() {
  const { filters, applyFilters, clearFilters, getBounds, baseFilters, filterCount } = useSearch()
  const dict = useDictionary()
  const { locale } = useLocale()
  const t = T[locale] ?? T.en
  const typeLabels = (dict.rental?.property?.types ?? {}) as Record<string, string>
  const amenityLabels = (dict.rental?.property?.amenities ?? {}) as Record<string, string>

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterState>(filters)
  const [preview, setPreview] = useState<number | null>(null)
  const reqRef = useRef(0)

  // Reset the draft from the live filters each time the dialog opens.
  useEffect(() => {
    if (open) {
      setDraft(filters)
      setPreview(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Debounced live count for the "Show N places" button.
  useEffect(() => {
    if (!open) return
    const handle = setTimeout(async () => {
      const id = ++reqRef.current
      const bounds = getBounds()
      const { location, ...datesGuests } = baseFilters
      const res = await searchListings({
        ...(bounds ? datesGuests : baseFilters),
        priceMin: draft.priceMin,
        priceMax: draft.priceMax,
        beds: draft.beds,
        baths: draft.baths,
        propertyType: draft.propertyType,
        amenities: draft.amenities.length ? draft.amenities : undefined,
        ...(bounds ?? {}),
        take: 1,
      })
      if (id !== reqRef.current) return
      setPreview(res.success ? res.total ?? res.data.length : null)
    }, 300)
    return () => clearTimeout(handle)
  }, [open, draft, getBounds, baseFilters])

  const price: [number, number] = [draft.priceMin ?? 0, draft.priceMax ?? MAX_PRICE]
  const setPrice = (vals: number[]) => {
    const lo = vals[0] ?? 0
    const hi = vals[1] ?? MAX_PRICE
    setDraft((d) => ({
      ...d,
      priceMin: lo > 0 ? lo : undefined,
      priceMax: hi < MAX_PRICE ? hi : undefined,
    }))
  }

  const toggleAmenity = (a: Amenity) =>
    setDraft((d) => ({
      ...d,
      amenities: d.amenities.includes(a)
        ? d.amenities.filter((x) => x !== a)
        : [...d.amenities, a],
    }))

  const showLabel =
    preview === null
      ? `${t.show} ${t.places}`
      : `${t.show} ${formatNumber(preview, locale)} ${preview === 1 ? t.place : t.places}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="relative flex h-12 shrink-0 items-center gap-2 rounded-full border border-border bg-background px-4 text-sm font-medium text-foreground shadow-sm transition-colors hover:border-foreground"
          aria-label={t.filters}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span className="hidden sm:inline">{t.filters}</span>
          {filterCount > 0 && (
            <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-background">
              {formatNumber(filterCount, locale)}
            </span>
          )}
        </button>
      </DialogTrigger>

      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle className="text-center text-base font-semibold">{t.title}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto px-6 py-6">
          {/* Property type */}
          <section>
            <h3 className="mb-4 text-lg font-semibold">{t.propertyType}</h3>
            <div className="flex flex-wrap gap-2">
              {PROPERTY_TYPES.map((pt) => (
                <Pill
                  key={pt}
                  active={draft.propertyType === pt}
                  onClick={() =>
                    setDraft((d) => ({ ...d, propertyType: d.propertyType === pt ? undefined : pt }))
                  }
                >
                  {typeLabels[pt] ?? pt}
                </Pill>
              ))}
            </div>
          </section>

          <hr className="my-6 border-border" />

          {/* Price range */}
          <section>
            <h3 className="text-lg font-semibold">{t.priceRange}</h3>
            <p className="mb-5 text-sm text-muted-foreground">{t.priceHint}</p>
            <Slider
              value={price}
              min={0}
              max={MAX_PRICE}
              step={10}
              onValueChange={setPrice}
            />
            <div className="mt-4 flex items-center justify-between text-sm text-foreground">
              <span className="rounded-lg border border-border px-3 py-2">
                ${formatNumber(price[0], locale)}
              </span>
              <span className="rounded-lg border border-border px-3 py-2">
                ${formatNumber(price[1], locale)}{price[1] >= MAX_PRICE ? "+" : ""}
              </span>
            </div>
          </section>

          <hr className="my-6 border-border" />

          {/* Rooms and beds */}
          <section className="space-y-5">
            <div>
              <h3 className="mb-3 text-lg font-semibold">{t.bedrooms}</h3>
              <RoomRow value={draft.beds} onChange={(v) => setDraft((d) => ({ ...d, beds: v }))} anyLabel={t.any} />
            </div>
            <div>
              <h3 className="mb-3 text-lg font-semibold">{t.bathrooms}</h3>
              <RoomRow value={draft.baths} onChange={(v) => setDraft((d) => ({ ...d, baths: v }))} anyLabel={t.any} />
            </div>
          </section>

          <hr className="my-6 border-border" />

          {/* Amenities */}
          <section>
            <h3 className="mb-4 text-lg font-semibold">{t.amenities}</h3>
            <div className="flex flex-wrap gap-2">
              {AMENITIES.map((a) => (
                <Pill key={a} active={draft.amenities.includes(a)} onClick={() => toggleAmenity(a)}>
                  {amenityLabels[a] ?? a}
                </Pill>
              ))}
            </div>
          </section>
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={() => setDraft(EMPTY_FILTERS)}
            className="text-sm font-semibold text-foreground underline underline-offset-2"
          >
            {t.clearAll}
          </button>
          <DialogClose asChild>
            <button
              type="button"
              onClick={() => applyFilters(draft)}
              className="rounded-lg px-6 py-3 text-sm font-semibold text-white transition-colors"
              style={{ backgroundColor: "#222222" }}
            >
              {showLabel}
            </button>
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  )
}
