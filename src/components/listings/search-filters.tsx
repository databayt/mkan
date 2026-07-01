"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { SlidersHorizontal, X, Minus, Plus, ChevronDown } from "lucide-react"
import { motion, AnimatePresence, LayoutGroup } from "framer-motion"
import { PropertyType, Amenity } from "@prisma/client"
import { Slider } from "@/components/ui/slider"
import { FilterIcon, type FilterIconName } from "./filter-icons"
import { PropertyTypeIcon } from "@/components/host/property-type-icons"
import { useSearch, EMPTY_FILTERS, type FilterState } from "./search-provider"
import { useLocale } from "@/components/internationalization/use-locale"
import { searchListings } from "@/lib/actions/search-actions"
import { formatNumber } from "@/lib/i18n/formatters"

// ---------------------------------------------------------------------------
// A pixel-faithful clone of Airbnb's search "Filters" dialog
// (airbnb.com/s/homes → Filters). Structure + measurements captured live and
// adapted to Mkan's real data model: every control here is backed by a real
// Listing column, so the live "Show N places" count and the results both
// respond. Sections with no Mkan backing (Accessibility, Host language) are
// intentionally omitted rather than faked.
//
// Colors/sizes are inline (not arbitrary Tailwind) because brand-new arbitrary
// utilities silently fail under Turbopack dev HMR in this project.
// ---------------------------------------------------------------------------

const C = {
  text: "#222222",
  sub: "#6a6a6a",
  border: "#dddddd",
  borderStrong: "#b0b0b0",
  muted: "#c1c1c1",
  pink: "#FF385C",
  selBg: "rgba(34,34,34,0.04)",
} as const

const sectionTitle: React.CSSProperties = {
  fontSize: 18,
  fontWeight: 500,
  lineHeight: "24px",
  color: C.text,
}

// Structure axis. "Type of place" (room vs. entire-home) and "Property type"
// (specific structures) both write to this one set — Mkan has a single
// propertyType column, unlike Airbnb's two independent axes.
const ALL_TYPES: PropertyType[] = [
  "Apartment", "Villa", "Townhouse", "Cottage", "Tinyhouse", "Rooms",
]
const ENTIRE_TYPES: PropertyType[] = ALL_TYPES.filter((t) => t !== "Rooms")

// Structure → an authentic Airbnb property-type icon id (rendered via the
// repo's PropertyTypeIcon, which has a graceful lucide fallback).
const TYPE_META: Record<PropertyType, { id: string; en: string; ar: string }> = {
  Apartment: { id: "apartment", en: "Apartment", ar: "شقة" },
  Villa: { id: "house", en: "Villa", ar: "فيلا" },
  Townhouse: { id: "house", en: "Townhouse", ar: "تاون هاوس" },
  Cottage: { id: "cabin", en: "Cottage", ar: "كوخ ريفي" },
  Tinyhouse: { id: "tiny-home", en: "Tiny house", ar: "منزل صغير" },
  Rooms: { id: "house", en: "Room", ar: "غرفة" },
}

// Each amenity → an authentic Airbnb interface glyph (see filter-icons.tsx).
const AMENITY_META: Record<Amenity, { icon: FilterIconName; en: string; ar: string }> = {
  AirConditioning: { icon: "airConditioning", en: "Air conditioning", ar: "تكييف" },
  WiFi: { icon: "wifi", en: "Wifi", ar: "واي فاي" },
  Parking: { icon: "parking", en: "Free parking", ar: "موقف مجاني" },
  Pool: { icon: "pool", en: "Pool", ar: "مسبح" },
  WasherDryer: { icon: "washer", en: "Washer", ar: "غسالة" },
  Dishwasher: { icon: "kitchen", en: "Dishwasher", ar: "غسالة صحون" },
  Refrigerator: { icon: "kitchen", en: "Refrigerator", ar: "ثلاجة" },
  Microwave: { icon: "kitchen", en: "Microwave", ar: "ميكروويف" },
  Gym: { icon: "gym", en: "Gym", ar: "صالة رياضية" },
  HighSpeedInternet: { icon: "wifi", en: "High-speed internet", ar: "إنترنت عالي السرعة" },
  HardwoodFloors: { icon: "kitchen", en: "Hardwood floors", ar: "أرضيات خشبية" },
  WalkInClosets: { icon: "kitchen", en: "Walk-in closet", ar: "خزانة ملابس" },
  PetsAllowed: { icon: "pets", en: "Pets allowed", ar: "يسمح بالحيوانات" },
}

// First-shown amenities (all backed by seed data) then the "Show more" tail.
const AMENITY_PRIMARY: Amenity[] = [
  "AirConditioning", "WiFi", "Parking", "Pool", "WasherDryer", "Dishwasher",
]
const AMENITY_MORE: Amenity[] = ["Refrigerator", "Gym", "HighSpeedInternet"]
// "Recommended for you" quick cards.
const RECOMMENDED: Amenity[] = ["AirConditioning", "Parking", "WiFi", "WasherDryer"]

const STEPPER_MAX = 8
const BAR_H = 64
const SPRING = {
  type: "spring" as const,
  stiffness: 280,
  damping: 34,
  mass: 1,
} as const

const T = {
  en: {
    filters: "Filters",
    recommended: "Recommended for you",
    typeOfPlace: "Type of place",
    anyType: "Any type", room: "Room", entireHome: "Entire home",
    priceRange: "Price range", priceHint: "Trip price, includes all fees",
    minimum: "Minimum", maximum: "Maximum", currency: "SDG",
    roomsAndBeds: "Rooms and beds", bedrooms: "Bedrooms", bathrooms: "Bathrooms", any: "Any",
    amenities: "Amenities", showMore: "Show more", showLess: "Show less",
    bookingOptions: "Booking options", instantBook: "Instant Book", allowsPets: "Allows pets",
    propertyType: "Property type",
    clearAll: "Clear all", show: "Show", places: "places", place: "place", close: "Close",
  },
  ar: {
    filters: "عوامل التصفية",
    recommended: "موصى به لك",
    typeOfPlace: "نوع المكان",
    anyType: "أي نوع", room: "غرفة", entireHome: "منزل كامل",
    priceRange: "نطاق السعر", priceHint: "سعر الرحلة، شامل جميع الرسوم",
    minimum: "الحد الأدنى", maximum: "الحد الأقصى", currency: "ج.س",
    roomsAndBeds: "الغرف والأسرّة", bedrooms: "غرف النوم", bathrooms: "الحمامات", any: "الكل",
    amenities: "وسائل الراحة", showMore: "عرض المزيد", showLess: "عرض أقل",
    bookingOptions: "خيارات الحجز", instantBook: "الحجز الفوري", allowsPets: "يسمح بالحيوانات الأليفة",
    propertyType: "نوع العقار",
    clearAll: "مسح الكل", show: "عرض", places: "أماكن", place: "مكان", close: "إغلاق",
  },
} as const

// ---------------------------------------------------------------------------
// Module-scope leaf components
// ---------------------------------------------------------------------------

function Divider() {
  return <hr style={{ border: "none", borderTop: `1px solid ${C.border}`, margin: "28px 0" }} />
}

/** Airbnb amenity / booking pill: icon + label, rounded-full, dark-ring when active. */
function Pill({
  active, onClick, icon, children,
}: {
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="inline-flex items-center whitespace-nowrap transition-colors"
      style={{
        height: 48,
        gap: 8,
        padding: "0 16px",
        borderRadius: 28,
        fontSize: 14,
        color: C.text,
        backgroundColor: active ? C.selBg : "#ffffff",
        border: `1px solid ${active ? C.text : C.border}`,
        boxShadow: active ? `inset 0 0 0 1px ${C.text}` : "none",
      }}
    >
      <span className="inline-flex shrink-0" style={{ color: C.text }}>{icon}</span>
      {children}
    </button>
  )
}

function RoundBtn({
  disabled, onClick, ariaLabel, children,
}: {
  disabled: boolean
  onClick: () => void
  ariaLabel: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex items-center justify-center rounded-full transition-colors"
      style={{
        width: 32,
        height: 32,
        border: `1px solid ${disabled ? C.border : C.borderStrong}`,
        color: disabled ? C.border : C.text,
        backgroundColor: "#ffffff",
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {children}
    </button>
  )
}

function Stepper({
  label, value, onChange,
}: {
  label: string
  value: number | undefined // undefined == "Any"
  onChange: (v: number | undefined) => void
}) {
  const anyLabel = useAnyLabel()
  const display = value === undefined ? anyLabel : value >= STEPPER_MAX ? `${STEPPER_MAX}+` : String(value)
  return (
    <div className="flex items-center justify-between" style={{ padding: "12px 0" }}>
      <span style={{ fontSize: 16, color: C.text }}>{label}</span>
      <div className="flex items-center" style={{ gap: 12 }}>
        <RoundBtn
          disabled={value === undefined}
          ariaLabel={`decrease ${label}`}
          onClick={() => onChange(value === undefined ? undefined : value <= 1 ? undefined : value - 1)}
        >
          <Minus size={16} />
        </RoundBtn>
        <span style={{ fontSize: 16, color: C.text, minWidth: 44, textAlign: "center" }}>{display}</span>
        <RoundBtn
          disabled={value !== undefined && value >= STEPPER_MAX}
          ariaLabel={`increase ${label}`}
          onClick={() => onChange(value === undefined ? 1 : Math.min(STEPPER_MAX, value + 1))}
        >
          <Plus size={16} />
        </RoundBtn>
      </div>
    </div>
  )
}

// `useAnyLabel` lets the module-scope Stepper read the locale-aware "Any".
const AnyLabelContext = React.createContext("Any")
function useAnyLabel() {
  return React.useContext(AnyLabelContext)
}

function PriceBox({
  label, currency, value, plus, onChange,
}: {
  label: string
  currency: string
  value: number
  plus: boolean
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col" style={{ gap: 6, flex: 1, maxWidth: 200 }}>
      <span style={{ fontSize: 12, fontWeight: 500, color: C.sub, textAlign: "center" }}>{label}</span>
      <div
        className="flex items-center justify-center"
        style={{ height: 56, padding: "0 16px", gap: 4, border: `1px solid ${C.borderStrong}`, borderRadius: 32 }}
      >
        <span style={{ fontSize: 14, color: C.text }}>{currency}</span>
        <input
          type="text"
          inputMode="numeric"
          value={formatNumberPlain(value)}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, "")
            onChange(digits ? parseInt(digits, 10) : 0)
          }}
          aria-label={label}
          style={{
            width: 64,
            textAlign: "center",
            fontSize: 14,
            color: C.text,
            border: "none",
            outline: "none",
            background: "transparent",
          }}
        />
        {plus && <span style={{ fontSize: 14, color: C.text }}>+</span>}
      </div>
    </div>
  )
}

function formatNumberPlain(n: number): string {
  return new Intl.NumberFormat("en-US").format(n)
}

// ---------------------------------------------------------------------------
// Main dialog
// ---------------------------------------------------------------------------

export function SearchFilters() {
  const { filters, applyFilters, getBounds, baseFilters, filterCount, listings } = useSearch()
  const { locale, isRTL } = useLocale()
  const isAr = locale === "ar"
  const t = T[locale] ?? T.en

  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<FilterState>(filters)
  const [preview, setPreview] = useState<number | null>(null)
  const [amenExpanded, setAmenExpanded] = useState(false)
  const [typeOpen, setTypeOpen] = useState(false)
  const [sheetH, setSheetH] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  const reqRef = useRef(0)

  // Track responsive state
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768)
    }
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  // Reset the draft from the live filters each time the dialog opens.
  useEffect(() => {
    if (open) {
      setDraft(filters)
      setPreview(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Lock body scroll + allow Escape-to-close while mobile sheet is open.
  useEffect(() => {
    if (!open || !isMobile) return
    document.body.style.overflow = "hidden"
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKey)
    return () => {
      document.body.style.overflow = ""
      document.removeEventListener("keydown", onKey)
    }
  }, [open, isMobile])

  // Histogram + slider ceiling derived from the loaded results (real prices).
  const ceil = useMemo(() => {
    const prices = listings.map((l) => l.pricePerNight ?? 0).filter((p) => p > 0)
    const maxP = prices.length ? Math.max(...prices) : 500
    return Math.min(5000, Math.max(200, Math.ceil(maxP / 50) * 50))
  }, [listings])
  const step = ceil <= 600 ? 5 : 10
  const bins = useMemo(() => {
    const N = 30
    const prices = listings.map((l) => l.pricePerNight ?? 0).filter((p) => p > 0)
    const arr = new Array(N).fill(0)
    if (prices.length >= 8) {
      for (const p of prices) {
        const i = Math.min(N - 1, Math.floor((p / ceil) * N))
        arr[i]++
      }
      const mx = Math.max(...arr, 1)
      return arr.map((v) => v / mx)
    }
    // Representative right-skewed shape when there isn't enough real data.
    return Array.from({ length: N }, (_, i) => {
      const x = i / (N - 1)
      return Math.max(0.08, Math.exp(-Math.pow((x - 0.32) * 3, 2)))
    })
  }, [listings, ceil])

  // Debounced live "Show N places" count.
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
        propertyTypes: draft.propertyTypes.length ? draft.propertyTypes : undefined,
        amenities: draft.amenities.length ? draft.amenities : undefined,
        instantBook: draft.instantBook || undefined,
        petsAllowed: draft.petsAllowed || undefined,
        ...(bounds ?? {}),
        take: 1,
      })
      if (id !== reqRef.current) return
      setPreview(res.success ? res.total ?? res.data.length : null)
    }, 300)
    return () => clearTimeout(handle)
  }, [open, draft, getBounds, baseFilters])

  const lo = draft.priceMin ?? 0
  const hi = draft.priceMax ?? ceil
  const setPrice = (vals: number[]) => {
    const a = vals[0] ?? 0
    const b = vals[1] ?? ceil
    setDraft((d) => ({
      ...d,
      priceMin: a > 0 ? a : undefined,
      priceMax: b < ceil ? b : undefined,
    }))
  }

  const toggleAmenity = (a: Amenity) =>
    setDraft((d) => ({
      ...d,
      amenities: d.amenities.includes(a) ? d.amenities.filter((x) => x !== a) : [...d.amenities, a],
    }))

  const toggleType = (pt: PropertyType) =>
    setDraft((d) => ({
      ...d,
      propertyTypes: d.propertyTypes.includes(pt)
        ? d.propertyTypes.filter((x) => x !== pt)
        : [...d.propertyTypes, pt],
    }))

  const kind: "any" | "room" | "entire" | "custom" = (() => {
    const ts = draft.propertyTypes
    if (ts.length === 0) return "any"
    if (ts.length === 1 && ts[0] === "Rooms") return "room"
    if (ts.length === ENTIRE_TYPES.length && ENTIRE_TYPES.every((x) => ts.includes(x))) return "entire"
    return "custom"
  })()
  const setPlace = (k: "any" | "room" | "entire") =>
    setDraft((d) => ({
      ...d,
      propertyTypes: k === "any" ? [] : k === "room" ? ["Rooms"] : [...ENTIRE_TYPES],
    }))

  const placeOptions: { key: "any" | "room" | "entire"; label: string }[] = [
    { key: "any", label: t.anyType },
    { key: "room", label: t.room },
    { key: "entire", label: t.entireHome },
  ]

  const hasDraft =
    draft.priceMin !== undefined || draft.priceMax !== undefined ||
    draft.beds !== undefined || draft.baths !== undefined ||
    draft.propertyTypes.length > 0 || draft.amenities.length > 0 ||
    !!draft.instantBook || !!draft.petsAllowed

  const showLabel =
    preview === null
      ? `${t.show} ${t.places}`
      : `${t.show} ${formatNumber(preview, locale)} ${preview === 1 ? t.place : t.places}`

  const amenityList = amenExpanded ? [...AMENITY_PRIMARY, ...AMENITY_MORE] : AMENITY_PRIMARY

  if (isMobile) {
    return (
      <LayoutGroup>
        <style>{`
          .ab-price-slider [data-slot=slider-track]{height:2px;background:${C.border};}
          .ab-price-slider [data-slot=slider-range]{background:${C.text};}
          .ab-price-slider [data-slot=slider-thumb]{width:28px;height:28px;background:#fff;border:1px solid ${C.border};box-shadow:0 1px 4px rgba(0,0,0,.18),0 4px 12px rgba(0,0,0,.12);}
          .ab-price-slider [data-slot=slider-thumb]:hover{box-shadow:0 2px 6px rgba(0,0,0,.24),0 6px 16px rgba(0,0,0,.16);}
        `}</style>

        <button
          type="button"
          className="relative flex shrink-0 items-center justify-center rounded-full bg-background text-sm font-medium text-foreground transition-colors hover:border-foreground"
          style={{ height: 40, width: 40, border: `1px solid ${C.border}` }}
          onClick={() => {
            setSheetH(Math.round(window.innerHeight * 0.85))
            setOpen(true)
          }}
          aria-label={t.filters}
        >
          <SlidersHorizontal className="h-4 w-4" />
          {filterCount > 0 && (
            <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-background">
              {formatNumber(filterCount, locale)}
            </span>
          )}
        </button>

        <AnimatePresence>
          {open && (
            <React.Fragment>
              {/* Scrim */}
              <motion.div
                key="scrim"
                className="fixed inset-0 z-[60] bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: "easeOut" }}
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />

              {/* Panel — anchored to the top, springs from BAR_H down to 85vh. */}
              <motion.div
                key="panel"
                className="fixed inset-x-0 top-0 z-[61] overflow-hidden rounded-b-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)] flex flex-col"
                initial={{ height: BAR_H }}
                animate={{ height: sheetH }}
                exit={{ height: BAR_H }}
                transition={SPRING}
                role="dialog"
                aria-modal="true"
              >
                {/* Header */}
                <div className="relative flex shrink-0 items-center justify-center border-b" style={{ height: 64, borderColor: "#ebebeb" }}>
                  <span style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
                    {t.filters}
                  </span>
                </div>

                {/* Body */}
                <AnyLabelContext.Provider value={t.any}>
                  <div className="flex-1 overflow-y-auto no-scrollbar" style={{ padding: "24px", paddingBottom: "120px" }}>
                    {/* Recommended for you */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.recommended}</h2>
                      <div className="grid grid-cols-4" style={{ gap: 12 }}>
                        {RECOMMENDED.map((a) => {
                          const meta = AMENITY_META[a]
                          const active = draft.amenities.includes(a)
                          return (
                            <button
                              key={a}
                              type="button"
                              onClick={() => toggleAmenity(a)}
                              aria-pressed={active}
                              className="flex flex-col items-center"
                              style={{ gap: 8 }}
                            >
                              <span
                                className="flex w-full items-center justify-center transition-colors"
                                style={{
                                  height: 92,
                                  borderRadius: 12,
                                  border: `1px solid ${active ? C.text : C.border}`,
                                  boxShadow: active ? `inset 0 0 0 1px ${C.text}` : "none",
                                  backgroundColor: active ? C.selBg : "#ffffff",
                                }}
                              >
                                <FilterIcon name={meta.icon} size={30} style={{ color: C.text }} />
                              </span>
                              <span style={{ fontSize: 14, color: C.text, textAlign: "center" }}>
                                {meta[locale === "ar" ? "ar" : "en"]}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </section>

                    <Divider />

                    {/* Type of place */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.typeOfPlace}</h2>
                      <div className="relative flex" style={{ border: `1px solid ${C.border}`, borderRadius: 12, height: 52 }}>
                        {placeOptions.map((o, i) => {
                          const active = kind === o.key
                          const prevActive = i > 0 && kind === placeOptions[i - 1]?.key
                          return (
                            <button
                              key={o.key}
                              type="button"
                              onClick={() => setPlace(o.key)}
                              aria-pressed={active}
                              className="relative flex flex-1 items-center justify-center"
                              style={{ fontSize: 14, fontWeight: 500, color: C.text }}
                            >
                              {i > 0 && !active && !prevActive && (
                                <span
                                  aria-hidden
                                  className="absolute top-1/2 -translate-y-1/2"
                                  style={{ insetInlineStart: 0, width: 1, height: 24, backgroundColor: C.border }}
                                />
                              )}
                              {active && (
                                <span
                                  aria-hidden
                                  className="absolute inset-0"
                                  style={{ border: `2px solid ${C.text}`, borderRadius: 12, margin: -1 }}
                                />
                              )}
                              <span className="relative">{o.label}</span>
                            </button>
                          )
                        })}
                      </div>
                    </section>

                    <Divider />

                    {/* Price range */}
                    <section>
                      <h2 style={sectionTitle}>{t.priceRange}</h2>
                      <p style={{ fontSize: 14, color: C.text, marginTop: 6, marginBottom: 20 }}>{t.priceHint}</p>

                      <div className="relative">
                        <div className="flex items-end" style={{ height: 56, gap: 2 }}>
                          {bins.map((h, i) => {
                            const center = ((i + 0.5) / bins.length) * ceil
                            const inRange = center >= lo && center <= hi
                            return (
                              <div
                                key={i}
                                style={{
                                  flex: 1,
                                  height: `${Math.max(4, Math.round(h * 52))}px`,
                                  backgroundColor: inRange ? C.pink : C.border,
                                  borderRadius: 2,
                                }}
                              />
                            )
                          })}
                        </div>
                        <Slider
                          className="ab-price-slider"
                          value={[lo, hi]}
                          min={0}
                          max={ceil}
                          step={step}
                          onValueChange={setPrice}
                          style={{ marginTop: -1 }}
                        />
                      </div>

                      <div className="mt-6 flex items-center" style={{ gap: 12 }}>
                        <PriceBox
                          label={t.minimum}
                          currency={t.currency}
                          value={lo}
                          plus={false}
                          onChange={(v) => setPrice([Math.min(v, hi - step), hi])}
                        />
                        <span aria-hidden style={{ width: 12, height: 1, backgroundColor: C.borderStrong, flexShrink: 0, alignSelf: "flex-end", marginBottom: 28 }} />
                        <PriceBox
                          label={t.maximum}
                          currency={t.currency}
                          value={hi}
                          plus={hi >= ceil}
                          onChange={(v) => setPrice([lo, Math.max(v, lo + step)])}
                        />
                      </div>
                    </section>

                    <Divider />

                    {/* Rooms and beds */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 8 }}>{t.roomsAndBeds}</h2>
                      <Stepper label={t.bedrooms} value={draft.beds} onChange={(v) => setDraft((d) => ({ ...d, beds: v }))} />
                      <Stepper label={t.bathrooms} value={draft.baths} onChange={(v) => setDraft((d) => ({ ...d, baths: v }))} />
                    </section>

                    <Divider />

                    {/* Amenities */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.amenities}</h2>
                      <div className="flex flex-wrap" style={{ gap: 12 }}>
                        {amenityList.map((a) => (
                          <Pill
                            key={a}
                            active={draft.amenities.includes(a)}
                            onClick={() => toggleAmenity(a)}
                            icon={<FilterIcon name={AMENITY_META[a].icon} size={20} />}
                          >
                            {AMENITY_META[a][locale === "ar" ? "ar" : "en"]}
                          </Pill>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setAmenExpanded((v) => !v)}
                        className="mt-4 flex items-center"
                        style={{ gap: 6, fontSize: 16, fontWeight: 500, color: C.text }}
                      >
                        <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
                          {amenExpanded ? t.showLess : t.showMore}
                        </span>
                        <ChevronDown size={16} style={{ transform: amenExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                      </button>
                    </section>

                    <Divider />

                    {/* Booking options */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.bookingOptions}</h2>
                      <div className="flex flex-wrap" style={{ gap: 12 }}>
                        <Pill
                          active={!!draft.instantBook}
                          onClick={() => setDraft((d) => ({ ...d, instantBook: !d.instantBook }))}
                          icon={<FilterIcon name="instantBook" size={20} />}
                        >
                          {t.instantBook}
                        </Pill>
                        <Pill
                          active={!!draft.petsAllowed}
                          onClick={() => setDraft((d) => ({ ...d, petsAllowed: !d.petsAllowed }))}
                          icon={<FilterIcon name="pets" size={20} />}
                        >
                          {t.allowsPets}
                        </Pill>
                      </div>
                    </section>

                    <Divider />

                    {/* Property type (collapsible) */}
                    <section>
                      <button
                        type="button"
                        onClick={() => setTypeOpen((o) => !o)}
                        aria-expanded={typeOpen}
                        className="flex w-full items-center justify-between"
                      >
                        <span style={sectionTitle}>{t.propertyType}</span>
                        <ChevronDown size={20} style={{ color: C.text, transform: typeOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                      </button>
                      {typeOpen && (
                        <div className="mt-4 flex flex-wrap" style={{ gap: 12 }}>
                          {ALL_TYPES.map((pt) => (
                            <Pill
                              key={pt}
                              active={draft.propertyTypes.includes(pt)}
                              onClick={() => toggleType(pt)}
                              icon={<PropertyTypeIcon type={TYPE_META[pt].id} size={22} />}
                            >
                              {TYPE_META[pt][locale === "ar" ? "ar" : "en"]}
                            </Pill>
                          ))}
                        </div>
                      )}
                    </section>
                  </div>
                </AnyLabelContext.Provider>

                {/* Footer */}
                <div className="absolute bottom-9 inset-x-0 bg-white flex shrink-0 items-center justify-between border-t" style={{ padding: "16px 24px", height: 72, borderColor: "#ebebeb" }}>
                  <button
                    type="button"
                    onClick={() => setDraft(EMPTY_FILTERS)}
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: hasDraft ? C.text : C.muted,
                      textDecoration: "underline",
                      textUnderlineOffset: 2,
                    }}
                  >
                    {t.clearAll}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      applyFilters(draft)
                      setOpen(false)
                    }}
                    className="transition-colors"
                    style={{ height: 48, padding: "0 24px", borderRadius: 12, backgroundColor: C.text, color: "#ffffff", fontSize: 16, fontWeight: 500 }}
                  >
                    {showLabel}
                  </button>
                </div>

                {/* Bottom grabber — replaces the close icon. */}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={isAr ? "إغلاق" : "Close"}
                  className="absolute bottom-0 left-1/2 z-40 flex h-9 w-20 -translate-x-1/2 items-center justify-center"
                >
                  <span className="h-1 w-9 rounded-full bg-gray-300" />
                </button>
              </motion.div>
            </React.Fragment>
          )}
        </AnimatePresence>
      </LayoutGroup>
    )
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          type="button"
          className="relative flex shrink-0 items-center gap-2 rounded-full bg-background px-4 text-sm font-medium text-foreground transition-colors hover:border-foreground"
          style={{ height: 40, border: `1px solid ${C.border}` }}
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
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 z-[100] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"
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
          {/* Scoped CSS so the Radix slider matches Airbnb exactly (avoids the
              Tailwind-arbitrary-variant dev HMR pitfall). */}
          <style>{`
            .ab-price-slider [data-slot=slider-track]{height:2px;background:${C.border};}
            .ab-price-slider [data-slot=slider-range]{background:${C.text};}
            .ab-price-slider [data-slot=slider-thumb]{width:28px;height:28px;background:#fff;border:1px solid ${C.border};box-shadow:0 1px 4px rgba(0,0,0,.18),0 4px 12px rgba(0,0,0,.12);}
            .ab-price-slider [data-slot=slider-thumb]:hover{box-shadow:0 2px 6px rgba(0,0,0,.24),0 6px 16px rgba(0,0,0,.16);}
          `}</style>

          {/* Header */}
          <div className="relative flex shrink-0 items-center justify-center" style={{ height: 64, borderBottom: `1px solid #ebebeb` }}>
            <DialogPrimitive.Title style={{ fontSize: 16, fontWeight: 600, color: C.text }}>
              {t.filters}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={t.close}
              className="absolute flex items-center justify-center rounded-full transition-colors hover:bg-gray-100 outline-none"
              style={{ insetInlineEnd: 16, width: 32, height: 32 }}
            >
              <X size={16} style={{ color: C.text }} />
            </DialogPrimitive.Close>
          </div>

          {/* Body */}
          <AnyLabelContext.Provider value={t.any}>
            <div className="flex-1 overflow-y-auto" style={{ padding: "24px" }}>
              {/* Recommended for you */}
              <section>
                <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.recommended}</h2>
                <div className="grid grid-cols-4" style={{ gap: 12 }}>
                  {RECOMMENDED.map((a) => {
                    const meta = AMENITY_META[a]
                    const active = draft.amenities.includes(a)
                    return (
                      <button
                        key={a}
                        type="button"
                        onClick={() => toggleAmenity(a)}
                        aria-pressed={active}
                        className="flex flex-col items-center"
                        style={{ gap: 8 }}
                      >
                        <span
                          className="flex w-full items-center justify-center transition-colors"
                          style={{
                            height: 92,
                            borderRadius: 12,
                            border: `1px solid ${active ? C.text : C.border}`,
                            boxShadow: active ? `inset 0 0 0 1px ${C.text}` : "none",
                            backgroundColor: active ? C.selBg : "#ffffff",
                          }}
                        >
                          <FilterIcon name={meta.icon} size={30} style={{ color: C.text }} />
                        </span>
                        <span style={{ fontSize: 14, color: C.text, textAlign: "center" }}>
                          {meta[locale === "ar" ? "ar" : "en"]}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <Divider />

              {/* Type of place */}
              <section>
                <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.typeOfPlace}</h2>
                <div className="relative flex" style={{ border: `1px solid ${C.border}`, borderRadius: 12, height: 52 }}>
                  {placeOptions.map((o, i) => {
                    const active = kind === o.key
                    const prevActive = i > 0 && kind === placeOptions[i - 1]?.key
                    return (
                      <button
                        key={o.key}
                        type="button"
                        onClick={() => setPlace(o.key)}
                        aria-pressed={active}
                        className="relative flex flex-1 items-center justify-center"
                        style={{ fontSize: 14, fontWeight: 500, color: C.text }}
                      >
                        {i > 0 && !active && !prevActive && (
                          <span
                            aria-hidden
                            className="absolute top-1/2 -translate-y-1/2"
                            style={{ insetInlineStart: 0, width: 1, height: 24, backgroundColor: C.border }}
                          />
                        )}
                        {active && (
                          <span
                            aria-hidden
                            className="absolute inset-0"
                            style={{ border: `2px solid ${C.text}`, borderRadius: 12, margin: -1 }}
                          />
                        )}
                        <span className="relative">{o.label}</span>
                      </button>
                    )
                  })}
                </div>
              </section>

              <Divider />

              {/* Price range */}
              <section>
                <h2 style={sectionTitle}>{t.priceRange}</h2>
                <p style={{ fontSize: 14, color: C.text, marginTop: 6, marginBottom: 20 }}>{t.priceHint}</p>

                <div className="relative">
                  <div className="flex items-end" style={{ height: 56, gap: 2 }}>
                    {bins.map((h, i) => {
                      const center = ((i + 0.5) / bins.length) * ceil
                      const inRange = center >= lo && center <= hi
                      return (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            height: `${Math.max(4, Math.round(h * 52))}px`,
                            backgroundColor: inRange ? C.pink : C.border,
                            borderRadius: 2,
                          }}
                        />
                      )
                    })}
                  </div>
                  <Slider
                    className="ab-price-slider"
                    value={[lo, hi]}
                    min={0}
                    max={ceil}
                    step={step}
                    onValueChange={setPrice}
                    style={{ marginTop: -1 }}
                  />
                </div>

                <div className="mt-6 flex items-center" style={{ gap: 12 }}>
                  <PriceBox
                    label={t.minimum}
                    currency={t.currency}
                    value={lo}
                    plus={false}
                    onChange={(v) => setPrice([Math.min(v, hi - step), hi])}
                  />
                  <span aria-hidden style={{ width: 12, height: 1, backgroundColor: C.borderStrong, flexShrink: 0, alignSelf: "flex-end", marginBottom: 28 }} />
                  <PriceBox
                    label={t.maximum}
                    currency={t.currency}
                    value={hi}
                    plus={hi >= ceil}
                    onChange={(v) => setPrice([lo, Math.max(v, lo + step)])}
                  />
                </div>
              </section>

              <Divider />

              {/* Rooms and beds */}
              <section>
                <h2 style={{ ...sectionTitle, marginBottom: 8 }}>{t.roomsAndBeds}</h2>
                <Stepper label={t.bedrooms} value={draft.beds} onChange={(v) => setDraft((d) => ({ ...d, beds: v }))} />
                <Stepper label={t.bathrooms} value={draft.baths} onChange={(v) => setDraft((d) => ({ ...d, baths: v }))} />
              </section>

              <Divider />

              {/* Amenities */}
              <section>
                <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.amenities}</h2>
                <div className="flex flex-wrap" style={{ gap: 12 }}>
                  {amenityList.map((a) => (
                    <Pill
                      key={a}
                      active={draft.amenities.includes(a)}
                      onClick={() => toggleAmenity(a)}
                      icon={<FilterIcon name={AMENITY_META[a].icon} size={20} />}
                    >
                      {AMENITY_META[a][locale === "ar" ? "ar" : "en"]}
                    </Pill>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setAmenExpanded((v) => !v)}
                  className="mt-4 flex items-center"
                  style={{ gap: 6, fontSize: 16, fontWeight: 500, color: C.text }}
                >
                  <span style={{ textDecoration: "underline", textUnderlineOffset: 2 }}>
                    {amenExpanded ? t.showLess : t.showMore}
                  </span>
                  <ChevronDown size={16} style={{ transform: amenExpanded ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                </button>
              </section>

              <Divider />

              {/* Booking options */}
              <section>
                <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.bookingOptions}</h2>
                <div className="flex flex-wrap" style={{ gap: 12 }}>
                  <Pill
                    active={!!draft.instantBook}
                    onClick={() => setDraft((d) => ({ ...d, instantBook: !d.instantBook }))}
                    icon={<FilterIcon name="instantBook" size={20} />}
                  >
                    {t.instantBook}
                  </Pill>
                  <Pill
                    active={!!draft.petsAllowed}
                    onClick={() => setDraft((d) => ({ ...d, petsAllowed: !d.petsAllowed }))}
                    icon={<FilterIcon name="pets" size={20} />}
                  >
                    {t.allowsPets}
                  </Pill>
                </div>
              </section>

              <Divider />

              {/* Property type (collapsible) */}
              <section>
                <button
                  type="button"
                  onClick={() => setTypeOpen((o) => !o)}
                  aria-expanded={typeOpen}
                  className="flex w-full items-center justify-between"
                >
                  <span style={sectionTitle}>{t.propertyType}</span>
                  <ChevronDown size={20} style={{ color: C.text, transform: typeOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                </button>
                {typeOpen && (
                  <div className="mt-4 flex flex-wrap" style={{ gap: 12 }}>
                    {ALL_TYPES.map((pt) => (
                      <Pill
                        key={pt}
                        active={draft.propertyTypes.includes(pt)}
                        onClick={() => toggleType(pt)}
                        icon={<PropertyTypeIcon type={TYPE_META[pt].id} size={22} />}
                      >
                        {TYPE_META[pt][locale === "ar" ? "ar" : "en"]}
                      </Pill>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </AnyLabelContext.Provider>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-between" style={{ padding: "16px 24px", borderTop: `1px solid #ebebeb` }}>
            <button
              type="button"
              onClick={() => setDraft(EMPTY_FILTERS)}
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: hasDraft ? C.text : C.muted,
                textDecoration: "underline",
                textUnderlineOffset: 2,
              }}
            >
              {t.clearAll}
            </button>
            <button
              type="button"
              onClick={() => {
                applyFilters(draft)
                setOpen(false)
              }}
              className="transition-colors"
              style={{ height: 48, padding: "0 24px", borderRadius: 12, backgroundColor: C.text, color: "#ffffff", fontSize: 16, fontWeight: 500 }}
            >
              {showLabel}
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
