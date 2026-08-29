/**
 * Host account handover — the message that tells a host the mkan account is theirs.
 *
 *   pnpm crm:handover --account=0005                       one host — prints the sheet (dry)
 *   pnpm crm:handover --all                                every site-provisioned account
 *   pnpm crm:handover --account=0005 --mark-sent --apply   a human sent it: stamp credentialsSentAt + a Note
 *
 * ── Two credential models, one per account, chosen by evidence rather than by flag ──
 *
 *   shared password   Accounts the SITE provisions — the four hand-verified hosts
 *                     (0001–0004, seeded) and every Slack-born host that `home:publish`
 *                     creates at `live` (0005+). `User.email` is the number, the password
 *                     is MKAN_DEFAULT_PASSWORD, and the host is told exactly that: the
 *                     number, the password, the login link, their listing links. Detected
 *                     by verifying the shared password against the stored hash — when it
 *                     no longer verifies, someone already changed it, the account is in
 *                     its owner's hands, and there is nothing left to hand over.
 *   claim link        Accounts the growth IMPORT provisions (1001+): a random bootstrap
 *                     password printed once and never stored, so the only key is a live
 *                     HostClaimToken. That sheet is `gift-handover.ts` (Port Sudan, with
 *                     the photo gift); this script points at it instead of compiling a
 *                     second copy of the claim message.
 *
 * Until 2026-08-29 nothing composed the shared-password message at all. The docs said
 * "`0006` and the shared password are the whole of what a host is told" — and no script,
 * thread reply or sheet ever told them. `home:publish` now appends this message to the
 * `live` thread, and this CLI re-prints it for any account, any time.
 *
 * READ-ONLY by default. `--mark-sent --apply` is the single write: `credentialsSentAt`
 * on the Twenty host plus a Note carrying the message — the human's word that it went
 * out. QUEUED is not SENT, here as in the hogwarts lane.
 */
import { config } from 'dotenv';
config({ override: true });

import { execSync } from 'node:child_process';
import { normalizeSudanPhone } from './home-intake-pure';
import { listingUrl, loginUrl, waLink } from './public-links';
import { phoneOf, twentyClient, type Phones, type TwentyClient } from './twenty-rest';

type Row = Record<string, unknown>;
const trim = (v: string | null | undefined): string => (v ?? '').trim();

if (!trim(process.env.TWENTY_API_URL)) process.env.TWENTY_API_URL = 'http://localhost:3100';
if (!trim(process.env.TWENTY_API_KEY)) {
  try {
    process.env.TWENTY_API_KEY = execSync('security find-generic-password -s databayt-twenty -a mkan -w', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    /* twentyClient() reports it */
  }
}

/** One password for every site-provisioned host account — the convention `home-publish.ts` writes. */
export const DEFAULT_PASSWORD = trim(process.env.MKAN_DEFAULT_PASSWORD) || '1234';
const MAX_LISTED = 6;

// ── the message (pure) ───────────────────────────────────────────────────────
export interface HandoverListing {
  code: string;
  title: string | null;
  url: string;
}
export interface HandoverInput {
  hostName: string;
  account: string;
  password: string;
  loginUrl: string;
  listings: HandoverListing[];
}

/**
 * Arabic only — every host on the site today is in Port Sudan. Same voice as the
 * gift-handover message: who is speaking, what we made for them, the keys, one line on
 * what they can do with them, and a door left open. No urgency, nothing to buy.
 */
export function compileAccountHandover(d: HandoverInput): string {
  const name = d.hostName.trim() || 'المضيف';
  const lines = [
    `السلام عليكم ورحمة الله أستاذ ${name}،`,
    '',
    'معاك فريق منصة «مكان» (mkan.sd) — منصة سودانية لحجز الشقق المفروشة مباشرة بين المضيف والنزيل وبدون أي عمولة (0%).',
    '',
  ];
  const n = d.listings.length;
  if (n === 0) {
    lines.push('حسابك على المنصة جاهز لإضافة عقاراتك.');
  } else if (n === 1) {
    const l = d.listings[0]!;
    lines.push(`جهزنا لعقارك${l.title ? ` «${l.title}»` : ''} صفحة كاملة على المنصة بالصور والوصف:`, `🔗 ${l.url}`);
  } else {
    lines.push(`جهزنا لعقاراتك (${n}) صفحاتها الكاملة على المنصة، كل عقار بصفحته:`);
    for (const l of d.listings.slice(0, MAX_LISTED)) lines.push(`🔗 ${l.url}${l.title ? ` — ${l.title}` : ''}`);
    if (n > MAX_LISTED) lines.push(`…و${n - MAX_LISTED} أخرى في حسابك.`);
  }
  lines.push(
    '',
    'حسابك كمضيف جاهز، ودي بيانات الدخول:',
    `🔢 رقم الحساب: ${d.account}`,
    `🔑 كلمة المرور: ${d.password}`,
    `🌐 ${d.loginUrl}`,
    '',
    'بعد الدخول تقدر تعدّل الأسعار والصور والتوافر بنفسك — وننصحك تغيّر كلمة المرور من الإعدادات أول ما تدخل. طلبات الحجز بتوصلك مباشرة على رقمك.',
    '',
    'لأي سؤال نحن هنا. 🤝',
  );
  return lines.join('\n');
}

// ── the sheet row ────────────────────────────────────────────────────────────
export type HandoverStatus =
  | 'ready' // shared password verifies, a phone is known → send
  | 'needs-phone' // shared password verifies, nobody to send it to
  | 'password-changed' // the host (or someone) set their own — the account is theirs
  | 'claim-link' // import-provisioned: see gift-handover / crm:claim-token
  | 'no-account';

export interface HandoverSheet {
  account: string;
  status: HandoverStatus;
  reason: string | null;
  hostName: string | null;
  phone: string | null;
  lastLogin: string | null;
  published: number;
  credentialsSentAt: string | null;
  twentyHostId: string | null;
  message: string | null;
  waLink: string | null;
}

const isNumericAccount = (email: string): boolean => /^\d{4}$/.test(email);

/** Twenty `hosts` row for a site account — by the number written on the host record. */
async function twentyHost(client: TwentyClient, account: string): Promise<Row | null> {
  const res = (await client.rest('GET', `hosts?filter=mkanUsername[eq]:"${encodeURIComponent(account)}"&limit=1&depth=0`)) as { data?: { hosts?: Row[] } };
  return res.data?.hosts?.[0] ?? null;
}
/** Fallback: the phone/name written on the account's homes when no host row carries the number. */
async function twentyHomeContact(client: TwentyClient, account: string): Promise<{ name: string | null; phone: string | null }> {
  const res = (await client.rest('GET', `homes?filter=account[eq]:"${encodeURIComponent(account)}"&limit=5&depth=0`)) as { data?: { homes?: Row[] } };
  for (const h of res.data?.homes ?? []) {
    const phone = normalizeSudanPhone(phoneOf(h.hostWhatsapp as Phones | null)) ?? normalizeSudanPhone(phoneOf(h.hostPhone as Phones | null));
    const name = trim(h.hostName as string | null) || null;
    if (phone || name) return { name, phone };
  }
  return { name: null, phone: null };
}

/** Everything the sheet needs for one account. Reads the site (truth) and Twenty (contact); writes nothing. */
export async function handoverForAccount(account: string): Promise<HandoverSheet> {
  const { db } = await import('../../src/lib/db');
  const { default: bcrypt } = await import('bcryptjs');
  const base: HandoverSheet = { account, status: 'no-account', reason: null, hostName: null, phone: null, lastLogin: null, published: 0, credentialsSentAt: null, twentyHostId: null, message: null, waLink: null };

  const user = await db.user.findUnique({
    where: { email: account },
    select: {
      id: true,
      username: true,
      password: true,
      sourceHostId: true,
      lastLogin: true,
      listings: { where: { isPublished: true }, select: { code: true, title: true }, orderBy: { code: 'asc' } },
    },
  });
  if (!user) return { ...base, reason: `no site account ${account} — it is provisioned at \`live\` (home:publish)` };
  base.lastLogin = user.lastLogin?.toISOString().slice(0, 10) ?? null;
  base.published = user.listings.length;
  if (user.sourceHostId) {
    return { ...base, status: 'claim-link', reason: `import-provisioned (airbnb host ${user.sourceHostId}) — the key is a claim link: pnpm crm:gift-handover --account=${account}` };
  }
  const shared = user.password ? await bcrypt.compare(DEFAULT_PASSWORD, user.password) : false;
  if (!shared) return { ...base, status: 'password-changed', reason: 'the shared password no longer verifies — the host set their own; the account is theirs' };

  const client = twentyClient();
  const host = await twentyHost(client, account);
  const fromHomes = host ? { name: null, phone: null } : await twentyHomeContact(client, account);
  // Only a number that reads as a Sudanese mobile becomes a wa.me link. A raw value that
  // does not normalise (0003 carried "+249 03467930" — eight digits) is reported, never
  // dialled: a WhatsApp to a wrong number is a handover that silently never happened.
  const rawPhone = phoneOf(host?.whatsapp as Phones | null) ?? phoneOf(host?.phone as Phones | null);
  const phone = normalizeSudanPhone(rawPhone) ?? fromHomes.phone;
  const siteName = user.username && !isNumericAccount(user.username) ? user.username : null;
  const hostName = trim(host?.name as string | null) || fromHomes.name || siteName || 'المضيف';

  const message = compileAccountHandover({
    hostName,
    account,
    password: DEFAULT_PASSWORD,
    loginUrl: loginUrl('ar'),
    listings: user.listings.filter((l) => !!l.code).map((l) => ({ code: l.code!, title: l.title, url: listingUrl(l.code!, 'ar') })),
  });
  return {
    ...base,
    status: phone ? 'ready' : 'needs-phone',
    reason: phone
      ? null
      : rawPhone
        ? `the host record's number "${rawPhone}" does not read as a Sudanese mobile — fix it in Twenty, then re-run`
        : 'no phone on the Twenty host or its homes — write the number in the home\'s thread, then re-run',
    hostName,
    phone,
    credentialsSentAt: ((host?.credentialsSentAt as string | null) ?? '').slice(0, 10) || null,
    twentyHostId: (host?.id as string | null) ?? null,
    message,
    waLink: phone ? waLink(phone, message) : null,
  };
}

/** The Slack thread text `home:publish` posts right after a home goes live. */
export function handoverReply(h: HandoverSheet): string {
  switch (h.status) {
    case 'ready':
      return [
        `📲 *سلّم الحساب للمضيف / hand the account to the host* — اضغط الرابط وأرسل:`,
        h.waLink,
        '',
        '```',
        h.message,
        '```',
        `_بعد الإرسال / after sending: \`pnpm crm:handover --account=${h.account} --mark-sent --apply\`_`,
      ].join('\n');
    case 'needs-phone':
      return `📲 الحساب *${h.account}* جاهز لكن لا رقم للمضيف — اكتب الرقم في هذا الثريد ثم \`pnpm crm:handover --account=${h.account}\` / account ready, no phone to send it to.`;
    case 'password-changed':
      return `🔐 الحساب *${h.account}* في يد المضيف (كلمة المرور تغيّرت) — لا شيء لتسليمه / already in the host's hands.`;
    case 'claim-link':
      return `🔑 الحساب *${h.account}* من الاستيراد — مفتاحه رابط استلام: \`pnpm crm:gift-handover --account=${h.account}\``;
    default:
      return `⚠️ لا حساب ${h.account} على الموقع بعد / no site account yet: ${h.reason ?? ''}`;
  }
}

// ── CLI ──────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  const argv = (n: string, d = ''): string => {
    const h = process.argv.find((a) => a.startsWith(`--${n}=`));
    return h ? h.split('=').slice(1).join('=') : d;
  };
  const flag = (n: string): boolean => process.argv.includes(`--${n}`);
  const ACCOUNT = argv('account');
  const ALL = flag('all');
  const APPLY = flag('apply');
  const MARK_SENT = flag('mark-sent');
  if (!ACCOUNT && !ALL) throw new Error('usage: crm:handover --account=NNNN | --all   [--mark-sent --apply]');
  if (MARK_SENT && !ACCOUNT) throw new Error('--mark-sent needs one --account — SENT is one human\'s word about one message');

  let accounts: string[] = [ACCOUNT];
  if (ALL) {
    const { db } = await import('../../src/lib/db');
    const users = await db.user.findMany({ where: { role: 'MANAGER', sourceHostId: null }, select: { email: true } });
    accounts = users.map((u) => u.email).filter(isNumericAccount).sort();
  }

  const sheets: HandoverSheet[] = [];
  for (const a of accounts) sheets.push(await handoverForAccount(a));

  console.log(`\n═══ Host account handover — ${sheets.length} account(s) ═══`);
  const by = (s: HandoverStatus) => sheets.filter((x) => x.status === s).length;
  console.log(`  ready ${by('ready')} · needs phone ${by('needs-phone')} · already theirs ${by('password-changed')} · claim-link accounts ${by('claim-link')} · no account ${by('no-account')}`);
  console.log(`  a ready row is a message a HUMAN sends; QUEUED is not SENT — stamp it with --mark-sent --apply afterwards\n`);
  for (const s of sheets) {
    console.log(`──── [${s.account}] ${s.hostName ?? ''}  ${s.status}`);
    if (s.reason) console.log(`  ${s.reason}`);
    console.log(`  phone ${s.phone ?? '—'} · last login ${s.lastLogin ?? '—'} · published ${s.published} · credentials sent ${s.credentialsSentAt ?? 'never'}`);
    if (s.waLink) console.log(`  📲 ${s.waLink.slice(0, 110)}…`);
    console.log('');
  }

  const { mkdirSync, writeFileSync } = await import('node:fs');
  mkdirSync('scripts/crm/.data', { recursive: true });
  writeFileSync('scripts/crm/.data/host-handover-sheet.json', JSON.stringify({ generatedAt: new Date().toISOString(), sheets }, null, 2));
  console.log('  sheet → scripts/crm/.data/host-handover-sheet.json');

  if (MARK_SENT) {
    const s = sheets[0]!;
    if (s.status !== 'ready') throw new Error(`[${s.account}] is ${s.status} — only a ready message can be marked sent`);
    if (!APPLY) {
      console.log(`\n  DRY RUN — would stamp credentialsSentAt=now on Twenty host ${s.twentyHostId ?? '(none)'} and attach the message as a Note. Re-run with --apply.`);
      return;
    }
    const client = twentyClient();
    const now = new Date().toISOString();
    if (!s.twentyHostId) throw new Error(`[${s.account}] has no Twenty host row carrying mkanUsername=${s.account} — nothing to stamp`);
    await client.rest('PATCH', `hosts/${s.twentyHostId}`, { credentialsSentAt: now });
    try {
      const note = (await client.rest('POST', 'notes', { title: `Account handover ${s.account} · sent ${now.slice(0, 10)}`, bodyV2: { markdown: s.message } })) as { data?: { createNote?: { id?: string } } };
      const noteId = note.data?.createNote?.id;
      if (noteId) await client.rest('POST', 'noteTargets', { noteId, targetHostId: s.twentyHostId });
    } catch (e) {
      console.warn(`  ! note failed (${(e as Error).message.slice(0, 120)}) — credentialsSentAt is stamped, the Note is not`);
    }
    console.log(`\n  ✅ [${s.account}] credentialsSentAt = ${now}`);
  }
}

if (process.argv[1] && /host-handover\.ts$/.test(process.argv[1])) {
  main()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(`\n❌ ${(e as Error).message}\n`);
      process.exit(1);
    });
}
