"use client";

import { WifiIcon, DedicatedWorkspaceIcon, KitchenIcon } from "@/components/atom/icons"
import { useDictionary } from "@/components/internationalization/use-dictionary"

export default function MobileInfo() {
  const dict = useDictionary()
  const info = dict?.atom?.propertyInfo

  return (
    <div className="md:hidden px-4 py-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <WifiIcon className="w-5 h-5 text-gray-700" />
        </div>
        <div className="space-y-1">
          <strong className="font-semibold text-gray-900 text-sm">{info?.fastWifiTitle ?? "Fast wifi"}</strong>
          <p className="text-gray-600 text-sm">{info?.fastWifiDesc ?? "100 Mbps download speed for streaming and video calls."}</p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <DedicatedWorkspaceIcon className="w-5 h-5 text-gray-700" />
        </div>
        <div className="space-y-1">
          <strong className="font-semibold text-gray-900 text-sm">{info?.freeParkingTitle ?? "Park for free"}</strong>
          <p className="text-gray-600 text-sm">{info?.freeParkingDesc ?? "This is one of the few places in the area with free parking."}</p>
        </div>
      </div>

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <KitchenIcon className="w-5 h-5 text-gray-700" />
        </div>
        <div className="space-y-1">
          <strong className="font-semibold text-gray-900 text-sm">{info?.freeCancellationTitle ?? "Free cancellation before Aug 7"}</strong>
          <p className="text-gray-600 text-sm">{info?.freeCancellationDesc ?? "Get a full refund if you change your mind."}</p>
        </div>
      </div>
    </div>
  )
}