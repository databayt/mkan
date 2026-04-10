"use client";

import { Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IdentityVerified, Building, Chat, SuperhostSimple } from "@/components/atom/icons"
import { useDictionary } from "@/components/internationalization/dictionary-context"

export default function MobileMeetHost() {
  const dict = useDictionary()
  const host = dict.rental?.host as Record<string, any> | undefined
  return (
    <div className="md:hidden px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">{host?.meetYourHost}</h1>

      {/* Host profile card */}
      <div className="border rounded-xl px-6 py-6 shadow-sm">
        <div className="flex items-center space-x-4">
          {/* Host image and verification */}
          <div className="relative">
            <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200">
              <img
                src="https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=48&h=48&fit=crop"
                alt="Host Faisal"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#e31c5f] rounded-full flex items-center justify-center">
              <IdentityVerified className="w-3 h-3 text-white" />
            </div>
          </div>

          {/* Host name and superhost status */}
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">Faisal</h2>
            <div className="flex items-center gap-1 text-gray-600">
              <SuperhostSimple className="w-4 h-4" />
              <span className="text-xs">{host?.superhost}</span>
            </div>
          </div>

          {/* Host stats */}
          <div className="text-end space-y-1">
            <div>
              <strong className="text-lg font-bold">75</strong>
              <p className="text-xs text-gray-600">{host?.reviews}</p>
            </div>
            <div>
              <strong className="text-lg font-bold">5.0</strong>
              <p className="text-xs text-gray-600">{host?.rating}</p>
            </div>
            <div>
              <strong className="text-lg font-bold">9</strong>
              <p className="text-xs text-gray-600">{host?.months}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Additional host info */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Building className="w-4 h-4 text-gray-600" />
          <span className="text-gray-900 text-sm">{host?.myWork}</span>
        </div>
        <div className="flex items-center gap-3">
          <Chat className="w-4 h-4 text-gray-600" />
          <span className="text-gray-900 text-sm">{host?.speaksLanguages}</span>
        </div>
      </div>

      <div>
        <p className="text-gray-900 font-medium text-sm">{host?.livingTheDream}</p>
      </div>

      {/* Host details */}
      <div className="space-y-4">
        <div>
          <h5 className="mb-2 text-sm font-medium">{host?.isSuperhost?.replace('{name}', 'Faisal')}</h5>
          <p className="text-sm leading-relaxed text-gray-600">
            {host?.superhostDescription}
          </p>
        </div>

        <div>
          <h5 className="mb-2 text-sm font-medium">{host?.hostDetails}</h5>
          <div className="space-y-1">
            <p className="text-sm text-gray-600">{host?.responseRate}</p>
            <p className="text-sm text-gray-600">{host?.respondsWithin}</p>
          </div>
        </div>

        <div>
          <Button
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            {host?.messageHost}
          </Button>
        </div>

        {/* Security notice */}
        <div className="pt-4 border-t border-gray-200">
          <div className="flex items-start gap-3">
            <Shield className="w-6 h-6 text-[#e31c5f] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-gray-700 leading-relaxed">
              {host?.paymentProtection}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 