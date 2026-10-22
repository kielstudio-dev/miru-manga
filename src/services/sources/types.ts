import { Manga, Chapter, Page } from '../../types';

export interface ISource {
  id: string;
  name: string;
  description: string;
  version: string;
  icon?: string;
  isLocal: boolean;
  getMangaList(page?: number, category?: string): Promise<Manga[]>;
  getMangaDetails(mangaId: string): Promise<Manga>;
  getChapters(mangaId: string): Promise<Chapter[]>;
  getPageList(chapterId: string): Promise<Page[]>;
  searchManga?(query: string): Promise<Manga[]>;
  getCategories?(): { id: string; label: string }[];
}
