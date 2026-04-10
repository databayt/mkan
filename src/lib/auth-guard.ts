import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireAuth(locale: string) {
  const session = await auth();
  if (!session?.user) {
    redirect(`/${locale}/login`);
  }
  return session;
}

export async function requireRole(locale: string, roles: string[]) {
  const session = await requireAuth(locale);
  if (!roles.includes(session.user.role)) {
    redirect(`/${locale}`);
  }
  return session;
}
