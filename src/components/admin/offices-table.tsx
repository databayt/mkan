"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  adminDeleteOffice,
  forceUnpublishOffice,
} from "@/lib/actions/admin-actions";

type AdminOffice = {
  id: number;
  name: string;
  isActive: boolean;
  isVerified: boolean;
  phone: string;
  email: string;
  createdAt: Date;
  owner: { id: string; email: string; username: string | null };
  _count: { buses: number; routes: number; bookings: number };
};

type Labels = {
  office: string;
  owner: string;
  contact: string;
  status: string;
  buses: string;
  routes: string;
  bookings: string;
  actions: string;
  view: string;
  deactivate: string;
  delete: string;
  active: string;
  inactive: string;
  verified: string;
  unverified: string;
  deactivateTitle: string;
  deactivateBody: string;
  deleteTitle: string;
  deleteBody: string;
  cancel: string;
  confirm: string;
  deactivatedToast: string;
  deletedToast: string;
  error: string;
};

export function OfficesTable({
  offices,
  lang,
  labels,
}: {
  offices: AdminOffice[];
  lang: string;
  labels: Labels;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.office}</TableHead>
          <TableHead>{labels.owner}</TableHead>
          <TableHead>{labels.contact}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead className="text-center">{labels.buses}</TableHead>
          <TableHead className="text-center">{labels.routes}</TableHead>
          <TableHead className="text-center">{labels.bookings}</TableHead>
          <TableHead className="text-right">{labels.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {offices.map((office) => (
          <OfficeRow key={office.id} office={office} lang={lang} labels={labels} />
        ))}
      </TableBody>
    </Table>
  );
}

function OfficeRow({
  office,
  lang,
  labels,
}: {
  office: AdminOffice;
  lang: string;
  labels: Labels;
}) {
  const [isPending, startTransition] = useTransition();

  function onDeactivate() {
    startTransition(async () => {
      try {
        await forceUnpublishOffice(office.id);
        toast.success(labels.deactivatedToast);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : labels.error);
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        await adminDeleteOffice(office.id);
        toast.success(labels.deletedToast);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : labels.error);
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/${lang}/admin/transport/${office.id}`}
          className="text-sm font-medium hover:underline"
        >
          {office.name}
        </Link>
      </TableCell>
      <TableCell>
        <div className="text-sm">{office.owner.username ?? office.owner.email}</div>
        <div className="text-xs text-muted-foreground">{office.owner.email}</div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <div>{office.email}</div>
        <div>{office.phone}</div>
      </TableCell>
      <TableCell className="space-y-1">
        <Badge variant={office.isActive ? "secondary" : "outline"}>
          {office.isActive ? labels.active : labels.inactive}
        </Badge>
        <Badge variant={office.isVerified ? "default" : "outline"}>
          {office.isVerified ? labels.verified : labels.unverified}
        </Badge>
      </TableCell>
      <TableCell className="text-center">{office._count.buses}</TableCell>
      <TableCell className="text-center">{office._count.routes}</TableCell>
      <TableCell className="text-center">{office._count.bookings}</TableCell>
      <TableCell className="text-right space-x-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${lang}/transport/offices/${office.id}`} target="_blank">
            {labels.view}
          </Link>
        </Button>
        {office.isActive ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" size="sm" disabled={isPending}>
                {labels.deactivate}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels.deactivateTitle}</AlertDialogTitle>
                <AlertDialogDescription>{labels.deactivateBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={onDeactivate}>
                  {labels.confirm}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ) : null}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isPending}>
              {labels.delete}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{labels.deleteTitle}</AlertDialogTitle>
              <AlertDialogDescription>{labels.deleteBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={onDelete}>{labels.confirm}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
