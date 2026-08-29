/**
 * Mint one-time claim links for pre-provisioned host accounts (Epic G1.8).
 *
 *   pnpm crm:claim-token --all                 # dry run over every scraped host
 *   pnpm crm:claim-token --host=56622144 --apply
 *   pnpm crm:claim-token --account=1004 --rotate --ttl-days=14 --apply   # by the number on the sheet
 *   pnpm crm:claim-token --all --rotate --apply
 *
 * ── Why a link, not a password ─────────────────────────────────────────────
 *
 * The 49 accounts the import already created have no recoverable password. The
 * bootstrap one was generated, bcrypt-hashed straight into the row, and printed
 * to a terminal that is long gone — `mkan-import.ts` never stored the
 * plaintext. So "send them their password" is not an option that exists, and
 * the outreach template that promises one has been emitting a literal
 * `<from provisioning>` into messages a human might actually send.
 *
 * A claim link also happens to be the better design: it proves the person on
 * the other end controls the channel we reached them on, it expires, and it
 * lets them set their own password instead of inheriting ours.
 *
 * The token is 32 random bytes, base64url, stored in HostClaimToken the same
 * way this repo already stores VerificationToken and TwoFactorToken. It is
 * printed once here and never written to the ledger or any scrape file.
 * `--rotate` expires any unused token for that host before minting the next
 * one, so a leaked link stops working when its replacement exists rather than
 * when it would have aged out.
 */
import { config } from 'dotenv';
import { randomBytes } from 'node:crypto';
import { claimUrl, publicAppUrl } from './public-links';

config({ override: true });

let prisma: (typeof import('@/lib/db'))['db'];

const APPLY = process.argv.includes('--apply');
const ALL = process.argv.includes('--all');
const ROTATE = process.argv.includes('--rotate');
const arg = (name: string, def: string) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};
const HOST = arg('host', '');
// The account number — what the gift-handover sheet shows and what a human types.
const ACCOUNT = arg('account', '');
const TTL_DAYS = parseInt(arg('ttl-days', '7'), 10);
// The public origin, localhost-guarded (see public-links.ts): the links printed
// below are the only copy that ever exists, so they must be sendable as printed.
const BASE_URL = publicAppUrl(arg('base-url', ''));

const mintToken = () => randomBytes(32).toString('base64url');

async function main() {
  if (!ALL && !HOST && !ACCOUNT) throw new Error('pass --host=<airbnbHostId>, --account=<NNNN> or --all');
  console.log(`\n🔑 Claim links — ${APPLY ? 'APPLY' : 'DRY RUN'}, ttl ${TTL_DAYS}d, base ${BASE_URL}`);

  prisma = (await import('@/lib/db')).db;

  const users = await prisma.user.findMany({
    where: HOST ? { sourceHostId: HOST } : ACCOUNT ? { email: ACCOUNT, sourceHostId: { not: null } } : { sourceHostId: { not: null } },
    select: {
      id: true,
      email: true,
      username: true,
      sourceHostId: true,
      lastLogin: true,
      _count: { select: { listings: true } },
      claimTokens: {
        where: { usedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, expiresAt: true },
      },
      listings: { select: { claimedAt: true }, take: 1, where: { claimedAt: { not: null } } },
    },
  });

  if (!users.length)
    throw new Error(
      HOST
        ? `no provisioned account for host ${HOST}`
        : ACCOUNT
          ? `no import-provisioned account ${ACCOUNT} — claim links are for scraped hosts (1001+); a site-provisioned account (0001+) uses the shared password: pnpm crm:handover --account=${ACCOUNT}`
          : 'no provisioned accounts — run crm:backfill-source first',
    );
  console.log(`   ${users.length} provisioned account(s)\n`);

  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  let minted = 0;
  let skipped = 0;
  let rotated = 0;

  for (const u of users) {
    const alreadyClaimed = u.listings.length > 0 || u.lastLogin != null;
    if (alreadyClaimed) {
      // The account is in its owner's hands; a fresh link would be a way in
      // past the password they set.
      console.log(`  · ${u.email}  already claimed — skipped`);
      skipped++;
      continue;
    }
    if (u.claimTokens.length && !ROTATE) {
      console.log(`  · ${u.email}  has a live link (expires ${u.claimTokens[0].expiresAt.toISOString().slice(0, 10)}) — pass --rotate to replace`);
      skipped++;
      continue;
    }

    const token = mintToken();
    const url = claimUrl(token, 'ar', BASE_URL);
    if (APPLY) {
      if (u.claimTokens.length) {
        // Burn the old links first, so a leaked one stops working the moment
        // the replacement exists rather than when it expires.
        await prisma.hostClaimToken.updateMany({
          where: { userId: u.id, usedAt: null },
          data: { expiresAt: new Date() },
        });
        rotated += u.claimTokens.length;
      }
      await prisma.hostClaimToken.create({ data: { token, userId: u.id, expiresAt } });
    }
    minted++;
    console.log(`  + ${u.email.padEnd(18)} host ${String(u.sourceHostId).padEnd(20)} ${u._count.listings} listing(s)`);
    console.log(`    ${url}`);
  }

  console.log('\n── result ───────────────────────────────────────────');
  console.log(`  ${minted} link(s) ${APPLY ? 'minted' : 'would be minted'}, ${skipped} skipped, ${rotated} old link(s) burned`);
  if (APPLY) {
    console.log('\n  ⚠ Copy these links now — this is the only place they are printed.');
    console.log('    Re-running mints new ones; it cannot re-print these.\n');
  } else {
    console.log('\nDRY RUN — the links above are NOT in the database. Re-run with --apply.\n');
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
