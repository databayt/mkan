/**
 * Drop `@mkan.org` from the host account numbers.
 *
 *   pnpm accounts:simplify                    what would change, writes nothing
 *   pnpm accounts:simplify --only=0001        one account (the canary)
 *   pnpm accounts:simplify --apply            the rest
 *
 * A provisioned host has never been told an address. They were given a number and a
 * password, and `getUserByIdentifier` quietly appended a domain nobody said out loud.
 * This removes the domain from the accounts that are only a number, so the thing they
 * type and the thing stored are the same string.
 *
 * Scope is deliberately narrow — `^\d{4}@mkan.org$` and nothing else. The admin
 * (`super@`), the demo guests (`travelerN@`), the transport operators and the named
 * legacy rows keep their addresses: they are not account numbers.
 *
 * Reversible: every row written is appended to `.data/simplify-accounts.jsonl` with the
 * address it had. Re-appending `@mkan.org` to those ids undoes the whole thing.
 *
 * Order matters. `getUserByIdentifier` must already be deployed to production answering
 * to a bare number (mkan `0c2ceab`) — until it is, a migrated host cannot sign in.
 */
import { config } from 'dotenv';
config({ override: true });

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const argv = (n: string, d = ''): string => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.split('=').slice(1).join('=') : d;
};
const APPLY = process.argv.includes('--apply');
const ONLY = argv('only');
const LEDGER = join(__dirname, '.data', 'simplify-accounts.jsonl');

async function main() {
  const { db } = await import('../../src/lib/db');
  const rows: { id: string; email: string; username: string | null }[] =
    await db.$queryRaw`SELECT id, email, username FROM "User" WHERE email ~ '^[0-9]{4}@mkan\.org$' ORDER BY email`;
  const scoped = ONLY ? rows.filter((r) => r.email.split('@')[0] === ONLY) : rows;
  if (!scoped.length) {
    console.log(ONLY ? `no account ${ONLY}@mkan.org` : 'nothing left to simplify');
    await db.$disconnect();
    return;
  }
  // A bare number already taken would abort the update halfway through.
  const clash: { email: string }[] =
    await db.$queryRaw`SELECT email FROM "User" WHERE email ~ '^[0-9]{4}$'`;
  const takenBare = new Set(clash.map((c) => c.email));
  const blocked = scoped.filter((r) => takenBare.has(r.email.split('@')[0]!));
  if (blocked.length) {
    console.error(`✋ already taken as a bare number: ${blocked.map((b) => b.email).join(', ')}`);
    await db.$disconnect();
    process.exitCode = 1;
    return;
  }

  console.log(`${scoped.length} account(s)${ONLY ? ` (only ${ONLY})` : ''}${APPLY ? '' : ' — DRY RUN, nothing written'}`);
  mkdirSync(dirname(LEDGER), { recursive: true });
  for (const r of scoped) {
    const bare = r.email.split('@')[0]!;
    console.log(`  ${r.email.padEnd(20)} → ${bare.padEnd(8)} ${JSON.stringify(r.username ?? '')}`);
    if (!APPLY) continue;
    appendFileSync(LEDGER, `${JSON.stringify({ id: r.id, from: r.email, to: bare, at: new Date().toISOString() })}\n`, 'utf8');
    await db.user.update({ where: { id: r.id }, data: { email: bare } });
  }
  if (APPLY) console.log(`\nledger → ${LEDGER}`);
  await db.$disconnect();
}
main();
