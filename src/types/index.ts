export type ReaderMode = 'webtoon' | 'rtl' | 'ltr';

export type BackgroundTheme = 'black' | 'dark' | 'sepia' | 'white';

export interface Manga {
  id: string;
  title: string;
  altTitle?: string;
  coverUrl: string;
  author?: string;
  description?: string;
  status?: 'ongoing' | 'completed' | 'unknown';
  sourceId: string;
  sourceName: string;
  addedAt: number;
  lastReadChapterId?: string;
  lastReadAt?: number;
  totalChapters?: number;
  unreadCount?: number;
  isFavorite?: boolean;
  isNsfw?: boolean;
}

export interface Chapter {
  id: string;
  mangaId: string;
  chapterNumber: number;
  title: string;
  releaseDate?: string;
  isRead: boolean;
  lastReadPageIndex: number;
  totalPages: number;
  sourceId: string;
}

export interface Page {
  index: number;
  url: string; // File URI or HTTP URL
  width?: number;
  height?: number;
}

export interface ReaderSettings {
  mode: ReaderMode;
  theme: BackgroundTheme;
  keepScreenOn: boolean;
  showPageNumbers: boolean;
  cropBorders: boolean;
  showNsfw?: boolean;
  blurNsfwCovers?: boolean;
}

export interface MangaSource {
  id: string;
  name: string;
  version: string;
  isLocal: boolean;
  getMangaList(): Promise<Manga[]>;
  getMangaDetails(id: string): Promise<Manga>;
  getChapters(mangaId: string): Promise<Chapter[]>;
  getPageList(chapterId: string): Promise<Page[]>;
}
