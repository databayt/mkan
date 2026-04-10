import { requireAuth } from "@/lib/auth-guard"
import HostingHeader from '@/components/hosting/hosting-header'
import NotificationCard from '@/components/hosting/notification-card'

export default async function HostingLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  await requireAuth(lang)

  return (
    <div className="min-h-screen">
      <NotificationCard
        subtitle="hello mkan"
        title="Confirm a few key details"
        description="Required to publish"
      />
      <HostingHeader />
      <main id="main-content" className="px-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
