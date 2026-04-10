import { requireAuth } from "@/lib/auth-guard"
import TransportHostLayoutClient from "./layout-client"

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
