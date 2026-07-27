import * as z from "zod";
import { NewPasswordSchema } from "../auth/validation";

/**
 * Claiming reuses the password rules the rest of auth enforces — strong in
 * production, moderate in development — so a claimed account is held to the
 * same standard as one created through /join.
 */
export const ClaimSchema = NewPasswordSchema.extend({
  /** The host confirmed the listings shown are theirs. */
  confirmed: z.literal(true, {
    message: "Please confirm these listings are yours",
  }),
});
