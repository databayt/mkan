// Transport vertical layout.
//
// The previous version mounted a TransportBookingProvider that duplicated the
// checkout flow already owned by trips/[id]/page.tsx + booking/checkout/
// content.tsx. It risked double-confirming bookings (processPayment already
// calls confirmBooking internally) and had zero consumers. See BMAD T1.S5.
//
// It now also anchors the shared "Report an issue" footer on every transport
// sub-page (search, offices, booking, checkout, trips, ticket). The bare
// /travel landing is skipped — it renders the full site footer, which
// already carries the Report-an-issue link, so mounting it here too would
// double up.
"use client";

import { usePathname } from "next/navigation";

import { ReportIssueFooter } from "@/components/report-issue/footer";

export default function TransportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLanding = /\/travel\/?$/.test(pathname ?? "");

  return (
    <>
      {children}
      {!isLanding && <ReportIssueFooter />}
    </>
  );
}
