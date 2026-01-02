import { TransportBookingProvider } from '@/context/transport-booking-context';

export default function TransportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TransportBookingProvider>{children}</TransportBookingProvider>;
}
