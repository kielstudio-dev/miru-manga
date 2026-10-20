import * as DocumentPicker from 'expo-document-picker';
import { ISource } from './types';
import { Manga, Chapter, Page } from '../../types';
import { extractCbzArchive } from '../archive';
import { saveManga, saveChapters, getAllManga, getChaptersForManga } from '../storage';

export const localSource: ISource = {
  id: 'local-storage',
  name: 'Local Device Files',
  description: 'Comics imported from device storage (.cbz, .zip, .cbr)',
  version: '1.0.0',
  isLocal: true,

  async getMangaList(): Promise<Manga[]> {
    const all = await getAllManga();
    return all.filter((m) => m.sourceId === 'local-storage');
  },

  async getMangaDetails(mangaId: string): Promise<Manga> {
    const list = await this.getMangaList();
    const item = list.find((m) => m.id === mangaId);
    if (!item) throw new Error('Local comic not found');
    return item;
  },

  async getChapters(mangaId: string): Promise<Chapter[]> {
    return await getChaptersForManga(mangaId);
  },

  async getPageList(chapterId: string): Promise<Page[]> {
    // If the chapter has already been extracted, retrieve pages or re-extract
    // For local files, chapterId is constructed from the archive metadata
    const cachedPages = localChapterPagesCache.get(chapterId);
    if (cachedPages && cachedPages.length > 0) {
      return cachedPages;
    }
    throw new Error('Chapter pages not currently in memory or file was moved.');
  },
};

// In-memory cache for page lists of local items
export const localChapterPagesCache = new Map<string, Page[]>();

export async function pickAndImportComicFile(): Promise<Manga | null> {
  try {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/zip',
        'application/x-zip-compressed',
        'application/x-cbz',
        'application/octet-stream',
        '*/*',
      ],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (res.canceled || !res.assets || res.assets.length === 0) {
      return null;
    }

    const asset = res.assets[0];
    const cleanTitle = asset.name.replace(/\.(cbz|cbr|zip)$/i, '');
    const mangaId = `local-${Date.now()}`;
    const chapterId = `${mangaId}-ch1`;

    // Extract pages from archive
    const pages = await extractCbzArchive(asset.uri, mangaId, chapterId);
    localChapterPagesCache.set(chapterId, pages);

    const coverUrl = pages.length > 0 ? pages[0].url : 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c';

    const newManga: Manga = {
      id: mangaId,
      title: cleanTitle,
      coverUrl: coverUrl,
      author: 'Local File',
      description: `Imported from ${asset.name} (${pages.length} pages)`,
      status: 'completed',
      sourceId: 'local-storage',
      sourceName: 'Local Device Files',
      addedAt: Date.now(),
      totalChapters: 1,
      unreadCount: 1,
    };

    const chapter: Chapter = {
      id: chapterId,
      mangaId: mangaId,
      chapterNumber: 1,
      title: cleanTitle,
      releaseDate: new Date().toLocaleDateString(),
      isRead: false,
      lastReadPageIndex: 0,
      totalPages: pages.length,
      sourceId: 'local-storage',
    };

    await saveManga(newManga);
    await saveChapters(mangaId, [chapter]);

    return newManga;
  } catch (err: any) {
    console.error('[LocalSource] Failed to pick/import file:', err);
    throw err;
  }
}
