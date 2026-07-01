"use client"

import React from "react"
import { useDictionary } from "@/components/internationalization/dictionary-context"

// Authentic Airbnb DLS icon wrapper: viewBox 0 0 32 32, solid currentColor,
// rendered 24px — identical convention to the live "Listing highlights" rows.
function DlsIcon({ d, className = "" }: { d: string; className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 32 32"
      aria-hidden="true"
      role="presentation"
      focusable="false"
      className={className}
      style={{ display: "block", height: 24, width: 24, fill: "currentColor" }}
    >
      <path d={d} />
    </svg>
  )
}

// Paths lifted verbatim from the live room page (airbnb.com/rooms) DOM.
const WIFI_D =
  "M16 20.33a3.67 3.67 0 1 1 0 7.34 3.67 3.67 0 0 1 0-7.34zm0 2a1.67 1.67 0 1 0 0 3.34 1.67 1.67 0 0 0 0-3.34zM16 15a9 9 0 0 1 8.04 4.96l-1.51 1.51a7 7 0 0 0-13.06 0l-1.51-1.51A9 9 0 0 1 16 15zm0-5.33c4.98 0 9.37 2.54 11.94 6.4l-1.45 1.44a12.33 12.33 0 0 0-20.98 0l-1.45-1.45A14.32 14.32 0 0 1 16 9.66zm0-5.34c6.45 0 12.18 3.1 15.76 7.9l-1.43 1.44a17.64 17.64 0 0 0-28.66 0L.24 12.24c3.58-4.8 9.3-7.9 15.76-7.9z"
const PARKING_D =
  "M26 19a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM7 18a1 1 0 1 0 0 2 1 1 0 0 0 0-2zm20.7-5 .41 1.12A4.97 4.97 0 0 1 30 18v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-2H8v2a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9c0-1.57.75-2.96 1.89-3.88L4.3 13H2v-2h3v.15L6.82 6.3A2 2 0 0 1 8.69 5h14.62c.83 0 1.58.52 1.87 1.3L27 11.15V11h3v2h-2.3zM6 25H4v2h2v-2zm22 0h-2v2h2v-2zm0-2v-5a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v5h24zm-3-10h.56L23.3 7H8.69l-2.25 6H25zm-15 7h12v-2H10v2z"
// Calendar (free cancellation) — DLS-style 32-grid glyph.
const CALENDAR_D =
  "M23 2v2h4a2 2 0 0 1 2 2v21a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4V2h2v2h10V2zM27 13H5v14h22zm-1-7h-3v2h-2V6H11v2H9V6H6a1 1 0 0 0-1 1v4h22V7a1 1 0 0 0-1-1z"

export default function AirbnbInfo() {
  const dict = useDictionary()
  const t = dict?.atom?.propertyInfo

  const rows = [
    {
      d: WIFI_D,
      title: t?.fastWifiTitle ?? "Fast wifi",
      desc: t?.fastWifiDesc ?? "100 Mbps download speed for streaming and video calls.",
    },
    {
      d: PARKING_D,
      title: t?.freeParkingTitle ?? "Park for free",
      desc: t?.freeParkingDesc ?? "This is one of the few places in the area with free parking.",
    },
    {
      d: CALENDAR_D,
      title: t?.freeCancellationTitle ?? "Free cancellation before Aug 7",
      desc: t?.freeCancellationDesc ?? "Get a full refund if you change your mind.",
    },
  ]

  return (
    <div className="space-y-6">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-6">
          <div className="flex-shrink-0 text-[#222222]">
            <DlsIcon d={row.d} />
          </div>
          <div className="space-y-0.5">
            <strong className="font-medium text-[#222222]">{row.title}</strong>
            <p className="text-sm text-[#6A6A6A]">{row.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
