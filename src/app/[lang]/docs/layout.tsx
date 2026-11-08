// Ported from hogwarts' docs block (src/app/[lang]/(saas-marketing)/docs).
import Navbar from "@/components/template/header/header"
import SiteFooter from "@/components/template/footer/site-footer"
import { NAVBAR_HEIGHT } from "@/lib/constants"
import { docsArabicSource, docsSource } from "@/lib/source"
import { SidebarProvider } from "@/components/ui/sidebar"
import { DocsSidebar } from "@/components/docs/docs-sidebar"

interface DocsLayoutProps {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}

export default async function DocsLayout({ children, params }: DocsLayoutProps) {
  const { lang } = await params
  // Arabic has its own tree; English and Kinyarwanda read the English one.
  const source = lang === "ar" ? docsArabicSource : docsSource

  return (
    <div
      className="bg-background min-h-screen w-full"
      style={
        {
          "--header-height": `${NAVBAR_HEIGHT}px`,
          "--footer-height": "0px",
        } as React.CSSProperties
      }
    >
      <Navbar />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 sm:px-6"
        style={{ marginTop: `${NAVBAR_HEIGHT}px` }}
      >
        <SidebarProvider className="min-h-min flex-1 items-start [--sidebar-width:220px] [--top-spacing:0] lg:grid lg:grid-cols-[var(--sidebar-width)_minmax(0,1fr)] lg:[--sidebar-width:calc(var(--spacing)*60)] lg:[--top-spacing:calc(var(--spacing)*4)]">
          <DocsSidebar tree={source.pageTree} lang={lang} />
          <div className="h-full w-full">{children}</div>
        </SidebarProvider>
      </main>
      <SiteFooter />
    </div>
  )
}
