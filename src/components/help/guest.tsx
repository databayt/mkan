import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle, ChevronRight } from "lucide-react"

export default function Guest() {
  return (
    <div className="py-10">
      {/* Main Content */}
      <div className="space-y-6">
        <h4 className="">Recommended for you</h4>

        <div className="flex space-x-4  ">
          {/* Action Required Card */}
          <Card className="border border-gray-300 max-w-xs pb-0 rounded-md">
            <CardHeader className="px-4">
              <div className="flex items-center gap-2 text-red-700 text-xs font-bold uppercase tracking-wide">
                <div className="w-4 h-4 bg-red-700 rounded-full flex items-center justify-center">
                  <span className="text-white text-xs font-bold">!</span>
                </div>
                ACTION REQUIRED
              </div>
            </CardHeader>
            <CardContent className="px-4">
              <h5 className="">Your identity is not fully verified</h5>
              <p className="text-sm leading-relaxed font-normal">
                Identity verification helps us check that you're really you. It's one of the ways we keep Mkan secure.
              </p>
            </CardContent>
            <div className="space-y-0">
              <div className="border-t border-gray-200 "></div>
              <Button variant="ghost" className="w-full justify-between text-start h-12 hover:bg-gray-50 border-0">
                <span className="font-semibold text-sm text-gray-900">Check identity verification status</span>
                <ChevronRight className="w-4 h-4 text-gray-900" />
              </Button>
              <div className="border-t border-gray-200"></div>
              <Button variant="ghost" className="w-full justify-between text-start h-12 hover:bg-gray-50 border-0">
                <span className="font-semibold text-sm text-gray-900">Learn more</span>
                <ChevronRight className="w-4 h-4 text-gray-900" />
              </Button>
            </div>
          </Card>

          {/* Quick Link Card */}
          <Card className="border border-gray-300 max-w-xs pb-0 relative rounded-md">
            <CardHeader className="px-4">
              <div className="text-gray-500 text-xs font-semibold uppercase tracking-wide">QUICK LINK</div>
            </CardHeader>
            <CardContent className="px-4">
              <h5 className="">Finding reservation details</h5>
              <p className="text-sm leading-relaxed font-normal">
                Your Trips tab has full details, receipts, and Host contact info for each of your reservations.
              </p>
            </CardContent>
            <div className="absolute bottom-0 left-0 right-0">
              <div className="border-t border-gray-200 "></div>
              <Button  className="bg-transparent w-full justify-between text-start h-12 hover:rounded-lg hover:bg-gray-50 border-0">
                <span className="font-semibold text-sm text-gray-900">Go to Trips</span>
                <ChevronRight className="w-4 h-4 text-gray-900" />
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
