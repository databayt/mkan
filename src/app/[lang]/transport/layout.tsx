// Transport vertical layout.
//
// The previous version mounted a TransportBookingProvider that duplicated the
// checkout flow already owned by trips/[id]/page.tsx + booking/checkout/
// content.tsx. It risked double-confirming bookings (processPayment already
// calls confirmBooking internally) and had zero consumers. See BMAD T1.S5.
export default function TransportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
