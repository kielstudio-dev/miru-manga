import { Platform } from 'react-native';

/**
 * Normalizes image URLs for cross-platform compatibility.
 * On Web in local development, routes through local CORS proxy if needed to bypass
 * browser Referer / CORS restrictions on third-party manga scanlation servers.
 * On Native (Android / iOS), returns the URL untouched as native OkHttp handles
 * Referer and User-Agent headers directly.
 */
export function getProxyImageUrl(url?: string | null): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (Platform.OS === 'web' && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
    // If the image is hosted on third-party aggregators that restrict web Referer or CORS:
    if (trimmed.includes('mangaread.org') || trimmed.includes('wp-content')) {
      return `http://127.0.0.1:8089/?url=${encodeURIComponent(trimmed)}`;
    }
  }
  return trimmed;
}
