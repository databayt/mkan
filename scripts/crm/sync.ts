/**
 * The whole CRM ↔ site loop, in one command.
 *
 *   pnpm crm:sync            # dry run — every step reports, nothing is written
 *   pnpm crm:sync --apply
 *
 * Order matters and is not arbitrary:
 *
 *   1. backfill-facts   re-derive from the scrape onto listings that already
 *                       exist (amenities, house rules, canonical locale)
 *   2. sync-down        operator decisions in the CRM → the site
 *   3. sync-up          the site's resulting state → the board
 *
 * Down before up, so a publish decision taken in the CRM this morning is
 * reflected on the site before the site reports back what it is showing.
 * Running up first would report yesterday's state and then immediately
 * invalidate it.
 *
 * A fresh **scrape** is deliberately not part of this. It needs a logged-in
 * browser over CDP and it is the one step that can invent new records rather
 * than reconcile existing ones — it stays a human-run command.
 *
 * Any step failing stops the run: a sync-down that half-applied should not be
 * followed by a sync-up that reports the half state as settled.
 */
import { spawn } from 'node:child_process';

const APPLY = process.argv.includes('--apply');

const STEPS: Array<{ name: string; script: string; why: string }> = [
  { name: 'backfill-facts', script: 'scripts/crm/backfill-listing-facts.ts', why: 're-derive from the scrape' },
  { name: 'sync-down', script: 'scripts/crm/sync-down.ts', why: 'CRM decisions → site' },
  { name: 'sync-up', script: 'scripts/crm/sync-up.ts', why: 'site state → CRM board' },
];

function run(script: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('npx', ['tsx', script, ...(APPLY ? ['--apply'] : [])], {
      stdio: 'inherit',
      env: process.env,
    });
    child.on('close', (code) => resolve(code ?? 1));
  });
}

async function main(): Promise<void> {
  const started = Date.now();
  console.log(`\n🔁 CRM ↔ mkan.sd sync  (${APPLY ? 'APPLY' : 'dry run'})`);

  for (const [i, step] of STEPS.entries()) {
    console.log(`\n${'─'.repeat(70)}\n${i + 1}/${STEPS.length}  ${step.name} — ${step.why}\n${'─'.repeat(70)}`);
    const code = await run(step.script);
    if (code !== 0) {
      console.error(`\n❌ ${step.name} exited ${code} — stopping before the remaining steps.\n`);
      process.exit(code);
    }
  }

  console.log(`\n✅ sync complete in ${Math.round((Date.now() - started) / 1000)}s\n`);
}

main().catch((e) => {
  console.error(`\n❌ ${(e as Error).message}\n`);
  process.exit(1);
});
