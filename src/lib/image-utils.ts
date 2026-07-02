import { cdn } from "@/lib/cdn";
/**
 * Image utility functions for handling image URLs and fallbacks
 */

// Default fallback images
export const DEFAULT_IMAGES = {
  property: cdn.product("images/default-property.svg"),
  avatar: cdn.product("images/default-avatar.svg"),
  placeholder: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAwIiBoZWlnaHQ9IjMwMCIgZmlsbD0iI2U1ZTdlYiIvPjx0ZXh0IHRleHQtYW5jaG9yPSJtaWRkbGUiIHg9IjIwMCIgeT0iMTUwIiBzdHlsZT0iZmlsbDojOTNhM2IzO2ZvbnQtd2VpZ2h0OmJvbGQ7Zm9udC1zaXplOjIwcHg7Zm9udC1mYW1pbHk6QXJpYWwsSGVsdmV0aWNhLHNhbnMtc2VyaWY7ZG9taW5hbnQtYmFzZWxpbmU6Y2VudHJhbCI+SW1hZ2UgTm90IEF2YWlsYWJsZTwvdGV4dD48L3N2Zz4=',
};

// Placeholder image URLs from various services
export const PLACEHOLDER_SERVICES = {
  unsplash: (width: number, height: number) =>
    `https://source.unsplash.com/random/${width}x${height}/?apartment,house`,
  picsum: (width: number, height: number) =>
    `https://picsum.photos/${width}/${height}`,
  placehold: (width: number, height: number) =>
    `https://via.placeholder.com/${width}x${height}/e5e7eb/93a3b3?text=Property`,
};

/**
 * Get a fallback image URL based on dimensions
 */
export function getFallbackImage(
  width = 400,
  height = 300,
  type: 'property' | 'avatar' | 'placeholder' = 'property'
): string {
  // Try to use local default images first
  if (type === 'avatar') {
    return DEFAULT_IMAGES.avatar;
  }

  if (type === 'property') {
    return DEFAULT_IMAGES.property;
  }

  // Return base64 placeholder as last resort
  return DEFAULT_IMAGES.placeholder;
}

/**
 * Validate and sanitize image URL
 */
export function sanitizeImageUrl(url: string | null | undefined): string {
  if (!url) {
    return getFallbackImage();
  }

  // Remove any potential XSS attempts
  const sanitized = url.trim();

  // Check if it's a valid URL or path
  if (
    sanitized.startsWith('http://') ||
    sanitized.startsWith('https://') ||
    sanitized.startsWith('/') ||
    sanitized.startsWith('data:image')
  ) {
    return sanitized;
  }

  // If ImageKit URL endpoint is configured, assume it's an ImageKit path
  if (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT) {
    return `${process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT}/${sanitized}`;
  }

  return getFallbackImage();
}

/**
 * Process an array of image URLs with fallbacks
 */
export function processImageUrls(
  urls: string[] | null | undefined,
  minImages = 1
): string[] {
  const processed: string[] = [];

  if (urls && Array.isArray(urls)) {
    urls.forEach((url) => {
      const sanitized = sanitizeImageUrl(url);
      if (sanitized) {
        processed.push(sanitized);
      }
    });
  }

  // Ensure minimum number of images
  while (processed.length < minImages) {
    processed.push(getFallbackImage());
  }

  return processed;
}

/**
 * Get ImageKit optimized URL with transformations
 */
export function getOptimizedImageUrl(
  url: string,
  options: {
    width?: number;
    height?: number;
    quality?: number;
    format?: 'auto' | 'webp' | 'jpg' | 'png';
  } = {}
): string {
  // If not an ImageKit URL, return as-is
  if (!url.includes('imagekit.io')) {
    return url;
  }

  const { width, height, quality = 80, format = 'auto' } = options;
  const transformations: string[] = [];

  if (width) transformations.push(`w-${width}`);
  if (height) transformations.push(`h-${height}`);
  if (quality) transformations.push(`q-${quality}`);
  if (format) transformations.push(`f-${format}`);

  if (transformations.length === 0) {
    return url;
  }

  // Add transformations to ImageKit URL
  const urlParts = url.split('/');
  const filename = urlParts.pop();
  const transformation = `tr:${transformations.join(',')}`;

  return `${urlParts.join('/')}/${transformation}/${filename}`;
}

/**
 * Handle image loading errors
 */
export function handleImageError(
  event: React.SyntheticEvent<HTMLImageElement>,
  fallbackUrl?: string
): void {
  const target = event.target as HTMLImageElement;

  // Prevent infinite loop by checking if we're already showing fallback
  if (target.dataset.fallbackLoaded === 'true') {
    return;
  }

  target.dataset.fallbackLoaded = 'true';
  target.src = fallbackUrl || getFallbackImage();
}