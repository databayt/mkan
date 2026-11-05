/**
 * The live /monetize numbers for the sprint scripts — the same model the page reads
 * (`loadMonetize`), flattened into metric keys (src/lib/monetize/metrics.ts).
 */
import { createRequire } from 'node:module';

import type { MonetizeOverview } from '../../src/lib/monetize/load';
import { readMetrics, type Metrics } from '../../src/lib/monetize/metrics';

export async function liveModel(days = 7): Promise<MonetizeOverview> {
  // src modules carry Next's `server-only` guard, which has no package outside Next.
  createRequire(__filename)('../agent/no-server-only.js');
  const { loadMonetize } = await import('../../src/lib/monetize/load');
  return loadMonetize(days);
}

export async function liveMetrics(days = 7): Promise<{ model: MonetizeOverview; metrics: Metrics }> {
  const model = await liveModel(days);
  return { model, metrics: readMetrics(model as Parameters<typeof readMetrics>[0]) };
}
