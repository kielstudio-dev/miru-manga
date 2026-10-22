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
    // Avoid double-proxying or proxying localhost/blob
    if (trimmed.includes('127.0.0.1:8089') || trimmed.includes('localhost:8089') || trimmed.startsWith('blob:')) {
      return trimmed;
    }
    // Route all remote extension and 18+ images through local dev proxy on Web to bypass browser CORS / hotlink protection
    return `http://127.0.0.1:8089/?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
}
