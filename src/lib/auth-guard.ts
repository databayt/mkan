import { auth, isAdminNow } from "@/lib/auth";
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

/** The admin console: an admin by the database right now, not only by a year-old JWT (src/lib/auth.ts isAdminNow). */
export async function requireAdminNow(locale: string) {
  const session = await requireAuth(locale);
  if (!(await isAdminNow(session))) {
    redirect(`/${locale}`);
  }
  return session;
}
