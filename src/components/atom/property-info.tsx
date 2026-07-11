"use client"

import React from "react"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { useLocale } from "@/components/internationalization/use-locale"
import { HIGHLIGHT_ICONS, featureIcon, featureLabel, featureDescription } from "@/components/listings/feature-icons"

interface AirbnbInfoProps {
  /** Real Prisma `Highlight` enum values for this listing. */
  highlights?: string[]
  /** Override the section heading (mobile PDP uses "Listing highlights"). */
  heading?: string
  /** Override heading classes. The live mobile PDP shows no visible highlights
   *  title (the heading is present only for a11y), so mobile passes "sr-only". */
  headingClassName?: string
}

// Listing highlights section — real `Highlight` enum values, labelled from the
// dictionary and paired with the canonical per-type subtitle Airbnb shows in
// HIGHLIGHTS_DEFAULT (e.g. "Designed for staying cool" → "Beat the heat with the
// AC and ceiling fan."). The subtitles are standard type-level copy, not
// per-listing fabrication (see feature-icons `HIGHLIGHT_DESCRIPTIONS`). Layout
// mirrors the live PDP: a 24px icon top-aligned with a 14px/500 title over a
// 14px/#6a6a6a subtitle. Renders nothing when the listing has no highlights.
export default function AirbnbInfo({ highlights = [], heading, headingClassName }: AirbnbInfoProps) {
  const dict = useDictionary()
  const { locale } = useLocale()
  const labels = dict?.rental?.property?.highlights as Record<string, string> | undefined

  if (!highlights || highlights.length === 0) return null

  return (
    <div className="space-y-6">
      <h2 className={headingClassName ?? "text-[22px] font-semibold leading-[26px] tracking-[-0.44px] text-[#222222]"}>
        {heading ?? (dict?.property?.sections?.highlights ?? "Highlights")}
      </h2>
      <div className="space-y-4">
        {highlights.map((h) => {
          const Icon = featureIcon(HIGHLIGHT_ICONS, h)
          const desc = featureDescription(h, locale)
          return (
            <div key={h} className="flex items-start gap-4">
              <Icon className="h-6 w-6 flex-shrink-0 text-[#222222]" strokeWidth={1.5} />
              <div className="min-w-0">
                <h3 className="text-sm font-medium leading-5 text-[#222222] md:text-base">
                  {featureLabel(labels, h)}
                </h3>
                {desc && (
                  <p className="mt-0.5 text-sm font-normal leading-5 text-[#6a6a6a]">
                    {desc}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
