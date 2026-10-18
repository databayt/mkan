/**
 * The CRM hygiene checks, pure — given the board and the site, what is wrong
 * and which of it is safe to fix without a human. `hygiene.ts` does the I/O.
 *
 * "Safe" means a fix that cannot lose information: a missing link or code
 * copied from the site, a phone rewritten to the same number with its calling
 * code, a record that shares an exact key with an older one marked as its
 * duplicate (never deleted — Twenty deletes are hard). Anything that needs a
 * judgement (two hosts with one phone, a stale VETTING home) is reported.
 */
import { normalizePhone, phonesFromTwenty, twentyPhones } from '../../src/lib/phone';
import { dupKey } from './tiktok-pure';

type Row = Record<string, unknown>;

export interface SiteListing {
  id: number;
  code: string | null;
  isPublished: boolean;
  source: string | null;
  sourceListingId: string | null;
}

export interface Finding {
  check: string;
  /** One line per instance, for the report. */
  items: string[];
}

export interface Fix {
  object: 'homes' | 'hosts';
  id: string;
  why: string;
  body: Row;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const micros = (v: unknown): number | null => {
  const m = (v as { amountMicros?: number | null } | null)?.amountMicros;
  return m != null ? m / 1_000_000 : null;
};
const isDup = (h: Row) => h.homeStatus === 'DUPLICATE' || h.duplicateCheck === 'CONFIRMED';
const groupBy = <T>(rows: T[], key: (r: T) => string[]): Map<string, T[]> => {
  const m = new Map<string, T[]>();
  for (const r of rows) for (const k of new Set(key(r).filter(Boolean))) m.set(k, [...(m.get(k) ?? []), r]);
  return m;
};
const oldestFirst = (a: Row, b: Row) => str(a.createdAt).localeCompare(str(b.createdAt));
/**
 * Which of two records for one home to keep: the one a lane filed (a scrape or
 * a video carries the host and the source facts) over sync-up's MKAN_SITE
 * echo, then the one with a host, then the older.
 */
const keeperFirst = (a: Row, b: Row) =>
  Number(a.source === 'MKAN_SITE') - Number(b.source === 'MKAN_SITE') || Number(!a.hostId) - Number(!b.hostId) || oldestFirst(a, b);

export function checkHomes(homes: Row[], listings: SiteListing[], now = new Date()): { findings: Finding[]; fixes: Fix[] } {
  const findings: Finding[] = [];
  const fixes: Fix[] = [];
  const live = homes.filter((h) => !isDup(h));
  const byId = new Map(listings.map((l) => [l.id, l]));

  // Exact keys shared by two records: the newer is a copy of the older.
  for (const [check, key] of [
    ['homes sharing a sourceId', (h: Row) => [str(h.sourceId)]],
    ['homes sharing a site listing', (h: Row) => [h.mkanListingId != null ? String(h.mkanListingId) : '']],
  ] as const) {
    const items: string[] = [];
    for (const [k, rows] of groupBy(live, key)) {
      if (rows.length < 2) continue;
      const [keep, ...copies] = [...rows].sort(keeperFirst);
      items.push(`${k}: ${rows.length} records — keeping ${keep!.id}`);
      for (const c of copies) fixes.push({ object: 'homes', id: String(c.id), why: `${check} (${k}) with ${keep!.id}`, body: { homeStatus: 'DUPLICATE', duplicateCheck: 'CONFIRMED', duplicateOfId: keep!.id } });
    }
    if (items.length) findings.push({ check, items });
  }

  // TikTok facts posted by more than one broker — a judgement, so only reported.
  const tiktok = live.filter((h) => h.source === 'TIKTOK');
  const factKey = (h: Row) => [
    dupKey('', {
      bedrooms: typeof h.bedrooms === 'number' ? h.bedrooms : null,
      priceRwf: micros(h.priceMonthLocal),
      neighbourhood: str((h.homeAddress as Row | null)?.addressStreet1) || null,
    }) ?? '',
  ];
  const cross = [...groupBy(tiktok, factKey)].filter(([, rows]) => new Set(rows.map((r) => str(r.hostId))).size > 1);
  if (cross.length) findings.push({ check: 'one TikTok home posted by several brokers', items: cross.map(([k, rows]) => `${k}: ${rows.map((r) => str(r.sourceId)).join(', ')}`) });

  const suspected = live.filter((h) => h.duplicateCheck === 'SUSPECTED');
  if (suspected.length) findings.push({ check: 'SUSPECTED duplicates nobody resolved', items: suspected.map((h) => `${h.id} ${str(h.title).slice(0, 50)}`) });

  // Board vs site.
  const items: Record<string, string[]> = { gone: [], liveNotShown: [], shownNotLive: [] };
  for (const h of live) {
    if (h.mkanListingId == null) continue;
    const l = byId.get(Number(h.mkanListingId));
    if (!l) {
      items.gone!.push(`${h.id} → #${h.mkanListingId}`);
      continue;
    }
    if (h.publishState === 'LIVE' && !l.isPublished) items.liveNotShown!.push(`${h.id} #${l.id}`);
    if (l.isPublished && h.mkanPublishState !== 'LIVE') items.shownNotLive!.push(`${h.id} #${l.id}`);
    // The public code is minted on the site at publish; the board never heard.
    if (l.code && str(h.listingId) !== l.code) fixes.push({ object: 'homes', id: String(h.id), why: `listing code ${l.code} from the site`, body: { listingId: l.code } });
  }
  if (items.gone!.length) findings.push({ check: 'board homes whose site listing is gone', items: items.gone! });
  if (items.liveNotShown!.length) findings.push({ check: 'operator said LIVE, the site is not showing it', items: items.liveNotShown! });
  if (items.shownNotLive!.length) findings.push({ check: 'on the site, the board does not know it is live', items: items.shownNotLive! });

  const cutoff = now.getTime() - 14 * 86_400_000;
  const stale = live.filter((h) => h.pipelineStage === 'VETTING' && h.createdAt && new Date(str(h.createdAt)).getTime() < cutoff);
  if (stale.length) findings.push({ check: 'at VETTING for more than 14 days', items: stale.map((h) => `${h.id} ${str(h.title).slice(0, 50)} (${str(h.createdAt).slice(0, 10)})`) });

  // A number filed under the other market's calling code.
  const wrongCc = live.filter((h) => {
    const p = phonesFromTwenty(h.hostPhone as never)[0];
    return p && ((h.country === 'RWANDA' && p.startsWith('+249')) || (h.country === 'SUDAN' && p.startsWith('+250')));
  });
  if (wrongCc.length) findings.push({ check: 'host phone in the other country', items: wrongCc.map((h) => `${h.id} ${h.country} ${phonesFromTwenty(h.hostPhone as never)[0]}`) });

  // A record about to be marked as a copy needs no code of its own.
  const copies = new Set(fixes.filter((f) => 'duplicateOfId' in f.body).map((f) => f.id));
  return { findings, fixes: fixes.filter((f) => 'duplicateOfId' in f.body || !copies.has(f.id)) };
}

export function checkHosts(hosts: Row[]): { findings: Finding[]; fixes: Fix[] } {
  const findings: Finding[] = [];
  const fixes: Fix[] = [];
  const hint = (h: Row) => (h.source === 'TIKTOK' || str(h.tiktokHandle) ? 'RW' : null);
  const numbers = (h: Row) => [...phonesFromTwenty(h.phone as never, hint(h)), ...phonesFromTwenty(h.whatsapp as never, hint(h))];

  for (const [check, key] of [
    ['hosts sharing a phone', (h: Row) => numbers(h)],
    ['hosts sharing a TikTok handle', (h: Row) => [str(h.tiktokHandle).replace(/^@/, '').toLowerCase()]],
    ['hosts sharing a site account', (h: Row) => [str(h.mkanUserId)]],
  ] as const) {
    const dupes = [...groupBy(hosts, key)].filter(([, rows]) => rows.length > 1);
    if (dupes.length) findings.push({ check, items: dupes.map(([k, rows]) => `${k}: ${rows.map((r) => `${str(r.name) || r.id}`).join(' · ')}`) });
  }

  // A number stored without its calling code — the webhook wrote these, and
  // a wa.me link built from one goes nowhere. Same number, now whole.
  for (const h of hosts) {
    if (h.contactVerifiedByHuman === true) continue;
    for (const field of ['phone', 'whatsapp'] as const) {
      const p = h[field] as { primaryPhoneNumber?: string; primaryPhoneCallingCode?: string } | null;
      if (!p?.primaryPhoneNumber?.trim() || p.primaryPhoneCallingCode?.trim()) continue;
      const e164 = normalizePhone(p.primaryPhoneNumber, hint(h));
      if (e164) fixes.push({ object: 'hosts', id: String(h.id), why: `${field} ${p.primaryPhoneNumber} → ${e164}`, body: { [field]: twentyPhones(e164) } });
    }
  }
  return { findings, fixes };
}

/** A yt-dlp error that means the video itself is gone, not that the network blinked. */
export const videoGone = (msg: string): boolean =>
  /video (is )?unavailable|has been removed|does not exist|not available|status code 10204|private/i.test(msg) && !/resolve|timed out|ENOTFOUND|network/i.test(msg);
