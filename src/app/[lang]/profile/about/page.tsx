import type { Metadata } from "next"

import { getDictionary } from "@/components/internationalization/dictionaries"
import type { Locale } from "@/components/internationalization/config"
import { requireAuth } from "@/lib/auth-guard"
import { db } from "@/lib/db"
import { ProfileEdit } from "@/components/profile/profile-edit"
import { ProfileView } from "@/components/profile/profile-view"
import { AboutProfileDialog } from "@/components/profile/about-profile-dialog"
import { EMPTY_PROFILE, toProfileData, type ProfileUser } from "@/components/profile/types"

// Authenticated, per-user, query-param driven (?editMode=true) — always dynamic.
export const dynamic = "force-dynamic"

type PageParams = { lang: Locale }
type PageSearch = { editMode?: string; context?: string }

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<PageParams>
  searchParams: Promise<PageSearch>
}): Promise<Metadata> {
  const { lang } = await params
  const { editMode } = await searchParams
  const dict = await getDictionary(lang)
  const t = dict.profile
  return {
    title:
      editMode === "true"
        ? t?.metaTitleEdit ?? "Edit profile"
        : t?.metaTitleView ?? "Profile",
  }
}

export default async function ProfileAboutPage({
  params,
  searchParams,
}: {
  params: Promise<PageParams>
  searchParams: Promise<PageSearch>
}) {
  const { lang } = await params
  const { editMode } = await searchParams
  const session = await requireAuth(lang)

  const dbUser = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      username: true,
      email: true,
      image: true,
      role: true,
      profile: true,
      _count: { select: { listings: true } },
    },
  })

  const name =
    dbUser?.username?.trim() || dbUser?.email?.split("@")[0] || "Guest"

  const user: ProfileUser = {
    id: session.user.id,
    name,
    image: dbUser?.image ?? null,
    isHost: (dbUser?._count.listings ?? 0) > 0 || dbUser?.role === "MANAGER",
  }

  const profile = dbUser?.profile ? toProfileData(dbUser.profile) : EMPTY_PROFILE

  return editMode === "true" ? (
    <ProfileEdit user={user} lang={lang} initialProfile={profile} />
  ) : (
    <>
      <ProfileView user={user} lang={lang} profile={profile} />
      <AboutProfileDialog />
    </>
  )
}
