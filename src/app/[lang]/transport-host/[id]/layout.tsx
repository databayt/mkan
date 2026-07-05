import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { requireAuth } from "@/lib/auth-guard"
import { canOverride } from "@/lib/auth"
import { db } from "@/lib/db"
import { getDictionary } from "@/components/internationalization/dictionaries"
import TransportHostLayoutClient from "./layout-client"

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; id: string }>
}): Promise<Metadata> {
  const { lang } = await params
  const dict = await getDictionary(lang as "en" | "ar")
  const t = dict?.transportHost?.metadata
  return {
    title: t?.title ?? "Transport Host",
    description: t?.description ?? "Manage your transport offices and bookings",
    robots: { index: false, follow: false },
  }
}

export default async function TransportHostLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string; id: string }>
}) {
  const { lang, id } = await params
  const session = await requireAuth(lang)

  // Ownership gate: this [id] is a TransportOffice id. requireAuth alone let
  // ANY authenticated user view another operator's office dashboard. Mirror
  // the action-level canOverride(session, office.ownerId) check (operators
  // have no dedicated role — ownership is tracked via TransportOffice.ownerId).
  const officeId = Number(id)
  const office = Number.isFinite(officeId)
    ? await db.transportOffice.findUnique({
        where: { id: officeId },
        select: { ownerId: true },
      })
    : null
  if (!office || !canOverride(session, office.ownerId)) {
    redirect(`/${lang}`)
  }

  return <TransportHostLayoutClient>{children}</TransportHostLayoutClient>
}
