"use client"

import dynamic from "next/dynamic"
import { useDictionary } from "@/components/internationalization/dictionary-context"

// mapbox-gl touches `window` at import time — load client-side only.
const ListingMap = dynamic(() => import("./listing-map"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-muted animate-pulse" />,
})

export interface LocationProps {
  latitude?: number | null
  longitude?: number | null
  city?: string | null
  state?: string | null
  country?: string | null
  description?: string | null
}

export default function Location({
  latitude,
  longitude,
  city,
  state,
  country,
  description,
}: LocationProps) {
  const dict = useDictionary()
  const hasCoords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    (latitude !== 0 || longitude !== 0)

  const placeLine = [city, state, country].filter(Boolean).join(", ")

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">{dict.rental?.map?.whereYoullBe}</h1>

      <div className="relative w-full h-[400px] mb-6 rounded-lg overflow-hidden border border-border">
        {hasCoords ? (
          <ListingMap
            latitude={latitude}
            longitude={longitude}
            pinLabel={dict.rental?.map?.exactLocation}
            className="w-full h-full"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <p className="text-sm text-muted-foreground">{placeLine || dict.rental?.map?.whereYoullBe}</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {placeLine ? <h2 className="text-xl font-semibold">{placeLine}</h2> : null}
        {description ? (
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        ) : null}
      </div>
    </div>
  )
}
