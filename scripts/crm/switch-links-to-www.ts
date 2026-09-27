/**
 * Move every mkan link stored in the CRM from the apex to www.mkan.sd.
 *
 * www.mkan.sd is the canonical host (it matches NEXTAUTH_URL). A link on the apex
 * still works — the proxy 308s page loads to www — but it costs every click a
 * redirect, and a link that disagrees with the canonical host is how the apex→www
 * login bounce happened in the first place (2026-09-27). `public-links.ts` builds
 * new links on www; this fixes the ones already stored: every LINKS field on
 * `homes` and `portSudans` (listingUrl, mkanListingUrl), primary and secondary.
 *
 * Only the host changes. Path, query, labels and non-mkan links (the Airbnb
 * provenance links) are left exactly as they are.
 *
 *   npx tsx scripts/crm/switch-links-to-www.ts                    # dry plan
 *   npx tsx scripts/crm/switch-links-to-www.ts --apply            # snapshot, then write
 *   npx tsx scripts/crm/switch-links-to-www.ts --restore=<file> --apply   # put it back
 *
 * Idempotent: a re-run finds nothing left to move.
 */
import { config } from 'dotenv';
config({ override: true });

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const APPLY = process.argv.includes('--apply');
const RESTORE = process.argv.find((a) => a.startsWith('--restore='))?.slice('--restore='.length);
const OBJECTS = ['homes', 'portSudans'] as const;
const APEX = /^https?:\/\/mkan\.sd(?=\/|$|\?|#)/;
const WWW = 'https://www.mkan.sd';

interface Links {
  primaryLinkUrl?: string | null;
  primaryLinkLabel?: string | null;
  secondaryLinks?: Array<{ url?: string | null; label?: string | null }> | null;
}
type Row = Record<string, unknown> & { id: string };
interface Change {
  object: string;
  id: string;
  field: string;
  before: Links;
  after: Links;
}

const isLinks = (v: unknown): v is Links => !!v && typeof v === 'object' && 'primaryLinkUrl' in (v as object);
const toWww = (url: string | null | undefined): string | null | undefined =>
  url && APEX.test(url) ? url.replace(APEX, WWW) : url;

function rewrite(links: Links): Links | null {
  const after: Links = {
    ...links,
    primaryLinkUrl: toWww(links.primaryLinkUrl),
    secondaryLinks: (links.secondaryLinks ?? []).map((s) => ({ ...s, url: toWww(s.url) })),
  };
  return JSON.stringify(after) === JSON.stringify({ ...links, secondaryLinks: links.secondaryLinks ?? [] })
    ? null
    : after;
}

async function main(): Promise<void> {
  const { twentyClient } = await import('./twenty-rest');
  const t = twentyClient();

  // ── Restore mode — replay a snapshot and stop ──────────────────────────────
  if (RESTORE) {
    const changes = JSON.parse(readFileSync(RESTORE, 'utf8')) as Change[];
    console.log(`\n↩️  restoring ${changes.length} field(s) from ${RESTORE}\n`);
    for (const c of changes) {
      if (APPLY) await t.rest('PATCH', `${c.object}/${c.id}`, { [c.field]: c.before });
    }
    console.log(`   ${APPLY ? `✅ ${changes.length} restored` : `(dry run) ${changes.length} would be restored`}\n`);
    return;
  }

  const changes: Change[] = [];
  for (const object of OBJECTS) {
    const res = await t.rest<{ data?: Record<string, Row[]> }>('GET', `${object}?limit=200&depth=0`);
    const rows = res.data?.[object] ?? [];
    let moved = 0;
    for (const row of rows) {
      for (const [field, value] of Object.entries(row)) {
        if (!isLinks(value)) continue;
        const after = rewrite(value);
        if (!after) continue;
        changes.push({ object, id: row.id, field, before: value, after });
        moved++;
      }
    }
    console.log(`── ${object}: ${rows.length} row(s), ${moved} link field(s) to move`);
  }
  for (const c of changes.slice(0, 3)) {
    console.log(`   e.g. ${c.object}.${c.field}: ${c.before.primaryLinkUrl} → ${c.after.primaryLinkUrl}`);
  }

  if (!APPLY || changes.length === 0) {
    console.log(changes.length ? '\n   (dry run — pass --apply to write)\n' : '\n   nothing to move\n');
    return;
  }

  // ── Snapshot first: a CRM write with no confirm step ───────────────────────
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const snapPath = join(process.cwd(), 'scripts/crm/.data', `switch-links-to-www-${stamp}.json`);
  mkdirSync(dirname(snapPath), { recursive: true });
  writeFileSync(snapPath, JSON.stringify(changes, null, 2));
  console.log(`\n   💾 snapshot → ${snapPath}`);
  console.log(`      restore with: npx tsx scripts/crm/switch-links-to-www.ts --restore=${snapPath} --apply\n`);

  for (const c of changes) await t.rest('PATCH', `${c.object}/${c.id}`, { [c.field]: c.after });
  console.log(`   ✅ ${changes.length} link field(s) moved to ${WWW}\n`);
}

main().catch((e: unknown) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
