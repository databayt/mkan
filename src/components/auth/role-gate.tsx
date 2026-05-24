"use client";

import { UserRole } from "@prisma/client";
import { useCurrentRole } from "./use-current-role";
import { FormError } from "./error/form-error";
import { useDictionary } from "@/components/internationalization/dictionary-context";

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export const RoleGate = ({ children, allowedRoles }: RoleGateProps) => {
  const role = useCurrentRole();
  const dict = useDictionary();
  const t = dict?.auth?.roleGate;
  const roles = allowedRoles ?? [];

  if (!role || !roles.includes(role)) {
    return (
      <FormError
        message={t?.noPermission ?? "You do not have permission to view this content!"}
      />
    );
  }

  return <>{children}</>;
};
