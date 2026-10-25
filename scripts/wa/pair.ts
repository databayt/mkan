/**
 * Pair mkan's WhatsApp number with the shared bridge (hogwarts' Evolution,
 * through https://www.mkan.sd/__wa) — once, and again after a device_removed.
 *
 *   pnpm wa:pair                        create instance `mkan` if missing, point its webhook at the app, save the QR PNG
 *   pnpm wa:pair --number=250780984777  also ask for an 8-character pairing code (Linked devices → link with phone number)
 *   pnpm wa:pair --webhook-only         only point the webhook at the app
 *
 * Creating the instance needs the bridge's admin key (Keychain
 * cf-hogwarts-EVOLUTION_API_KEY); the instance token it returns is stored as
 * Keychain cf-mkan-MKAN_EVOLUTION_KEY — the only key mkan's Worker holds
 * (scripts/cf-secrets.sh pushes it). A human scans the QR from the phone
 * (+250780984777): Settings → Linked devices → Link a device. It expires in
 * about a minute; run it again for a fresh one.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { INSTANCE, connectionState, createInstance, evolutionUrl, hookUrl, instanceToken, keychain, qr, setWebhook } from './evolution';

const OUT_DIR = join(__dirname, '..', 'crm', '.data', 'wa');

async function ensureInstance() {
  if (process.env.MKAN_EVOLUTION_KEY) return;
  const admin = keychain('cf-hogwarts-EVOLUTION_API_KEY');
  if (!admin) throw new Error('no instance token (cf-mkan-MKAN_EVOLUTION_KEY) and no admin key (cf-hogwarts-EVOLUTION_API_KEY) to make one');
  let token = await instanceToken(admin);
  if (!token) {
    console.log(`· instance "${INSTANCE}" missing — creating it`);
    const res = await createInstance(admin);
    token = typeof res.hash === 'string' ? res.hash : (res.hash?.apikey ?? null);
  }
  if (!token) throw new Error('the bridge returned no instance token');
  execFileSync('security', ['add-generic-password', '-a', process.env.USER ?? 'abdout', '-s', 'cf-mkan-MKAN_EVOLUTION_KEY', '-w', token, '-U']);
  process.env.MKAN_EVOLUTION_KEY = token;
  console.log('✓ instance token saved to Keychain cf-mkan-MKAN_EVOLUTION_KEY — push it with scripts/cf-secrets.sh');
}

async function main() {
  const number = process.argv.find((a) => a.startsWith('--number='))?.split('=')[1];
  if (!process.env.MKAN_WA_BRIDGE_SECRET) throw new Error('no MKAN_WA_BRIDGE_SECRET (Keychain cf-mkan-MKAN_WA_BRIDGE_SECRET)');
  console.log(`Evolution ${evolutionUrl()}, instance "${INSTANCE}"`);
  await ensureInstance();
  await setWebhook(hookUrl());
  console.log('✓ webhook → https://www.mkan.sd/api/whatsapp/hook/<token> (MESSAGES_UPSERT)');
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
  console.log('Scan it from the phone: WhatsApp → Settings → Linked devices → Link a device.');
}

main().catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
});
