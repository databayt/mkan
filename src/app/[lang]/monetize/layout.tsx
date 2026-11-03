import Navbar from "@/components/template/header/header";
import SiteFooter from "@/components/template/footer/site-footer";
import { NAVBAR_HEIGHT } from "@/lib/constants";
import { NOINDEX_METADATA } from "@/lib/metadata";

export const metadata = NOINDEX_METADATA;

/** Public at Abdout's ask (2026-11-03): anyone can read the numbers; writes stay admin-only. Still noindex. */
export default function MonetizeLayout({ children }: { children: React.ReactNode }) {
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
