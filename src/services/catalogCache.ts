import { Manga } from '../types';
import { safeDbRun } from './storage';

interface CacheEntry {
  mangas: Manga[];
  timestamp: number;
}

// In-memory cache for 0ms instantaneous tab switching & browsing
const memoryCache = new Map<string, CacheEntry>();

export async function initCatalogCacheTable(): Promise<void> {
  await safeDbRun(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS catalog_cache (
        cacheKey TEXT PRIMARY KEY NOT NULL,
        dataJson TEXT NOT NULL,
        cachedAt INTEGER NOT NULL
      );
    `);
  }, undefined);
}

function getCacheKey(sourceId: string, category: string, page: number): string {
  return `${sourceId}::${category || 'default'}::page_${page}`;
}

/**
 * Retrieve cached catalog results for ultra-fast, zero-lag loading.
 */
export async function getCachedCatalog(
  sourceId: string,
  category: string,
  page: number
): Promise<Manga[] | null> {
  const key = getCacheKey(sourceId, category, page);

  // 1. Check in-memory cache (0ms)
  const mem = memoryCache.get(key);
  if (mem && mem.mangas.length > 0) {
    return mem.mangas;
  }

  // 2. Check persistent SQLite cache (<10ms)
  return safeDbRun(async (db) => {
    await initCatalogCacheTable();
    const row = await db.getFirstAsync<{ dataJson: string; cachedAt: number }>(
      `SELECT dataJson, cachedAt FROM catalog_cache WHERE cacheKey = ?;`,
      [key]
    );
    if (row && row.dataJson) {
      try {
        const parsed: Manga[] = JSON.parse(row.dataJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          memoryCache.set(key, { mangas: parsed, timestamp: row.cachedAt });
          return parsed;
        }
      } catch (e) {
        // Parse error
      }
    }
    return null;
  }, null);
}

/**
 * Save fresh catalog results into memory and SQLite.
 */
export async function setCachedCatalog(
  sourceId: string,
  category: string,
  page: number,
  mangas: Manga[]
): Promise<void> {
  if (!mangas || mangas.length === 0) return;
  const key = getCacheKey(sourceId, category, page);
  const now = Date.now();

  memoryCache.set(key, { mangas, timestamp: now });

  await safeDbRun(async (db) => {
    await initCatalogCacheTable();
    await db.runAsync(
      `INSERT OR REPLACE INTO catalog_cache (cacheKey, dataJson, cachedAt) VALUES (?, ?, ?);`,
      [key, JSON.stringify(mangas), now]
    );
  }, undefined);
}

/**
 * Clear cache for a specific source
 */
export async function clearCatalogCacheForSource(sourceId: string): Promise<void> {
  for (const k of memoryCache.keys()) {
    if (k.startsWith(`${sourceId}::`)) {
      memoryCache.delete(k);
    }
  }

  await safeDbRun(async (db) => {
    await initCatalogCacheTable();
    await db.runAsync(`DELETE FROM catalog_cache WHERE cacheKey LIKE ?;`, [`${sourceId}::%`]);
  }, undefined);
}
