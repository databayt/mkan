"use server";

import { db } from "@/lib/db";
import { getVerificationTokenByToken } from "./verificiation-token";
import { getUserByEmail } from "../user";

const isDevelopment = process.env.NODE_ENV === "development";


export const newVerification = async (token: string) => {
  if (isDevelopment) {
    console.log("New verification initiated");
  }

  const existingToken = await getVerificationTokenByToken(token);
  if (isDevelopment) {
    console.log("Token lookup completed");
  }

  if (!existingToken) {
    const existingUser = await getUserByEmail(token);
    if (existingUser && existingUser.emailVerified) {
      return { success: "Email already verified!" };
    } else {
      if (isDevelopment) {
        console.log("Token does not exist");
      }
      return { error: "Token does not exist!" };
    }
  }

  if (isDevelopment) {
    console.log("Valid token found in database");
  }

  const hasExpired = new Date(existingToken.expires) < new Date();
  if (isDevelopment) {
    console.log("Token expiration checked:", hasExpired ? "expired" : "valid");
  }

  if (hasExpired) {
    if (isDevelopment) {
      console.log("Token has expired");
    }
    return { error: "Token has expired!" };
  }

  const existingUser = await getUserByEmail(existingToken.email);
  if (isDevelopment) {
    console.log("User lookup completed");
  }

  if (!existingUser) {
    if (isDevelopment) {
      console.log("Email associated with token does not exist");
    }
    return { error: "Email does not exist!" };
  }

  if (existingUser.emailVerified) {
    return { success: "Email verified!" };
  }

  await db.user.update({
    where: { id: existingUser.id },
    data: { 
      emailVerified: new Date(),
      email: existingToken.email,
    }
  });
  if (isDevelopment) {
    console.log("User email verified successfully");
  }

  await db.verificationToken.delete({
    where: { id: existingToken.id }
  });
  if (isDevelopment) {
    console.log("Verification token deleted");
  }

  return { success: "Email verified!" };
};