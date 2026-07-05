import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth-guard";
import HostingHeader from "@/components/hosting/hosting-header";
import { HostingBottomNav } from "@/components/hosting/hosting-bottom-nav";

// The multicalendar is a full-screen grid (Airbnb's /multicalendar), so it gets
// its own shell: the host header on top, then a flex-fill main with no page
// scroll — the grid scrolls internally. No notification banner / footer here.
export default async function MulticalendarLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  await requireRole(lang, [
    UserRole.MANAGER,
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
  ]);

  return (
    // Inline height, not `h-[100dvh]` — the arbitrary utility silently fails to
    // emit under Turbopack in dev, collapsing the container so the whole page
    // scrolls and the mobile header can't pin. Inline keeps the internal scroll.
    <div className="flex flex-col overflow-hidden" style={{ height: "100dvh" }}>
      {/* No top bar on mobile — the month-stack view carries its own header. */}
      <div className="hidden lg:block">
        <HostingHeader />
      </div>
      <main id="main-content" className="min-h-0 flex-1 pb-16 lg:pb-0">
        {children}
      </main>
      <HostingBottomNav />
    </div>
  );
}
