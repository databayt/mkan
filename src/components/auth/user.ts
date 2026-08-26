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

/**
 * What a host types to sign in. A provisioned host account is known by its number and
 * nothing else — `0001`, never an address — because `username` doubles as the display
 * name a guest reads under "Hosted by", so the number cannot live there.
 *
 * Three lookups, in this order, and every one of them has to stay: a name resolves a
 * named account, a bare number resolves an account whose address IS the number, and the
 * `@mkan.org` form resolves the accounts minted before that domain was dropped — as does
 * a host who types the whole old address out of habit.
 */
export const getUserByIdentifier = async (identifier: string) => {
  const raw = identifier.trim();
  const lower = raw.toLowerCase();
  if (raw.includes("@")) {
    const byAddress = await getUserByEmail(lower);
    if (byAddress) return byAddress;
    // "0001@mkan.org" typed from memory, for an account that is now just "0001"
    return getUserByEmail(lower.split("@")[0] ?? lower);
  }
  // `username` is matched exactly — it holds names like "Osman" and "عبدوت", and
  // lowercasing it here would lock every named host out of their own account.
  const byUsername = await getUserByUsername(raw);
  if (byUsername) return byUsername;

  const byNumber = await getUserByEmail(lower);
  if (byNumber) return byNumber;

  return getUserByEmail(`${lower}@mkan.org`);
};

export const getUserById = async (id: string) => {
  try {
    const user = await db.user.findUnique({ where: { id } });

    return user;
  } catch {
    return null;
  }
};
