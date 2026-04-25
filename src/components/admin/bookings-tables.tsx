import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type HomeBooking = {
  id: number;
  status: string;
  totalPrice: number;
  checkIn: Date;
  checkOut: Date;
  createdAt: Date;
  guest: { id: string; email: string; username: string | null };
  listing: { id: number; title: string | null };
};

type TransportBooking = {
  id: number;
  bookingReference: string;
  status: string;
  totalAmount: number;
  createdAt: Date;
  user: { id: string; email: string; username: string | null };
  office: { id: number; name: string };
};

type HomeLabels = {
  guest: string;
  listing: string;
  checkIn: string;
  checkOut: string;
  status: string;
  total: string;
  created: string;
};

type TransportLabels = {
  passenger: string;
  office: string;
  reference: string;
  status: string;
  total: string;
  created: string;
};

export function HomeBookingsTable({
  bookings,
  labels,
}: {
  bookings: HomeBooking[];
  labels: HomeLabels;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.guest}</TableHead>
          <TableHead>{labels.listing}</TableHead>
          <TableHead>{labels.checkIn}</TableHead>
          <TableHead>{labels.checkOut}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead className="text-right">{labels.total}</TableHead>
          <TableHead>{labels.created}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((b) => (
          <TableRow key={b.id}>
            <TableCell className="text-sm">
              <div>{b.guest.username ?? b.guest.email}</div>
              <div className="text-xs text-muted-foreground">{b.guest.email}</div>
            </TableCell>
            <TableCell className="text-sm">{b.listing.title ?? `#${b.listing.id}`}</TableCell>
            <TableCell className="text-sm">
              {new Date(b.checkIn).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-sm">
              {new Date(b.checkOut).toLocaleDateString()}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{b.status}</Badge>
            </TableCell>
            <TableCell className="text-right text-sm">
              ${b.totalPrice.toFixed(0)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(b.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function TransportBookingsTable({
  bookings,
  labels,
}: {
  bookings: TransportBooking[];
  labels: TransportLabels;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.passenger}</TableHead>
          <TableHead>{labels.office}</TableHead>
          <TableHead>{labels.reference}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead className="text-right">{labels.total}</TableHead>
          <TableHead>{labels.created}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {bookings.map((b) => (
          <TableRow key={b.id}>
            <TableCell className="text-sm">
              <div>{b.user.username ?? b.user.email}</div>
              <div className="text-xs text-muted-foreground">{b.user.email}</div>
            </TableCell>
            <TableCell className="text-sm">{b.office.name}</TableCell>
            <TableCell className="text-sm font-mono">{b.bookingReference}</TableCell>
            <TableCell>
              <Badge variant="outline">{b.status}</Badge>
            </TableCell>
            <TableCell className="text-right text-sm">
              ${b.totalAmount.toFixed(0)}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(b.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
