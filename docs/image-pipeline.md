# Image pipeline — S3 + CloudFront + CDN

Home/property images are stored on **S3**, served through **CloudFront**
(`cdn.databayt.org`), and optimized **AWS-side** (pre-made Sharp WebP variants),
not by ImageKit and not by Vercel's optimizer. ImageKit has been fully retired.

Mirrors the proven hogwarts pattern (`catalog/image.ts`, `cloudfront-url.ts`,
`api/blob/presign`, `use-image-optimization`).

> **Status: ✅ LIVE (2026-07-03).** Stock variants uploaded to `databayt-cdn`,
> `NEXT_PUBLIC_USE_CDN_VARIANTS=true` + AWS creds set in prod — homes photos
> serve pre-made WebP straight from `cdn.databayt.org/mkan/stock/*-{sm,md,lg}.webp`
> (off Vercel), and uploads are configured (`checks.storage: true`). Verified on
> `mk.databayt.org`. **Follow-up (hardening):** the runtime creds are the shared
> `hogwarts-s3-uploader` IAM user (broad `databayt-cdn` write); replace with an
> mkan-scoped user limited to `mkan/uploads/*`.

## CDN namespace (databayt convention)

`cdn.ts` classifies every asset by its first path segment (codebase
`content/docs/(root)/cdn.mdx`):

- **`cdn.product("…")` → `cdn.databayt.org/mkan/…`** — mkan's OWN media: home/
  property images, `stock/photo-*.jpg`, `property-placeholder.svg`, marketing art.
  **All homes imagery lives here.**
- **`cdn.vendor("airbnb", "…")` → `cdn.databayt.org/airbnb/…`** — Airbnb *original*
  artwork (amenity/highlight glyphs, nav marks, host videos, the price-tag Lottie).
  Consumed for icons/arts, **never for listing photos**.

So **homes images = `/mkan`, Airbnb arts = `/airbnb`.** This pipeline only ever
writes `/mkan` (`mkan/stock/*`, `mkan/uploads/*`); it never touches `/airbnb`.

## How it works

```
UPLOAD  browser: Canvas resize→WebP (≤2048²)   →  presigned PUT direct to S3
        (src/lib/image-optimize.ts)               (POST /api/upload/presign → src/lib/s3.ts)
STORE   S3 key  mkan/uploads/<userId>/<uuid>.webp →  DB photoUrls = cdn.databayt.org URL
STOCK   scripts/process-stock-images.ts (Sharp)  →  <base>-{sm,md,lg,original}.webp on S3
                                                  →  + per-image blur → src/lib/stock-blur-map.ts
SERVE   every listing image renders through <PropertyImage> (src/components/atom/property-image.tsx):
        blur placeholder, per-surface sizes/quality, graceful fallback, optional CDN-variant loader.
```

- **`<PropertyImage variant="card|hero|thumb|full|nearby">`** is the single
  primitive. Tune sizes/quality/blur/loader in one place; it applies across
  search cards, the detail gallery, the mobile strip, the full-screen viewer,
  the "nearby" carousel, and the home carousels.
- **Blur/LQIP**: stock photos use a real per-image blur (`stock-blur-map.ts`);
  everything else falls back to a shared shimmer. No more gray pop-in.
- **Transforms**: today the default Next optimizer serves images from the CDN.
  Flip to pre-made CDN variants (off Vercel) with the flag below.

## What is live now (no AWS needed)

- Unified `<PropertyImage>` across all surfaces, blur placeholders, correct
  responsive `sizes`, LCP `priority` on the hero + first home carousel + first
  search/listings cards, per-image stock LQIP.
- All upload/storage code is written and build-green but **dormant**: uploads
  need AWS creds. `/api/upload/presign` returns `503 not configured` until then
  (uploads are rare pre-launch — the demo runs on CDN stock).

## AWS go-live checklist (operator)

1. **Bucket** — the canonical CDN bucket `databayt-cdn`, OAC-fronted by CloudFront
   at `cdn.databayt.org`. Objects under key `mkan/…` serve at
   `https://cdn.databayt.org/mkan/…` (stock already does). The **codebase** repo is
   the authority for *static* `mkan/*` assets (stock, placeholders) via its
   `cdn:sync`; mkan only writes *dynamic* user uploads under `mkan/uploads/*`.
2. **CORS** on the bucket — allow `PUT` from the app origin(s) so the browser
   can upload to the presigned URL.
3. **IAM** user/role scoped to `s3:PutObject` + `s3:DeleteObject` on
   `arn:aws:s3:::<bucket>/mkan/uploads/*` (delete is guarded to `uploads/` in
   `src/lib/s3.ts` so shared stock is never removed).
4. **Env** (central `.env`): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
   `AWS_REGION`, `AWS_S3_BUCKET`. (`NEXT_PUBLIC_CDN_DOMAIN` already set.)
   S3 hosts are already allow-listed: `next.config.ts` remotePatterns has
   `*.amazonaws.com`/`*.cloudfront.net`/`cdn.databayt.org`, and `proxy.ts` CSP
   `connect-src` has `*.amazonaws.com` for the presigned PUT.
5. **Pre-make stock variants** (two paths):
   - *Quick*: with env set (`AWS_S3_BUCKET=databayt-cdn`), run
     `pnpm tsx scripts/process-stock-images.ts` — uploads
     `mkan/stock/<base>-{sm,md,lg,original}.webp` and refreshes the blur map.
   - *Canonical*: stage the variants in the **codebase** repo under
     `public/cdn/mkan/stock/` and run its `cdn:sync` (codebase owns the static
     `mkan/*` mirror).
6. **Flip transforms off Vercel**: set `NEXT_PUBLIC_USE_CDN_VARIANTS=true`.
   `<PropertyImage>` then serves pre-made variants via the custom loader
   (`src/lib/image-loader.ts`) instead of `/_next/image`.

## Files

- **Serving/atom**: `components/atom/property-image.tsx`,
  `components/atom/property-image-fallback.tsx`, `lib/image-loader.ts`,
  `lib/listing-image.ts`, `lib/stock-blur-map.ts` (generated).
- **Storage/upload**: `lib/s3.ts`, `lib/cdn.ts` (`urlForKey`),
  `lib/upload-config.ts`, `lib/image-optimize.ts`, `lib/image-upload-client.ts`,
  `hooks/use-image-upload.ts`, `app/api/upload/presign/route.ts`,
  `app/api/upload/route.ts`.
- **Stock processing**: `scripts/process-stock-images.ts`.

## Optional follow-ups

- `/search` still shows a fullscreen spinner on load; a card-grid skeleton would
  match `/listings`.
- Store a per-photo blur for real uploads (client already can generate one via
  `generateBlurDataURL` in `lib/image-optimize.ts`).
