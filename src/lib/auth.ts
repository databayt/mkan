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

export const canOverride = (session: SessionLike, ownerId: string | null | undefined) =>
  (!!session?.user?.id && session.user.id === ownerId) || isAdminOrSuper(session);
