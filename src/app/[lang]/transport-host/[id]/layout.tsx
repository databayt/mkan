import type { Metadata } from "next"
import { requireAuth } from "@/lib/auth-guard"
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
  }
}

export default async function TransportHostLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string; id: string }>
}) {
  const { lang } = await params
  await requireAuth(lang)

  return <TransportHostLayoutClient>{children}</TransportHostLayoutClient>
}
