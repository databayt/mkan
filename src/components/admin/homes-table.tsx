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
  adminDeleteListing,
  forceUnpublishListing,
} from "@/lib/actions/admin-actions";

type AdminListing = {
  id: number;
  title: string | null;
  isPublished: boolean;
  draft: boolean;
  pricePerNight: number | null;
  averageRating: number | null;
  createdAt: Date;
  host: { id: string; email: string; username: string | null };
  location: { city: string; country: string } | null;
  _count: { bookings: number; reviews: number };
};

type Labels = {
  listing: string;
  host: string;
  location: string;
  price: string;
  status: string;
  bookings: string;
  actions: string;
  view: string;
  unpublish: string;
  delete: string;
  published: string;
  draft: string;
  unlisted: string;
  unpublishTitle: string;
  unpublishBody: string;
  deleteTitle: string;
  deleteBody: string;
  cancel: string;
  confirm: string;
  unpublishedToast: string;
  deletedToast: string;
  error: string;
};

export function HomesTable({
  listings,
  lang,
  labels,
}: {
  listings: AdminListing[];
  lang: string;
  labels: Labels;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.listing}</TableHead>
          <TableHead>{labels.host}</TableHead>
          <TableHead>{labels.location}</TableHead>
          <TableHead className="text-right">{labels.price}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead className="text-center">{labels.bookings}</TableHead>
          <TableHead className="text-right">{labels.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {listings.map((l) => (
          <HomeRow key={l.id} listing={l} lang={lang} labels={labels} />
        ))}
      </TableBody>
    </Table>
  );
}

function HomeRow({
  listing,
  lang,
  labels,
}: {
  listing: AdminListing;
  lang: string;
  labels: Labels;
}) {
  const [isPending, startTransition] = useTransition();

  function onUnpublish() {
    startTransition(async () => {
      try {
        await forceUnpublishListing(listing.id);
        toast.success(labels.unpublishedToast);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : labels.error);
      }
    });
  }

  function onDelete() {
    startTransition(async () => {
      try {
        await adminDeleteListing(listing.id);
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
          href={`/${lang}/admin/homes/${listing.id}`}
          className="text-sm font-medium hover:underline"
        >
          {listing.title ?? `#${listing.id}`}
        </Link>
      </TableCell>
      <TableCell>
        <div className="text-sm">{listing.host.username ?? listing.host.email}</div>
        <div className="text-xs text-muted-foreground">{listing.host.email}</div>
      </TableCell>
      <TableCell className="text-sm">
        {listing.location ? `${listing.location.city}, ${listing.location.country}` : "—"}
      </TableCell>
      <TableCell className="text-right text-sm">
        ${(listing.pricePerNight ?? 0).toFixed(0)}
      </TableCell>
      <TableCell>
        <StatusBadge listing={listing} labels={labels} />
      </TableCell>
      <TableCell className="text-center">{listing._count.bookings}</TableCell>
      <TableCell className="text-right space-x-2">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/${lang}/listings/${listing.id}`} target="_blank">
            {labels.view}
          </Link>
        </Button>
        {listing.isPublished ? (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="secondary" size="sm" disabled={isPending}>
                {labels.unpublish}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{labels.unpublishTitle}</AlertDialogTitle>
                <AlertDialogDescription>{labels.unpublishBody}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
                <AlertDialogAction onClick={onUnpublish}>
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

function StatusBadge({ listing, labels }: { listing: AdminListing; labels: Labels }) {
  if (listing.isPublished) return <Badge variant="secondary">{labels.published}</Badge>;
  if (listing.draft) return <Badge variant="outline">{labels.draft}</Badge>;
  return <Badge variant="outline">{labels.unlisted}</Badge>;
}
