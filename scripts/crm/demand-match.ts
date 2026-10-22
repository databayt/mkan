/**
 * Daily: match every open tenant request against the homes that came in since
 * the last run (TikTok, Facebook, web, brokers' replies), alert the tenants
 * who left a number, close expired requests, and post the day's digest.
 *
 *   pnpm crm:demand-match [--since=2026-10-20] [--dry-run] [--notify]
 *
 * The last run's time lives in .data/demand/last-run.json, so a missed day
 * catches up instead of skipping homes. --dry-run counts, writes nothing.
 *
 * Then the Twenty `zone` records' `openDemand` counters are refreshed (only the
 * ones that changed — a few PATCHes); the other counters move with `crm:zones`.
 */
import { config } from 'dotenv';
config({ override: true });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { postToMkan, recordRun } from './notify';

const DIR = join(__dirname, '.data', 'demand');
const LAST = join(DIR, 'last-run.json');
const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const flag = (name: string) => process.argv.includes(`--${name}`);

function lastRun(): Date {
  const given = arg('since');
  if (given) return new Date(given);
  try {
    if (existsSync(LAST)) return new Date(JSON.parse(readFileSync(LAST, 'utf8')).at);
  } catch {
    /* first run */
  }
  return new Date(Date.now() - 86_400_000);
}

async function main() {
  const { db } = await import('../../src/lib/db');
  const since = lastRun();
  const started = new Date();
  const day = new Date(started.getTime() - 86_400_000);

  const [newBySource, newBrokers, open, outbox] = await Promise.all([
    db.listing.groupBy({ by: ['source'], where: { createdAt: { gt: since }, source: { in: ['TIKTOK', 'FACEBOOK', 'WEB'] } }, _count: true }),
    db.broker.count({ where: { createdAt: { gt: day } } }),
    db.tenantRequest.count({ where: { status: { in: ['OPEN', 'MATCHED'] }, expiresAt: { gte: started } } }),
    db.outboundMessage.groupBy({ by: ['kind', 'status'], where: { createdAt: { gt: day } }, _count: true }),
  ]);

  let result = { requests: open, matched: 0, homes: 0 };
  if (!flag('dry-run')) {
    const { matchOpenDemand } = await import('../../src/components/agent/demand');
    result = await matchOpenDemand(since, started);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(LAST, JSON.stringify({ at: started.toISOString(), ...result }, null, 2));
  }

  // Zone pages show how many tenants still wait there. Twenty being down never fails the run.
  let zonesNote = '';
  try {
    const { refreshOpenDemand } = await import('./zones');
    const n = await refreshOpenDemand({ write: !flag('dry-run') });
    zonesNote = ` · zone open-demand counters ${flag('dry-run') ? 'to refresh' : 'refreshed'}: ${n}`;
  } catch (err) {
    zonesNote = ` · zone counters skipped (${(err as Error).message.slice(0, 80)})`;
  }

  const leads = newBySource.map((r) => `${r.source?.toLowerCase()} ${r._count}`).join(' · ') || 'none';
  const sends = outbox.map((r) => `${r.kind.toLowerCase()} ${r.status.toLowerCase()} ${r._count}`).join(' · ') || 'none';
  const digest = [
    `:house: *mkan daily* — new leads since ${since.toISOString().slice(0, 16)}Z: ${leads}`,
    `New brokers (24 h): ${newBrokers} · open tenant requests: ${result.requests}${zonesNote}`,
    `Matched today: ${result.matched} request(s), ${result.homes} home(s)${flag('dry-run') ? ' (dry run)' : ''}`,
    `WhatsApp (24 h): ${sends}`,
  ].join('\n');
  console.log(digest);
  if (flag('notify')) await postToMkan(digest);
  await db.$disconnect();
}

main()
  .then(() => recordRun('demand-match', true))
  .catch(async (err) => {
    console.error(err);
    await recordRun('demand-match', false, (err as Error).message);
    process.exit(1);
  });
