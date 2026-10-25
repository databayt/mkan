/**
 * The WhatsApp outbox from a terminal — the same pass the 2-minute cron runs
 * on Cloudflare (src/components/agent/wa-outbox.ts, /api/cron/wa-outbox).
 *
 *   pnpm wa:outbox --dry-run   print the plan and the replies; send, write and post nothing
 *   pnpm wa:outbox             one real pass (the cron's lease keeps it from overlapping one)
 *
 * It reaches the shared bridge through https://www.mkan.sd/__wa with the
 * Keychain secrets (scripts/wa/evolution.ts).
 */
import { config } from 'dotenv';
config({ override: true });
import './evolution';

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { runOutbox } = await import('../../src/components/agent/wa-outbox');
  const { db } = await import('../../src/lib/db');
  try {
    const res = await runOutbox({ dry, log: (m) => console.log(`${new Date().toISOString()} ${dry ? '[dry] ' : ''}${m}`) });
    console.log(JSON.stringify(res));
  } finally {
    await db.$disconnect().catch(() => {});
  }
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).stack ?? err}`);
  process.exit(1);
});
