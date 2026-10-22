import { Manga, Chapter, ReaderSettings } from '../types';

// Persistent localStorage keys
const STORAGE_KEY_MANGAS = 'miru_mangas_v1';
const STORAGE_KEY_CHAPTERS = 'miru_chapters_v1';
const STORAGE_KEY_SETTINGS = 'miru_settings_v1';

// Initial default settings
const defaultSettings: ReaderSettings = {
  mode: 'webtoon',
  theme: 'black',
  keepScreenOn: true,
  showPageNumbers: true,
  cropBorders: false,
  showNsfw: false,
  blurNsfwCovers: true,
};

function loadFromStorage<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined' || !window.localStorage) {
    return defaultValue;
  }
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw) as T;
  } catch (err) {
    console.warn(`[StorageWeb] Error reading ${key} from localStorage:`, err);
    return defaultValue;
  }
}

function saveToStorage<T>(key: string, value: T): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    return;
  }
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`[StorageWeb] Error writing ${key} to localStorage:`, err);
  }
}

// In-memory cache hydrated from localStorage
const memoryStore = {
  mangas: new Map<string, Manga>(),
  chapters: new Map<string, Chapter[]>(),
  settings: defaultSettings,
};

// Hydrate memoryStore on module load
try {
  const savedMangas = loadFromStorage<Record<string, Manga>>(STORAGE_KEY_MANGAS, {});
  for (const [id, m] of Object.entries(savedMangas)) {
    memoryStore.mangas.set(id, m);
  }

  const savedChapters = loadFromStorage<Record<string, Chapter[]>>(STORAGE_KEY_CHAPTERS, {});
  for (const [id, chs] of Object.entries(savedChapters)) {
    memoryStore.chapters.set(id, chs);
  }

  memoryStore.settings = {
    ...defaultSettings,
    ...loadFromStorage<Partial<ReaderSettings>>(STORAGE_KEY_SETTINGS, {}),
  };
} catch (e) {
  console.warn('[StorageWeb] Hydration warning:', e);
}

function persistMangas() {
  const obj: Record<string, Manga> = {};
  for (const [k, v] of memoryStore.mangas.entries()) {
    obj[k] = v;
  }
  saveToStorage(STORAGE_KEY_MANGAS, obj);
}

function persistChapters() {
  const obj: Record<string, Chapter[]> = {};
  for (const [k, v] of memoryStore.chapters.entries()) {
    obj[k] = v;
  }
  saveToStorage(STORAGE_KEY_CHAPTERS, obj);
}

const mockWebDb = {
  getFirstAsync: async <T>(query: string, params: any[] = []): Promise<T | null> => {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const match = query.match(/key\s*=\s*'([^']+)'/i);
    const key = match ? match[1] : (params && params[0]);
    if (key) {
      const val = window.localStorage.getItem(`miru_setting_${key}`);
      return val ? ({ value: val } as T) : null;
    }
    return null;
  },
  runAsync: async (query: string, params: any[] = []): Promise<any> => {
    if (typeof window === 'undefined' || !window.localStorage) return { changes: 1 };
    if (query.toLowerCase().includes('settings') && params && params.length >= 2) {
      const key = params[0];
      const val = params[1];
      window.localStorage.setItem(`miru_setting_${key}`, String(val));
    }
    return { changes: 1 };
  },
  getAllAsync: async <T>(_query: string, _params: any[] = []): Promise<T[]> => {
    return [];
  },
  execAsync: async (_query: string): Promise<void> => {},
};

/**
 * Web compatibility shim for getDatabase (SQLite is not needed on web)
 */
export async function getDatabase(_forceReset = false): Promise<any> {
  return mockWebDb;
}

/**
 * Web compatibility shim for safeDbRun
 */
export async function safeDbRun<T>(action: (db: any) => Promise<T>, fallback: T): Promise<T> {
  try {
    return await action(mockWebDb);
  } catch (err) {
    console.warn('[StorageWeb safeDbRun] error:', err);
    return fallback;
  }
}

export async function getMangaById(id: string): Promise<Manga | null> {
  return memoryStore.mangas.get(id) || null;
}

export async function saveManga(manga: Manga): Promise<void> {
  const existing = memoryStore.mangas.get(manga.id);

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

  const merged: Manga = {
    ...existing,
    ...manga,
    altTitle: manga.altTitle || existing?.altTitle || '',
    isFavorite: resolvedIsFavorite,
    lastReadChapterId: resolvedLastReadChapterId,
    lastReadAt: resolvedLastReadAt,
  };

  memoryStore.mangas.set(manga.id, merged);
  persistMangas();
}

export async function toggleFavorite(mangaId: string): Promise<boolean> {
  const existing = memoryStore.mangas.get(mangaId);
  const nextState = existing ? !existing.isFavorite : true;

  if (existing) {
    await saveManga({ ...existing, isFavorite: nextState });
  }
  return nextState;
}

export async function toggleBookmarkManga(manga: Manga): Promise<boolean> {
  const existing = memoryStore.mangas.get(manga.id);
  const nextState = existing ? !existing.isFavorite : true;

  const merged: Manga = {
    ...(existing || {}),
    ...manga,
    isFavorite: nextState,
    addedAt: existing?.addedAt || Date.now(),
  };

  await saveManga(merged);

  // Background cloud sync to Supabase if available
  setTimeout(() => {
    import('./cloudSync')
      .then(({ syncSingleBookmarkToCloud }) => {
        syncSingleBookmarkToCloud(merged, nextState);
      })
      .catch(() => {});
  }, 0);

  return nextState;
}

export async function getBookmarkedMangaIds(): Promise<Set<string>> {
  const all = await getAllManga();
  const set = new Set<string>();
  for (const m of all) {
    if (m.isFavorite) {
      if (m.id) set.add(m.id);
      if (m.title) set.add(`title::${m.title.toLowerCase().trim()}`);
    }
  }
  return set;
}

export async function getAllManga(): Promise<Manga[]> {
  const list = Array.from(memoryStore.mangas.values());
  // Sort favorites first, then by lastReadAt, then by addedAt
  return list.sort((a, b) => {
    if (a.isFavorite && !b.isFavorite) return -1;
    if (!a.isFavorite && b.isFavorite) return 1;
    return (b.lastReadAt || b.addedAt || 0) - (a.lastReadAt || a.addedAt || 0);
  });
}

export async function saveChapters(
  mangaId: string,
  chapters: Chapter[],
  isExplicitUserAction: boolean = false
): Promise<void> {
  const existingList = memoryStore.chapters.get(mangaId) || [];
  const existingById = new Map<string, Chapter>();
  const existingByNum = new Map<number, Chapter>();
  for (const c of existingList) {
    existingById.set(c.id, c);
    existingByNum.set(c.chapterNumber, c);
  }

  const mergedList: Chapter[] = chapters.map((ch) => {
    if (isExplicitUserAction) return ch;
    const prev = existingById.get(ch.id) || existingByNum.get(ch.chapterNumber);
    return {
      ...ch,
      isRead: Boolean(ch.isRead || prev?.isRead),
      lastReadPageIndex:
        ch.lastReadPageIndex && ch.lastReadPageIndex > 0
          ? ch.lastReadPageIndex
          : prev?.lastReadPageIndex || 0,
    };
  });

  memoryStore.chapters.set(mangaId, mergedList);
  persistChapters();
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
    persistChapters();
  }
}

export async function getChaptersForManga(mangaId: string): Promise<Chapter[]> {
  const list = (memoryStore.chapters.get(mangaId) || []).filter((c) => !c.id.startsWith('ext::'));
  return [...list].sort((a, b) => a.chapterNumber - b.chapterNumber);
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

  const manga = memoryStore.mangas.get(mangaId);
  if (manga) {
    manga.lastReadChapterId = chapterId;
    manga.lastReadAt = now;
    persistMangas();
  }

  const chapters = memoryStore.chapters.get(mangaId);
  if (chapters) {
    const ch = chapters.find((c) => c.id === chapterId);
    if (ch) {
      ch.lastReadPageIndex = safePageIndex;
      if (isFinished) ch.isRead = true;
      persistChapters();
    }
  }
}

export async function getSettings(): Promise<ReaderSettings> {
  return { ...memoryStore.settings };
}

export async function saveSettings(settings: Partial<ReaderSettings>): Promise<ReaderSettings> {
  memoryStore.settings = { ...memoryStore.settings, ...settings };
  saveToStorage(STORAGE_KEY_SETTINGS, memoryStore.settings);
  return memoryStore.settings;
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
    customRepos: [],
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

  if (data.settings) {
    await saveSettings(data.settings);
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
