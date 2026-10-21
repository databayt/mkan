/**
 * The candidate sites `web-ads survey` re-checks, and the pure checks it runs
 * on each: robots.txt, rendering, ad links on the first list page, prices,
 * Kigali mentions. SURVEY.md records the first pass and why each site passed
 * or did not; this list is how that verdict stays current.
 */

export interface SurveySite {
  site: string;
  listUrl: string;
  /** Group 1 = a stable ad id (or the ad path) — counted distinct. */
  adLink: RegExp;
  /** Group 1 = a page number in the pager; the largest × ads per page ≈ total. */
  pager?: RegExp;
  /** Sibling lists of the same shape the adapter also walks (imali: houses, apartments, rooms). */
  lists?: number;
  note: string;
}

export const SURVEY_SITES: SurveySite[] = [
  { site: 'houseinrwanda', listUrl: 'https://www.houseinrwanda.com/for-rent', adLink: /data-history-node-id="(\d+)"/g, pager: /href="\?page=(\d+)"/g, note: 'adapter' },
  { site: 'rwandahouseland', listUrl: 'https://rwandahouseland.com/forRent', adLink: /property_view\/(\d+)/g, pager: /forRent\?page=(\d+)/g, note: 'adapter' },
  { site: 'imali', listUrl: 'https://imali.biz/category/23/27/houses-for-rent?all', adLink: /\/isaziso\/[a-z-]*for-rent\/\d+\/(\d+)\//g, lists: 3, note: 'adapter' },
  { site: 'abahuza', listUrl: 'https://www.abahuza.com/', adLink: /abahuza\.com\/property\/[a-z0-9-]*rent[a-z0-9-]*-(\d+)/g, note: 'same stock as houseinrwanda (ESERCOS)' },
  { site: 'kigaliproperty', listUrl: 'https://www.kigaliproperty.com/filter/house/rent', adLink: /href="\/property\/([a-z0-9-]+)"/g, note: 'small agency catalogue' },
  { site: 'kigalilife', listUrl: 'https://kigalilife.co.rw/ad-category/real-estate/houses-apartments-for-rent/', adLink: /kigalilife\.co\.rw\/ads\/([^"/]+)\//g, pager: /houses-apartments-for-rent\/page\/(\d+)/g, note: 'stale, sale ads mixed in, spam links' },
  { site: 'plutproperties', listUrl: 'https://plutproperties.com/', adLink: /plutproperties\.com\/property\/([^"/]+)/g, note: 'one agency, rent + sale' },
  { site: 'nextlinehomes', listUrl: 'https://nextlinehomes.com/properties?listing_type=rent', adLink: /href="\/properties\/([a-z0-9-]+)"/g, note: 'client-rendered' },
  { site: 'kigaliapartments', listUrl: 'https://kigaliapartments.com/', adLink: /kigaliapartments\.com\/(?:apartment|property|listing)s?\/([a-z0-9-]+)/g, note: 'location pages, no ad list' },
  { site: 'zimcompass', listUrl: 'https://rw.zimcompass.com/houses-for-rent', adLink: /\/product\?id=(\d+)/g, pager: /houses-for-rent\?page=(\d+)/g, note: 'phone hidden behind the contact button' },
  { site: 'jiji', listUrl: 'https://jiji.rw/', adLink: /jiji\.rw\/[a-z-]+\/([a-z0-9-]+\.html)/g, note: 'closed in Rwanda' },
];

/** Does robots.txt let `User-agent: *` read `path`? Longest matching rule wins (RFC 9309). */
export function robotsAllows(robots: string, path: string): boolean {
  const rules: { allow: boolean; pattern: string }[] = [];
  let applies = false;
  let inAgents = false;
  for (const raw of robots.split('\n')) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([a-z-]+)\s*:\s*(.*)$/i.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === 'user-agent') {
      if (!inAgents) applies = false;
      inAgents = true;
      if (val === '*' || /mkan/i.test(val)) applies = true;
      continue;
    }
    inAgents = false;
    if (!applies || (key !== 'allow' && key !== 'disallow')) continue;
    if (key === 'disallow' && !val) continue;
    rules.push({ allow: key === 'allow', pattern: val });
  }
  const toRe = (p: string) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\\\$$/, '$')}`);
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!toRe(r.pattern).test(path)) continue;
    if (!best || r.pattern.length > best.len || (r.pattern.length === best.len && r.allow)) best = { allow: r.allow, len: r.pattern.length };
  }
  return best?.allow ?? true;
}

export interface SurveyRow {
  site: string;
  http: number | string;
  robots: boolean;
  render: 'static' | 'js' | 'none' | 'closed' | '—';
  adLinks: number;
  estimate: number | string;
  priced: number;
  kigali: number;
  contact: boolean | null;
  sample?: string;
  verdict: string;
}

/** The pure part of one survey row, from the list page as fetched (null = no answer). */
export function surveyPage(s: SurveySite, page: { status: number; url: string; html: string } | null, robots: boolean): SurveyRow {
  const base: SurveyRow = { site: s.site, http: page?.status ?? '—', robots, render: '—', adLinks: 0, estimate: '—', priced: 0, kigali: 0, contact: null, verdict: '' };
  if (!robots) return { ...base, verdict: 'FAIL robots.txt disallows the list' };
  if (!page) return { ...base, verdict: 'FAIL no response' };
  if (page.status !== 200) return { ...base, verdict: `FAIL HTTP ${page.status}` };
  if (/\/(login|signin)/i.test(new URL(page.url).pathname)) return { ...base, verdict: 'FAIL login wall' };
  const html = page.html;
  if (html.length < 3000 && /closed/i.test(html)) return { ...base, render: 'closed', verdict: 'FAIL site closed' };
  const ids = new Set([...html.matchAll(s.adLink)].map((m) => m[1]!));
  const pages = s.pager ? Math.max(1, ...[...html.matchAll(s.pager)].map((m) => Number(m[1]) + (s.site === 'houseinrwanda' ? 1 : 0))) : 1;
  const text = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const priced = (text.match(/(?:rwf|frw|\$|usd)\s*[\d][\d,. ]{2,}|[\d][\d,. ]{2,}\s*(?:rwf|frw|usd)/gi) ?? []).length;
  const kigali = (text.match(/kigali|gasabo|kicukiro|nyarugenge|kimihurura|kacyiru|kibagabaga|kimironko|gacuriro|remera|nyamirambo|kagugu|kanombe|gikondo|niboye|kinyinya/gi) ?? []).length;
  const js = /\/_next\/static|id="(?:root|app|__next)"|ng-version|data-reactroot/i.test(html);
  const render: SurveyRow['render'] = ids.size ? 'static' : js ? 'js' : 'none';
  const estimate = ids.size * pages * (s.lists ?? 1);
  const row = { ...base, render, adLinks: ids.size, estimate, priced, kigali };
  const verdict =
    render === 'js'
      ? 'FAIL ads render client-side'
      : !ids.size
        ? 'FAIL no ad list'
        : estimate < 30
          ? `FAIL ~${estimate} ads (< 30)`
          : !priced
            ? 'FAIL no prices on the list'
            : `PASS ~${estimate} ads`;
  return { ...row, verdict: s.note && s.note !== 'adapter' && verdict.startsWith('PASS') ? `${verdict} — but ${s.note}` : verdict };
}
