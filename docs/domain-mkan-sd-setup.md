# Adding `mkan.sd` as the primary domain

Goal: make **`mkan.sd`** the canonical production domain for the Mkan app,
with `mk.databayt.org` (and `mkan.databayt.org`) permanently redirecting to it.

- Registrar: mazinhost.com (`.sd`, via TPRA)
- Nameservers: Cloudflare (already set at the registrar — TPRA takes **1–5 business days** to apply)
- Vercel project: `mkan` (`prj_utHmZvhIjOJrcdynB8qSoP7aQMOB`, team `team_byS1aI4jmz4mSh0RNx8dR12J`)
- Current canonical: `mk.databayt.org` (from `NEXTAUTH_URL` + `src/proxy.ts` `CANONICAL_HOST`)

> **Do the two phases in order.** Phase 1 (DNS + Vercel) is safe to do now and
> does not touch the live site. Phase 2 (the canonical flip) MUST wait until
> `mkan.sd` actually serves the app over HTTPS — otherwise the current live
> site breaks.

---

## Phase 0 — Cloudflare zone (prerequisite)

You set Cloudflare nameservers at mazinhost, so the `mkan.sd` **zone must exist
in a Cloudflare account** for those nameservers to answer.

1. Cloudflare dashboard → **Add a site** → `mkan.sd` → Free plan.
2. Cloudflare shows two nameservers (e.g. `xxx.ns.cloudflare.com`). Confirm
   these are the exact two you entered in the mazinhost "أسماء السيرفرات" form
   (النيم سيرفر 1 / 2). If they differ, update mazinhost to match.
3. Zone status stays **"Pending Nameserver Update"** until TPRA propagates
   (1–5 business days). DNS records added below activate the moment it flips.

---

## Phase 1 — Add the domain (safe now, no downtime)

### 1a. Vercel — add the domains

Vercel dashboard → project **mkan** → **Settings → Domains → Add**:

- Add `mkan.sd`
- Add `www.mkan.sd`  → set it to **Redirect to `mkan.sd`** (Vercel offers this toggle)

Vercel will show the DNS target for each. Expected values (confirm against what
the dashboard actually prints — Vercel occasionally rotates these):

| Host          | Type  | Value                     |
| ------------- | ----- | ------------------------- |
| `mkan.sd` (@) | `A`   | `76.76.21.21`             |
| `www`         | `CNAME` | `cname.vercel-dns.com`  |

### 1b. Cloudflare — add the DNS records

Cloudflare → `mkan.sd` → **DNS → Records → Add record**, using exactly what
Vercel printed:

- `A` · Name `@` · IPv4 `76.76.21.21` · **Proxy status: DNS only (grey cloud)**
- `CNAME` · Name `www` · Target `cname.vercel-dns.com` · **DNS only (grey cloud)**

> **Grey cloud matters.** Leave these **unproxied** so Vercel can verify the
> domain and issue the TLS cert. An orange-cloud (proxied) record blocks
> Vercel's cert issuance and can cause a redirect loop. You can turn proxy on
> later once the cert is live, but only with Cloudflare SSL/TLS mode =
> **Full (strict)**. Simplest is to leave it grey.

### 1c. Wait

- TPRA propagates the Cloudflare nameservers (1–5 business days).
- Once propagated, Vercel's Domains page flips `mkan.sd` to **Valid /
  Certificate issued**.
- Visiting `https://mkan.sd` now serves the app. At this point the app is
  reachable on BOTH `mkan.sd` and `mk.databayt.org`; `mk.databayt.org` is still
  canonical in metadata. **This is a fine, non-broken intermediate state.**

Verify before Phase 2:

```bash
dig +short mkan.sd            # should return 76.76.21.21
curl -sI https://mkan.sd/en   # should be 200/307 from Vercel, valid cert
```

---

## Phase 2 — Flip canonical to mkan.sd (only after mkan.sd serves HTTPS)

Do all three of these together, in one deploy window.

### 2a. Vercel env var

Vercel → project mkan → **Settings → Environment Variables → Production**:

- `NEXTAUTH_URL` = `https://mkan.sd`  (was `https://mk.databayt.org`)

This one var drives `SITE_URL` (metadata, sitemap, robots, JSON-LD, OG) and
NextAuth's own callback origin. Redeploy after changing it.

> Leave the **local** `.env` `NEXTAUTH_URL=http://localhost:3000` unchanged —
> that's dev only.

### 2b. Code — `src/proxy.ts`

Change lines 28–29 from:

```ts
const CANONICAL_HOST = 'mk.databayt.org';
const STALE_HOSTS = new Set(['mkan.databayt.org', 'www.mk.databayt.org']);
```

to:

```ts
const CANONICAL_HOST = 'mkan.sd';
const STALE_HOSTS = new Set([
  'mk.databayt.org',
  'www.mk.databayt.org',
  'mkan.databayt.org',
  'www.mkan.sd',
]);
```

Commit + push to `main` (auto-deploys). **Push this only after 2a is saved and
mkan.sd is confirmed live**, so the redirect target exists.

### 2c. OAuth redirect URIs (else Google/Facebook login breaks)

- **Google Cloud Console** → the Mkan OAuth client → Authorized redirect URIs →
  add `https://mkan.sd/api/auth/callback/google`. Keep the old
  `mk.databayt.org` one until you're sure nothing links to it.
- **Facebook Login** → Valid OAuth Redirect URIs → add
  `https://mkan.sd/api/auth/callback/facebook`.
- Also add `https://mkan.sd` to any "Authorized JavaScript origins" list.

---

## Phase 3 — Verify & tidy up

```bash
curl -sI https://mk.databayt.org/en   # expect 308 → https://mkan.sd/en
curl -sI https://mkan.sd/en           # expect 200, canonical, valid cert
```

- Sign in with Google/Facebook on `https://mkan.sd` — confirm the callback
  lands back on mkan.sd.
- Check page source `<link rel="canonical">` points at `mkan.sd`.
- **Google Search Console**: add `mkan.sd` as a property, submit
  `https://mkan.sd/sitemap.xml`. Use the Change-of-Address tool from the
  `mk.databayt.org` property to signal the move.
- Re-check `robots.ts` / `sitemap.ts` output now emit `mkan.sd` URLs (they read
  `SITE_URL` → `NEXTAUTH_URL`, so 2a handles this automatically).

---

## Rollback

If anything breaks after Phase 2: revert the `src/proxy.ts` commit and set
`NEXTAUTH_URL` back to `https://mk.databayt.org` in Vercel, redeploy. Because
`mk.databayt.org`'s own DNS never changed, it comes straight back.
