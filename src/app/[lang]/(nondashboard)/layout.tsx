import SiteFooter from "@/components/template/footer/site-footer";

export default function NondashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="h-full w-full">
      <main id="main-content" className="h-full flex w-full flex-col">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
