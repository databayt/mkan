// Client-side image optimization (mirror hogwarts use-image-optimization).
//
// Runs in the browser via createImageBitmap + Canvas: downscale to a max edge
// and re-encode to WebP BEFORE upload, so hosts never ship 10MB originals to
// S3. Also generates a tiny base64 blur for the <Image> placeholder. Every
// path fails soft — a broken optimize returns the original file, never blocks
// the upload.

export interface OptimizeOptions {
  /** Longest edge in px after downscale. */
  maxEdge?: number;
  /** WebP quality 0..1. */
  quality?: number;
}

export async function optimizeImageFile(
  file: File,
  opts: OptimizeOptions = {},
): Promise<File> {
  const maxEdge = opts.maxEdge ?? 2048;
  const quality = opts.quality ?? 0.85;

  if (!file.type.startsWith("image/")) return file;
  // Small files already in WebP aren't worth the processing cost.
  if (file.size < 100 * 1024 && file.type === "image/webp") return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", quality),
    );
    if (!blob) return file;

    const name = file.name.replace(/\.[^/.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp" });
  } catch {
    return file;
  }
}

/** Tiny base64 WebP for use as a next/image `blurDataURL`. Null on failure. */
export async function generateBlurDataURL(
  file: File,
  edge = 16,
): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = edge / Math.max(bitmap.width, bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();
    return canvas.toDataURL("image/webp", 0.5);
  } catch {
    return null;
  }
}
