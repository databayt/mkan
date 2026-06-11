"use client"

import Image from "next/image"
import { Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IdentityVerified, Building, Chat, SuperhostSimple } from "@/components/atom/icons"
import { useDictionary } from "@/components/internationalization/dictionary-context"

interface MeetHostUser {
  username: string | null;
  email?: string | null;
  image?: string | null;
}

interface MeetHostProps {
  hostUser?: MeetHostUser | null;
  reviewsCount?: number;
  averageRating?: number;
  hostingMonths?: number;
  superhost?: boolean;
}

const FALLBACK_AVATAR =
  "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=48&h=48&fit=crop";

export default function MeetHost({
  hostUser,
  reviewsCount,
  averageRating,
  hostingMonths,
  superhost = false,
}: MeetHostProps) {
  const dict = useDictionary()
  const host = dict.rental?.host as Record<string, any> | undefined
  const displayName =
    hostUser?.username ?? hostUser?.email?.split("@")[0] ?? host?.hostFallback ?? "Host";
  const avatar = hostUser?.image ?? FALLBACK_AVATAR;
  return (
    <div className="max-w-6xl mx-auto py-6 bg-white">
      <h1 className="text-3xl font-semibold text-gray-900 mb-8">{host?.meetYourHost}</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Left side - Host profile */}
        <div className="space-y-8">
          <div className=" w-88 rounded-4xl border px-10 py-6 shadow-lg items-center justify-center">
            <div className="flex gap-20">
              {/* Left div - Image, name, superhost */}
              <div className="flex flex-col items-center">
                <div className="relative mb-4">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-gray-200 relative">
                    <Image
                      src={avatar}
                      alt={displayName}
                      width={80}
                      height={80}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="absolute -bottom-1 -end-1 w-7 h-7 bg-[#e31c5f] rounded-full flex items-center justify-center">
                    <IdentityVerified className="w-4 h-4 text-white" />
                  </div>
                </div>
                <h2 className="text-3xl font-semibold text-gray-900 ">{displayName}</h2>
                {superhost && (
                  <div className="flex items-center gap-1 text-gray-600">
                    <SuperhostSimple className=" " />
                    <span className="text-xs">{host?.superhost}</span>
                  </div>
                )}
              </div>

              {/* Right div - Statistics with dividers */}
              <div className="flex flex-col  gap-2 flex-1">
                {typeof reviewsCount === "number" && (
                  <>
                    <div>
                      <strong className="text-xl font-bold">{reviewsCount}</strong>
                      <p className="text-xs -mt-1">{host?.reviews}</p>
                    </div>
                    <div className="w-24 h-[1px] bg-gray-300 " />
                  </>
                )}

                {typeof averageRating === "number" && averageRating > 0 && (
                  <>
                    <div className="leading-none">
                      <strong className="text-xl font-bold ">{averageRating.toFixed(1)}</strong>
                      <p className="text-xs -mt-1">{host?.rating}</p>
                    </div>
                    <div className="w-24 h-[1px] bg-gray-300 " />
                  </>
                )}

                {typeof hostingMonths === "number" && (
                  <div className="leading-none">
                    <strong className="text-xl font-bold ">{hostingMonths}</strong>
                    <p className="text-xs -mt-1">{host?.monthsHosting}</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Additional host info */}
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Building className="w-5 h-5 text-gray-600" />
              <span className="text-gray-900">{host?.myWork}</span>
            </div>
            <div className="flex items-center gap-3">
              <Chat className="w-5 h-5 text-gray-600" />
              <span className="text-gray-900">{host?.speaksLanguages}</span>
            </div>
          </div>

          <div>
            <p className="text-gray-900 font-medium">{host?.livingTheDream}</p>
          </div>
        </div>

        {/* Right side - Host details */}
        <div className="space-y-4">
          {superhost && (
            <div>
              <h5 className="mb-2">{host?.isSuperhost?.replace('{name}', displayName)}</h5>
              <p className="text-sm leading-relaxed">
                {host?.superhostDescription}
              </p>
            </div>
          )}

          <div>
            <h5 className="mb-2">{host?.hostDetails}</h5>
            <div className="">
              <p className="text-sm">{host?.responseRate}</p>
              <p className="text-sm">{host?.respondsWithin}</p>
            </div>
          </div>

          <div>
            <Button
              className="bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-3 rounded-lg font-medium flex items-center gap-2"
              
            >
              
              {host?.messageHost}
            </Button>
          </div>

          {/* Security notice */}
          <div className="pt-8 border-t border-gray-200">
            <div className="flex items-start gap-3">
              
                <Shield className="w-8 h-8 text-[#e31c5f]" />
              
              <p className="text-sm text-gray-700 leading-relaxed">
                {host?.paymentProtection}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
