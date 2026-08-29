"use server";

import * as z from "zod";
import bcrypt from "bcryptjs";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { DEFAULT_LOGIN_REDIRECT } from "../../../routes";
import { ClaimSchema } from "./validation";

/**
 * Hand a pre-provisioned host account to the person who owns the listings.
 *
 * These accounts were created by the growth import with a bootstrap password
 * that was printed once and never stored, so there is no credential to send and
 * no "forgot password" path either — the account is a bare number (`1004`) with
 * no mailbox behind it. The claim token is the only key that exists. (Accounts
 * the site provisions itself — `0001+` — use the shared password instead and are
 * handed over by `scripts/crm/host-handover.ts`; they never see this page.)
 *
 * Claiming is therefore three things at once, and they must all succeed or none
 * of them: the token is spent, the account gets a password its owner chose, and
 * the listings are stamped `claimedAt` — which is the hard gate wave-publish
 * checks before anything of theirs can go live.
 */
export const claimAccount = async (
  values: z.infer<typeof ClaimSchema>,
  token: string,
): Promise<{ error?: string; success?: string }> => {
  const parsed = ClaimSchema.safeParse(values);
  if (!parsed.success) return { error: "Invalid fields!" };

  const claim = await db.hostClaimToken.findUnique({
    where: { token },
    select: { id: true, userId: true, usedAt: true, expiresAt: true, user: { select: { email: true } } },
  });

  // Deliberately the same message for every failure: a claim link is a bearer
  // credential, and distinguishing "already used" from "never existed" tells an
  // attacker which guesses were close.
  if (!claim || claim.usedAt || claim.expiresAt < new Date()) {
    return { error: "This link is no longer valid. Ask us for a new one." };
  }

  const hashedPassword = await bcrypt.hash(parsed.data.password, 10);
  const now = new Date();

  await db.$transaction([
    db.user.update({
      where: { id: claim.userId },
      data: { password: hashedPassword, emailVerified: now },
    }),
    // Spend the token by id, but only while it is still unused — two tabs
    // submitting at once would otherwise both succeed.
    db.hostClaimToken.updateMany({
      where: { id: claim.id, usedAt: null },
      data: { usedAt: now },
    }),
    // Every other outstanding link for this account dies with it.
    db.hostClaimToken.updateMany({
      where: { userId: claim.userId, usedAt: null, id: { not: claim.id } },
      data: { expiresAt: now },
    }),
    // The consent record. Until this is set, wave-publish refuses to publish
    // these listings no matter what flags an operator passes.
    db.listing.updateMany({
      where: { hostId: claim.userId, claimedAt: null },
      data: { claimedAt: now },
    }),
  ]);

  try {
    await signIn("credentials", {
      email: claim.user.email,
      password: parsed.data.password,
      redirectTo: DEFAULT_LOGIN_REDIRECT,
    });
  } catch (error) {
    // next-auth signals a successful redirect by throwing; anything else means
    // the account is claimed but the session did not start, so send them to
    // sign in by hand rather than reporting a failure that already happened.
    if ((error as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw error;
    return { success: "Account claimed. Please sign in." };
  }

  return { success: "Account claimed." };
};
