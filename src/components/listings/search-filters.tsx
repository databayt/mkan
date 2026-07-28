"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Dialog as DialogPrimitive } from "radix-ui"
import { X, Minus, Plus, ChevronDown } from "lucide-react"
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
//
// Deliberately a subset of the `Amenity` enum, not a total map: the sheet
// shows what people actually filter on, and the enum carries 40+ values. The
// `satisfies` keeps every key checked against the enum while letting the keys
// stay exact, so `FilterAmenity` below is derived from this object and the
// curated lists cannot name an amenity that has no glyph.
const AMENITY_META = {
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
  // The two most common amenities in the dataset (111 and 110 of 121 homes),
  // which had no enum value to filter on until now.
  Kitchen: { icon: "kitchen", en: "Kitchen", ar: "مطبخ" },
  TV: { icon: "tv", en: "TV", ar: "تلفزيون" },
  DedicatedWorkspace: { icon: "wifi", en: "Dedicated workspace", ar: "مساحة مخصصة للعمل" },
  HairDryer: { icon: "hairDryer", en: "Hair dryer", ar: "مجفف شعر" },
} satisfies Partial<Record<Amenity, { icon: FilterIconName; en: string; ar: string }>>

type FilterAmenity = keyof typeof AMENITY_META

// First-shown amenities (all backed by seed data) then the "Show more" tail.
// Ordered to mirror Airbnb's mobile Filters sheet (Wifi first, then Washer,
// Air conditioning, …) — every one maps to a real Listing `amenities` value.
const AMENITY_PRIMARY: FilterAmenity[] = [
  "WiFi", "WasherDryer", "AirConditioning", "Parking", "Kitchen", "TV",
]
const AMENITY_MORE: FilterAmenity[] = [
  "Pool", "Dishwasher", "Refrigerator", "Gym", "HighSpeedInternet", "DedicatedWorkspace",
]
// "Recommended for you" quick cards.
const RECOMMENDED: FilterAmenity[] = ["AirConditioning", "Parking", "WiFi", "Kitchen"]

// ── Airbnb-mobile parity data ──────────────────────────────────────────────
// The mobile Filters sheet mirrors Airbnb's live sheet section-for-section.
// Controls backed by a real Listing column are wired; the rest (marked with no
// `amenity`) are faithful cosmetic controls so the visual matches exactly
// without sending values our schema can't honor.

// "Recommended for you" — Airbnb shows Kitchen / Free parking / Wifi. Each maps
// to a real Mkan amenity so the quick cards actually filter.
const RECOMMENDED_MOBILE: { img: string; en: string; ar: string; amenity: Amenity }[] = [
  { img: "/filter/kitchen.png", en: "Kitchen", ar: "مطبخ", amenity: "Dishwasher" },
  { img: "/filter/free-parking.png", en: "Free parking", ar: "موقف مجاني", amenity: "Parking" },
  { img: "/filter/wifi.png", en: "Wifi", ar: "واي فاي", amenity: "WiFi" },
]

// Airbnb's first amenities row (before "Show more"). AC → real AirConditioning,
// Dryer → real WasherDryer; TV/Heating/Iron/Hair dryer have no Mkan column and
// stay cosmetic (kept for exact visual parity, authentic glyphs).
const AMENITY_MOBILE: { icon: FilterIconName; en: string; ar: string; amenity?: Amenity }[] = [
  { icon: "airConditioning", en: "Air conditioning", ar: "تكييف", amenity: "AirConditioning" },
  { icon: "tv", en: "TV", ar: "تلفاز" },
  { icon: "dryer", en: "Dryer", ar: "مجفف", amenity: "WasherDryer" },
  { icon: "heating", en: "Heating", ar: "تدفئة" },
  { icon: "iron", en: "Iron", ar: "مكواة" },
  { icon: "hairDryer", en: "Hair dryer", ar: "مجفف شعر" },
]
// "Show more" reveals Mkan's remaining real amenities so working filters stay
// reachable under the Airbnb-styled first row.
const AMENITY_MOBILE_MORE: FilterAmenity[] = ["WiFi", "Parking", "Kitchen", "TV", "Pool", "Dishwasher", "Refrigerator", "Gym"]

// "Standout stays" — Guest favorite / Luxe. Mkan's ratings are uniform, so these
// can't discriminate; rendered as faithful cosmetic cards.
const STANDOUT: { key: string; icon: FilterIconName; en: string; ar: string; subEn: string; subAr: string }[] = [
  { key: "guestFavorite", icon: "guestFavorite", en: "Guest favorite", ar: "المفضّل لدى الضيوف", subEn: "The most loved homes on Mkan", subAr: "المنازل الأكثر تفضيلاً على مكان" },
  { key: "luxe", icon: "luxe", en: "Luxe", ar: "لوكس", subEn: "Luxury homes with elevated design", subAr: "منازل فاخرة بتصميم راقٍ" },
]

// Collapsible cosmetic sections (no backing data yet) — expand to authentic
// option lists to complete the visual parity with Airbnb.
const ACCESS_FEATURES: { en: string; ar: string }[] = [
  { en: "Step-free guest entrance", ar: "مدخل بدون درجات" },
  { en: "Guest entrance wider than 32 inches", ar: "مدخل أوسع من 81 سم" },
  { en: "Step-free path to the guest entrance", ar: "مسار بدون درجات إلى المدخل" },
  { en: "Accessible parking spot", ar: "موقف مخصص لذوي الإعاقة" },
]
const HOST_LANGS: { en: string; ar: string }[] = [
  { en: "English", ar: "الإنجليزية" },
  { en: "Arabic", ar: "العربية" },
  { en: "French", ar: "الفرنسية" },
  { en: "Spanish", ar: "الإسبانية" },
  { en: "German", ar: "الألمانية" },
  { en: "Chinese", ar: "الصينية" },
]

const STEPPER_MAX = 8
const BAR_H = 64
// Mobile sheet choreography — gentle spring open, feather-landing close, panel
// dissolving into the header bar as it lands. Kept in lockstep with the mobile
// SEARCH sheet (search-header.tsx) so the two sheets breathe identically.
const SHEET_OPEN = {
  type: "spring" as const,
  stiffness: 240,
  damping: 28,
  mass: 1,
} as const
const SHEET_CLOSE = { duration: 0.38, ease: [0.32, 0.72, 0, 1] as const }

const T = {
  en: {
    filters: "Filters",
    recommended: "Recommended for you",
    typeOfPlace: "Type of place",
    anyType: "Any type", room: "Room", entireHome: "Entire home",
    priceRange: "Price range", priceHint: "Trip price, includes all fees",
    minimum: "Minimum", maximum: "Maximum", currency: "SDG",
    roomsAndBeds: "Rooms and beds", bedrooms: "Bedrooms", beds: "Beds", bathrooms: "Bathrooms", any: "Any",
    amenities: "Amenities", showMore: "Show more", showLess: "Show less",
    bookingOptions: "Booking options", instantBook: "Instant Book", selfCheckIn: "Self check-in", allowsPets: "Allows pets",
    standoutStays: "Standout stays",
    guestFavorite: "Guest favorite", guestFavoriteSub: "The most loved homes on Mkan",
    luxe: "Luxe", luxeSub: "Luxury homes with elevated design",
    propertyType: "Property type",
    accessibility: "Accessibility features", hostLanguage: "Host language",
    clearAll: "Clear all", show: "Show", places: "places", place: "place", close: "Close",
  },
  ar: {
    filters: "عوامل التصفية",
    recommended: "موصى به لك",
    typeOfPlace: "نوع المكان",
    anyType: "أي نوع", room: "غرفة", entireHome: "منزل كامل",
    priceRange: "نطاق السعر", priceHint: "سعر الرحلة، شامل جميع الرسوم",
    minimum: "الحد الأدنى", maximum: "الحد الأقصى", currency: "ج.س",
    roomsAndBeds: "الغرف والأسرّة", bedrooms: "غرف النوم", beds: "الأسرّة", bathrooms: "الحمامات", any: "الكل",
    amenities: "وسائل الراحة", showMore: "عرض المزيد", showLess: "عرض أقل",
    bookingOptions: "خيارات الحجز", instantBook: "الحجز الفوري", selfCheckIn: "تسجيل وصول ذاتي", allowsPets: "يسمح بالحيوانات الأليفة",
    standoutStays: "إقامات مميزة",
    guestFavorite: "المفضّل لدى الضيوف", guestFavoriteSub: "المنازل الأكثر تفضيلاً على مكان",
    luxe: "لوكس", luxeSub: "منازل فاخرة بتصميم راقٍ",
    propertyType: "نوع العقار",
    accessibility: "ميزات إمكانية الوصول", hostLanguage: "لغة المضيف",
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
        gap: icon ? 8 : 0,
        padding: "0 16px",
        borderRadius: 28,
        fontSize: 14,
        color: C.text,
        backgroundColor: active ? C.selBg : "#ffffff",
        border: `1px solid ${active ? C.text : C.border}`,
        boxShadow: active ? `inset 0 0 0 1px ${C.text}` : "none",
      }}
    >
      {icon && <span className="inline-flex shrink-0" style={{ color: C.text }}>{icon}</span>}
      {children}
    </button>
  )
}

function RoundBtn({
  disabled, onClick, ariaLabel, size = 32, children,
}: {
  disabled: boolean
  onClick: () => void
  ariaLabel: string
  size?: number
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
        width: size,
        height: size,
        border: `1px solid ${disabled ? C.border : C.borderStrong}`,
        color: disabled ? C.border : C.text,
        backgroundColor: "#ffffff",
        cursor: disabled ? "not-allowed" : "pointer",
        touchAction: "manipulation",
      }}
    >
      {children}
    </button>
  )
}

function Stepper({
  label, value, onChange, big = false,
}: {
  label: string
  value: number | undefined // undefined == "Any"
  onChange: (v: number | undefined) => void
  big?: boolean // Airbnb's mobile filter uses larger 40px steppers
}) {
  const anyLabel = useAnyLabel()
  const display = value === undefined ? anyLabel : value >= STEPPER_MAX ? `${STEPPER_MAX}+` : String(value)
  const btn = big ? 40 : 32
  return (
    <div className="flex items-center justify-between" style={{ padding: big ? "16px 0" : "12px 0" }}>
      <span style={{ fontSize: 16, color: C.text }}>{label}</span>
      <div className="flex items-center" style={{ gap: big ? 16 : 12 }}>
        <RoundBtn
          size={btn}
          disabled={value === undefined}
          ariaLabel={`decrease ${label}`}
          onClick={() => onChange(value === undefined ? undefined : value <= 1 ? undefined : value - 1)}
        >
          <Minus size={16} />
        </RoundBtn>
        <span style={{ fontSize: 16, color: C.text, minWidth: 44, textAlign: "center" }}>{display}</span>
        <RoundBtn
          size={btn}
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

/** Airbnb's exact "adjustments" filter glyph (stroked sliders with knobs). */
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
  )
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
  const [accessOpen, setAccessOpen] = useState(false)
  const [langOpen, setLangOpen] = useState(false)
  // Cosmetic-only selections (Beds + data-less pills) — kept out of FilterState
  // so the server contract and "Show N places" count stay honest.
  const [bedsCount, setBedsCount] = useState<number | undefined>(undefined)
  const [cosmetic, setCosmetic] = useState<Set<string>>(() => new Set())
  const [sheetH, setSheetH] = useState(0)
  const [isMobile, setIsMobile] = useState(false)
  // Client-mount guard so the mobile sheet can portal to <body> (below) only
  // after hydration — createPortal needs a real DOM node.
  const [mounted, setMounted] = useState(false)
  const reqRef = useRef(0)

  // Track responsive state
  useEffect(() => {
    setMounted(true)
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
      // Mirror `run()` in search-provider exactly: when a viewport is active it
      // supersedes BOTH the named location and any Nearby centre. Dropping only
      // `location` here would make the preview count a different query than the
      // one Apply then runs.
      const { location, lat, lng, ...datesGuests } = baseFilters
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
        selfCheckIn: draft.selfCheckIn || undefined,
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

  const toggleCosmetic = (key: string) =>
    setCosmetic((prev) => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })

  const clearAll = () => {
    setDraft(EMPTY_FILTERS)
    setBedsCount(undefined)
    setCosmetic(new Set())
  }

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
    !!draft.instantBook || !!draft.petsAllowed || !!draft.selfCheckIn

  const showLabel =
    preview === null
      ? `${t.show} ${t.places}`
      : `${t.show} ${formatNumber(preview, locale)} ${preview === 1 ? t.place : t.places}`

  const amenityList = amenExpanded ? [...AMENITY_PRIMARY, ...AMENITY_MORE] : AMENITY_PRIMARY

  if (isMobile) {
    return (
      <LayoutGroup>
        {/* i18n-exempt — scoped CSS, not user-facing copy */}
        <style>{`
          .ab-price-slider [data-slot=slider-track]{height:2px;background:${C.border};}
          .ab-price-slider [data-slot=slider-range]{background:${C.text};}
          .ab-price-slider [data-slot=slider-thumb]{width:28px;height:28px;background:#fff;border:1px solid ${C.border};box-shadow:0 1px 4px rgba(0,0,0,.18),0 4px 12px rgba(0,0,0,.12);}
          .ab-price-slider [data-slot=slider-thumb]:hover{box-shadow:0 2px 6px rgba(0,0,0,.24),0 6px 16px rgba(0,0,0,.16);}
        `}</style>

        <button
          type="button"
          className="relative flex shrink-0 items-center justify-center rounded-full bg-background text-sm font-medium text-foreground outline-none transition-colors"
          // No border ring — Airbnb's mobile /search filter control is the bare
          // sliders glyph. Narrow width keeps it close to the search pill; height
          // 48 keeps vertical alignment.
          style={{ height: 48, width: 32, touchAction: "manipulation" }}
          onClick={() => {
            // 0.92 == the mobile search sheet (mobile-listings-header.tsx), so
            // the Filters sheet and the search sheet open to the same height.
            setSheetH(Math.round(window.innerHeight * 0.92))
            setOpen(true)
          }}
          aria-label={t.filters}
        >
          <FilterTriggerIcon />
          {filterCount > 0 && (
            <span className="absolute -end-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1 text-[11px] font-semibold text-background">
              {formatNumber(filterCount, locale)}
            </span>
          )}
        </button>

        {/* Portal the sheet to <body> so `position: fixed` anchors to the
            VIEWPORT, not the header's `will-change: transform` container (which
            would otherwise become the containing block and inset the panel by
            the header's margins — the "not edge to edge" bug). This is why the
            search sheet, rendered at the top level, was already flush. */}
        {mounted &&
          createPortal(
            <AnimatePresence>
          {open && (
            <React.Fragment>
              {/* Scrim — fades over the FULL close travel so the room never
                  brightens while the sheet is still tucking away. */}
              <motion.div
                key="scrim"
                className="fixed inset-0 z-[60] bg-black/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.4, ease: "easeOut" } }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                onClick={() => setOpen(false)}
                aria-hidden="true"
              />

              {/* Panel — anchored to the top: breathes open from BAR_H down to
                  92vh on a gentle spring, lands back on a feather ease while
                  dissolving into the (identical-height) header bar beneath it.
                  Not flex — the body owns its height (see below) so the panel's
                  animated height only CLIPS content instead of reflowing it. */}
              <motion.div
                key="panel"
                className="fixed inset-x-0 top-0 z-[61] overflow-hidden rounded-b-[28px] bg-white shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
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
                {/* No title bar — the sheet opens straight into the filter
                    content and is dismissed via the bottom grabber, consistent
                    with the mobile SEARCH sheet (search-header.tsx). The body's
                    top padding gives the first section clean breathing room from
                    the sheet's flush top edge. */}

                {/* Body — a section-for-section clone of Airbnb's live mobile
                    Filters sheet (Recommended → Type of place → Price → Rooms
                    and beds → Amenities → Booking options → Standout stays →
                    Property type → Accessibility → Host language). */}
                <AnyLabelContext.Provider value={t.any}>
                  {/* Body — FIXED pixel height (not flex-1): laid out once at
                      final size so the panel's height animation never reflows
                      these hundreds of nodes per frame (the jank source). It
                      rises in a beat behind the panel and evaporates first on
                      close, so the sheet empties before tucking away. */}
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
                    {/* Recommended for you */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.recommended}</h2>
                      <div className="grid grid-cols-3" style={{ gap: 12 }}>
                        {RECOMMENDED_MOBILE.map((r) => {
                          const active = draft.amenities.includes(r.amenity)
                          return (
                            <button
                              key={r.en}
                              type="button"
                              onClick={() => toggleAmenity(r.amenity)}
                              aria-pressed={active}
                              className="flex flex-col items-center"
                              style={{ gap: 8 }}
                            >
                              <span
                                className="flex w-full items-center justify-center transition-colors"
                                style={{
                                  height: 84,
                                  borderRadius: 12,
                                  border: `1px solid ${active ? C.text : C.border}`,
                                  boxShadow: active ? `inset 0 0 0 1px ${C.text}` : "none",
                                  backgroundColor: active ? C.selBg : "#ffffff",
                                }}
                              >
                                {/* Authentic Airbnb recommended-filter illustration
                                    (downloaded to /public/filter). */}
                                <img
                                  src={r.img}
                                  alt=""
                                  width={44}
                                  height={44}
                                  style={{ width: 44, height: 44, objectFit: "contain" }}
                                />
                              </span>
                              <span style={{ fontSize: 13, color: C.text, textAlign: "center" }}>
                                {r[locale === "ar" ? "ar" : "en"]}
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

                    {/* Rooms and beds — Bedrooms + Bathrooms filter real columns;
                        Beds mirrors Airbnb's sheet but has no Listing column, so
                        it's a cosmetic stepper. */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 8 }}>{t.roomsAndBeds}</h2>
                      <Stepper big label={t.bedrooms} value={draft.beds} onChange={(v) => setDraft((d) => ({ ...d, beds: v }))} />
                      <Stepper big label={t.beds} value={bedsCount} onChange={setBedsCount} />
                      <Stepper big label={t.bathrooms} value={draft.baths} onChange={(v) => setDraft((d) => ({ ...d, baths: v }))} />
                    </section>

                    <Divider />

                    {/* Amenities — Airbnb's exact first row (AC, TV, Dryer,
                        Heating, Iron, Hair dryer). "Show more" reveals Mkan's
                        remaining real amenities. */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.amenities}</h2>
                      <div className="flex flex-wrap" style={{ gap: 12 }}>
                        {AMENITY_MOBILE.map((a) => {
                          const active = a.amenity ? draft.amenities.includes(a.amenity) : cosmetic.has(`am:${a.en}`)
                          return (
                            <Pill
                              key={a.en}
                              active={active}
                              onClick={() => (a.amenity ? toggleAmenity(a.amenity) : toggleCosmetic(`am:${a.en}`))}
                              icon={<FilterIcon name={a.icon} size={20} />}
                            >
                              {a[locale === "ar" ? "ar" : "en"]}
                            </Pill>
                          )
                        })}
                        {amenExpanded &&
                          AMENITY_MOBILE_MORE.map((a) => (
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
                          active={!!draft.selfCheckIn}
                          onClick={() => setDraft((d) => ({ ...d, selfCheckIn: !d.selfCheckIn }))}
                          icon={<FilterIcon name="selfCheckIn" size={20} />}
                        >
                          {t.selfCheckIn}
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

                    {/* Standout stays — Guest favorite / Luxe. Cosmetic cards
                        (uniform ratings can't discriminate). */}
                    <section>
                      <h2 style={{ ...sectionTitle, marginBottom: 16 }}>{t.standoutStays}</h2>
                      <div className="grid grid-cols-2" style={{ gap: 12 }}>
                        {STANDOUT.map((s) => {
                          const active = cosmetic.has(`so:${s.key}`)
                          return (
                            <button
                              key={s.key}
                              type="button"
                              onClick={() => toggleCosmetic(`so:${s.key}`)}
                              aria-pressed={active}
                              className="flex flex-col text-start transition-colors"
                              style={{
                                gap: 4,
                                padding: 16,
                                borderRadius: 16,
                                minHeight: 128,
                                border: `1px solid ${active ? C.text : C.border}`,
                                boxShadow: active ? `inset 0 0 0 1px ${C.text}` : "none",
                                backgroundColor: active ? C.selBg : "#ffffff",
                              }}
                            >
                              <FilterIcon name={s.icon} size={30} style={{ color: C.text, marginBottom: 8 }} />
                              <span style={{ fontSize: 15, fontWeight: 500, color: C.text }}>
                                {s[locale === "ar" ? "ar" : "en"]}
                              </span>
                              <span style={{ fontSize: 12, color: C.sub, lineHeight: "16px" }}>
                                {locale === "ar" ? s.subAr : s.subEn}
                              </span>
                            </button>
                          )
                        })}
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

                    <Divider />

                    {/* Accessibility features (collapsible) — cosmetic pills. */}
                    <section>
                      <button
                        type="button"
                        onClick={() => setAccessOpen((o) => !o)}
                        aria-expanded={accessOpen}
                        className="flex w-full items-center justify-between"
                      >
                        <span style={sectionTitle}>{t.accessibility}</span>
                        <ChevronDown size={20} style={{ color: C.text, transform: accessOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                      </button>
                      {accessOpen && (
                        <div className="mt-4 flex flex-wrap" style={{ gap: 12 }}>
                          {ACCESS_FEATURES.map((f) => (
                            <Pill
                              key={f.en}
                              active={cosmetic.has(`ax:${f.en}`)}
                              onClick={() => toggleCosmetic(`ax:${f.en}`)}
                              icon={null}
                            >
                              {f[locale === "ar" ? "ar" : "en"]}
                            </Pill>
                          ))}
                        </div>
                      )}
                    </section>

                    <Divider />

                    {/* Host language (collapsible) — cosmetic pills. */}
                    <section>
                      <button
                        type="button"
                        onClick={() => setLangOpen((o) => !o)}
                        aria-expanded={langOpen}
                        className="flex w-full items-center justify-between"
                      >
                        <span style={sectionTitle}>{t.hostLanguage}</span>
                        <ChevronDown size={20} style={{ color: C.text, transform: langOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }} />
                      </button>
                      {langOpen && (
                        <div className="mt-4 flex flex-wrap" style={{ gap: 12 }}>
                          {HOST_LANGS.map((l) => (
                            <Pill
                              key={l.en}
                              active={cosmetic.has(`lang:${l.en}`)}
                              onClick={() => toggleCosmetic(`lang:${l.en}`)}
                              icon={null}
                            >
                              {l[locale === "ar" ? "ar" : "en"]}
                            </Pill>
                          ))}
                        </div>
                      )}
                    </section>
                  </motion.div>
                </AnyLabelContext.Provider>

                {/* Footer — a solid bar pinned flush to the sheet's bottom edge,
                    layered in FRONT of the scrolling body (own z-index + a soft
                    top border) so content slides underneath it instead of
                    bleeding past. Mirrors Airbnb's mobile Filters footer; unlike
                    the search sheet's transparent floating CTA, this stays an
                    opaque, always-visible bar. */}
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
                      color: hasDraft || bedsCount !== undefined || cosmetic.size > 0 ? C.text : C.muted,
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

                {/* Bottom grabber — the dismiss handle, same as the mobile search
                    sheet; sits centered on top of the footer, in the empty gap
                    between "Clear all" and the Show button. */}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label={isAr ? "إغلاق" : "Close"}
                  className="absolute bottom-0 left-1/2 z-40 flex h-8 w-20 -translate-x-1/2 items-end justify-center pb-2.5"
                >
                  <span className="h-1 w-9 rounded-full bg-gray-300" />
                </button>
              </motion.div>
            </React.Fragment>
          )}
            </AnimatePresence>,
            document.body,
          )}
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
          <FilterTriggerIcon />
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
          {/* i18n-exempt — scoped CSS, not user-facing copy */}
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
