import { listAllUsers } from "@/lib/actions/admin-actions";
import { getDictionary } from "@/components/internationalization/dictionaries";
import { UsersTable } from "@/components/admin/users-table";

export default async function AdminUsersPage({
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
  const { users, total, pageSize } = await listAllUsers({ q: sp.q, page });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{a.users ?? "Users"}</h1>
        <p className="text-sm text-muted-foreground">
          {a.usersDescription ?? "Manage platform members, roles, and suspensions."}
        </p>
      </header>
      <form className="flex items-center gap-2" action="" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder={a.searchPlaceholder ?? "Search by email or username"}
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
        <UsersTable
          users={users}
          labels={{
            user: a.user ?? "User",
            role: a.role ?? "Role",
            listings: a.listings ?? "Listings",
            offices: a.offices ?? "Offices",
            status: a.status ?? "Status",
            joined: a.joined ?? "Joined",
            lastLogin: a.lastLogin ?? "Last login",
            actions: a.actions ?? "Actions",
            suspend: a.suspend ?? "Suspend",
            unsuspend: a.unsuspend ?? "Unsuspend",
            suspendConfirmTitle: a.suspendConfirmTitle ?? "Confirm",
            suspendConfirmBody:
              a.suspendConfirmBody ?? "Suspended users cannot log in until unsuspended.",
            suspendConfirmAction: a.confirm ?? "Confirm",
            cancel: a.cancel ?? "Cancel",
            suspendReasonLabel: a.suspendReason ?? "Reason (optional)",
            active: a.userActive ?? "Active",
            suspended: a.userSuspended ?? "Suspended",
            roleUpdated: a.roleUpdated ?? "Role updated",
            suspendedToast: a.suspendedToast ?? "User suspended",
            unsuspendedToast: a.unsuspendedToast ?? "User restored",
            error: a.actionError ?? "Action failed",
          }}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        {a.pageOf
          ? a.pageOf.replace("{page}", String(page)).replace("{count}", String(pageCount))
          : `Page ${page} of ${pageCount}`}{" "}
        · {total}{" "}
        {a.total ?? "total"}
      </p>
    </div>
  );
}
