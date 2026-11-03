/** The price ask's pure core. Fixtures are made up (the repo is public). */
import { describe, expect, it } from 'vitest';
import { priceAskText, selectPriceAsks } from '../../scripts/crm/price-ask-pure';

const NOW = Date.UTC(2026, 10, 3, 9);
const phone = (n: string) => ({ primaryPhoneNumber: n, primaryPhoneCallingCode: '+250' });
const home = (over: Record<string, unknown>) => ({
  id: 'h1',
  source: 'TIKTOK',
  pipelineStage: 'VETTING',
  homeStatus: 'SCRAPED',
  createdAt: new Date(NOW - 86_400_000).toISOString(),
  hostId: 'b1',
  titleEn: 'Studio in Gisozi',
  sourceUrl: { primaryLinkUrl: 'https://www.tiktok.com/@somebroker/video/1' },
  priceMonthLocal: { amountMicros: null },
  priceNightLocal: { amountMicros: null },
  ...over,
});
const hosts = [{ id: 'b1', name: 'Some Broker', contactName: 'Jean', preferredLanguage: 'RW', phone: phone('780000001') }];

describe('price ask', () => {
  it('asks for recent priceless homes with a phone, newest first', () => {
    const asks = selectPriceAsks(
      [home({}), home({ id: 'h2', createdAt: new Date(NOW - 3_600_000).toISOString() })],
      hosts,
      NOW,
    );
    expect(asks.map((a) => a.homeId)).toEqual(['h2', 'h1']);
    expect(asks[0]).toMatchObject({ phone: '250780000001', name: 'Jean', lang: 'RW' });
    expect(asks[0]!.link).toMatch(/^https:\/\/wa\.me\/250780000001\?text=/);
  });

  it('skips priced, duplicate, old, non-vetting and unreachable homes', () => {
    const skip = [
      home({ priceMonthLocal: { amountMicros: 300_000_000_000 } }),
      home({ priceNightLocal: { amountMicros: 50_000_000_000 } }),
      home({ homeStatus: 'DUPLICATE' }),
      home({ pipelineStage: 'CLAIMED' }),
      home({ createdAt: new Date(NOW - 9 * 86_400_000).toISOString() }),
      home({ hostId: 'nobody', hostPhone: null }),
      home({ source: 'AIRBNB' }),
    ];
    expect(selectPriceAsks(skip, hosts, NOW)).toEqual([]);
  });

  it('writes the ask in the broker language first', () => {
    expect(priceAskText('Jean', 'Studio', null, 'RW').startsWith('Muraho Jean')).toBe(true);
    expect(priceAskText('', 'Studio', null, 'FR').startsWith('Bonjour 👋')).toBe(true);
    expect(priceAskText('', 'Studio', 'https://x', null)).toContain('monthly rent for "Studio"?\nhttps://x');
  });
});
