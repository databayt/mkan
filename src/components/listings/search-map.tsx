import { Plus, Minus, Maximize2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

export default function SearchMap() {
  return (
    <div className="w-[430px] border-s border-gray-200">
      {/* Sticky map container - sticks until end of listings */}
      <div className="sticky top-16 w-[430px] h-[calc(100vh-64px)] bg-gray-100">
        {/* Actual map image */}
        <img
          src="/search-map.png"
          alt="Map of Bordeaux region"
          className="w-full h-full object-cover"
        />
        
        {/* Map controls overlay */}
        <div className="absolute top-8 left-1/2 transform -translate-x-1/2">
          {/* Search as I move the map checkbox */}
          <div className="bg-white rounded-lg p-2 shadow-lg flex items-center gap-2">
            <Checkbox id="search-as-move" defaultChecked className="border-black bg-black w-3 h-3" />
            <label htmlFor="search-as-move" className="text-xs font-medium text-gray-700">
              Search as I move the map
            </label>
          </div>
        </div>

        {/* Price bubbles overlay - positioned slightly up */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[80px] left-[180px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $110
            </Button>
          </div>
          <div className="absolute top-[105px] left-[220px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $150
            </Button>
          </div>
          <div className="absolute top-[140px] left-[250px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $500
            </Button>
          </div>
          <div className="absolute top-[165px] left-[270px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $275
            </Button>
          </div>
          <div className="absolute top-[185px] left-[275px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $140
            </Button>
          </div>
          <div className="absolute top-[205px] left-[320px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $190
            </Button>
          </div>
          <div className="absolute top-[225px] left-[250px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $350
            </Button>
          </div>
          <div className="absolute top-[235px] left-[320px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $200
            </Button>
          </div>
          <div className="absolute top-[315px] left-[275px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $95
            </Button>
          </div>
          <div className="absolute top-[345px] left-[255px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $325
            </Button>
          </div>
          <div className="absolute top-[380px] left-[320px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $125
            </Button>
          </div>
          <div className="absolute top-[400px] left-[260px]">
            <Button size="sm" variant="outline" className="rounded-full px-1.5 py-0.5 text-xs font-medium bg-white border-gray-200 shadow-sm h-6">
              $200
            </Button>
          </div>
        </div>

        {/* Bottom right map controls */}
        <div className="absolute bottom-4 right-4 flex gap-1">
          <Button size="icon" variant="outline" className="w-7 h-7 rounded-full bg-white border-gray-200 hover:bg-gray-100" aria-label="Zoom in">
            <Plus className="w-3 h-3 text-gray-700" />
          </Button>
          <Button size="icon" variant="outline" className="w-7 h-7 rounded-full bg-white border-gray-200 hover:bg-gray-100" aria-label="Zoom out">
            <Minus className="w-3 h-3 text-gray-700" />
          </Button>
        </div>

        {/* Top right maximize button */}
        <Button
          size="icon"
          variant="outline"
          className="absolute top-4 right-4 w-7 h-7 rounded-full bg-white border-gray-200 hover:bg-gray-100"
          aria-label="Fullscreen map"
        >
          <svg className="w-2.5 h-2.5 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" strokeWidth="2"/>
          </svg>
        </Button>
      </div>
    </div>
  )
} 