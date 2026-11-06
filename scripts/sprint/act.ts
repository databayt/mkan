/**
 * The loop's hands for Abdout's one-tap answers (src/lib/monetize/actions.ts). Run by the sprint runner
 * between sessions — deterministic code, never a model session — with MKAN_WA_BRIDGE_SECRET read from the
 * Keychain for this process only:
 *
 *   MKAN_WA_BRIDGE_SECRET=… pnpm exec tsx scripts/sprint/act.ts [--dry]
 *
 * For every answered decision not yet acted on: the Worker's signature must verify (a "yes" a session wrote
 * itself fails here), the answer must be under 24 h old, and at most ACTS_PER_DAY run a day. A yes is taken
 * once — an atomic update marks it consumed before anything runs — and its kind's own argv runs with no
 * shell; the prompt is then processed (or blocked with the error). A no skips the prompt.
 */
import { config } from 'dotenv';
config({ override: true });
process.env.PRISMA_QUIET ??= '1';

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { actionArgv, DECISION_TTL_MS, verifyDecision, type DecisionRecord } from '../../src/lib/monetize/actions';

const ACTS_PER_DAY = 10;
const dry = process.argv.includes('--dry');
const say = (line: string) => console.log(`${dry ? '[dry] ' : ''}${line}`);

async function main() {
  if (!process.env.MKAN_WA_BRIDGE_SECRET?.trim()) {
    console.log('act: no decision key (MKAN_WA_BRIDGE_SECRET) — nothing acted on');
    return;
  }
  const { db } = await import('../../src/lib/db');
  try {
    const rows = await db.waState.findMany({ where: { key: { startsWith: 'decision:' } }, select: { key: true, value: true } });
    const all = rows.map((r) => ({ key: r.key, rec: r.value as unknown as DecisionRecord }));
    const today = new Date().toISOString().slice(0, 10);
    let used = all.filter((x) => x.rec.consumedAt?.startsWith(today) && x.rec.decision === 'yes').length;
    for (const { key, rec } of all) {
      if (!rec?.decision || rec.consumedAt) continue;
      const tag = `${rec.kind} for prompt ${rec.promptId}`;
      if (!verifyDecision(rec)) {
        say(`act: ${tag} — the signature does not verify; left alone`);
        continue;
      }
      const age = Date.now() - Date.parse(rec.decidedAt!);
      const expired = !(age >= 0 && age < DECISION_TTL_MS);
      if (rec.decision === 'yes' && !expired && used >= ACTS_PER_DAY) {
        say(`act: ${tag} — today's ${ACTS_PER_DAY} actions are used; it waits for tomorrow`);
        continue;
      }
      if (dry) {
        say(`act: would ${expired ? 'expire' : rec.decision === 'yes' ? `run pnpm ${actionArgv(rec.kind, rec.params).join(' ')}` : 'skip the prompt'} (${tag})`);
        continue;
      }
      // Take it once: only an unconsumed record takes the mark, so two loops never run the same yes.
      const at = new Date().toISOString();
      const took = await db.$executeRaw`UPDATE "WaState" SET value = jsonb_set(value::jsonb, '{consumedAt}', to_jsonb(${at}::text)), "updatedAt" = now() WHERE key = ${key} AND NOT (value::jsonb ? 'consumedAt')`;
      if (took !== 1) continue;

      let outcome: { ok: boolean; at: string; output: string };
      let promptUpdate: { status: string; result: string };
      if (expired) {
        outcome = { ok: false, at, output: 'expired: answered more than 24 h before the loop saw it' };
        promptUpdate = { status: 'blocked', result: `The yes came too late to act on (over 24 h). Ask again. ${rec.ask}`.slice(0, 500) };
      } else if (rec.decision === 'no') {
        outcome = { ok: true, at, output: 'Abdout said no' };
        promptUpdate = { status: 'skipped', result: `Abdout said no: ${rec.ask}`.slice(0, 500) };
      } else {
        used++;
        const argv = actionArgv(rec.kind, rec.params);
        say(`act: pnpm ${argv.join(' ')}  (${tag})`);
        // No shell, no MKAN_UNATTENDED: this is Abdout's own yes, verified above, run as he would run it.
        const env = { ...process.env };
        delete env.MKAN_UNATTENDED;
        delete env.MKAN_WA_BRIDGE_SECRET;
        const r = spawnSync('pnpm', ['-s', ...argv], { cwd: join(__dirname, '../..'), env, encoding: 'utf8', timeout: 5 * 60_000 });
        const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.replace(/\s+/g, ' ').trim();
        outcome = { ok: r.status === 0, at, output: out.slice(-400) };
        promptUpdate =
          r.status === 0
            ? { status: 'processed', result: `Done after Abdout's yes: ${rec.effect}`.slice(0, 500) }
            : { status: 'blocked', result: `Abdout said yes, but it failed (exit ${r.status}): ${out.slice(-200)}`.slice(0, 500) };
      }
      await db.$executeRaw`UPDATE "WaState" SET value = jsonb_set(value::jsonb, '{outcome}', ${JSON.stringify(outcome)}::jsonb), "updatedAt" = now() WHERE key = ${key}`;
      await db.sprintPrompt.update({
        where: { id: rec.promptId },
        data: { status: promptUpdate.status, result: promptUpdate.result, processedAt: new Date(), unblockWhen: null, ...(promptUpdate.status === 'blocked' ? { blockedAt: new Date() } : {}) },
      });
      say(`act: ${tag} → ${promptUpdate.status}${outcome.ok ? '' : ` (${outcome.output.slice(0, 120)})`}`);
    }
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(`❌ act: ${(e as Error).message}`);
  process.exit(1);
});
