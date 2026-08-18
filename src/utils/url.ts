/**
 * URL Utilities for Dynamic Multi-Host, Docker & Public IP/Domain Deployment
 * Dynamically resolves direct image and thumbnail URLs to match the client's current
 * window.location.origin (e.g. http://27.112.79.121:3000, http://192.168.x.x:3000, or custom domains).
 */
import { ImageItem } from '../types';

export function formatDirectUrl(url?: string, storagePath?: string): string {
  if (storagePath) {
    const sanitized = storagePath
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return `${window.location.origin}/images/${sanitized}`;
  }
  if (!url) return '';
  if (url.startsWith('/')) {
    return `${window.location.origin}${url}`;
  }
  try {
    const parsed = new URL(url);
    // If it points to local/private IP or contains /images/ path from our app,
    // adapt it to the current browser origin (e.g., http://27.112.79.121:3000)
    if (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '0.0.0.0' ||
      parsed.pathname.startsWith('/images/')
    ) {
      return `${window.location.origin}${parsed.pathname}${parsed.search}`;
    }
  } catch (_) {
    // fallback
  }
  return url;
}

export function formatThumbnailUrl(url?: string, thumbnailPath?: string, storagePath?: string): string {
  if (thumbnailPath) {
    const sanitized = thumbnailPath
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
    return `${window.location.origin}/images/${sanitized}`;
  }
  if (url) {
    return formatDirectUrl(url);
  }
  if (storagePath) {
    return formatDirectUrl(undefined, storagePath);
  }
  return '';
}

/**
 * Normalizes an ImageItem object so all public URLs strictly adapt to active window origin
 */
export function normalizeImageUrls(image: ImageItem): ImageItem {
  if (!image) return image;
  return {
    ...image,
    directUrl: formatDirectUrl(image.directUrl, image.storagePath),
    thumbnailUrl: formatThumbnailUrl(image.thumbnailUrl, image.thumbnailPath, image.storagePath)
  };
}

