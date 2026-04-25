import { UserRole } from "@prisma/client";

import Navbar from "@/components/template/header/header";
import SiteFooter from "@/components/template/footer/site-footer";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { NAVBAR_HEIGHT } from "@/lib/constants";
import { requireRole } from "@/lib/auth-guard";
import { getDictionary } from "@/components/internationalization/dictionaries";

export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  await requireRole(lang, [UserRole.SUPER_ADMIN, UserRole.ADMIN]);
  const dict = await getDictionary(lang as "en" | "ar");
  const adminDict = (dict as { admin?: Record<string, string> }).admin ?? {};

  const labels = {
    header: adminDict.header ?? "Admin console",
    platform: adminDict.platform ?? "Platform",
    overview: adminDict.overview ?? "Overview",
    users: adminDict.users ?? "Users",
    homes: adminDict.homes ?? "Homes",
    transport: adminDict.transport ?? "Transport",
    bookings: adminDict.bookings ?? "Bookings",
    payments: adminDict.payments ?? "Payments",
    settings: adminDict.settings ?? "Settings",
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full bg-background">
        <Navbar />
        <div style={{ marginTop: `${NAVBAR_HEIGHT}px` }}>
          <main id="main-content" className="flex">
            <AdminSidebar lang={lang} labels={labels} />
            <div className="flex-grow p-6 transition-all duration-300">{children}</div>
          </main>
        </div>
        <SiteFooter />
      </div>
    </SidebarProvider>
  );
}
