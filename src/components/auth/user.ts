import { db } from "@/lib/db";

export const getUserByEmail = async (email: string) => {
  try {
    const user = await db.user.findUnique({ where: { email } });

    return user;
  } catch {
    return null;
  }
};

export const getUserByUsername = async (username: string) => {
  try {
    const user = await db.user.findUnique({ where: { username } });

    return user;
  } catch {
    return null;
  }
};

export const getUserByIdentifier = async (identifier: string) => {
  const value = identifier.trim();
  if (value.includes("@")) {
    return getUserByEmail(value.toLowerCase());
  }
  const byUsername = await getUserByUsername(value);
  if (byUsername) return byUsername;

  // Account-number login. `username` doubles as the display name shown on a
  // listing ("Hosted by …"), so the real owners' usernames are their names —
  // and the number they have always typed to log in is only their email's
  // local part. Resolving it here keeps "0001" working without making the
  // account number the thing guests read on the home.
  return getUserByEmail(`${value.toLowerCase()}@mkan.org`);
};

export const getUserById = async (id: string) => {
  try {
    const user = await db.user.findUnique({ where: { id } });

    return user;
  } catch {
    return null;
  }
};
