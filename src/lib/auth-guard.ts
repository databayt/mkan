import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireAuth(locale: string) {
  const session = await auth();
  // Check user.id (not just user): a suspended user's stripped JWT yields a
  // session object with no id, which must still be treated as unauthenticated.
  if (!session?.user?.id) {
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
