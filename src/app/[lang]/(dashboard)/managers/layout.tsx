import { UserRole } from "@prisma/client";
import { requireRole } from "@/lib/auth-guard";

export default async function ManagersLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  await requireRole(lang, [UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN]);
  return <>{children}</>;
}
