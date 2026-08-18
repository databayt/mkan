/**
 * Give every host a name — Twenty CRM → mkan `User.username` (Epic G1.6).
 *
 *   npx tsx scripts/crm/sync-host-names.ts                       # dry run
 *   TWENTY_API_URL=http://localhost:3100 TWENTY_API_KEY=… \
 *     npx tsx scripts/crm/sync-host-names.ts --apply
 *
 * A listing that says "Hosted by 1055" is a listing that looks unfinished. The
 * numbers are seed artifacts: `username` is what every host surface renders
 * (hosted-by, meet-host, the mobile PDP, admin), and everywhere else in the app
 * it already holds a real name — OAuth sign-in maps `profile.name → username`,
 * and registration writes the name the person typed. The CRM is where the real
 * names live, so it is the source and this is the one-way sync down.
 *
 * The account number does not disappear: it is the local part of the host's
 * email, and `getUserByIdentifier` resolves "0001" through `0001@mkan.org`, so
 * the owners keep logging in exactly as before.
 *
 * Write rules, deliberately conservative — a wrong name on a live listing is
 * worse than a number:
 *   · Only hosts whose CRM record carries `mkanUserId` are touched.
 *   · A name shorter than 3 characters is skipped (the login identifier
 *     validator rejects those, so it could never be typed back in).
 *   · `username` is @unique. On a collision the host is SKIPPED and logged —
 *     never suffixed into "Ahmed2", which reads as a bug to a guest.
 *   · A username that is already non-numeric is left alone: a human or an
 *     earlier run has decided.
 *   · The CRM's `mkanUsername` mirror is updated to match, or it goes stale the
 *     moment this runs.
 *
 * CANONICAL_NAMES pins the three real owners to the names they gave us
 * (2026-08-18) and pushes them UP to the CRM first, so the sync down can't
 * overwrite them with the Latin placeholders the CRM was seeded with.
 */
import { config } from 'dotenv';

config({ override: true });

const APPLY = process.argv.includes('--apply');
const API_URL = (process.env.TWENTY_API_URL ?? '').replace(/\/+$/, '');
const API_KEY = process.env.TWENTY_API_KEY ?? '';

/** mkan account email → the owner's real display name, in their own script. */
const CANONICAL_NAMES: Record<string, string> = {
  '0001@mkan.org': 'عبدوت',
  '0002@mkan.org': 'دقنة',
  '0003@mkan.org': 'حسين',
};

const MIN_NAME_LENGTH = 3;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
const MIN_GAP_MS = 700;
let lastCallAt = 0;
async function throttle(): Promise<void> {
  const wait = lastCallAt + MIN_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  lastCallAt = Date.now();
}

async function rest<T = any>(method: 'GET' | 'PATCH', path: string, body?: unknown): Promise<T> {
  await throttle();
  const res = await fetch(`${API_URL}/rest/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Twenty ${method} ${path} → ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

interface CrmHost {
  id: string;
  name: string | null;
  mkanUserId: string | null;
  mkanUsername: string | null;
  mkanAccountEmail: { primaryEmail?: string | null } | null;
}

async function main(): Promise<void> {
  if (!API_URL || !API_KEY) {
    throw new Error('needs TWENTY_API_URL + TWENTY_API_KEY (Settings → APIs & Webhooks)');
  }

  const { db } = await import('@/lib/db');

  const hosts = (await rest<{ data: { hosts: CrmHost[] } }>('GET', 'hosts?limit=500')).data.hosts;
  console.log(`\n👤 host names — ${hosts.length} CRM hosts, ${APPLY ? 'APPLY' : 'DRY RUN'}\n`);

  // ── 1. Push the three owners' canonical names UP to the CRM ──────────────
  for (const [email, name] of Object.entries(CANONICAL_NAMES)) {
    const host = hosts.find((h) => h.mkanAccountEmail?.primaryEmail === email);
    if (!host) {
      console.log(`  ⚠️  ${email}: no CRM host record — skipped`);
      continue;
    }
    if (host.name === name) {
      console.log(`  ·   ${email}: CRM already "${name}"`);
    } else {
      console.log(`  ⬆️  ${email}: CRM "${host.name}" → "${name}"`);
      if (APPLY) await rest('PATCH', `hosts/${host.id}`, { name });
      host.name = name;
    }
  }

  // ── 2. Sync every CRM name DOWN to the mkan account ──────────────────────
  const users = await db.user.findMany({
    where: { listings: { some: {} } },
    select: { id: true, username: true, email: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));
  const takenUsernames = new Set(
    (await db.user.findMany({ select: { username: true } }))
      .map((u) => u.username?.toLowerCase())
      .filter((u): u is string => Boolean(u)),
  );

  let renamed = 0;
  const skipped: string[] = [];

  for (const host of hosts) {
    const user = host.mkanUserId ? byId.get(host.mkanUserId) : undefined;
    if (!user) continue;

    const name = (host.name ?? '').trim();
    const current = user.username ?? '';

    if (!name) {
      skipped.push(`${current || user.email}: CRM name is empty`);
      continue;
    }
    if (name.length < MIN_NAME_LENGTH) {
      skipped.push(`${current || user.email}: CRM name "${name}" is too short to log in with`);
      continue;
    }
    if (current === name) continue;
    // Already a real name — someone decided; automation doesn't get a second opinion.
    if (current && !/^\d+$/.test(current)) {
      skipped.push(`${current}: already a name, CRM says "${name}"`);
      continue;
    }
    if (takenUsernames.has(name.toLowerCase())) {
      skipped.push(`${current || user.email}: "${name}" is taken by another account`);
      continue;
    }

    console.log(`  ✏️  ${current || user.email} → ${name}`);
    if (APPLY) {
      await db.user.update({ where: { id: user.id }, data: { username: name } });
      if (host.mkanUsername !== name) await rest('PATCH', `hosts/${host.id}`, { mkanUsername: name });
    }
    takenUsernames.add(name.toLowerCase());
    renamed += 1;
  }

  if (skipped.length > 0) {
    console.log(`\n  skipped (${skipped.length}):`);
    for (const s of skipped) console.log(`    · ${s}`);
  }

  console.log(
    `\n${APPLY ? '🎉' : '📋'} ${renamed} host${renamed === 1 ? '' : 's'} ${APPLY ? 'renamed' : 'would be renamed'}.` +
      (APPLY ? '' : '  Re-run with --apply to write.\n'),
  );

  await db.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
