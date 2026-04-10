import { Star, Globe, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IdentityVerified, Building, Chat, SuperhostSimple } from "@/components/atom/icons"

export default function MeetHost() {
  return (
    <div className="max-w-6xl mx-auto py-6 bg-white">
      <h1 className="text-3xl font-semibold text-gray-900 mb-8">Meet your host</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left side - Host profile */}
        <div className="space-y-8">
          <div className=" w-88 rounded-4xl border px-10 py-6 shadow-lg items-center justify-center">
            <div className="flex gap-20">
              {/* Left div - Image, name, superhost */}
              <div className="flex flex-col items-center">
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-200">
                    <img
                      src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=48&h=48&fit=crop"
                      alt="Host Faisal"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-[#e31c5f] rounded-full flex items-center justify-center">
                    <IdentityVerified className="w-4 h-4 text-white" />
                  </div>
                </div>
                <h2 className="text-3xl font-semibold text-gray-900 ">Faisal</h2>
                <div className="flex items-center gap-1 text-gray-600">
                  <SuperhostSimple className=" " />
                  <span className="text-xs">Superhost</span>
                </div>
              </div>

              {/* Right div - Statistics with dividers */}
              <div className="flex flex-col  gap-2 flex-1">
                <div className="">
                  <strong className="text-xl font-bold">75</strong>
                  <p className="text-xs -mt-1">Reviews</p>
                </div>

                <div className="w-24 h-[1px] bg-gray-300 "></div>

                <div className="leading-none">
                  <strong className="text-xl font-bold ">5.0</strong>
                  <p className="text-xs -mt-1">Rating</p>
                </div>

                <div className="w-24 h-[1px] bg-gray-300 "></div>

                <div className="leading-none">
                  <strong className="text-xl font-bold ">9</strong>
                  <p className="text-xs -mt-1">Months hosting</p>
                </div>
              </div>
            </div>
          </div>

          {/* Additional host info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Building className="w-5 h-5 text-gray-600" />
              <span className="text-gray-900">My work: Architect</span>
            </div>
            <div className="flex items-center gap-3">
              <Chat className="w-5 h-5 text-gray-600" />
              <span className="text-gray-900">Speaks Arabic and English</span>
            </div>
          </div>

          <div>
            <p className="text-gray-900 font-medium">Living the Dream!</p>
          </div>
        </div>

        {/* Right side - Host details */}
        <div className="space-y-4">
          <div>
            <h5 className="mb-2">Faisal is a Superhost</h5>
            <p className="text-sm leading-relaxed">
              Superhosts are experienced, highly rated hosts who are committed to providing great stays for guests.
            </p>
          </div>

          <div>
            <h5 className="mb-2">Host details</h5>
            <div className="">
              <p className="text-sm">Response rate: 100%</p>
              <p className="text-sm">Responds within an hour</p>
            </div>
          </div>

          <div>
            <Button
              className="bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-3 rounded-lg font-medium flex items-center gap-2"
              
            >
              
              Message host
            </Button>
          </div>

          {/* Security notice */}
          <div className="pt-8 border-t border-gray-200">
            <div className="flex items-start gap-3">
              
                <Shield className="w-8 h-8 text-[#e31c5f]" />
              
              <p className="text-sm text-gray-700 leading-relaxed">
                To help protect your payment, always use Mkan to send money and communicate with hosts.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
