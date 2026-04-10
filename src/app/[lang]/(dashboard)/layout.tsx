import Navbar from "@/components/template/header/header";
import SiteFooter from "@/components/template/footer/site-footer";
import { SidebarProvider } from "@/components/ui/sidebar";
import Sidebar from "@/components/AppSidebar";
import { NAVBAR_HEIGHT } from "@/lib/constants";
import { requireAuth } from "@/lib/auth-guard";

export default async function DashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  await requireAuth(lang);

  return (
    <SidebarProvider>
      <div className="min-h-screen w-full bg-primary-100">
        <Navbar />
        <div style={{ marginTop: `${NAVBAR_HEIGHT}px` }}>
          <main id="main-content" className="flex">
            <Sidebar />
            <div className="flex-grow transition-all duration-300">
              {children}
            </div>
          </main>
        </div>
        <SiteFooter />
      </div>
    </SidebarProvider>
  );
}
