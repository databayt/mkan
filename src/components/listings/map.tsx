"use client"

import { Button } from "@/components/ui/button"
import { ChevronRight, Home, Minus, Plus } from "lucide-react"
import Image from "next/image"
import { useDictionary } from "@/components/internationalization/dictionary-context"

export default function Location() {
  const dict = useDictionary()
  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <h1 className="text-2xl font-semibold mb-6 text-[#000000]">{dict.rental?.map?.whereYoullBe}</h1>

      {/* Map Container */}
      <div className="relative w-full h-[400px] mb-6 rounded-lg overflow-hidden border border-[#e5e7eb]">
        {/* Map Background */}
        <div className="absolute inset-0 bg-[#ffffff]">
          <Image
            src="/assets/map.png"
            alt="Map of Bordeaux, France showing the Garonne River, Grands Hommes district, and surrounding areas"
            width={1200}
            height={500}
            className="w-full h-full object-cover"
            priority
            unoptimized
          />
        </div>

        {/* Location Pin and Tooltip Container */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
          {/* Location Tooltip */}
          <div className="relative bg-[#ffffff] shadow-lg border border-[#e5e7eb] px-4 py-2 mb-4">
            <p className="text-sm text-[#374151] whitespace-nowrap font-medium">{dict.rental?.map?.exactLocation}</p>
            {/* Down arrow */}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-s-5 border-e-5 border-t-5 border-s-transparent border-e-transparent border-t-[#ffffff]"></div>
          </div>

          {/* Location Pin */}
          <div className="relative">
            <div className="w-10 h-10 bg-[#de3151] rounded-full flex items-center justify-center shadow-lg">
              <Home className="w-5 h-5 text-[#ffffff]" />
            </div>
          </div>
        </div>

        {/* Zoom Controls */}
        <div className="absolute bottom-4 right-4 flex gap-1">
          <Button size="icon" variant="outline" className="w-7 h-7 rounded-full bg-[#ffffff] border-[#e5e7eb] hover:bg-[#e5e7eb]" aria-label="Zoom in">
            <Plus className="w-3 h-3 text-[#374151]" />
          </Button>
          <Button size="icon" variant="outline" className="w-7 h-7 rounded-full bg-[#ffffff] border-[#e5e7eb] hover:bg-[#e5e7eb]" aria-label="Zoom out">
            <Minus className="w-3 h-3 text-[#374151]" />
          </Button>
        </div>

        {/* Fullscreen Button */}
        <Button
          size="icon"
          variant="outline"
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-[#ffffff] border-[#e5e7eb] hover:bg-[#e5e7eb]"
          aria-label="Fullscreen map"
        >
          <svg className="w-2.5 h-2.5 text-[#374151]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeWidth="2"/>
          </svg>
        </Button>
      </div>

      {/* Location Information */}
      <div className="space-y-4">
        <h2 className="text-xl font-semibold text-[#000000]">Bordeaux, Nouvelle-Aquitaine, France</h2>

        <p className="text-[#374151] leading-relaxed">
          Very dynamic and appreciated district by the people of Bordeaux thanks to rue St James and place Fernand
          Lafargue. Home to many historical monuments such as the Grosse Cloche, the Porte de Bourgogne and the Porte
          Cailhau, and cultural sites such as the Aquitaine Museum.
        </p>

        <button className="flex items-center p-0 underline h-auto text-[#000000] hover:text-[#374151] font-medium">
          {dict.rental?.map?.showMore}
          <ChevronRight className="w-3 h-3 ms-1 rtl:rotate-180" />
        </button>
      </div>
    </div>
  )
}
