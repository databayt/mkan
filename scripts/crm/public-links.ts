/**
 * Links that leave the building — the app origin, wa.me, claim, listing, login.
 *
 * One place, because three scripts each carried their own answer to "what is the
 * site's URL" and only one of them (`gift-handover.ts`) guarded against localhost.
 * `.env` holds `NEXT_PUBLIC_APP_URL=http://localhost:3000` for local dev, so
 * `claim-tokens.ts` printed `http://localhost:3000/ar/claim/…` — the ONLY place a
 * minted link is ever printed — and a human copying it would have handed a host a
 * dead link that reads as a broken company. Measured 2026-08-29 on the real dry run.
 *
 * The canonical public host is mkan.sd. mk.databayt.org redirects there;
 * mkan.databayt.org is the Twenty CRM, not the app (reassigned 2026-08-16).
 */
const CANONICAL = 'https://mkan.sd';
const LOCAL = /localhost|127\.0\.0\.1|0\.0\.0\.0/i;

/**
 * The public origin. An explicit value (a `--base-url` flag) is honoured verbatim —
 * someone testing the claim page on a dev server means it — while the environment
 * fallback is guarded: a local origin there is a dev convenience, never a message.
 */
export function publicAppUrl(explicit?: string | null): string {
  const given = (explicit ?? '').trim();
  if (given) return given.replace(/\/+$/, '');
  const env = (process.env.NEXT_PUBLIC_APP_URL ?? '').trim();
  const ok = /^https?:\/\//.test(env) && !LOCAL.test(env);
  return (ok ? env : CANONICAL).replace(/\/+$/, '');
}

export const claimUrl = (token: string, lang = 'ar', base = publicAppUrl()): string => `${base}/${lang}/claim/${token}`;
export const listingUrl = (code: string, lang = 'ar', base = publicAppUrl()): string => `${base}/${lang}/listings/${code}`;
export const loginUrl = (lang = 'ar', base = publicAppUrl()): string => `${base}/${lang}/login`;

/** wa.me click-to-chat — digits only (wa.me tolerates a leading `+`, but never spaces), message pre-filled. */
export function waLink(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/[^\d]/g, '')}?text=${encodeURIComponent(text)}`;
}
