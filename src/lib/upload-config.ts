// Shared image-upload constraints, moved off the retired ImageKit lib so both
// client (validation before upload) and server (defensive re-check) import from
// a neutral module. Isomorphic — no AWS/ImageKit deps.

export const IMAGE_UPLOAD_CONFIG = {
  /** Hard ceiling on the ORIGINAL file, before client-side WebP optimization. */
  maxFileSize: 10 * 1024 * 1024, // 10MB
  allowedTypes: ["image/jpeg", "image/jpg", "image/png", "image/webp"],
} as const;

export function validateImageFile(file: {
  size: number;
  type: string;
}): { valid: boolean; error?: string } {
  if (file.size > IMAGE_UPLOAD_CONFIG.maxFileSize) {
    return {
      valid: false,
      error: `File size exceeds ${IMAGE_UPLOAD_CONFIG.maxFileSize / (1024 * 1024)}MB limit`,
    };
  }
  if (!(IMAGE_UPLOAD_CONFIG.allowedTypes as readonly string[]).includes(file.type)) {
    return {
      valid: false,
      error: `File type ${file.type} is not allowed. Allowed types: ${IMAGE_UPLOAD_CONFIG.allowedTypes.join(", ")}`,
    };
  }
  return { valid: true };
}
