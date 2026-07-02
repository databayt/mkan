"use client";

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
import { useDictionary } from "@/components/internationalization/dictionary-context"

// mapbox-gl touches `window` at import time — load client-side only.
const ListingMap = dynamic(() => import("./listing-map"), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-muted animate-pulse" />,
})

export interface MobileMapProps {
  latitude?: number | null
  longitude?: number | null
  city?: string | null
  state?: string | null
  country?: string | null
}

export default function MobileMap({
  latitude,
  longitude,
  city,
  state,
  country,
}: MobileMapProps) {
  const dict = useDictionary()
  const hasCoords =
    typeof latitude === "number" &&
    typeof longitude === "number" &&
    (latitude !== 0 || longitude !== 0)

  const placeLine = [city, state, country].filter(Boolean).join(", ")

  // Mount mapbox only when the section is about to scroll into view. Most
  // visits never reach it (mapbox-gl + tiles saved), and a canvas that never
  // mounted can't flash during back-navigation repaints.
  const holderRef = useRef<HTMLDivElement | null>(null)
  const [nearViewport, setNearViewport] = useState(false)
  useEffect(() => {
    const el = holderRef.current
    if (!el || nearViewport) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setNearViewport(true)
      },
      { rootMargin: "600px 0px" }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [nearViewport])

  return (
    <div className="md:hidden px-4 py-6">
      <h1 className="text-xl font-semibold mb-4">{dict.rental?.map?.whereYoullBe}</h1>

      {/* bg-muted behind the canvas: any repaint (route transition, canvas
          restore) shows neutral grey instead of a white flash. */}
      <div ref={holderRef} className="relative w-full h-[250px] mb-4 rounded-lg overflow-hidden border border-border bg-muted">
        {hasCoords && nearViewport ? (
          <ListingMap
            latitude={latitude}
            longitude={longitude}
            pinLabel={dict.rental?.map?.exactLocation}
            className="w-full h-full"
          />
        ) : hasCoords ? (
          <div className="w-full h-full bg-muted" />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center">
            <p className="text-sm text-muted-foreground">{placeLine || dict.rental?.map?.whereYoullBe}</p>
          </div>
        )}
      </div>

      {placeLine ? <h2 className="text-base font-medium">{placeLine}</h2> : null}
    </div>
  )
}
