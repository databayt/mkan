/**
 * Client-side S3 upload helper. Usage:
 *
 *   const uploaded = await uploadListingPhoto(file, { listingId });
 *   // uploaded.url is the persistent CloudFront/CDN URL
 *
 * Flow:
 *   1. Optimize the file in the browser (downscale ≤2048px, re-encode WebP).
 *   2. POST /api/upload/presign → short-lived presigned PUT + final CDN URL.
 *   3. PUT the bytes DIRECTLY to S3 (never through the Vercel function).
 *   4. POST /api/upload to attach the CDN URL to the listing's photoUrls.
 */

import { optimizeImageFile } from "@/lib/image-optimize";
import { validateImageFile } from "@/lib/upload-config";

export interface UploadedImage {
  url: string;
  key: string;
}

export async function uploadListingPhoto(
  file: File,
  opts: { listingId?: number | string } = {},
): Promise<UploadedImage> {
  const check = validateImageFile(file);
  if (!check.valid) throw new Error(check.error);

  // 1. Downscale + WebP in the browser so we never PUT a 10MB original.
  const optimized = await optimizeImageFile(file);

  // 2. Ask the server for a presigned PUT.
  const presignRes = await fetch("/api/upload/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: optimized.type, size: optimized.size }),
  });
  if (!presignRes.ok) {
    const body = await presignRes.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not prepare upload");
  }
  const { presignedUrl, finalUrl, key } = (await presignRes.json()) as {
    presignedUrl: string;
    finalUrl: string;
    key: string;
  };

  // 3. Upload bytes straight to S3.
  const putRes = await fetch(presignedUrl, {
    method: "PUT",
    headers: { "Content-Type": optimized.type },
    body: optimized,
  });
  if (!putRes.ok) {
    throw new Error(`Upload failed (${putRes.status})`);
  }

  // 4. Attach to the listing (the host wizard always supplies a listingId;
  //    ad-hoc/profile uploads may omit it and just use the returned URL).
  if (opts.listingId) {
    await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: finalUrl,
        key,
        listingId: opts.listingId,
        type: "listing",
      }),
    });
  }

  return { url: finalUrl, key };
}
