import { UserRole } from "@prisma/client"
import { requireRole } from "@/lib/auth-guard"
import HostingHeader from '@/components/hosting/hosting-header'
import { ReportIssueFooter } from '@/components/report-issue/footer'

export default async function HostingLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = await params
  await requireRole(lang, [
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ])

  return (
    <div className="min-h-screen">
      {/* The old always-on NotificationCard bar ("Confirm a few key details")
          was hardcoded English noise on every hosting page — the targeted,
          snoozable AvailabilityPrompt (locale layout) replaces that job. */}
      <HostingHeader />
      <main id="main-content" className="px-4 sm:px-6 lg:px-8">
        {children}
        <ReportIssueFooter />
      </main>
    </div>
  )
}
