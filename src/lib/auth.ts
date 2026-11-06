import { UserRole } from "@prisma/client";
import type { Session } from "next-auth";
import { auth } from "../../auth";

export { auth };

export const currentUser = async () => {
  const session = await auth();
  return session?.user;
};

export const currentRole = async () => {
  const session = await auth();
  return session?.user?.role;
};

type SessionLike = Pick<Session, "user"> | null | undefined;

export const isSuperAdmin = (session: SessionLike) =>
  session?.user?.role === UserRole.SUPER_ADMIN;

export const isAdminOrSuper = (session: SessionLike) =>
  session?.user?.role === UserRole.SUPER_ADMIN ||
  session?.user?.role === UserRole.ADMIN;

/**
 * The role as the database has it now. The JWT's copy is minted at sign-in and the session lives a
 * year, so a demoted or suspended admin would keep it: every admin write and the admin console
 * re-read it here (2026-11-06). Null for a missing or suspended user.
 */
export async function roleFromDb(userId: string | null | undefined): Promise<UserRole | null> {
  if (!userId) return null;
  const { db } = await import("@/lib/db");
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true, isSuspended: true } });
  return user && !user.isSuspended ? user.role : null;
}

/** An admin by the JWT AND by the database right now (cheap reject first: no query for a non-admin token). */
export async function isAdminNow(session: SessionLike): Promise<boolean> {
  if (!isAdminOrSuper(session)) return false;
  const role = await roleFromDb(session?.user?.id);
  return role === UserRole.SUPER_ADMIN || role === UserRole.ADMIN;
}

export const canOverride = (session: SessionLike, ownerId: string | null | undefined) =>
  (!!session?.user?.id && session.user.id === ownerId) || isAdminOrSuper(session);
