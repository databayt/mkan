import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

type HomePayment = {
  id: number;
  amountDue: number;
  amountPaid: number;
  dueDate: Date;
  paymentDate: Date | null;
  paymentStatus: string;
  lease: {
    id: number;
    tenant: { userId: string; name: string } | null;
    listing: { id: number; title: string | null };
  };
};

type TransportPayment = {
  id: number;
  amount: number;
  status: string;
  method: string;
  createdAt: Date;
  booking: {
    id: number;
    user: { id: string; email: string };
    office: { id: number; name: string };
  };
};

type HomeLabels = {
  listing: string;
  tenant: string;
  due: string;
  paid: string;
  dueDate: string;
  paidAt: string;
  status: string;
};

type TransportLabels = {
  office: string;
  user: string;
  amount: string;
  method: string;
  status: string;
  created: string;
};

export function HomePaymentsTable({
  payments,
  labels,
}: {
  payments: HomePayment[];
  labels: HomeLabels;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.listing}</TableHead>
          <TableHead>{labels.tenant}</TableHead>
          <TableHead className="text-right">{labels.due}</TableHead>
          <TableHead className="text-right">{labels.paid}</TableHead>
          <TableHead>{labels.dueDate}</TableHead>
          <TableHead>{labels.paidAt}</TableHead>
          <TableHead>{labels.status}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="text-sm">
              {p.lease.listing.title ?? `#${p.lease.listing.id}`}
            </TableCell>
            <TableCell className="text-sm">{p.lease.tenant?.name ?? "—"}</TableCell>
            <TableCell className="text-right text-sm">${p.amountDue.toFixed(0)}</TableCell>
            <TableCell className="text-right text-sm">${p.amountPaid.toFixed(0)}</TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(p.dueDate).toLocaleDateString()}
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {p.paymentDate ? new Date(p.paymentDate).toLocaleDateString() : "—"}
            </TableCell>
            <TableCell>
              <Badge variant="outline">{p.paymentStatus}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function TransportPaymentsTable({
  payments,
  labels,
}: {
  payments: TransportPayment[];
  labels: TransportLabels;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.office}</TableHead>
          <TableHead>{labels.user}</TableHead>
          <TableHead className="text-right">{labels.amount}</TableHead>
          <TableHead>{labels.method}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead>{labels.created}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {payments.map((p) => (
          <TableRow key={p.id}>
            <TableCell className="text-sm">{p.booking.office.name}</TableCell>
            <TableCell className="text-sm">{p.booking.user.email}</TableCell>
            <TableCell className="text-right text-sm">${p.amount.toFixed(0)}</TableCell>
            <TableCell className="text-sm">{p.method}</TableCell>
            <TableCell>
              <Badge variant="outline">{p.status}</Badge>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">
              {new Date(p.createdAt).toLocaleDateString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
