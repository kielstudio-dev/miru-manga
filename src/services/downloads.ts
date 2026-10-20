import * as FileSystem from 'expo-file-system/legacy';
import { Manga, Chapter, Page } from '../types';
import { sourceRegistry } from './sources/registry';
import { getDatabase, safeDbRun, saveManga, getAllManga } from './storage';

export interface DownloadProgress {
  chapterId: string;
  downloaded: number;
  total: number;
  status: 'pending' | 'downloading' | 'completed' | 'failed';
}

export interface DownloadedChapterRecord {
  chapterId: string;
  mangaId: string;
  chapterNumber: number;
  title: string;
  totalPages: number;
  downloadedAt: number;
  localPages: Page[];
}

// In-memory fallback
const memoryDownloads = new Map<string, DownloadedChapterRecord>();

// Ensure downloads directory exists
async function getDownloadsDir(): Promise<string> {
  const baseDir = `${FileSystem.documentDirectory}vortex_downloads/`;
  try {
    const info = await FileSystem.getInfoAsync(baseDir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(baseDir, { intermediates: true });
    }
  } catch (err) {
    console.warn('[Downloads] Error creating base downloads dir:', err);
  }
  return baseDir;
}

// Initialize SQLite table for downloads
export async function initDownloadsTable(): Promise<void> {
  await safeDbRun(async (db) => {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS downloaded_chapters (
        chapterId TEXT PRIMARY KEY NOT NULL,
        mangaId TEXT NOT NULL,
        chapterNumber REAL NOT NULL,
        title TEXT NOT NULL,
        totalPages INTEGER NOT NULL,
        downloadedAt INTEGER NOT NULL,
        localPagesJson TEXT NOT NULL
      );
    `);
  }, undefined);
}

// Check if a chapter is downloaded
export async function isChapterDownloaded(chapterId: string): Promise<boolean> {
  if (memoryDownloads.has(chapterId)) return true;
  return safeDbRun(async (db) => {
    await initDownloadsTable();
    const row = await db.getFirstAsync<{ chapterId: string }>(
      `SELECT chapterId FROM downloaded_chapters WHERE chapterId = ?;`,
      [chapterId]
    );
    return Boolean(row);
  }, false);
}

// Get downloaded pages for offline reading
export async function getDownloadedPages(chapterId: string): Promise<Page[] | null> {
  const inMem = memoryDownloads.get(chapterId);
  if (inMem && inMem.localPages.length > 0) return inMem.localPages;

  return safeDbRun(async (db) => {
    await initDownloadsTable();
    const row = await db.getFirstAsync<{ localPagesJson: string }>(
      `SELECT localPagesJson FROM downloaded_chapters WHERE chapterId = ?;`,
      [chapterId]
    );
    if (row && row.localPagesJson) {
      return JSON.parse(row.localPagesJson);
    }
    return null;
  }, null);
}

// Download a chapter for offline reading
export async function downloadChapter(
  manga: Manga,
  chapter: Chapter,
  onProgress?: (progress: DownloadProgress) => void
): Promise<DownloadedChapterRecord> {
  await initDownloadsTable();
  const baseDir = await getDownloadsDir();
  const safeMangaId = encodeURIComponent(manga.id).replace(/%/g, '_');
  const safeChapterId = encodeURIComponent(chapter.id).replace(/%/g, '_');
  const chapterDir = `${baseDir}${safeMangaId}/${safeChapterId}/`;

  await FileSystem.makeDirectoryAsync(chapterDir, { intermediates: true });

  // 1. Fetch online page URLs
  const source = sourceRegistry.get(chapter.sourceId) || sourceRegistry.getLocalSource();
  const onlinePages = await source.getPageList(chapter.id);
  const total = onlinePages.length;

  if (onProgress) {
    onProgress({ chapterId: chapter.id, downloaded: 0, total, status: 'downloading' });
  }

  const imageHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
  if (onlinePages[0]?.url.includes('mangaread')) {
    imageHeaders.Referer = 'https://www.mangaread.org/';
  }

  const localPages: Page[] = [];

  for (let i = 0; i < onlinePages.length; i++) {
    const p = onlinePages[i];
    const cleanUrl = p.url.split('?')[0];
    const ext = cleanUrl.includes('.') ? cleanUrl.split('.').pop() : 'jpg';
    const filename = `page_${String(i).padStart(3, '0')}.${ext}`;
    const destinationUri = `${chapterDir}${filename}`;

    try {
      const info = await FileSystem.getInfoAsync(destinationUri);
      if (!info.exists) {
        await FileSystem.downloadAsync(p.url, destinationUri, {
          headers: imageHeaders,
        });
      }
      localPages.push({
        index: i,
        url: destinationUri,
      });
    } catch (pageErr) {
      console.warn(`[Downloads] Failed to download page ${i}:`, pageErr);
      // Fallback to online URL if single page failed
      localPages.push(p);
    }

    if (onProgress) {
      onProgress({
        chapterId: chapter.id,
        downloaded: i + 1,
        total,
        status: 'downloading',
      });
    }
  }

  const record: DownloadedChapterRecord = {
    chapterId: chapter.id,
    mangaId: manga.id,
    chapterNumber: chapter.chapterNumber,
    title: chapter.title,
    totalPages: localPages.length,
    downloadedAt: Date.now(),
    localPages,
  };

  memoryDownloads.set(chapter.id, record);

  // Save manga in DB so it shows in library
  await saveManga(manga);

  // Save download record in SQLite
  await safeDbRun(async (db) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO downloaded_chapters (
        chapterId, mangaId, chapterNumber, title, totalPages, downloadedAt, localPagesJson
      ) VALUES (?, ?, ?, ?, ?, ?, ?);`,
      [
        record.chapterId,
        record.mangaId,
        record.chapterNumber,
        record.title,
        record.totalPages,
        record.downloadedAt,
        JSON.stringify(record.localPages),
      ]
    );
  }, undefined);

  if (onProgress) {
    onProgress({ chapterId: chapter.id, downloaded: total, total, status: 'completed' });
  }

  return record;
}

// Delete a downloaded chapter
export async function deleteDownloadedChapter(chapterId: string, mangaId?: string): Promise<void> {
  memoryDownloads.delete(chapterId);
  try {
    const baseDir = await getDownloadsDir();
    if (mangaId) {
      const safeMangaId = encodeURIComponent(mangaId).replace(/%/g, '_');
      const safeChapterId = encodeURIComponent(chapterId).replace(/%/g, '_');
      const chapterDir = `${baseDir}${safeMangaId}/${safeChapterId}/`;
      await FileSystem.deleteAsync(chapterDir, { idempotent: true });
    }
  } catch (err) {
    console.warn('[Downloads] Could not delete chapter files from disk:', err);
  }
  await safeDbRun(async (db) => {
    await db.runAsync(`DELETE FROM downloaded_chapters WHERE chapterId = ?;`, [chapterId]);
  }, undefined);
}

// Get all downloaded chapter IDs for a manga
export async function getDownloadedChapterIdsForManga(mangaId: string): Promise<string[]> {
  const memIds = Array.from(memoryDownloads.values())
    .filter((d) => d.mangaId === mangaId)
    .map((d) => d.chapterId);

  return safeDbRun(async (db) => {
    await initDownloadsTable();
    const rows = await db.getAllAsync<{ chapterId: string }>(
      `SELECT chapterId FROM downloaded_chapters WHERE mangaId = ?;`,
      [mangaId]
    );
    return rows.map((r) => r.chapterId);
  }, memIds);
}

// Get all downloaded chapter records for a specific manga
export async function getDownloadedChaptersForManga(mangaId: string): Promise<DownloadedChapterRecord[]> {
  const mem = Array.from(memoryDownloads.values()).filter((d) => d.mangaId === mangaId);
  return safeDbRun(async (db) => {
    await initDownloadsTable();
    const rows = await db.getAllAsync<any>(
      `SELECT chapterId, mangaId, chapterNumber, title, totalPages, downloadedAt, localPagesJson
       FROM downloaded_chapters WHERE mangaId = ? ORDER BY chapterNumber DESC;`,
      [mangaId]
    );
    return rows.map((r) => ({
      chapterId: r.chapterId,
      mangaId: r.mangaId,
      chapterNumber: Number(r.chapterNumber),
      title: r.title,
      totalPages: Number(r.totalPages),
      downloadedAt: Number(r.downloadedAt),
      localPages: r.localPagesJson ? JSON.parse(r.localPagesJson) : [],
    }));
  }, mem);
}

// Get all downloaded chapter records across all manga
export async function getAllDownloadedChapters(): Promise<DownloadedChapterRecord[]> {
  const mem = Array.from(memoryDownloads.values());
  return safeDbRun(async (db) => {
    await initDownloadsTable();
    const rows = await db.getAllAsync<any>(
      `SELECT chapterId, mangaId, chapterNumber, title, totalPages, downloadedAt, localPagesJson
       FROM downloaded_chapters ORDER BY downloadedAt DESC;`
    );
    return rows.map((r) => ({
      chapterId: r.chapterId,
      mangaId: r.mangaId,
      chapterNumber: Number(r.chapterNumber),
      title: r.title,
      totalPages: Number(r.totalPages),
      downloadedAt: Number(r.downloadedAt),
      localPages: r.localPagesJson ? JSON.parse(r.localPagesJson) : [],
    }));
  }, mem);
}

// Delete all downloaded chapters for a specific manga
export async function deleteDownloadsForManga(mangaId: string): Promise<void> {
  for (const [id, rec] of memoryDownloads.entries()) {
    if (rec.mangaId === mangaId) {
      memoryDownloads.delete(id);
    }
  }
  try {
    const baseDir = await getDownloadsDir();
    const safeMangaId = encodeURIComponent(mangaId).replace(/%/g, '_');
    const mangaDir = `${baseDir}${safeMangaId}/`;
    await FileSystem.deleteAsync(mangaDir, { idempotent: true });
  } catch (err) {
    console.warn('[Downloads] Could not delete manga dir from disk:', err);
  }
  await safeDbRun(async (db) => {
    await db.runAsync(`DELETE FROM downloaded_chapters WHERE mangaId = ?;`, [mangaId]);
  }, undefined);
}

// Delete all offline downloaded chapters from device
export async function deleteAllDownloads(): Promise<void> {
  memoryDownloads.clear();
  try {
    const baseDir = await getDownloadsDir();
    await FileSystem.deleteAsync(baseDir, { idempotent: true });
    await getDownloadsDir();
  } catch (err) {
    console.warn('[Downloads] Could not clear base downloads dir:', err);
  }
  await safeDbRun(async (db) => {
    await db.runAsync(`DELETE FROM downloaded_chapters;`);
  }, undefined);
}

// Calculate offline storage stats
export async function getDownloadsStorageStats(): Promise<{
  chapterCount: number;
  totalPages: number;
  estimatedSizeMb: number;
}> {
  return safeDbRun(async (db) => {
    await initDownloadsTable();
    const row = await db.getFirstAsync<{ count: number; totalPages: number }>(
      `SELECT COUNT(*) as count, SUM(totalPages) as totalPages FROM downloaded_chapters;`
    );
    const chapterCount = Number(row?.count || 0);
    const totalPages = Number(row?.totalPages || 0);
    const estimatedSizeMb = Math.round(totalPages * 0.45 * 10) / 10;
    return { chapterCount, totalPages, estimatedSizeMb };
  }, {
    chapterCount: memoryDownloads.size,
    totalPages: Array.from(memoryDownloads.values()).reduce((sum, c) => sum + c.totalPages, 0),
    estimatedSizeMb: Math.round(Array.from(memoryDownloads.values()).reduce((sum, c) => sum + c.totalPages, 0) * 0.45 * 10) / 10,
  });
}

// Get all manga that have at least one downloaded chapter
export async function getDownloadedMangaList(): Promise<Manga[]> {
  const allMangas = await getAllManga();
  return safeDbRun(async (db) => {
    await initDownloadsTable();
    const rows = await db.getAllAsync<{ mangaId: string }>(
      `SELECT DISTINCT mangaId FROM downloaded_chapters;`
    );
    const downloadedIds = new Set(rows.map((r) => r.mangaId));
    return allMangas.filter((m) => downloadedIds.has(m.id));
  }, allMangas.filter((m) => memoryDownloads.has(m.id)));
}

