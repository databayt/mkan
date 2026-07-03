// Server-only S3 helpers for mkan image uploads.
//
// Serving/URL construction reuses the canonical `cdn.ts` (`urlForKey`) so we
// never fork that cross-repo file. AWS credentials are OPTIONAL: when unset,
// every helper degrades gracefully (presign returns null, delete no-ops), so
// the app boots and renders without S3 configured. Uploads go live the moment
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_S3_BUCKET are present.
//
// Do not import this from a client component — it pulls @aws-sdk/* in.

import { randomUUID } from "crypto";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { urlForKey } from "@/lib/cdn";

const NAMESPACE = process.env.NEXT_PUBLIC_CDN_NAMESPACE?.trim() || "mkan";
const REGION = process.env.AWS_REGION || "us-east-1";
const UPLOAD_PREFIX = `${NAMESPACE}/uploads`;

let client: S3Client | null = null;

/** True when AWS credentials + bucket are configured for writes. */
export function isS3Configured(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_S3_BUCKET,
  );
}

function getS3Client(): S3Client | null {
  if (!isS3Configured()) return null;
  if (!client) {
    client = new S3Client({
      region: REGION,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return client;
}

/**
 * Build a tenant-scoped upload key under the product namespace, e.g.
 * `mkan/uploads/<userId>/<uuid>.webp`. Kept under `uploads/` so the delete
 * guard below can never touch shared `stock/` assets.
 */
export function buildUploadKey(userId: string, ext = "webp"): string {
  const safeExt = ext.replace(/[^a-z0-9]/gi, "").toLowerCase() || "webp";
  const safeUser = String(userId).replace(/[^a-z0-9_-]/gi, "") || "anon";
  return `${UPLOAD_PREFIX}/${safeUser}/${randomUUID()}.${safeExt}`;
}

/** Public CDN URL a stored key serves from (via the canonical cdn helper). */
export function publicUrlForKey(key: string): string {
  return urlForKey(key);
}

/**
 * Mint a short-lived presigned PUT so the browser uploads bytes straight to S3
 * (never through the Vercel function). Returns null when S3 is unconfigured.
 */
export async function presignUpload(opts: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<{ presignedUrl: string; finalUrl: string; key: string } | null> {
  const s3 = getS3Client();
  if (!s3) return null;
  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET!,
    Key: opts.key,
    ContentType: opts.contentType,
  });
  const presignedUrl = await getSignedUrl(s3, command, {
    expiresIn: opts.expiresIn ?? 300, // 5 minutes (org s3/presigned-urls rule)
  });
  return { presignedUrl, finalUrl: publicUrlForKey(opts.key), key: opts.key };
}

/** Extract the S3 key from a stored CDN/S3 URL (pathname sans leading slash). */
export function keyFromUrl(url: string): string | null {
  try {
    return new URL(url).pathname.replace(/^\/+/, "") || null;
  } catch {
    return null;
  }
}

/**
 * Best-effort delete of an uploaded object by its stored URL. Guarded to the
 * `uploads/` prefix so removing a listing photo can NEVER delete a shared
 * `stock/` image (which many listings reference). No-ops when S3 is unset.
 */
export async function deleteObjectByUrl(url: string): Promise<void> {
  const s3 = getS3Client();
  if (!s3) return;
  const key = keyFromUrl(url);
  if (!key || !key.startsWith(`${UPLOAD_PREFIX}/`)) return;
  await s3
    .send(new DeleteObjectCommand({ Bucket: process.env.AWS_S3_BUCKET!, Key: key }))
    .catch(() => undefined);
}
