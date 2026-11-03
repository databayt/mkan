/**
 * Price ask — the CRM homes that came in with no rent, as one #mkan list of prefilled
 * WhatsApp asks (a person taps send; nothing reaches a broker by itself), and the
 * command that records the answer so the next mirror carries the home into /find.
 *
 *   pnpm crm:price-ask                         the list (dry run)
 *   pnpm crm:price-ask --apply                 post it to #mkan (each home at most every 3 days)
 *   pnpm crm:price-ask --set=<homeId> --price=<RWF> [--period=MONTH|NIGHT]
 *
 * Why (2026-11-03): 40 of the 55 homes kept out of /find had no price at all.
 */
import { config } from 'dotenv';
config({ override: true });

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { twentyClient } from './twenty-rest';
import { postToMkan, recordRun } from './notify';
import { errorText } from './error-text';
import { selectPriceAsks } from './price-ask-pure';

const argv = (n: string, d = ''): string => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const flag = (n: string): boolean => process.argv.includes(`--${n}`);
const DATA = join(__dirname, '.data', 'price-ask');
const LEDGER = join(DATA, 'asked.json');
const AGAIN_MS = 3 * 86_400_000;
const MAX_ROWS = Number(argv('limit', '15'));

function loadLedger(): Record<string, string> {
  try {
    return existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
  } catch {
    return {};
  }
}

async function list(apply: boolean): Promise<void> {
  const client = twentyClient();
  const [homes, hosts] = await Promise.all([client.all('homes'), client.all('hosts')]);
  const asked = loadLedger();
  const all = selectPriceAsks(homes, hosts, Date.now(), Number(argv('days', '7')));
  const due = all.filter((a) => !asked[a.homeId] || Date.now() - Date.parse(asked[a.homeId]!) >= AGAIN_MS);
  const rows = due.slice(0, MAX_ROWS);
  console.log(`price ask: ${all.length} home(s) with no price · ${due.length} due · ${rows.length} in this list`);
  for (const a of rows) console.log(`  ${a.homeId.slice(0, 8)}  ${a.title}  · ${a.name || '?'} +${a.phone}${a.lang ? ` (${a.lang})` : ''}`);
  if (!apply) {
    console.log('\nDRY RUN — pass --apply to post the list to #mkan.');
    return;
  }
  if (!rows.length) {
    await recordRun('price-ask', true, `${all.length} without price, none due`);
    return;
  }
  const lines = rows.map((a, i) => `${i + 1}. *${a.title}* — ${a.name || 'broker'} · <${a.link}|ask on WhatsApp>${a.sourceUrl ? ` · <${a.sourceUrl}|post>` : ''}\n    reply → \`pnpm crm:price-ask --set=${a.homeId} --price=<RWF>\``);
  const more = due.length > rows.length ? `\n…and ${due.length - rows.length} more tomorrow.` : '';
  const ok = await postToMkan(`💬 *Homes with no price* — ${rows.length} to ask (a price puts them on /find):\n${lines.join('\n')}${more}`);
  if (ok) {
    mkdirSync(DATA, { recursive: true });
    const at = new Date().toISOString();
    for (const a of rows) asked[a.homeId] = at;
    writeFileSync(LEDGER, JSON.stringify(asked, null, 2));
  }
  await recordRun('price-ask', ok, ok ? `${rows.length} asked · ${all.length} without price` : 'slack post failed');
}

async function set(homeId: string): Promise<void> {
  const price = Number(argv('price').replace(/[^\d]/g, ''));
  const period = (argv('period', 'MONTH') || 'MONTH').toUpperCase();
  if (!price || !['MONTH', 'NIGHT'].includes(period)) throw new Error('usage: --set=<homeId> --price=<RWF> [--period=MONTH|NIGHT]');
  const money = { amountMicros: price * 1_000_000, currencyCode: 'RWF' };
  await twentyClient().rest('PATCH', `homes/${homeId}`, {
    rentPeriod: period,
    ...(period === 'MONTH' ? { priceMonthLocal: money } : { priceNightLocal: money }),
    priceConfirmedByHost: true,
  });
  console.log(`✅ ${homeId}: RWF ${price.toLocaleString('en')}/${period === 'MONTH' ? 'month' : 'night'} — the next mirror carries it to /find.`);
}

const target = argv('set');
(target ? set(target) : list(flag('apply'))).catch((e) => {
  console.error(`\n❌ ${errorText(e)}\n`);
  process.exit(1);
});
