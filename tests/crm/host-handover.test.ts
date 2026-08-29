/**
 * The account handover message and the public links it is built from.
 *
 * Two of these guard measured defects from 2026-08-29: `claim-tokens.ts` printed
 * `http://localhost:3000/ar/claim/…` because `.env` carries a dev origin and the only
 * guard lived in one other script; and nothing at all composed the shared-password
 * message the docs said every Slack-born host is told.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { compileAccountHandover, handoverReply, type HandoverSheet } from '../../scripts/crm/host-handover';
import { claimUrl, listingUrl, loginUrl, publicAppUrl, waLink } from '../../scripts/crm/public-links';

const sheet = (over: Partial<HandoverSheet>): HandoverSheet => ({
  account: '0005',
  status: 'ready',
  reason: null,
  hostName: 'الطيب',
  phone: '+249912345678',
  lastLogin: null,
  published: 1,
  credentialsSentAt: null,
  twentyHostId: 'h1',
  message: 'MSG',
  waLink: 'https://wa.me/249912345678?text=MSG',
  ...over,
});

describe('publicAppUrl', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('never lets a localhost .env origin into a message', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    expect(publicAppUrl()).toBe('https://mkan.sd');
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://127.0.0.1:3000/');
    expect(publicAppUrl()).toBe('https://mkan.sd');
  });

  it('honours a real public origin from the env, without a trailing slash', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://mk.databayt.org/');
    expect(publicAppUrl()).toBe('https://mk.databayt.org');
  });

  it('honours an explicit --base-url verbatim, even a dev server (someone testing the claim page means it)', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://mkan.sd');
    expect(publicAppUrl('http://localhost:3000/')).toBe('http://localhost:3000');
  });

  it('builds the three links a host receives on the public origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'http://localhost:3000');
    expect(claimUrl('tok')).toBe('https://mkan.sd/ar/claim/tok');
    expect(listingUrl('0005-01')).toBe('https://mkan.sd/ar/listings/0005-01');
    expect(loginUrl()).toBe('https://mkan.sd/ar/login');
  });
});

describe('waLink', () => {
  it('keeps digits only and pre-fills the message', () => {
    const l = waLink('+249 91 234 5678', 'مرحبا & أهلا');
    expect(l.startsWith('https://wa.me/249912345678?text=')).toBe(true);
    expect(l).not.toContain('+');
    expect(decodeURIComponent(l.split('text=')[1]!)).toBe('مرحبا & أهلا');
  });
});

describe('compileAccountHandover', () => {
  const base = { hostName: 'الطيب', account: '0005', password: 'pw-1234', loginUrl: 'https://mkan.sd/ar/login' };

  it('tells the host the three things they need: number, password, where to log in', () => {
    const m = compileAccountHandover({ ...base, listings: [] });
    expect(m).toContain('أستاذ الطيب');
    expect(m).toContain('رقم الحساب: 0005');
    expect(m).toContain('كلمة المرور: pw-1234');
    expect(m).toContain('https://mkan.sd/ar/login');
    expect(m).toContain('جاهز لإضافة عقاراتك');
  });

  it('links the one listing by name', () => {
    const m = compileAccountHandover({ ...base, listings: [{ code: '0005-01', title: 'شقة الثورة', url: 'https://mkan.sd/ar/listings/0005-01' }] });
    expect(m).toContain('«شقة الثورة»');
    expect(m).toContain('🔗 https://mkan.sd/ar/listings/0005-01');
    expect(m).not.toContain('عقاراتك (');
  });

  it('lists many listings, caps the list and says how many more', () => {
    const listings = Array.from({ length: 8 }, (_, i) => ({ code: `0002-0${i + 1}`, title: `وحدة ${i + 1}`, url: `https://mkan.sd/ar/listings/0002-0${i + 1}` }));
    const m = compileAccountHandover({ ...base, listings });
    expect(m).toContain('عقاراتك (8)');
    expect(m.match(/🔗 /g)?.length).toBe(6);
    expect(m).toContain('…و2 أخرى');
  });

  it('falls back to a neutral honorific when the name is blank', () => {
    expect(compileAccountHandover({ ...base, hostName: '  ', listings: [] })).toContain('أستاذ المضيف');
  });
});

describe('handoverReply', () => {
  it('a ready row carries the wa.me link, the message, and the mark-sent command', () => {
    const r = handoverReply(sheet({}));
    expect(r).toContain('https://wa.me/249912345678?text=MSG');
    expect(r).toContain('MSG');
    expect(r).toContain('--account=0005 --mark-sent --apply');
  });

  it('every other status says what is missing rather than printing a message', () => {
    expect(handoverReply(sheet({ status: 'needs-phone', phone: null, waLink: null }))).toContain('لا رقم');
    expect(handoverReply(sheet({ status: 'password-changed' }))).toContain('في يد المضيف');
    expect(handoverReply(sheet({ status: 'claim-link' }))).toContain('crm:gift-handover --account=0005');
    expect(handoverReply(sheet({ status: 'no-account', reason: 'x' }))).toContain('لا حساب 0005');
  });
});
