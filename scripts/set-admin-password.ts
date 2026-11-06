/**
 * Set one admin account's password from stdin — never from argv, never printed.
 *
 *   security find-generic-password -s mkan-admin-password -w \
 *     | pnpm admin:password --id=<userId>
 *
 * The value lives only in the Mac's Keychain (`mkan-admin-password`); this writes its bcrypt hash
 * onto the user, reads the row back and checks the hash matches, and prints the account it changed.
 * It refuses a user that is not ADMIN or SUPER_ADMIN, and a password under 16 characters.
 * (2026-11-06: the prod admin was still on the shared `1234`.)
 */
import { config } from "dotenv";
config({ override: true, quiet: true } as never);

import bcrypt from "bcryptjs";

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error("pipe the password in (security find-generic-password … -w | …); it is never typed or passed as an argument");
  let s = "";
  for await (const chunk of process.stdin) s += chunk;
  return s.replace(/\r?\n$/, "");
}

async function main() {
  const id = arg("id");
  if (!id) throw new Error("--id=<userId> is required");
  const password = await readStdin();
  if (password.length < 16) throw new Error("refusing a password under 16 characters");

  const { db } = await import("../src/lib/db");
  try {
    const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } });
    if (!user) throw new Error(`no user ${id}`);
    if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") throw new Error(`user ${id} is ${user.role}, not an admin`);

    await db.user.update({ where: { id }, data: { password: await bcrypt.hash(password, 10) } });
    const back = await db.user.findUnique({ where: { id }, select: { password: true } });
    if (!back?.password || !(await bcrypt.compare(password, back.password))) throw new Error("the stored hash does not match — nothing verified");
    console.log(`✓ password set for ${user.email ?? user.id} (${user.role}); verified against the stored hash`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
