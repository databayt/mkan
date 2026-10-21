"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

const listingIdSchema = z.coerce.number().int().positive();

export type ToggleFavoriteResult =
  | { ok: true; isFavorite: boolean }
  | { ok: false; requiresAuth?: true };

/** Ids of every listing the signed-in user has favorited ([] for guests). */
export async function getMyFavoriteIds(): Promise<number[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  try {
    const tenant = await db.tenant.findUnique({
      where: { userId: session.user.id },
      select: { favorites: { select: { id: true } } },
    });
    return tenant?.favorites.map((f) => f.id) ?? [];
  } catch (error) {
    logger.error("Error fetching favorite ids:", error);
    return [];
  }
}

/**
 * Toggle a listing in the current user's favorites and report the new state.
 * Unlike add/removeFavoriteProperty, this UPSERTS the Tenant row — most
 * accounts (hosts, fresh OAuth users) have none, which made the old actions
 * throw and every heart silently revert.
 */
export async function toggleFavorite(listingId: unknown): Promise<ToggleFavoriteResult> {
  const parsed = listingIdSchema.safeParse(listingId);
  if (!parsed.success) return { ok: false };

  const session = await auth();
  if (!session?.user?.id) return { ok: false, requiresAuth: true };

  try {
    const tenant = await db.tenant.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        name: session.user.name ?? session.user.email?.split("@")[0] ?? "Guest",
        email: session.user.email ?? "",
        phoneNumber: "",
      },
      update: {},
      select: {
        id: true,
        favorites: { where: { id: parsed.data }, select: { id: true } },
      },
    });

    const currentlyFavorite = tenant.favorites.length > 0;
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        favorites: currentlyFavorite
          ? { disconnect: { id: parsed.data } }
          : { connect: { id: parsed.data } },
      },
      select: { id: true },
    });

    revalidatePath("/tenants/favorites");
    return { ok: true, isFavorite: !currentlyFavorite };
  } catch (error) {
    logger.error("Error toggling favorite:", error);
    return { ok: false };
  }
}

/**
 * Bring a guest's hearts (kept in this browser) into the account on sign-in,
 * so saving a home before logging in is never lost. Adds only listings that
 * exist; returns the account's full list.
 */
export async function mergeFavorites(listingIds: unknown): Promise<number[]> {
  const ids = z.array(listingIdSchema).max(200).safeParse(listingIds);
  const session = await auth();
  if (!ids.success || !session?.user?.id) return getMyFavoriteIds();
  try {
    const existing = await db.listing.findMany({ where: { id: { in: ids.data } }, select: { id: true } });
    if (existing.length) {
      await db.tenant.upsert({
        where: { userId: session.user.id },
        create: {
          userId: session.user.id,
          name: session.user.name ?? session.user.email?.split("@")[0] ?? "Guest",
          email: session.user.email ?? "",
          phoneNumber: "",
          favorites: { connect: existing.map(({ id }) => ({ id })) },
        },
        update: { favorites: { connect: existing.map(({ id }) => ({ id })) } },
        select: { id: true },
      });
      revalidatePath("/tenants/favorites");
    }
  } catch (error) {
    logger.error("Error merging favorites:", error);
  }
  return getMyFavoriteIds();
}
