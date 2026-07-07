import { listAllOfficesAdmin } from "@/lib/actions/admin-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { OfficesTable } from "@/components/admin/offices-table";

export default async function AdminTransportPage({
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
  const { offices, total, pageSize } = await listAllOfficesAdmin({ q: sp.q, page });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{a.transport ?? "Transport"}</h1>
        <p className="text-sm text-muted-foreground">
          {a.transportDescription ?? "All transport offices across the platform."}
        </p>
      </header>
      <form className="flex items-center gap-2" action="" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={a.searchOfficesPlaceholder ?? "Search by office or owner email"}
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
        <OfficesTable
          offices={offices}
          lang={lang}
          labels={{
            office: a.office ?? "Office",
            owner: a.owner ?? "Owner",
            contact: a.contact ?? "Contact",
            status: a.status ?? "Status",
            buses: a.buses ?? "Buses",
            routes: a.routes ?? "Routes",
            bookings: a.bookings ?? "Bookings",
            actions: a.actions ?? "Actions",
            view: a.view ?? "View",
            deactivate: a.deactivate ?? "Deactivate",
            delete: a.delete ?? "Delete",
            active: a.officeActive ?? "Active",
            inactive: a.officeInactive ?? "Inactive",
            verified: a.officeVerified ?? "Verified",
            unverified: a.officeUnverified ?? "Unverified",
            deactivateTitle: a.deactivateTitle ?? "Deactivate office?",
            deactivateBody:
              a.deactivateBody ??
              "The office will be hidden from search until the owner reactivates.",
            deleteTitle: a.deleteOfficeTitle ?? "Delete office?",
            deleteBody:
              a.deleteOfficeBody ??
              "This permanently removes the office and all buses, routes, and trips.",
            cancel: a.cancel ?? "Cancel",
            confirm: a.confirm ?? "Confirm",
            deactivatedToast: a.deactivatedToast ?? "Office deactivated",
            deletedToast: a.officeDeletedToast ?? "Office deleted",
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
