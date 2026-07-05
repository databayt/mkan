import { UserRole } from "@prisma/client"
import { requireRole } from "@/lib/auth-guard"
import HostingHeader from '@/components/hosting/hosting-header'
import { ReportIssueFooter } from '@/components/report-issue/footer'
import { HostingBottomNav } from '@/components/hosting/hosting-bottom-nav'

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
      {/* Airbnb's mobile hosting surface has no top bar — every page brings its
          own in-page header and the bottom tab bar carries navigation. */}
      <div className="hidden lg:block">
        <HostingHeader />
      </div>
      <main id="main-content" className="px-4 pb-20 sm:px-6 lg:px-8 lg:pb-0">
        {children}
        {/* Report-issue footer is the fallback for app surfaces without a site
            footer. Mobile hosting pages either carry the full site footer now
            (Today) or intentionally end at the bottom nav (Airbnb-clone), so it
            renders on desktop only to avoid stacking under the site footer. */}
        <div className="hidden lg:block">
          <ReportIssueFooter />
        </div>
      </main>
      <HostingBottomNav />
    </div>
  )
}
