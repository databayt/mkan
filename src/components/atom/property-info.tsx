"use client"

import React from "react"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { HIGHLIGHT_ICONS, featureIcon, featureLabel } from "@/components/listings/feature-icons"

interface AirbnbInfoProps {
  /** Real Prisma `Highlight` enum values for this listing. */
  highlights?: string[]
  /** Override the section heading (mobile PDP uses "Listing highlights"). */
  heading?: string
}

// Listing highlights row — real `Highlight` enum values, labelled from the
// dictionary. Previously showed fabricated "Fast wifi / Free cancellation"
// copy; phase 1 shows only genuine, host-supplied highlights (or nothing).
// Airbnb pairs each with a subtitle description; our enum data has none, so we
// render title-only (honest-info rule) — the heading + layout still mirror live.
export default function AirbnbInfo({ highlights = [], heading }: AirbnbInfoProps) {
  const dict = useDictionary()
  const labels = dict?.rental?.property?.highlights as Record<string, string> | undefined

  if (!highlights || highlights.length === 0) return null

  return (
    <div className="space-y-6">
      <h3 className="text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]">
        {heading ?? dict?.property?.sections?.highlights ?? "Highlights"}
      </h3>
      <div className="space-y-5">
        {highlights.map((h) => {
          const Icon = featureIcon(HIGHLIGHT_ICONS, h)
          return (
            <div key={h} className="flex items-center gap-4">
              <Icon className="h-8 w-8 flex-shrink-0 text-[#222222]" strokeWidth={1.5} />
              <strong className="text-base font-medium text-[#222222]">{featureLabel(labels, h)}</strong>
            </div>
          )
        })}
      </div>
    </div>
  )
}
