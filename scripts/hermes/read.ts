/**
 * mkan, read-only, for Hermes (the Slack gateway's free model) and anyone at a terminal.
 *
 *   pnpm -s mkan:read                    one screen: chats, WhatsApp, TikTok, consent
 *   pnpm -s mkan:read chats [--days=1] [--n=8]    the /find conversations (web + WhatsApp)
 *   pnpm -s mkan:read wa [--days=1] [--n=8]       the WhatsApp line: tenants, broker sends, replies
 *   pnpm -s mkan:read crm homes|brokers|consent|tiktok   the Twenty CRM (mkan workspace)
 *   pnpm -s mkan:read tiktok                     today's TikTok post: queue, uploads, log
 *   pnpm -s mkan:read lanes                      every pipeline: last run, how it went, the last 24 h
 *
 * It never writes and never sends. Its output reaches a third-party model, so phone
 * numbers show only their last 3 digits, long digit runs inside free text are masked
 * the same way, and no tenant or broker name field is printed. Deep or multi-step
 * questions go to Claude Code through the kun bridge (kun/scripts/hermes/claude.sh).
 */
import { config } from 'dotenv';
config({ override: true, quiet: true } as Parameters<typeof config>[0]);
process.env.PRISMA_QUIET = '1'; // no query log: this output is read by a model
process.env.DOTENV_CONFIG_QUIET = 'true'; // the modules it loads call dotenv again

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type Db = (typeof import('../../src/lib/db'))['db'];

const arg = (n: string, d: number): number => {
  const hit = process.argv.find((a) => a.startsWith(`--${n}=`));
  const v = hit ? Number(hit.slice(n.length + 3)) : NaN;
  return Number.isFinite(v) && v > 0 ? v : d;
};
const words = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DAYS = arg('days', 1);
const N = arg('n', 8);
const since = new Date(Date.now() - DAYS * 86_400_000);
const TIKTOK = join(__dirname, '..', 'crm', '.data', 'tiktok-post');

/** "+250 780 984 777" → "…777"; also inside free text. */
export const maskPhone = (p: string | null | undefined): string => {
  const d = String(p ?? '').replace(/\D/g, '');
  return d ? `…${d.slice(-3)}` : '—';
};
/** A run of 9–13 digits (spaces, dashes, dots and brackets allowed) reads as a phone; dates and ids pass. */
const looksLikePhone = (m: string): boolean => {
  const digits = m.replace(/\D/g, '').length;
  return digits >= 9 && digits <= 13 && !/\d{4}-\d{2}-\d{2}/.test(m);
};
export const maskText = (t: string | null | undefined, max = 90): string =>
  String(t ?? '')
    .replace(/\+?\d[\d\s().-]{6,}\d/g, (m) => (looksLikePhone(m) ? maskPhone(m) : m))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const ago = (d: Date | string | null | undefined): string => {
  if (!d) return '—';
  const m = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  return m < 60 ? `${m}m ago` : m < 2880 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
};
const kigali = (d: Date | string): string =>
  new Date(d).toLocaleString('en-GB', { timeZone: 'Africa/Kigali', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

type Msg = { role: 'user' | 'agent'; text?: string; kind?: string; count?: number; at?: string; wa?: string };

async function chats(db: Db, onlyWhatsApp = false): Promise<string[]> {
  const out: string[] = [];
  if (!onlyWhatsApp) {
    const { agentFunnel, funnelLine } = await import('../crm/agent-funnel');
    out.push(funnelLine(await agentFunnel(db, DAYS)));
  }
  const tasks = await db.agentTask.findMany({
    where: { updatedAt: { gte: since }, ...(onlyWhatsApp ? { profile: { waPhone: { not: null } } } : {}) },
    orderBy: { updatedAt: 'desc' },
    take: N,
    select: { status: true, locale: true, messages: true, shortlist: true, updatedAt: true, profile: { select: { waPhone: true } } },
  });
  out.push(`${onlyWhatsApp ? 'WhatsApp tenant chats' : 'Latest conversations'} (last ${DAYS}d, newest first, ${tasks.length} shown):`);
  for (const t of tasks) {
    const msgs = (Array.isArray(t.messages) ? t.messages : []) as Msg[];
    const said = msgs.filter((m) => m.role === 'user');
    const lastUser = said[said.length - 1];
    const lastAgent = [...msgs].reverse().find((m) => m.role === 'agent');
    const homes = Array.isArray(t.shortlist) ? t.shortlist.length : 0;
    const via = t.profile?.waPhone ? `WhatsApp ${maskPhone(t.profile.waPhone)}` : 'web';
    out.push(
      `• ${kigali(t.updatedAt)} · ${via} · ${t.locale} · ${said.length} msg · last: "${maskText(lastUser?.text, 80)}" → ${lastAgent?.kind ?? '—'}${homes ? ` (${homes} homes)` : ''}${t.status === 'FAILED' ? ' · FAILED' : ''}`,
    );
  }
  return out;
}

async function whatsapp(db: Db): Promise<string[]> {
  const out = await chats(db, true);
  const sends = await db.outboundMessage.groupBy({ by: ['kind', 'status'], where: { createdAt: { gte: since } }, _count: { _all: true } });
  out.push(
    `Broker/tenant sends (last ${DAYS}d): ` +
      (sends.length ? sends.map((s) => `${s.kind} ${s.status} ${s._count._all}`).join(' · ') : 'none'),
  );
  const failed = await db.outboundMessage.findMany({ where: { createdAt: { gte: since }, status: 'FAILED' }, orderBy: { createdAt: 'desc' }, take: 3, select: { kind: true, error: true, createdAt: true } });
  for (const f of failed) out.push(`  ✗ ${kigali(f.createdAt)} ${f.kind}: ${maskText(f.error, 100)}`);
  const answers = await db.brokerRequest.groupBy({ by: ['status'], where: { updatedAt: { gte: since } }, _count: { _all: true } });
  out.push(`Broker answers updated (last ${DAYS}d): ` + (answers.length ? answers.map((a) => `${a.status} ${a._count._all}`).join(' · ') : 'none'));
  const lease = await db.waState.findUnique({ where: { key: 'outbox-lease' } }).catch(() => null);
  out.push(`Outbox cron: last lease ${ago(lease?.updatedAt)} (healthy under 10 min)`);

  // The raw broker replies live only in the bridge (Evolution), not in the database.
  try {
    await import('../wa/evolution');
    const { findMessages, connectionState } = await import('../../src/lib/whatsapp/evolution');
    const { messageText, senderPhone } = await import('../wa/outbox-pure');
    const { isDirectChat } = await import('../wa/tenant-pure');
    out.push(`Line +250 780 984 777: ${await connectionState().catch(() => 'unknown')}`);
    const brokers = await db.broker.findMany({ where: { phones: { isEmpty: false } }, select: { phones: true, whatsapp: true } });
    const key = (p: string) => p.replace(/\D/g, '').slice(-9);
    const brokerPhones = new Set(brokers.flatMap((b) => [...b.phones, b.whatsapp ?? '']).filter(Boolean).map(key));
    const inbound = (await findMessages(since, new Date(), 1000))
      .filter((m) => !m.key?.fromMe && isDirectChat(m.key?.remoteJid))
      .map((m) => ({ phone: senderPhone(m.key) ?? '', text: messageText(m.message), at: new Date(Number(m.messageTimestamp ?? 0) * 1000) }))
      .sort((a, b) => b.at.getTime() - a.at.getTime());
    const fromBrokers = inbound.filter((m) => m.phone && brokerPhones.has(key(m.phone)));
    out.push(`Inbound on the line (last ${DAYS}d): ${inbound.length} messages, ${fromBrokers.length} from known brokers`);
    for (const m of fromBrokers.slice(0, N)) out.push(`  ← ${kigali(m.at)} broker ${maskPhone(m.phone)}: "${maskText(m.text || '[media]', 80)}"`);
  } catch (e) {
    out.push(`Line: unreachable from this Mac (${maskText((e as Error).message, 80)})`);
  }
  return out;
}

async function crm(what: string): Promise<string[]> {
  const { twentyClient } = await import('../crm/twenty-rest');
  const client = twentyClient();
  const total = async (plural: string, filter?: string): Promise<number> => {
    const q = new URLSearchParams({ limit: '1', ...(filter ? { filter } : {}) });
    const r = await client.rest<{ totalCount?: number }>('GET', `${plural}?${q}`);
    return r.totalCount ?? 0;
  };
  const out: string[] = [];
  if (what === 'consent' || what === 'tiktok') {
    const [yes, asked, no] = await Promise.all(['YES', 'ASKED', 'NO'].map((v) => total('hosts', `repostConsent[eq]:${v}`)));
    out.push(`Broker repost consent (Twenty hosts): YES ${yes} · ASKED ${asked} · NO ${no}`);
    if (yes) {
      const r = await client.rest<{ data?: { hosts?: Record<string, unknown>[] } }>('GET', `hosts?${new URLSearchParams({ limit: '60', filter: 'repostConsent[eq]:YES' })}`);
      const handles = (r.data?.hosts ?? []).map((h) => `@${String(h.tiktokHandle ?? '').replace(/^@/, '')}`).filter((h) => h !== '@');
      out.push(`  said YES: ${handles.join(', ') || '(no handles on record)'}`);
    }
  }
  if (what === 'tiktok') {
    const week = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const [posts, fresh] = await Promise.all([total('tiktokPosts'), total('tiktokPosts', `createdAt[gte]:${week}`)]);
    out.push(`Broker TikTok videos in the CRM (tiktokPost): ${posts} · ${fresh} added in the last 7 days`);
  }
  if (what === 'homes') {
    const [homes, hosts] = await Promise.all([total('homes'), total('hosts')]);
    out.push(`Homes: ${homes} · hosts: ${hosts}`);
    const r = await client.rest<{ data?: { homes?: Record<string, unknown>[] } }>('GET', `homes?${new URLSearchParams({ limit: String(N), order_by: 'updatedAt[DescNullsLast]' })}`);
    for (const h of r.data?.homes ?? [])
      out.push(`• ${h.listingId || '(no code)'} · ${h.source ?? '—'} · ${maskText(String(h.title || h.titleAr || ''), 60)} · ${h.homeStatus ?? '—'} · publish ${h.publishState ?? '—'} · ${ago(h.updatedAt as string)}`);
  }
  if (what === 'brokers') {
    const [brokers, zones] = await Promise.all([total('brokers'), total('zones')]);
    out.push(`Brokers in Twenty: ${brokers} · zones: ${zones}`);
  }
  if (!out.length) out.push('crm what? homes | brokers | consent | tiktok');
  return out;
}

function tiktok(): string[] {
  const day = new Date().toISOString().slice(0, 10);
  const dir = join(TIKTOK, day);
  const read = <T,>(p: string, d: T): T => (existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as T) : d);
  const queue = read<{ code?: string | null; id: number }[]>(join(dir, 'queue.json'), []);
  const uploads = read<Record<string, string>>(join(dir, 'uploads.json'), {});
  const out = [`TikTok @mkan.rw — ${day}`];
  out.push(`Queued homes: ${queue.length ? queue.map((q) => q.code || `K${q.id}`).join(', ') : 'none (no consented broker homes yet)'}`);
  out.push(`Picture video: ${existsSync(join(dir, 'carousel', 'video.mp4')) ? 'rendered' : 'not rendered'}`);
  const posted = Object.entries(uploads);
  out.push(`Posted today: ${posted.length ? posted.map(([k, at]) => `${k} at ${kigali(at)}`).join(', ') : 'nothing yet (slots 07:00, 12:30, 18:30)'}`);
  const days = existsSync(TIKTOK)
    ? require('node:fs').readdirSync(TIKTOK).filter((d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && existsSync(join(TIKTOK, d, 'uploads.json')))
    : [];
  out.push(`Days with a post so far: ${days.length} (${days.slice(-5).join(', ')})`);
  const log = existsSync(join(TIKTOK, 'post.log')) ? readFileSync(join(TIKTOK, 'post.log'), 'utf8').split('\n') : [];
  const tail = log.filter((l) => l.trim() && !l.startsWith('prisma:') && !l.includes('injected env')).slice(-6);
  if (tail.length) out.push('Log tail:', ...tail.map((l) => `  ${maskText(l, 140)}`));
  return out;
}

type HermesJob = { name?: string; schedule_display?: string; last_run_at?: string | null; last_status?: string | null; last_error?: string | null; next_run_at?: string | null; enabled?: boolean };

/**
 * Every pipeline in one screen (2026-11-01): the Hermes jobs as they last ran
 * (a "ok" with nothing found shows as its counts here), the last 24 h of supply,
 * the broker directory, the WhatsApp line, viewings and deals.
 */
async function lanes(db: Db): Promise<string[]> {
  const out = [`mkan lanes — ${kigali(new Date().toISOString())} Kigali`];
  const jobsFile = join(process.env.HOME ?? '', '.hermes', 'cron', 'jobs.json');
  const raw = existsSync(jobsFile) ? (JSON.parse(readFileSync(jobsFile, 'utf8')) as { jobs?: HermesJob[] } | HermesJob[]) : [];
  const jobs: HermesJob[] = Array.isArray(raw) ? raw : (raw.jobs ?? []);
  out.push('', 'Scheduled lanes (Hermes, on the Mac):');
  for (const name of ['mkan-tiktok-sweep', 'mkan-web-sweep', 'mkan-demand-match', 'mkan-tiktok-post', 'mkan-tiktok-upload-retry', 'mkan-tiktok-upload-evening', 'mkan-tiktok-stats', 'mkan-price-ask']) {
    const j = jobs.find((x) => x.name === name);
    if (!j) {
      out.push(`  ${name.padEnd(25)} not scheduled`);
      continue;
    }
    const last = j.last_run_at ? `${kigali(j.last_run_at)} ${j.last_status ?? ''}` : 'never ran';
    const err = j.last_status === 'error' && j.last_error ? ` — ${maskText(j.last_error, 90)}` : '';
    out.push(`  ${name.padEnd(25)} ${(j.schedule_display ?? '').padEnd(14)} last ${last}${err} · next ${j.next_run_at ? kigali(j.next_run_at) : '—'}${j.enabled === false ? ' · PAUSED' : ''}`);
  }
  // Hermes says "ok" the moment a detached run starts; each run's own record says how it went (crm/notify.ts recordRun).
  const streaksFile = join(__dirname, '..', 'crm', '.data', 'failure-streaks.json');
  const streaks = existsSync(streaksFile) ? (JSON.parse(readFileSync(streaksFile, 'utf8')) as Record<string, { fails: number; at?: string; ok?: boolean; detail?: string; last?: string }>) : {};
  out.push('', 'Last runs, as the runs themselves recorded them:');
  // How long each run may go unrecorded before it is overdue: twice-daily lanes 13 h, daily ones 26 h.
  // `mirror` (CRM homes → /find leads) runs inside every sweep and demand run: its own row, so a failed copy shows red.
  const every: Record<string, number> = { 'tiktok-sweep': 13, mirror: 13, 'price-ask': 26, 'web-ads': 13, 'web-recheck': 13, 'demand-match': 26, 'tiktok-post': 26, 'tiktok-upload': 26 };
  for (const job of Object.keys(every)) {
    const r = streaks[job];
    if (!r?.at) {
      out.push(`  ${job.padEnd(25)} not recorded yet${r?.fails ? ` · ${r.fails} failed in a row` : ''}`);
      continue;
    }
    // A run that never got the network records nothing, so a quiet lane is flagged by its age.
    const hours = Math.floor((Date.now() - Date.parse(r.at)) / 3_600_000);
    const overdue = hours >= every[job]! ? ` · ⚠ nothing recorded for ${hours} h` : '';
    out.push(`  ${job.padEnd(25)} ${kigali(r.at)} ${r.ok ? 'ok' : 'FAILED'}${r.fails > 1 ? ` (${r.fails} in a row)` : ''}${overdue}${r.detail ? ` — ${maskText(r.detail, 110)}` : ''}`);
  }
  const day = new Date(Date.now() - 86_400_000);
  const week = new Date(Date.now() - 7 * 86_400_000);
  const brokerKinds = { in: ['BROKER_REQUEST' as const, 'BROKER_ASK' as const] };
  const [tiktokNew, webNew, leads, brokers, brokersNew, withPhone, withLang, partners, lost, sends, sent24, queued, waTenants, visits, deals] = await Promise.all([
    db.listing.count({ where: { source: 'TIKTOK', createdAt: { gte: day } } }),
    db.listing.count({ where: { source: 'WEB', createdAt: { gte: day } } }),
    db.listing.count({ where: { source: { in: ['TIKTOK', 'WEB', 'FACEBOOK'] }, rentPeriod: 'MONTHLY', sourceUrl: { not: null }, lostAt: null } }),
    db.broker.count(),
    db.broker.count({ where: { createdAt: { gte: day } } }),
    db.broker.count({ where: { phones: { isEmpty: false } } }),
    db.broker.count({ where: { preferredLanguage: { not: null } } }),
    db.broker.count({ where: { relationship: { in: ['ACTIVE', 'PARTNER'] } } }),
    db.listing.count({ where: { lostAt: { gte: week }, NOT: { lostReason: 'OWN_PAGE' } } }),
    db.waState.findUnique({ where: { key: 'broker-sends' }, select: { value: true } }),
    db.outboundMessage.count({ where: { status: 'SENT', kind: brokerKinds, sentAt: { gte: day } } }),
    db.outboundMessage.count({ where: { status: 'QUEUED', kind: brokerKinds } }),
    db.agentProfile.count({ where: { waPhone: { not: null }, updatedAt: { gte: day } } }),
    db.listingVisit.groupBy({ by: ['outcome'], where: { taskId: { not: null } }, _count: true }),
    db.deal.groupBy({ by: ['status'], _count: true }),
  ]);
  const mode = (sends?.value as { mode?: string } | null)?.mode === 'gated' ? 'GATED (real WhatsApp tenants only)' : 'OFF (picks go to #mkan)';
  out.push(
    '',
    `Supply, last 24 h: ${tiktokNew} TikTok home(s) · ${webNew} web home(s) · ${leads} live broker leads in /find · ${lost} home(s) lost this week`,
    `Brokers: ${brokers} (${withPhone} with a phone, ${withLang} with a language, ${partners} talking to us) · ${brokersNew} new in 24 h`,
    `WhatsApp line: broker sends ${mode} · ${sent24} broker message(s) in 24 h · ${queued} queued · ${waTenants} tenant(s) wrote in 24 h`,
    `Viewings: ${visits.map((v) => `${v._count} ${v.outcome}`).join(', ') || 'none yet'} · Deals: ${deals.map((d) => `${d._count} ${d.status}`).join(', ') || 'none yet'}`,
  );
  return out;
}

async function main(): Promise<void> {
  const [topic = 'brief', sub = ''] = words;
  const needsDb = ['brief', 'chats', 'wa', 'whatsapp', 'lanes'].includes(topic);
  const db = needsDb ? (await import('../../src/lib/db')).db : null;
  try {
    let lines: string[] = [];
    if (topic === 'chats') lines = await chats(db!);
    else if (topic === 'wa' || topic === 'whatsapp') lines = await whatsapp(db!);
    else if (topic === 'crm') lines = await crm(sub);
    else if (topic === 'tiktok') lines = [...tiktok(), ...(await crm('consent'))];
    else if (topic === 'lanes') lines = await lanes(db!);
    else if (topic === 'brief') {
      const { agentFunnel, funnelLine } = await import('../crm/agent-funnel');
      lines = [funnelLine(await agentFunnel(db!, DAYS)), '', ...tiktok().slice(0, 4), ...(await crm('consent').catch((e) => [`CRM: ${(e as Error).message}`]))];
    } else lines = ['topics: brief (default) · chats · wa · crm homes|brokers|consent|tiktok · tiktok · lanes   (--days=N --n=N)'];
    console.log(lines.join('\n'));
  } finally {
    await db?.$disconnect().catch(() => {});
  }
}

if (process.argv[1] && /read\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(`❌ ${maskText((e as Error).message, 200)}`);
    process.exit(1);
  });
}
