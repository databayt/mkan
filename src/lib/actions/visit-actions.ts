"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { VisitOutcome } from "@prisma/client";

import { auth, canOverride } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { assertRateLimit } from "@/lib/rate-limit";

/**
 * Property viewings — the "Visits" stage of the marketplace funnel.
 *
 * Recorded by the host (or an admin), not booked by the guest. mkan is
 * contact-only this phase: a guest calls, they agree a time on the phone, and
 * the host logs it afterwards. Building guest-facing scheduling would have
 * meant shipping a booking flow nobody asked for in order to measure a number.
 *
 * Because most visits are arranged by phone, the guest is usually just a name
 * and a number rather than an account — hence `contactName`/`contactPhone`
 * alongside the optional `guestUserId`.
 */

async function requireListingAccess(listingId: number) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "unauthorized" as const };

  const listing = await db.listing.findUnique({
    where: { id: listingId },
    select: { id: true, hostId: true },
  });
  if (!listing) return { ok: false as const, error: "not_found" as const };

  // Owner or admin. Same helper the rest of the host surfaces use.
  if (!canOverride(session, listing.hostId)) {
    return { ok: false as const, error: "forbidden" as const };
  }

  return { ok: true as const, session, listing };
}

const recordSchema = z.object({
  listingId: z.coerce.number().int().positive(),
  scheduledFor: z.coerce.date(),
  guestUserId: z.string().min(1).optional(),
  contactName: z.string().trim().min(1).max(120).optional(),
  contactPhone: z.string().trim().min(1).max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  outcome: z.enum(VisitOutcome).optional(),
});

export async function recordListingVisit(
  input: unknown,
): Promise<{ ok: true; visitId: number } | { ok: false; error: string }> {
  const parsed = recordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const access = await requireListingAccess(parsed.data.listingId);
  if (!access.ok) return { ok: false, error: access.error };

  await assertRateLimit("mutation", `visit:${access.session.user.id}`);

  try {
    const visit = await db.listingVisit.create({
      data: {
        listingId: parsed.data.listingId,
        scheduledFor: parsed.data.scheduledFor,
        guestUserId: parsed.data.guestUserId ?? null,
        contactName: parsed.data.contactName ?? null,
        contactPhone: parsed.data.contactPhone ?? null,
        notes: parsed.data.notes ?? null,
        outcome: parsed.data.outcome ?? VisitOutcome.Scheduled,
        // A visit logged after the fact is already done; stamp it so the funnel
        // doesn't have to wait for a second edit to count it.
        occurredAt:
          parsed.data.outcome === VisitOutcome.Completed ? new Date() : null,
        recordedById: access.session.user.id,
      },
      select: { id: true },
    });

    revalidatePath("/hosting");
    return { ok: true, visitId: visit.id };
  } catch (error) {
    logger.error("recordListingVisit failed", {
      error: String(error),
      listingId: parsed.data.listingId,
    });
    return { ok: false, error: "error" };
  }
}

const outcomeSchema = z.object({
  visitId: z.coerce.number().int().positive(),
  outcome: z.enum(VisitOutcome),
  notes: z.string().trim().max(2000).optional(),
});

export async function updateVisitOutcome(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = outcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };

  const visit = await db.listingVisit.findUnique({
    where: { id: parsed.data.visitId },
    select: { id: true, listingId: true, occurredAt: true },
  });
  if (!visit) return { ok: false, error: "not_found" };

  const access = await requireListingAccess(visit.listingId);
  if (!access.ok) return { ok: false, error: access.error };

  try {
    await db.listingVisit.update({
      where: { id: visit.id },
      data: {
        outcome: parsed.data.outcome,
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
        // Stamp the first time it lands on Completed; never re-stamp, so the
        // original timestamp survives a later correction.
        ...(parsed.data.outcome === VisitOutcome.Completed && !visit.occurredAt
          ? { occurredAt: new Date() }
          : {}),
      },
    });

    revalidatePath("/hosting");
    return { ok: true };
  } catch (error) {
    logger.error("updateVisitOutcome failed", { error: String(error), visitId: visit.id });
    return { ok: false, error: "error" };
  }
}

type VisitRow = {
  id: number;
  scheduledFor: Date;
  occurredAt: Date | null;
  outcome: VisitOutcome;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  guestUser: { id: string; username: string | null; email: string; image: string | null } | null;
};

export async function listListingVisits(
  listingId: unknown,
): Promise<{ ok: true; visits: VisitRow[] } | { ok: false; error: string }> {
  const parsed = z.coerce.number().int().positive().safeParse(listingId);
  if (!parsed.success) return { ok: false as const, error: "invalid" };

  const access = await requireListingAccess(parsed.data);
  if (!access.ok) return { ok: false as const, error: access.error };

  const visits = await db.listingVisit.findMany({
    where: { listingId: parsed.data },
    orderBy: { scheduledFor: "desc" },
    take: 100,
    select: {
      id: true,
      scheduledFor: true,
      occurredAt: true,
      outcome: true,
      contactName: true,
      contactPhone: true,
      notes: true,
      guestUser: { select: { id: true, username: true, email: true, image: true } },
    },
  });

  return { ok: true as const, visits };
}
