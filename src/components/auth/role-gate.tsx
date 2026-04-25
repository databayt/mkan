"use client";

import { UserRole } from "@prisma/client";
import { usePathname } from "next/navigation";
import { useCurrentRole } from "./use-current-role";
import { FormError } from "./error/form-error";

const translations = {
  en: {
    noPermission: "You do not have permission to view this content!",
  },
  ar: {
    noPermission: "ليس لديك صلاحية لعرض هذا المحتوى!",
  },
} as const;

interface RoleGateProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
}

export const RoleGate = ({ children, allowedRoles }: RoleGateProps) => {
  const role = useCurrentRole();
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];
  const roles = allowedRoles ?? [];

  if (!role || !roles.includes(role)) {
    return <FormError message={t.noPermission} />;
  }

  return <>{children}</>;
};
