import Navbar from "@/components/template/header/header";
import SiteFooter from "@/components/template/footer/site-footer";
import { NAVBAR_HEIGHT } from "@/lib/constants";
import { requireRole } from "@/lib/auth-guard";
import { NOINDEX_METADATA } from "@/lib/metadata";

export const metadata = NOINDEX_METADATA;

/** Admin-only, like /admin: money, costs and broker names are not for tenants or crawlers. */
export default async function MonetizeLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  await requireRole(lang, ["SUPER_ADMIN", "ADMIN"]);
  return (
    <div className="min-h-screen w-full bg-background">
      <Navbar />
      <main id="main-content" style={{ marginTop: `${NAVBAR_HEIGHT}px` }}>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
