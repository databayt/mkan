"use client";

import { useState, useTransition } from "react";
import { UserRole } from "@prisma/client";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Input } from "@/components/ui/input";
import { toggleUserSuspension, updateUserRole } from "@/lib/actions/admin-actions";

type AdminUser = {
  id: string;
  email: string;
  username: string | null;
  image: string | null;
  role: UserRole;
  isSuspended: boolean;
  suspendedAt: Date | null;
  createdAt: Date;
  lastLogin: Date | null;
  _count: { listings: number; transportOffices: number };
};

type Labels = {
  user: string;
  role: string;
  listings: string;
  offices: string;
  status: string;
  joined: string;
  lastLogin: string;
  actions: string;
  suspend: string;
  unsuspend: string;
  suspendConfirmTitle: string;
  suspendConfirmBody: string;
  suspendConfirmAction: string;
  cancel: string;
  suspendReasonLabel: string;
  active: string;
  suspended: string;
  roleUpdated: string;
  suspendedToast: string;
  unsuspendedToast: string;
  error: string;
};

export function UsersTable({
  users,
  labels,
}: {
  users: AdminUser[];
  labels: Labels;
}) {
  const roles = Object.values(UserRole);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{labels.user}</TableHead>
          <TableHead>{labels.role}</TableHead>
          <TableHead className="text-center">{labels.listings}</TableHead>
          <TableHead className="text-center">{labels.offices}</TableHead>
          <TableHead>{labels.status}</TableHead>
          <TableHead>{labels.joined}</TableHead>
          <TableHead>{labels.lastLogin}</TableHead>
          <TableHead className="text-right">{labels.actions}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => (
          <UserRow key={user.id} user={user} roles={roles} labels={labels} />
        ))}
      </TableBody>
    </Table>
  );
}

function UserRow({
  user,
  roles,
  labels,
}: {
  user: AdminUser;
  roles: UserRole[];
  labels: Labels;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState("");

  function onRoleChange(next: UserRole) {
    if (next === user.role) return;
    startTransition(async () => {
      try {
        await updateUserRole({ userId: user.id, role: next });
        toast.success(labels.roleUpdated);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : labels.error);
      }
    });
  }

  function onSuspendConfirm() {
    startTransition(async () => {
      try {
        const result = await toggleUserSuspension({
          userId: user.id,
          reason: reason || undefined,
        });
        toast.success(result.suspended ? labels.suspendedToast : labels.unsuspendedToast);
        setReason("");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : labels.error);
      }
    });
  }

  return (
    <TableRow>
      <TableCell>
        <div className="text-sm font-medium">{user.username ?? user.email}</div>
        <div className="text-xs text-muted-foreground">{user.email}</div>
      </TableCell>
      <TableCell>
        <Select
          defaultValue={user.role}
          onValueChange={(v) => onRoleChange(v as UserRole)}
          disabled={isPending}
        >
          <SelectTrigger className="h-8 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r} value={r}>
                {r}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="text-center">{user._count.listings}</TableCell>
      <TableCell className="text-center">{user._count.transportOffices}</TableCell>
      <TableCell>
        <Badge variant={user.isSuspended ? "destructive" : "secondary"}>
          {user.isSuspended ? labels.suspended : labels.active}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {new Date(user.createdAt).toLocaleDateString()}
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : "—"}
      </TableCell>
      <TableCell className="text-right">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant={user.isSuspended ? "outline" : "destructive"}
              size="sm"
              disabled={isPending}
            >
              {user.isSuspended ? labels.unsuspend : labels.suspend}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{labels.suspendConfirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{labels.suspendConfirmBody}</AlertDialogDescription>
            </AlertDialogHeader>
            {!user.isSuspended ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">{labels.suspendReasonLabel}</label>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                />
              </div>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel>{labels.cancel}</AlertDialogCancel>
              <AlertDialogAction onClick={onSuspendConfirm}>
                {labels.suspendConfirmAction}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </TableCell>
    </TableRow>
  );
}
