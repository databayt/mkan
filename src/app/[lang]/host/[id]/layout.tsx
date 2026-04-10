import { requireAuth } from "@/lib/auth-guard"
import HostLayoutClient from "./layout-client"

export default async function HostLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string; id: string }>
}) {
  const { lang } = await params
  await requireAuth(lang)

  return <HostLayoutClient>{children}</HostLayoutClient>
}
