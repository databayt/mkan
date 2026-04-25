import { listAllListingsAdmin } from "@/lib/actions/admin-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { HomesTable } from "@/components/admin/homes-table";

export default async function AdminHomesPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { lang } = await params;
  const sp = await searchParams;
  const dict = await getDictionary(lang as "en" | "ar");
  const a = (dict as { admin?: Record<string, string> }).admin ?? {};

  const page = Number(sp.page ?? 1) || 1;
  const { listings, total, pageSize } = await listAllListingsAdmin({ q: sp.q, page });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{a.homes ?? "Homes"}</h1>
        <p className="text-sm text-muted-foreground">
          {a.homesDescription ?? "All listings across the platform."}
        </p>
      </header>
      <form className="flex items-center gap-2" action="" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={a.searchHomesPlaceholder ?? "Search by title or host email"}
          className="flex h-9 w-full max-w-sm rounded-md border border-input bg-background px-3 py-1 text-sm"
        />
        <button
          type="submit"
          className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
        >
          {a.search ?? "Search"}
        </button>
      </form>
      <div className="rounded-md border">
        <HomesTable
          listings={listings}
          lang={lang}
          labels={{
            listing: a.listing ?? "Listing",
            host: a.host ?? "Host",
            location: a.location ?? "Location",
            price: a.price ?? "Price",
            status: a.status ?? "Status",
            bookings: a.bookings ?? "Bookings",
            actions: a.actions ?? "Actions",
            view: a.view ?? "View",
            unpublish: a.forceUnpublish ?? "Unpublish",
            delete: a.delete ?? "Delete",
            published: a.statusPublished ?? "Published",
            draft: a.statusDraft ?? "Draft",
            unlisted: a.statusUnlisted ?? "Unlisted",
            unpublishTitle: a.unpublishTitle ?? "Force unpublish?",
            unpublishBody:
              a.unpublishBody ??
              "The listing will be hidden from public pages until the host republishes.",
            deleteTitle: a.deleteTitle ?? "Delete listing?",
            deleteBody:
              a.deleteBody ?? "This permanently removes the listing and related data.",
            cancel: a.cancel ?? "Cancel",
            confirm: a.confirm ?? "Confirm",
            unpublishedToast: a.unpublishedToast ?? "Listing unpublished",
            deletedToast: a.deletedToast ?? "Listing deleted",
            error: a.actionError ?? "Action failed",
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {a.pageOf
          ? a.pageOf.replace("{page}", String(page)).replace("{count}", String(pageCount))
          : `Page ${page} of ${pageCount}`}{" "}
        · {total} {a.total ?? "total"}
      </p>
    </div>
  );
}
