/**
 * Nightly truth check between Neon and Twenty (2026-11-15). Twenty wins on the fields a person edits
 * (a deal's stage, terms, viewing time, share, trip cost; a tenant's opt-out); mkan reports what it
 * observes. This diffs open deals and tenants and, with --apply, applies Twenty's values — through the
 * SAME handlers the webhook uses (src/lib/crm/twenty-inbound.ts), fed a synthetic `updated` event, so a
 * missed webhook (Twenty gives no retries) is caught up exactly as if it had arrived.
 *
 *   pnpm crm:reconcile            # dry: prints every difference, changes nothing
 *   pnpm crm:reconcile --apply    # applies Twenty's values to Neon (setDealStatus may send a share request)
 *
 * A field EMPTY in Twenty is never copied. Brokers are not diffed here: `crm:brokers` already pulls a
 * person's broker edits daily (and the webhook does it live).
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';
import { twentyClient } from './twenty-rest';

const APPLY = process.argv.includes('--apply');
if (!(process.env.TWENTY_API_URL ?? '').trim()) process.env.TWENTY_API_URL = 'http://localhost:3100';

async function main() {
  const { db } = await import('../../src/lib/db');
  const { dealDiff } = await import('../../src/lib/crm/inbound-pure');
  const { parseDealKey } = await import('../../src/lib/crm/deal-sync-pure');
  const { onDealUpdated, onTenantUpdated } = await import('../../src/lib/crm/twenty-inbound');
  const { readState } = await import('../../src/components/agent/wa-state');
  const { phonesFromTwenty } = await import('../../src/lib/phone');
  const client = twentyClient();

  console.log(`\n⚖  CRM reconcile — ${APPLY ? 'APPLY' : 'DRY RUN'}`);
  const deals = await client.all('deals');
  let dealDiffs = 0;
  let unmatched = 0;
  for (const rec of deals) {
    const p = parseDealKey(typeof rec.mkanKey === 'string' ? rec.mkanKey : null);
    if (!p) continue;
    const row =
      p.kind === 'deal' ? await db.deal.findUnique({ where: { id: p.dealId }, include: { visit: true } })
      : p.kind === 'task' ? await db.deal.findFirst({ where: { taskId: p.taskId, listingId: p.listingId }, include: { visit: true } })
      : await db.deal.findFirst({ where: { listingId: p.listingId }, orderBy: { createdAt: 'desc' }, include: { visit: true } });
    if (!row) { unmatched += 1; continue; } // picked, not booked: no Deal row to compare
    const fields = dealDiff(rec, { status: row.status, mkanShare: row.mkanShare, tripCost: row.tripCost, notes: row.notes, scheduledFor: row.visit?.scheduledFor ?? null });
    if (!fields.length) continue;
    dealDiffs += 1;
    console.log(`   deal K${row.listingId} ${rec.mkanKey}: Twenty ≠ Neon on ${fields.join(', ')}`);
    if (APPLY) console.log('     →', JSON.stringify(await onDealUpdated({ object: 'deal', action: 'updated', eventName: 'deal.updated', record: rec, updatedFields: fields })));
  }
  console.log(`   deals: ${deals.length} in Twenty · ${dealDiffs} differ · ${unmatched} without a Deal row yet`);

  const tenants = await client.all('tenants');
  const stopped = new Set(await readState<string[]>('tenant-stop', []));
  let optOuts = 0;
  for (const rec of tenants) {
    if (rec.optOut !== true) continue;
    const digits = [...phonesFromTwenty(rec.whatsapp as never, 'RW'), ...phonesFromTwenty(rec.phone as never, 'RW')].map((n) => n.replace(/\D/g, ''));
    if (!digits.length || digits.every((d) => stopped.has(d))) continue;
    optOuts += 1;
    console.log(`   tenant ${rec.name ?? rec.id}: opted out in Twenty, not yet stopped here`);
    if (APPLY) await onTenantUpdated({ object: 'tenant', action: 'updated', eventName: 'tenant.updated', record: rec, updatedFields: ['optOut'] });
  }
  const linked = await db.crmLink.count({ where: { object: 'tenant' } });
  console.log(`   tenants: ${tenants.length} in Twenty (${linked} linked from here) · ${optOuts} opt-out(s) to apply`);

  const queued = await db.crmOp.count({ where: { status: 'QUEUED' } });
  const failed = await db.crmOp.count({ where: { status: 'FAILED' } });
  console.log(`   queue: ${queued} waiting · ${failed} failed`);
  if (!APPLY) console.log('\nDRY RUN — nothing changed. Pass --apply to take Twenty\'s values.');
  await db.$disconnect();
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
