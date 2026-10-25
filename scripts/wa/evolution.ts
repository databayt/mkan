/**
 * The Mac side of the Evolution client: src/lib/whatsapp/evolution.ts, with
 * its env filled from the Keychain so `pnpm wa:pair` and
 * `pnpm wa:outbox --dry-run` reach the shared bridge from a terminal:
 *
 *   MKAN_EVOLUTION_KEY     Keychain cf-mkan-MKAN_EVOLUTION_KEY (written by pnpm wa:pair)
 *   MKAN_WA_BRIDGE_SECRET  Keychain cf-mkan-MKAN_WA_BRIDGE_SECRET
 */
import { execSync } from 'node:child_process';

export function keychain(service: string): string {
  try {
    return execSync(`security find-generic-password -s ${service} -w`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

for (const name of ['MKAN_EVOLUTION_KEY', 'MKAN_WA_BRIDGE_SECRET']) {
  if (!process.env[name]?.trim()) process.env[name] = keychain(`cf-mkan-${name}`);
}

export * from '../../src/lib/whatsapp/evolution';
