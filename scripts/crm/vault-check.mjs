// Can a Playwright client attach to the session-vault Chrome (:9222)? Exit 0 yes, 1 no.
// It can answer HTTP and still hang every CDP attach (11-05: a Gemini-in-Chrome panel target
// stalled it; the 18:00 sweep and its re-run both timed out). lane.sh vault_ready restarts it.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../package.json', import.meta.url));
const { chromium } = require('playwright');
const url = process.env.TIKTOK_CDP_URL ?? 'http://127.0.0.1:9222';
try {
  const b = await chromium.connectOverCDP(url, { timeout: Number(process.env.VAULT_CHECK_MS ?? 25_000) });
  await b.close().catch(() => {});
  process.exit(0);
} catch (e) {
  console.error(`vault-check: ${String(e?.message ?? e).split('\n')[0]}`);
  process.exit(1);
}
