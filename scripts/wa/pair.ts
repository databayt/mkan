/**
 * Pair mkan's WhatsApp number with the local Evolution bridge — once.
 *
 *   pnpm wa:pair                        create instance `mkan` if missing, save the QR PNG, print its path
 *   pnpm wa:pair --number=250780984777  also ask for an 8-character pairing code (Linked devices → link with phone number)
 *   pnpm wa:pair --webhook-only         only point the instance's webhook at the inbox server (scripts/wa/inbox-server.ts)
 *
 * A human scans the QR from WhatsApp on the phone (+250780984777): Settings →
 * Linked devices → Link a device. The QR expires in about a minute; run it
 * again for a fresh one. Needs ops/evolution/up.sh running first.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EVOLUTION_URL, INSTANCE, connectionState, createInstance, evolutionKey, fetchInstance, qr, setWebhook } from './evolution';

const OUT_DIR = join(__dirname, '..', 'crm', '.data', 'wa');
/** Where Evolution (in Docker) reaches the inbox server on this Mac; the key keeps strangers out. */
const INBOX_URL = (process.env.MKAN_WA_INBOX_URL ?? '').trim() || 'http://host.docker.internal:8091/wa';

async function webhook() {
  await setWebhook(`${INBOX_URL}/${evolutionKey()}`);
  console.log(`✓ webhook → ${INBOX_URL}/<key> (MESSAGES_UPSERT)`);
}

async function main() {
  const number = process.argv.find((a) => a.startsWith('--number='))?.split('=')[1];
  console.log(`Evolution ${EVOLUTION_URL}, instance "${INSTANCE}"`);

  if (!(await fetchInstance())) {
    console.log('· instance missing — creating it');
    await createInstance();
  }
  await webhook();
  if (process.argv.includes('--webhook-only')) return;

  const state = await connectionState();
  if (state === 'open') {
    console.log('✓ already paired (state: open) — nothing to do');
    return;
  }

  const code = await qr(INSTANCE, number);
  if (code.pairingCode) console.log(`pairing code: ${code.pairingCode}`);
  if (!code.base64) {
    console.error(`✗ no QR returned (state: ${state}). Wait a few seconds and run again.`);
    process.exitCode = 1;
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, 'qr.png');
  writeFileSync(file, Buffer.from(code.base64.replace(/^data:image\/\w+;base64,/, ''), 'base64'));
  console.log(`QR saved: ${file}`);
  console.log('Scan it from the phone: WhatsApp → Settings → Linked devices → Link a device. Then `pnpm wa:outbox --dry-run` shows state: open.');
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
