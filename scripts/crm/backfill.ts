/**
 * Queue the CRM's first load (2026-11-15): real people from the last N days become Twenty tenants, and
 * every open Deal a Twenty deal. Dry by default — it only reads and prints what it would queue.
 *
 *   pnpm crm:backfill                    # dry: counts + a sample
 *   pnpm crm:backfill --days=60          # window (default 60)
 *   pnpm crm:backfill --apply            # writes CrmOp rows to Neon (production!) — they drain in the Worker's backstop
 *   pnpm crm:backfill --apply --drain    # …and drains them from here too (needs TWENTY_API_URL/KEY)
 *
 * "Real people" is src/lib/monetize/team.ts REAL_PERSON: not Abdout's contacts, test phones or the team.
 * Idempotent: ops upsert by mkanProfileId / mkanKey and merge into a still-queued op, so a re-run is safe.
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

const APPLY = process.argv.includes('--apply');
const DRAIN = process.argv.includes('--drain');
const DAYS = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 60);

async function main() {
  const { db } = await import('../../src/lib/db');
  const { changedTenants, sweepFieldsFor } = await import('../../src/lib/crm/tenant-sync');
  const { enqueueCrm, drainCrm } = await import('../../src/lib/crm/crm-ops');
  const { readState } = await import('../../src/components/agent/wa-state');
  const { buildDealFields, tenantKeyOf, parseDealKey } = await import('../../src/lib/crm/deal-sync-pure');

  console.log(`\n📥 CRM backfill — ${APPLY ? 'APPLY' : 'DRY RUN'} · last ${DAYS} days`);
  const stopped = new Set(await readState<string[]>('tenant-stop', []));
  let since = new Date(Date.now() - DAYS * 86_400_000);
  let tenants = 0;
  const sample: string[] = [];
  for (let page = 0; page < 200; page++) {
    const { rows, last } = await changedTenants(since, 200);
    if (!rows.length || !last) break;
    for (const row of rows) {
      const fields = await sweepFieldsFor(row, stopped);
      if (!fields.$phone) continue;
      tenants += 1;
      if (sample.length < 8) sample.push(`   ${String(row.id).slice(0, 10)}  ${fields.$phone}  ${fields.source}  ${fields.stage ?? '(stage kept)'}  ${fields.needSummary ?? ''}`);
      if (APPLY) await enqueueCrm('tenant', row.id, fields);
    }
    since = last;
  }
  console.log(`   tenants: ${tenants}${APPLY ? ' queued' : ' would be queued'}`);
  for (const l of sample) console.log(l);

  const deals = await db.deal.findMany({
    where: { createdAt: { gte: new Date(Date.now() - DAYS * 86_400_000) } },
    include: { visit: { select: { scheduledFor: true, meetingPoint: true } } },
  });
  for (const d of deals) {
    const key = d.taskId ? `${d.taskId}:${d.listingId}` : `deal:${d.id}`;
    const profile = d.tenantPhone ? await db.agentProfile.findUnique({ where: { waPhone: d.tenantPhone }, select: { id: true } }) : null;
    const fields = buildDealFields(
      d.status as never,
      { listingId: d.listingId, taskId: d.taskId, dealId: d.id, tenantPhone: d.tenantPhone, tenantName: d.tenantName, brokerId: d.brokerId, at: d.updatedAt, viewingAt: d.visit?.scheduledFor, meetingPoint: d.visit?.meetingPoint },
      key,
      tenantKeyOf(profile?.id, d.tenantPhone),
      { rentMonthly: d.rentMonthly, brokerCommission: d.brokerCommission, mkanShare: d.mkanShare, tripCost: d.tripCost },
    );
    // buildDealFields only writes viewingAt for the booking steps; a backfilled deal carries it whatever its stage.
    if (d.visit?.scheduledFor) fields.viewingAt = d.visit.scheduledFor.toISOString();
    if (!parseDealKey(key)) continue;
    if (APPLY) await enqueueCrm('deal', key, fields);
  }
  console.log(`   deals:   ${deals.length}${APPLY ? ' queued' : ' would be queued'}`);

  if (!APPLY) console.log('\nDRY RUN — nothing queued. Pass --apply (writes CrmOp rows to the production Neon DB).');
  else if (DRAIN) {
    const r = await drainCrm({ max: 40, deadlineMs: 55_000 });
    console.log(`   drained: ${JSON.stringify(r)} (re-run --drain until nothing is left; 40 calls a minute)`);
  } else console.log('\nQueued. The wa-outbox backstop drains them within the hour, or run again with --drain.');
  await db.$disconnect();
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
