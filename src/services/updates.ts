import { getAllManga, getChaptersForManga, saveChapters, saveManga } from './storage';
import { sourceRegistry } from './sources/registry';
import { Manga, Chapter } from '../types';

export interface MangaUpdateResult {
  mangaId: string;
  mangaTitle: string;
  newChapterCount: number;
  latestChapterTitle: string;
}

export interface CheckUpdatesResponse {
  hasUpdates: boolean;
  totalNewChapters: number;
  updatedMangaList: MangaUpdateResult[];
}

/**
 * Checks all favorited manga for new chapters released by their sources.
 * Any new chapters found are inserted into SQLite as unread, updating the unreadCount badge.
 */
export async function checkFavoriteMangaUpdates(
  onProgress?: (checked: number, total: number) => void
): Promise<CheckUpdatesResponse> {
  const allManga = await getAllManga();
  const favorites = allManga.filter((m: Manga) => Boolean(m.isFavorite) && !m.sourceId.startsWith('local'));

  const updatedMangaList: MangaUpdateResult[] = [];
  let totalNewChapters = 0;

  for (let i = 0; i < favorites.length; i++) {
    const manga = favorites[i];
    onProgress?.(i + 1, favorites.length);

    try {
      const source = sourceRegistry.get(manga.sourceId);
      if (!source) continue;

      const [localChapters, remoteChapters] = await Promise.all([
        getChaptersForManga(manga.id),
        source.getChapters(manga.id).catch(() => [] as Chapter[]),
      ]);

      if (remoteChapters.length > localChapters.length) {
        const localIdSet = new Set(localChapters.map((c: Chapter) => c.id));
        const newChapters = remoteChapters.filter((c: Chapter) => !localIdSet.has(c.id));

        if (newChapters.length > 0) {
          // Merge chapters, preserving local reading progress for existing chapters
          const mergedChapters: Chapter[] = remoteChapters.map((remote: Chapter) => {
            const local = localChapters.find((l: Chapter) => l.id === remote.id);
            if (local) {
              return {
                ...remote,
                isRead: local.isRead,
                lastReadPageIndex: local.lastReadPageIndex,
              };
            }
            return {
              ...remote,
              isRead: false,
              lastReadPageIndex: 0,
            };
          });

          await saveChapters(manga.id, mergedChapters);

          const unreadCount = mergedChapters.filter((c: Chapter) => !c.isRead).length;
          await saveManga({
            ...manga,
            totalChapters: mergedChapters.length,
            unreadCount: unreadCount,
          });

          totalNewChapters += newChapters.length;
          updatedMangaList.push({
            mangaId: manga.id,
            mangaTitle: manga.title,
            newChapterCount: newChapters.length,
            latestChapterTitle: newChapters[0]?.title || `Chapter ${newChapters[0]?.chapterNumber}`,
          });
        }
      }
    } catch (err) {
      console.warn(`[Updates] Error checking updates for ${manga.title}:`, err);
    }
  }

  return {
    hasUpdates: updatedMangaList.length > 0,
    totalNewChapters,
    updatedMangaList,
  };
}
