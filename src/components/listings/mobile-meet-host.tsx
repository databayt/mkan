"use client";

import { Fragment } from "react"
import Image from "next/image"
import { Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { IdentityVerified, Building, Chat, SuperhostSimple } from "@/components/atom/icons"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { PHASE1 } from "@/config/phase-flags"

interface MobileMeetHostUser {
  username: string | null;
  email?: string | null;
  image?: string | null;
}

interface MobileMeetHostProps {
  hostUser?: MobileMeetHostUser | null;
  reviewsCount?: number;
  averageRating?: number;
  hostingMonths?: number;
  superhost?: boolean;
}

const FALLBACK_AVATAR =
  "https://cdn.databayt.org/mkan/stock/photo-1506905925346-21bda4d32df4.jpg";

/** Small filled star (14px) — matches the Airbnb rating stat glyph. */
function RatingStar() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="h-3.5 w-3.5 fill-current"
    >
      <path d="M7.57 1.1 5.51 5.24l-4.57.65a.5.5 0 0 0-.29.14l-.06.1c-.1.2-.11.27-.03.44l.1.18 3.3 3.23-.8 4.55a.5.5 0 0 0 .05.32l.07.08c.16.17.22.2.41.17l.2-.04 4.1-2.13 4.08 2.16c.1.06.21.07.33.05l.08-.04c.21-.1.26-.15.3-.34l.02-.2-.77-4.55 3.32-3.22a.5.5 0 0 0 .15-.3l-.01-.1c-.05-.3-.08-.3-.42-.46l-4.57-.68L8.47 1.1a.5.5 0 0 0-.9 0z" />
    </svg>
  );
}

export default function MobileMeetHost({
  hostUser,
  reviewsCount,
  averageRating,
  hostingMonths,
  superhost = false,
}: MobileMeetHostProps) {
  const dict = useDictionary()
  const host = dict.rental?.host as Record<string, any> | undefined
  const displayName =
    hostUser?.username ?? hostUser?.email?.split("@")[0] ?? host?.hostFallback ?? "Host";
  const avatar = hostUser?.image ?? FALLBACK_AVATAR;

  // Airbnb switches the tenure stat from "Months hosting" to "Years hosting"
  // once the host crosses a year — mirror that so we never show "13 Months".
  const stats: Array<{ value: string; label: string; star?: boolean }> = [];
  if (typeof reviewsCount === "number") {
    stats.push({ value: String(reviewsCount), label: host?.reviews });
  }
  if (typeof averageRating === "number" && averageRating > 0) {
    stats.push({ value: averageRating.toFixed(1), label: host?.rating, star: true });
  }
  if (typeof hostingMonths === "number") {
    stats.push(
      hostingMonths >= 12
        ? { value: String(Math.floor(hostingMonths / 12)), label: host?.yearsHosting }
        : { value: String(hostingMonths), label: host?.monthsHosting }
    );
  }

  return (
    <div className="md:hidden px-6 py-8 space-y-6 relative before:content-[''] before:absolute before:inset-x-6 before:top-0 before:h-px before:bg-[#DDDDDD]">
      <h2 className="text-[22px] font-medium leading-[26px] tracking-[-0.44px] text-[#222222]">{host?.meetYourHost}</h2>

      {/* Host profile card — avatar + name on top, divided stat row beneath */}
      <div
        className="rounded-2xl border border-[#DDDDDD] px-6 py-8"
        style={{ boxShadow: "0 6px 16px rgba(0,0,0,0.12)" }}
      >
        <div className="flex items-center gap-5">
          {/* Host image and verification badge */}
          <div className="relative shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-muted relative">
              <Image
                src={avatar}
                alt={displayName}
                width={96}
                height={96}
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute bottom-0 -end-1 w-7 h-7 rounded-full bg-[#e31c5f] ring-2 ring-white flex items-center justify-center">
              <IdentityVerified className="w-4 h-4 text-white" />
            </div>
          </div>

          {/* Host name and role/superhost label */}
          <div className="min-w-0">
            <h3 className="text-2xl font-semibold leading-tight text-[#222222] truncate">{displayName}</h3>
            <div className="mt-1 flex items-center gap-1 text-sm text-[#6a6a6a]">
              {superhost ? (
                <>
                  <SuperhostSimple className="w-3.5 h-3.5" />
                  <span>{host?.superhost}</span>
                </>
              ) : (
                <span>{host?.hostFallback}</span>
              )}
            </div>
          </div>
        </div>

        {/* Stat row — number over label, vertical dividers between */}
        {stats.length > 0 && (
          <div className="mt-6 flex items-stretch">
            {stats.map((s, i) => (
              <Fragment key={s.label}>
                {i > 0 && <div className="w-px bg-[#DDDDDD] mx-4 self-stretch" />}
                <div className="flex flex-col justify-center">
                  <span className="flex items-center gap-1 text-base font-semibold text-[#222222]">
                    {s.value}
                    {s.star && <RatingStar />}
                  </span>
                  <span className="text-xs text-[#6a6a6a]">{s.label}</span>
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      {/* Host facts */}
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Building className="w-6 h-6 text-[#222222]" />
          <span className="text-[#222222] text-base">{host?.myWork}</span>
        </div>
        <div className="flex items-center gap-3">
          <Chat className="w-6 h-6 text-[#222222]" />
          <span className="text-[#222222] text-base">{host?.speaksLanguages}</span>
        </div>
      </div>

      <p className="text-[#222222] text-base leading-6">{host?.livingTheDream}</p>

      {/* Host details */}
      <div className="space-y-4">
        {superhost && (
          <div>
            <h3 className="mb-1 text-base font-semibold text-[#222222]">{host?.isSuperhost?.replace('{name}', displayName)}</h3>
            <p className="text-sm leading-relaxed text-[#6a6a6a]">
              {host?.superhostDescription}
            </p>
          </div>
        )}

        <div>
          <h3 className="mb-1 text-base font-semibold text-[#222222]">{host?.hostDetails}</h3>
          <div className="text-sm text-[#6a6a6a] space-y-0.5">
            <p>{host?.responseRate}</p>
            <p>{host?.respondsWithin}</p>
          </div>
        </div>

        {/* Message host — inert in phase 1 (no handler); hidden until wired. See phase-flags. */}
        {PHASE1.showMessageHost && (
        <div>
          <Button
            className="w-full bg-gray-100 hover:bg-gray-200 text-gray-900 px-6 py-2 rounded-lg font-medium flex items-center justify-center gap-2"
          >
            {host?.messageHost}
          </Button>
        </div>
        )}

        {/* Payment-protection notice — hidden in contact-only phase 1 (no online payment). See phase-flags. */}
        {PHASE1.enableOnlineBooking && (
        <div className="pt-4 border-t border-[#DDDDDD]">
          <div className="flex items-start gap-3">
            <Shield className="w-6 h-6 text-[#e31c5f] flex-shrink-0 mt-0.5" />
            <p className="text-sm text-[#6a6a6a] leading-relaxed">
              {host?.paymentProtection}
            </p>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}
