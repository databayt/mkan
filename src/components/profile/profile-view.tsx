"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowLeft, Plane, Users } from "lucide-react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { useDictionary } from "@/components/internationalization/dictionary-context"
import { isRTL, type Locale } from "@/components/internationalization/config"
import { cn } from "@/lib/utils"

import { PromptIcon, type PromptKey } from "./prompt-icons"
import { ReviewsIcon } from "./prompt-icons"
import { headingStyle, initialOf, type ProfileData, type ProfileUser } from "./types"

const DETAIL_ORDER: PromptKey[] = [
  "whereILive", "work", "languages", "school", "decadeBorn", "whereWantedToGo",
  "pets", "spendTime", "song", "funFact", "uselessSkill", "obsessedWith", "bioTitle",
]

const AVATAR_TINT = { backgroundColor: "#ede9fb", color: "#503eb2" } as const

interface ProfileViewProps {
  user: ProfileUser
  lang: Locale
  profile: ProfileData
}

export function ProfileView({ user, lang, profile }: ProfileViewProps) {
  const dict = useDictionary()
  const router = useRouter()
  const t = dict.profile
  const editHref = `/${lang}/profile/about?editMode=true`
  const rtl = isRTL(lang)

  const filledKeys = DETAIL_ORDER.filter((k) => {
    const v = profile[k]
    return Array.isArray(v) ? v.length > 0 : Boolean(v)
  })
  const hasContent =
    Boolean(profile.bio) || filledKeys.length > 0 || profile.interests.length > 0

  return (
    <main id="main-content" className="mx-auto w-full max-w-[1280px] px-6 py-6 lg:px-10 lg:py-8">
      {/* Mobile top bar */}
      <div className="mb-6 flex items-center justify-between lg:hidden">
        <button
          type="button"
          aria-label={t?.back ?? "Back"}
          onClick={() => router.back()}
          className="inline-flex size-10 items-center justify-center rounded-full bg-muted text-foreground"
        >
          <ArrowLeft className="size-5" style={{ transform: rtl ? "scaleX(-1)" : undefined }} />
        </button>
        <EditPill href={editHref} label={t?.edit ?? "Edit"} />
      </div>

      <div className="lg:flex lg:items-start lg:gap-0">
        {/* Sidebar (desktop only) */}
        <aside className="hidden lg:sticky lg:top-8 lg:flex lg:w-[345px] lg:shrink-0 lg:flex-col lg:gap-3 lg:py-9">
          <h1 style={headingStyle.h1} className="mb-3 text-foreground">
            {t?.profile ?? "Profile"}
          </h1>
          <div className="flex h-[60px] items-center gap-3 rounded-2xl bg-muted px-4">
            <Avatar className="size-9">
              {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
              <AvatarFallback style={{ ...AVATAR_TINT, fontSize: 16, fontWeight: 600 }}>
                {initialOf(user.name)}
              </AvatarFallback>
            </Avatar>
            <span className="text-base font-medium text-foreground">{t?.aboutMe ?? "About me"}</span>
          </div>
          <SidebarItem icon={<Plane className="size-6" strokeWidth={1.6} />} label={t?.pastTrips ?? "Past trips"} />
          <SidebarItem icon={<Users className="size-6" strokeWidth={1.6} />} label={t?.connections ?? "Connections"} />
        </aside>

        {/* Content */}
        <div className="lg:flex-1 lg:border-s lg:border-border lg:py-9 lg:ps-[60px]">
          <div className="mb-6 hidden items-center gap-3 lg:flex">
            <h2 style={headingStyle.h2} className="text-foreground">
              {t?.aboutMe ?? "About me"}
            </h2>
            <EditPill href={editHref} label={t?.edit ?? "Edit"} />
          </div>

          <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[345px_minmax(0,1fr)] lg:gap-10">
            {/* Profile card */}
            <div
              className="mx-auto flex w-full max-w-[345px] flex-col items-center justify-center gap-4 rounded-3xl bg-card px-6 py-8 lg:mx-0 lg:h-[230px]"
              style={{ boxShadow: "rgba(0,0,0,0.02) 0 0 0 1px, rgba(0,0,0,0.1) 0 8px 24px" }}
            >
              <Avatar className="size-[104px]">
                {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
                <AvatarFallback style={{ ...AVATAR_TINT, fontSize: 44, fontWeight: 600 }}>
                  {initialOf(user.name)}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-center gap-0.5">
                <span style={headingStyle.h2} className="text-foreground">{user.name}</span>
                {user.isHost ? (
                  <span className="text-xs text-muted-foreground">{t?.host ?? "Host"}</span>
                ) : null}
              </div>
            </div>

            {/* Filled profile OR empty-state CTA */}
            {hasContent ? (
              <div className="w-full text-start">
                {profile.bio ? (
                  <p className="mb-6 whitespace-pre-wrap text-base leading-6 text-foreground">{profile.bio}</p>
                ) : null}
                <div className="flex flex-col gap-4">
                  {filledKeys.map((key) => {
                    const v = profile[key]
                    const display = Array.isArray(v) ? v.join(", ") : v
                    return (
                      <div key={key} className="flex items-center gap-3 text-base text-foreground">
                        <PromptIcon name={key} className="text-foreground/80" />
                        <span>{display}</span>
                      </div>
                    )
                  })}
                </div>
                {profile.interests.length > 0 ? (
                  <div className="mt-6 flex flex-wrap gap-2">
                    {profile.interests.map((i) => (
                      <Badge key={i} variant="secondary" className="px-3 py-1.5 text-sm font-normal">
                        {i}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="flex flex-col items-center text-center lg:items-start lg:text-start">
                <h3 style={headingStyle.h3} className="text-foreground">
                  {t?.completeYourProfile ?? "Complete your profile"}
                </h3>
                <p className="mt-4 max-w-[368px] text-sm leading-[18px] text-muted-foreground">
                  {t?.completeProfileBody ??
                    "Your Mkan profile is an important part of every reservation. Complete yours to help other hosts and guests get to know you."}
                </p>
                <Link
                  href={editHref}
                  className="mt-6 inline-flex items-center rounded-xl bg-primary px-6 py-3.5 text-base font-medium leading-5 text-primary-foreground transition-opacity hover:opacity-90"
                >
                  {t?.getStarted ?? "Get started"}
                </Link>
              </div>
            )}
          </div>

          {/* Show reviews */}
          <div className="mt-10 border-t border-border pt-8">
            <button type="button" className="flex items-center gap-3 text-base font-medium text-foreground">
              <ReviewsIcon className="size-6" />
              {t?.showReviewsWritten ?? "Show reviews I've written"}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}

function SidebarItem({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className={cn(
        "flex h-[60px] items-center gap-3 rounded-2xl px-4 text-start text-muted-foreground",
        "transition-colors hover:bg-muted hover:text-foreground",
      )}
    >
      <span className="flex size-9 items-center justify-center">{icon}</span>
      <span className="text-base font-medium">{label}</span>
    </button>
  )
}

function EditPill({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted/70"
    >
      {label}
    </Link>
  )
}
