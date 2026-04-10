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
  allowedRole: UserRole;
};

export const RoleGate = ({
  children,
  allowedRole,
}: RoleGateProps) => {
  const role = useCurrentRole();
  const pathname = usePathname();
  const t = translations[pathname?.startsWith("/ar") ? "ar" : "en"];

  if (role !== allowedRole) {
    return (
      <FormError message={t.noPermission} />
    )
  }

  return (
    <>
      {children}
    </>
  );
};
