"use client"

import dynamic from "next/dynamic"
import { useEffect, useRef, useState } from "react"
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

  // Mount mapbox only when the section approaches the viewport. Crucially,
  // this whole desktop tree is `hidden` (display:none) on mobile — a hidden
  // element never intersects, so phones no longer pay a second invisible
  // mapbox init on every listing (CPU + the canvas that could flash on
  // back-navigation).
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
    <section className="py-12">
      <h2 className="mb-6 text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">
        {dict.rental?.map?.whereYoullBe}
      </h2>

      {/* Airbnb "Where you'll be" map: 480px tall, 20px radius, no border. */}
      <div ref={holderRef} className="relative mb-6 h-[480px] w-full overflow-hidden rounded-[20px] bg-muted">
        {hasCoords && nearViewport ? (
          <ListingMap
            latitude={latitude}
            longitude={longitude}
            pinLabel={dict.rental?.map?.exactLocation}
            className="h-full w-full"
          />
        ) : hasCoords ? (
          <div className="h-full w-full bg-muted" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted">
            <p className="text-sm text-muted-foreground">{placeLine || dict.rental?.map?.whereYoullBe}</p>
          </div>
        )}
      </div>

      <div className="space-y-2">
        {placeLine ? <h3 className="text-base font-medium text-[#222222]">{placeLine}</h3> : null}
        {description ? (
          <p className="leading-relaxed text-[#6A6A6A]">{description}</p>
        ) : null}
      </div>
    </section>
  )
}
