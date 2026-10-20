import * as SQLite from 'expo-sqlite';
import { Manga, Chapter, ReaderSettings } from '../types';

let dbInstance: SQLite.SQLiteDatabase | null = null;
let dbInitPromise: Promise<SQLite.SQLiteDatabase | null> | null = null;

// Memory fallback for environments where SQLite is unsupported or initializing
const memoryStore = {
  mangas: new Map<string, Manga>(),
  chapters: new Map<string, Chapter[]>(),
  settings: {
    mode: 'webtoon',
    theme: 'black',
    keepScreenOn: true,
    showPageNumbers: true,
    cropBorders: false,
    showNsfw: false,
    blurNsfwCovers: true,
  } as ReaderSettings,
};

export async function getDatabase(forceReset = false): Promise<SQLite.SQLiteDatabase | null> {
  if (dbInstance && !forceReset) return dbInstance;
  if (dbInitPromise && !forceReset) return dbInitPromise;

  dbInitPromise = (async () => {
    try {
      const db = await SQLite.openDatabaseAsync('manga_reader.db');
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS mangas (
          id TEXT PRIMARY KEY NOT NULL,
          title TEXT NOT NULL,
          altTitle TEXT,
          coverUrl TEXT NOT NULL,
          author TEXT,
          description TEXT,
          status TEXT,
          sourceId TEXT NOT NULL,
          sourceName TEXT NOT NULL,
          addedAt INTEGER NOT NULL,
          lastReadChapterId TEXT,
          lastReadAt INTEGER,
          isFavorite INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS chapters (
          id TEXT PRIMARY KEY NOT NULL,
          mangaId TEXT NOT NULL,
          chapterNumber REAL NOT NULL,
          title TEXT NOT NULL,
          releaseDate TEXT,
          isRead INTEGER DEFAULT 0,
          lastReadPageIndex INTEGER DEFAULT 0,
          totalPages INTEGER DEFAULT 0,
          sourceId TEXT NOT NULL,
          FOREIGN KEY (mangaId) REFERENCES mangas (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);

      // Safe migration in case table was created prior
      try {
        await db.execAsync(`ALTER TABLE mangas ADD COLUMN isFavorite INTEGER DEFAULT 0;`);
      } catch (e) {
        // Column already exists
      }

      try {
        await db.execAsync(`ALTER TABLE mangas ADD COLUMN altTitle TEXT;`);
      } catch (e) {
        // Column already exists
      }

      // Safe cleanup of any corrupted dflazy or blank placeholder covers from previous runs
      try {
        await db.execAsync(`
          UPDATE mangas 
          SET coverUrl = '' 
          WHERE coverUrl LIKE '%dflazy%' 
             OR coverUrl LIKE '%blank.gif%';
        `);
      } catch (e) {
        // Ignore
      }

      // Safe cleanup of any legacy external redirect chapters that kicked users out of the app
      try {
        await db.execAsync(`DELETE FROM chapters WHERE id LIKE 'ext::%';`);
      } catch (e) {
        // Ignore
      }

      dbInstance = db;
      return db;
    } catch (err) {
      console.warn('[Storage] SQLite initialization error:', err);
      dbInstance = null;
      return null;
    } finally {
      dbInitPromise = null;
    }
  })();

  return dbInitPromise;
}

/**
 * Executes a SQLite operation with automatic reconnection & retry on native NullPointerExceptions
 */
export async function safeDbRun<T>(
  action: (db: SQLite.SQLiteDatabase) => Promise<T>,
  fallback: T
): Promise<T> {
  let db = await getDatabase();
  if (!db) return fallback;

  try {
    return await action(db);
  } catch (err: any) {
    const msg = String(err?.message || err);
    if (
      msg.includes('NullPointerException') ||
      msg.includes('prepareAsync') ||
      msg.includes('closed') ||
      msg.includes('rejected')
    ) {
      console.warn('[Storage] Native database handle corrupted or rejected. Resetting connection and retrying...');
      dbInstance = null;
      db = await getDatabase(true);
      if (!db) return fallback;
      try {
        return await action(db);
      } catch (retryErr) {
        console.error('[Storage] Database retry failed:', retryErr);
        return fallback;
      }
    }
    console.error('[Storage] Database error:', err);
    return fallback;
  }
}

export async function getMangaById(id: string): Promise<Manga | null> {
  const mem = memoryStore.mangas.get(id);
  return safeDbRun(async (db) => {
    const row = await db.getFirstAsync<any>(
      `SELECT * FROM mangas WHERE id = ?;`,
      [id]
    );
    if (!row) return mem || null;
    return {
      id: row.id,
      title: row.title,
      altTitle: row.altTitle || '',
      coverUrl: row.coverUrl,
      author: row.author,
      description: row.description,
      status: row.status,
      sourceId: row.sourceId,
      sourceName: row.sourceName,
      addedAt: row.addedAt,
      lastReadChapterId: row.lastReadChapterId,
      lastReadAt: row.lastReadAt,
      isFavorite: Boolean(row.isFavorite),
    };
  }, mem || null);
}

export async function saveManga(manga: Manga): Promise<void> {
  const existing = await getMangaById(manga.id);

  // Preserve existing isFavorite if manga.isFavorite was not explicitly passed
  const resolvedIsFavorite =
    manga.isFavorite !== undefined
      ? Boolean(manga.isFavorite)
      : existing
      ? Boolean(existing.isFavorite)
      : false;

  const resolvedLastReadChapterId =
    manga.lastReadChapterId !== undefined
      ? manga.lastReadChapterId
      : existing?.lastReadChapterId;

  const resolvedLastReadAt =
    manga.lastReadAt !== undefined
      ? manga.lastReadAt
      : existing?.lastReadAt;

  const isIncomingCoverBad =
    !manga.coverUrl ||
    manga.coverUrl.includes('dflazy') ||
    manga.coverUrl.includes('blank.gif');

  const isExistingCoverBad =
    !existing?.coverUrl ||
    existing.coverUrl.includes('dflazy') ||
    existing.coverUrl.includes('blank.gif');

  let resolvedCoverUrl = manga.coverUrl;
  if (isIncomingCoverBad) {
    resolvedCoverUrl = !isExistingCoverBad ? existing!.coverUrl : '';
  }

  const merged: Manga = {
    ...existing,
    ...manga,
    altTitle: manga.altTitle || existing?.altTitle || '',
    coverUrl: resolvedCoverUrl,
    isFavorite: resolvedIsFavorite,
    lastReadChapterId: resolvedLastReadChapterId,
    lastReadAt: resolvedLastReadAt,
  };

  memoryStore.mangas.set(manga.id, merged);

  await safeDbRun(async (db) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO mangas (
        id, title, altTitle, coverUrl, author, description, status, sourceId, sourceName, addedAt, lastReadChapterId, lastReadAt, isFavorite
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
      [
        merged.id,
        merged.title,
        merged.altTitle || '',
        merged.coverUrl,
        merged.author || '',
        merged.description || '',
        merged.status || 'unknown',
        merged.sourceId,
        merged.sourceName,
        merged.addedAt,
        resolvedLastReadChapterId ?? null,
        resolvedLastReadAt ?? null,
        merged.isFavorite ? 1 : 0,
      ]
    );
  }, undefined);
}

export async function toggleFavorite(mangaId: string): Promise<boolean> {
  const existing = await getMangaById(mangaId);
  const nextState = existing ? !existing.isFavorite : true;

  if (existing) {
    await saveManga({ ...existing, isFavorite: nextState });
  } else {
    const mem = memoryStore.mangas.get(mangaId);
    if (mem) {
      await saveManga({ ...mem, isFavorite: nextState });
    }
  }
  return nextState;
}

export async function toggleBookmarkManga(manga: Manga): Promise<boolean> {
  const existing = await getMangaById(manga.id);
  const nextState = existing ? !existing.isFavorite : true;

  const merged: Manga = {
    ...(existing || {}),
    ...manga,
    isFavorite: nextState,
    addedAt: existing?.addedAt || Date.now(),
  };

  await saveManga(merged);
  return nextState;
}

export async function getBookmarkedMangaIds(): Promise<Set<string>> {
  const all = await getAllManga();
  return new Set(all.filter((m) => m.isFavorite).map((m) => m.id));
}

export async function getAllManga(): Promise<Manga[]> {
  const fallback = Array.from(memoryStore.mangas.values());
  return safeDbRun(async (db) => {
    const rows = await db.getAllAsync<any>(
      `SELECT m.*, 
        COUNT(CASE WHEN c.isRead = 0 THEN 1 END) as unreadCount,
        COUNT(c.id) as totalChapters
       FROM mangas m
       LEFT JOIN chapters c ON m.id = c.mangaId
       GROUP BY m.id
       ORDER BY m.isFavorite DESC, m.lastReadAt DESC, m.addedAt DESC;`
    );

    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      altTitle: r.altTitle || '',
      coverUrl: r.coverUrl,
      author: r.author,
      description: r.description,
      status: r.status,
      sourceId: r.sourceId,
      sourceName: r.sourceName,
      addedAt: r.addedAt,
      lastReadChapterId: r.lastReadChapterId,
      lastReadAt: r.lastReadAt,
      unreadCount: Number(r.unreadCount || 0),
      totalChapters: Number(r.totalChapters || 0),
      isFavorite: Boolean(r.isFavorite),
    }));
  }, fallback);
}

export async function saveChapters(mangaId: string, chapters: Chapter[]): Promise<void> {
  memoryStore.chapters.set(mangaId, chapters);
  await safeDbRun(async (db) => {
    for (const ch of chapters) {
      await db.runAsync(
        `INSERT OR REPLACE INTO chapters (
          id, mangaId, chapterNumber, title, releaseDate, isRead, lastReadPageIndex, totalPages, sourceId
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          ch.id,
          ch.mangaId,
          ch.chapterNumber,
          ch.title,
          ch.releaseDate || '',
          ch.isRead ? 1 : 0,
          ch.lastReadPageIndex || 0,
          ch.totalPages || 0,
          ch.sourceId,
        ]
      );
    }
  }, undefined);
}

export async function markAllChaptersReadForManga(
  mangaId: string,
  isRead = true
): Promise<void> {
  const memChapters = memoryStore.chapters.get(mangaId);
  if (memChapters) {
    for (const ch of memChapters) {
      ch.isRead = isRead;
    }
  }

  await safeDbRun(async (db) => {
    await db.runAsync(
      `UPDATE chapters SET isRead = ? WHERE mangaId = ?;`,
      [isRead ? 1 : 0, mangaId]
    );
  }, undefined);
}

export async function getChaptersForManga(mangaId: string): Promise<Chapter[]> {
  const fallback = (memoryStore.chapters.get(mangaId) || []).filter((c) => !c.id.startsWith('ext::'));
  return safeDbRun(async (db) => {
    const rows = await db.getAllAsync<any>(
      `SELECT * FROM chapters WHERE mangaId = ? AND id NOT LIKE 'ext::%' ORDER BY chapterNumber ASC;`,
      [mangaId]
    );

    return rows.map((r) => ({
      id: r.id,
      mangaId: r.mangaId,
      chapterNumber: r.chapterNumber,
      title: r.title,
      releaseDate: r.releaseDate,
      isRead: Boolean(r.isRead),
      lastReadPageIndex: r.lastReadPageIndex,
      totalPages: r.totalPages,
      sourceId: r.sourceId,
    }));
  }, fallback);
}

export async function updateProgress(
  mangaId: string,
  chapterId: string,
  pageIndex: number,
  isFinished: boolean
): Promise<void> {
  if (!mangaId || !chapterId) return;
  const now = Date.now();
  const safePageIndex = typeof pageIndex === 'number' && !isNaN(pageIndex) ? pageIndex : 0;
  const safeFinished = isFinished ? 1 : 0;

  // Update memory store
  const manga = memoryStore.mangas.get(mangaId);
  if (manga) {
    manga.lastReadChapterId = chapterId;
    manga.lastReadAt = now;
  }
  const chapters = memoryStore.chapters.get(mangaId);
  if (chapters) {
    const ch = chapters.find((c) => c.id === chapterId);
    if (ch) {
      ch.lastReadPageIndex = safePageIndex;
      if (isFinished) ch.isRead = true;
    }
  }

  await safeDbRun(async (db) => {
    await db.runAsync(
      `UPDATE mangas SET lastReadChapterId = ?, lastReadAt = ? WHERE id = ?;`,
      [chapterId, now, mangaId]
    );

    await db.runAsync(
      `UPDATE chapters SET lastReadPageIndex = ?, isRead = MAX(isRead, ?) WHERE id = ?;`,
      [safePageIndex, safeFinished, chapterId]
    );
  }, undefined);
}

export async function getSettings(): Promise<ReaderSettings> {
  return safeDbRun(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = 'reader_settings';`
    );
    if (row && row.value) {
      return JSON.parse(row.value);
    }
    return memoryStore.settings;
  }, memoryStore.settings);
}

export async function saveSettings(settings: Partial<ReaderSettings>): Promise<ReaderSettings> {
  const current = await getSettings();
  const updated = { ...current, ...settings };
  memoryStore.settings = updated;

  await safeDbRun(async (db) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES ('reader_settings', ?);`,
      [JSON.stringify(updated)]
    );
  }, undefined);

  return updated;
}

export interface AppBackupPayload {
  version: number;
  appName: string;
  createdAt: number;
  settings: ReaderSettings;
  customRepos: string[];
  mangas: {
    manga: Manga;
    chapters: Chapter[];
  }[];
}

export async function createBackupData(): Promise<string> {
  const allManga = await getAllManga();
  const settings = await getSettings();

  let customRepos: string[] = [];
  try {
    const db = await getDatabase();
    if (db) {
      const row = await db.getFirstAsync<{ value: string }>(
        `SELECT value FROM settings WHERE key = 'custom_extension_repos';`
      );
      if (row && row.value) customRepos = JSON.parse(row.value);
    }
  } catch (e) {
    // Ignore
  }

  const mangaEntries: { manga: Manga; chapters: Chapter[] }[] = [];
  for (const m of allManga) {
    const chapters = await getChaptersForManga(m.id);
    mangaEntries.push({
      manga: m,
      chapters,
    });
  }

  const payload: AppBackupPayload = {
    version: 1,
    appName: 'Miru Manga Reader',
    createdAt: Date.now(),
    settings,
    customRepos,
    mangas: mangaEntries,
  };

  return JSON.stringify(payload, null, 2);
}

export async function restoreBackupData(
  jsonString: string
): Promise<{ mangaCount: number; chapterCount: number }> {
  const data = JSON.parse(jsonString) as AppBackupPayload;
  if (!data || !Array.isArray(data.mangas)) {
    throw new Error('Invalid backup file format. Expected a valid Miru Manga backup JSON.');
  }

  // Restore settings if present
  if (data.settings) {
    await saveSettings(data.settings);
  }

  // Restore custom repos if present
  if (Array.isArray(data.customRepos) && data.customRepos.length > 0) {
    await safeDbRun(async (db) => {
      await db.runAsync(
        `INSERT OR REPLACE INTO settings (key, value) VALUES ('custom_extension_repos', ?);`,
        [JSON.stringify(data.customRepos)]
      );
    }, undefined);
  }

  let totalMangaRestored = 0;
  let totalChaptersRestored = 0;

  for (const item of data.mangas) {
    if (!item.manga || !item.manga.id) continue;
    await saveManga(item.manga);
    totalMangaRestored++;

    if (Array.isArray(item.chapters) && item.chapters.length > 0) {
      await saveChapters(item.manga.id, item.chapters);
      totalChaptersRestored += item.chapters.length;
    }
  }

  return {
    mangaCount: totalMangaRestored,
    chapterCount: totalChaptersRestored,
  };
}
