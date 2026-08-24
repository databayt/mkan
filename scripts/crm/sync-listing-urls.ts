/**
 * Point every Port Sudan CRM row's **Listing URL** at mkan.sd.
 *
 * 26 of the 34 rows already did. The 8 that came in through the Airbnb scrape
 * kept the Airbnb room link as their primary, so the column an operator clicks
 * meant "the site this listing came from" on some rows and "our page for it"
 * on others — and only one of those is the link you send a host.
 *
 * The Airbnb link is not discarded: it moves to a secondary link on the same
 * field, where it is still one click away as provenance.
 *
 *   TWENTY_API_URL=http://localhost:3100 \
 *   TWENTY_API_KEY=$(security find-generic-password -s databayt-twenty -a mkan -w) \
 *   npx tsx scripts/crm/sync-listing-urls.ts            # dry plan
 *   … --apply
 *
 * Idempotent: a row already pointing at the right mkan URL is skipped.
 */
import { config } from 'dotenv';
config({ override: true });

import { LISTING_CODE_RE } from '@/lib/listing-code';

const APPLY = process.argv.includes('--apply');
const SITE = 'https://mkan.sd';

interface Link {
  primaryLinkLabel?: string | null;
  primaryLinkUrl?: string | null;
  secondaryLinks?: Array<{ label?: string | null; url?: string | null }> | null;
}

async function main(): Promise<void> {
  const { twentyClient } = await import('./twenty-rest');
  const t = twentyClient();

  const res = await t.rest<{ data?: { portSudans?: Array<Record<string, unknown>> } }>(
    'GET',
    'portSudans?limit=100&depth=0',
  );
  const rows = (res.data?.portSudans ?? []).filter((r) => LISTING_CODE_RE.test(String(r.listingId ?? '')));
  console.log(`\n🔗 ${rows.length} Port Sudan row(s) with a listing code\n`);

  let changed = 0;
  let already = 0;
  for (const row of rows.sort((a, b) => String(a.listingId).localeCompare(String(b.listingId)))) {
    const code = String(row.listingId);
    const want = `${SITE}/listings/${code}`;
    const current = (row.listingUrl ?? {}) as Link;

    if (current.primaryLinkUrl === want && current.primaryLinkLabel === code) {
      already++;
      continue;
    }

    // Whatever the primary was, if it was an external listing keep it — the
    // provenance is the reason the row exists.
    const secondaries = [...(current.secondaryLinks ?? [])];
    const displaced = current.primaryLinkUrl;
    if (displaced && displaced !== want && !secondaries.some((s) => s.url === displaced)) {
      secondaries.push({ label: current.primaryLinkLabel || 'Source listing', url: displaced });
    }

    console.log(`   ${code} → ${want}`);
    if (displaced && displaced !== want) console.log(`             keeps ${displaced} as a secondary link`);

    if (APPLY) {
      await t.rest('PATCH', `portSudans/${String(row.id)}`, {
        listingUrl: { primaryLinkLabel: code, primaryLinkUrl: want, secondaryLinks: secondaries },
      });
    }
    changed++;
  }

  console.log(
    `\n${APPLY ? '✅' : 'DRY RUN —'} ${changed} row(s) ${APPLY ? 'updated' : 'would be updated'}` +
      `, ${already} already correct.` +
      (APPLY ? '\n' : '\nTo apply: re-run with --apply\n'),
  );
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
