import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth-guard"
import { canOverride } from "@/lib/auth"
import { db } from "@/lib/db"
import HostLayoutClient from "./layout-client"

export default async function HostLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string; id: string }>
}) {
  const { lang, id } = await params
  const session = await requireAuth(lang)

  // Ownership gate: this [id] is a Listing id. requireAuth alone let ANY
  // authenticated user walk another host's onboarding flow and only fail at
  // the final updateListing/publishListing canOverride(session, hostId) check.
  // Mirror that action-level check here so the wall is the route boundary, not
  // the "Create" button.
  const listingId = Number(id)
  const listing = Number.isFinite(listingId)
    ? await db.listing.findUnique({
        where: { id: listingId },
        select: { hostId: true },
      })
    : null
  if (!listing || !canOverride(session, listing.hostId)) {
    redirect(`/${lang}`)
  }

  return <HostLayoutClient>{children}</HostLayoutClient>
}
