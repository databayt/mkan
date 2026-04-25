/**
 * Client-side ImageKit upload helpers. Usage:
 *
 *   const uploaded = await uploadListingPhoto(file, { listingId });
 *   // uploaded.url is the persistent ImageKit URL
 *
 * Flow: fetch a signed token from `/api/upload/signature`, POST the file +
 * signature directly to ImageKit's upload endpoint, then POST the resulting
 * URL to `/api/upload` which attaches it to the listing's `photoUrls`.
 */

export interface UploadedImage {
  fileId: string;
  url: string;
  filePath: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export async function uploadListingPhoto(
  file: File,
  opts: { listingId?: number | string; folder?: string } = {}
): Promise<UploadedImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image must be smaller than 10MB");
  }

  // 1. Ask the server for a signed upload token.
  const sigRes = await fetch("/api/upload/signature", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, folder: opts.folder }),
  });
  if (!sigRes.ok) {
    const body = await sigRes.json().catch(() => ({}));
    throw new Error(body.error ?? "Could not sign upload");
  }
  const { signature, expire, token, publicKey } = (await sigRes.json()) as {
    signature: string;
    expire: number;
    token: string;
    publicKey: string;
    urlEndpoint: string;
    folder: string;
  };

  // 2. Upload directly to ImageKit from the browser.
  const fd = new FormData();
  fd.append("file", file);
  fd.append("fileName", file.name);
  fd.append("publicKey", publicKey);
  fd.append("signature", signature);
  fd.append("expire", String(expire));
  fd.append("token", token);
  fd.append("folder", opts.folder ?? "/listings");
  fd.append("useUniqueFileName", "true");

  const uploadRes = await fetch("https://upload.imagekit.io/api/v1/files/upload", {
    method: "POST",
    body: fd,
  });
  if (!uploadRes.ok) {
    const body = await uploadRes.text();
    throw new Error(`ImageKit rejected upload: ${body.slice(0, 200)}`);
  }
  const result = (await uploadRes.json()) as UploadedImage;

  // 3. Attach to the listing (if supplied). The host wizard always supplies
  // a listingId because photos are part of a draft. Missing listingId is
  // allowed for profile / ad-hoc uploads.
  if (opts.listingId) {
    await fetch("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileId: result.fileId,
        url: result.url,
        filePath: result.filePath,
        listingId: opts.listingId,
        type: "listing",
      }),
    });
  }

  return result;
}
