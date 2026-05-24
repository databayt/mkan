"use client"

import { WifiIcon, DedicatedWorkspaceIcon, KitchenIcon } from "./icons"
import { useDictionary } from "@/components/internationalization/dictionary-context"

export default function AirbnbInfo() {
  const dict = useDictionary()
  const t = dict?.atom?.propertyInfo

  return (
    <div className="max-w-2xl mx-auto space-y-6 py-6">
      <div className="flex items-start gap-4 ">
        <div className="flex-shrink-0">
          <WifiIcon className="w-6 h-6 text-gray-700" />
        </div>
        <div className="space-y-1">
          <strong className="font-semibold text-gray-900">{t?.fastWifiTitle ?? "Fast wifi"}</strong>
          <p className="text-gray-600">{t?.fastWifiDesc ?? "100 Mbps download speed for streaming and video calls."}</p>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <DedicatedWorkspaceIcon className="w-6 h-6 text-gray-700" />
        </div>
        <div className="space-y-1">
          <strong className="font-semibold text-gray-900">{t?.freeParkingTitle ?? "Park for free"}</strong>
          <p className="text-gray-600">{t?.freeParkingDesc ?? "This is one of the few places in the area with free parking."}</p>
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0">
          <KitchenIcon className="w-6 h-6 text-gray-700" />
        </div>
        <div className="space-y-1">
          <strong className="font-semibold text-gray-900">{t?.freeCancellationTitle ?? "Free cancellation before Aug 7"}</strong>
          <p className="text-gray-600">{t?.freeCancellationDesc ?? "Get a full refund if you change your mind."}</p>
        </div>
      </div>
    </div>
  )
}
