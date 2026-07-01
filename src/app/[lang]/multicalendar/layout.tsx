import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth-guard";
import HostingHeader from "@/components/hosting/hosting-header";

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
    <div className="flex h-[100dvh] flex-col overflow-hidden">
      <HostingHeader />
      <main id="main-content" className="min-h-0 flex-1">
        {children}
      </main>
    </div>
  );
}
