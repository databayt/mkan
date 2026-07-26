// Transport vertical layout.
//
// The previous version mounted a TransportBookingProvider that duplicated the
// checkout flow already owned by trips/[id]/page.tsx + booking/checkout/
// content.tsx. It risked double-confirming bookings (processPayment already
// calls confirmBooking internally) and had zero consumers. See BMAD T1.S5.
//
// It also anchors the shared "Report an issue" footer on every transport
// sub-page (search, offices, booking, checkout, trips, ticket). The bare
// /travel landing is skipped — it renders the full site footer, which
// already carries the Report-an-issue link, so mounting it here too would
// double up. The pathname check lives in a tiny client leaf
// (ReportIssueFooterGate) so this layout stays a Server Component and the
// ISR children (/travel, /travel/listings) keep a streamable RSC shell.

import { ReportIssueFooterGate } from "@/components/report-issue/footer-gate";

export default function TransportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {children}
      <ReportIssueFooterGate />
    </>
  );
}
