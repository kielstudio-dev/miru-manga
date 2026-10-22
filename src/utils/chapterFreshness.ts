import { Chapter } from '../types';

/**
 * Determines whether a chapter is within the active 2-3 day window of release or recent upload.
 * Manga aggregators (e.g. MangaRead, Madara-based sites) often upload chapters with jumbled or
 * misordered pages initially, then re-upload or correct the page order within 24-72 hours.
 * 
 * For chapters in this window:
 * 1. We re-fetch live chapter HTML and page lists directly from the source.
 * 2. We apply a dynamic window cache-buster to page image URLs so expo-image bypasses stale disk cache
 *    if the scanlation team replaced corrupted/scrambled images under identical filenames.
 */
export function isChapterInRecentWindow(chapter: Chapter, allChapters?: Chapter[]): boolean {
  if (!chapter) return false;

  // 1. Check chapter.releaseDate if provided by the source
  if (chapter.releaseDate) {
    const raw = chapter.releaseDate.trim().toLowerCase();

    // Relative strings within 1-3 days
    if (
      raw.includes('sec') ||
      raw.includes('min') ||
      raw.includes('hour') ||
      raw.includes('today') ||
      raw.includes('yesterday') ||
      raw.includes('1 day') ||
      raw.includes('2 day') ||
      raw.includes('3 day')
    ) {
      return true;
    }

    // Absolute date parsing
    const parsed = Date.parse(chapter.releaseDate);
    if (!isNaN(parsed)) {
      const ageMs = Date.now() - parsed;
      // 3 days in milliseconds: 3 * 24 * 60 * 60 * 1000 = 259,200,000
      if (ageMs >= 0 && ageMs < 3 * 24 * 60 * 60 * 1000) {
        return true;
      }
    }
  }

  // 2. Check position: if this is one of the top 3 newest chapters of an ongoing title
  if (allChapters && allChapters.length > 0) {
    const sortedDesc = [...allChapters].sort((a, b) => b.chapterNumber - a.chapterNumber);
    const top3 = sortedDesc.slice(0, 3);
    const isTop3 = top3.some((c) => c.id === chapter.id || c.chapterNumber === chapter.chapterNumber);
    if (isTop3) {
      return true;
    }
  }

  return false;
}

/**
 * Returns a cache-busting page URL for newly uploaded/recent chapters so that
 * when a scanlator fixes jumbled images on their server, the app downloads the corrected
 * images instead of serving stale disk cache.
 * 
 * Older chapters that are stable return the pristine URL to allow permanent disk caching.
 */
export function getFreshPageUrl(
  originalUrl: string,
  isRecent: boolean,
  forceTimestamp?: number
): string {
  if (!originalUrl) return originalUrl;
  const sep = originalUrl.includes('?') ? '&' : '?';

  // Explicit user-triggered reload (immediate network bypass)
  if (forceTimestamp) {
    return `${originalUrl}${sep}_t=${forceTimestamp}`;
  }

  // 2-3 day auto-rechecking window: cycles every 3 hours so scanlator fixes are pulled automatically
  if (isRecent) {
    const windowKey = Math.floor(Date.now() / (1000 * 60 * 60 * 3)); // 3 hours
    return `${originalUrl}${sep}_rv=${windowKey}`;
  }

  return originalUrl;
}
