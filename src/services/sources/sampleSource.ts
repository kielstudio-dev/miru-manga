import { ISource } from './types';
import { Manga, Chapter, Page } from '../../types';

// Curated open-access comics for testing the reader engine
export const sampleSource: ISource = {
  id: 'sample-source',
  name: 'Open Comics (CC-BY)',
  description: 'Pre-loaded creative commons open comics to test the reader engine immediately.',
  version: '1.0.0',
  isLocal: false,

  async getMangaList(): Promise<Manga[]> {
    return [
      {
        id: 'pepper-and-carrot',
        title: 'Pepper & Carrot (Fantasy Manga)',
        author: 'David Revoy (CC-BY 4.0)',
        description:
          'A lighthearted fantasy comic about a young potion witch named Pepper and her cheeky cat Carrot. Designed to test horizontal Manga RTL & LTR modes.',
        coverUrl:
          'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=800&auto=format&fit=crop&q=80',
        status: 'ongoing',
        sourceId: 'sample-source',
        sourceName: 'Open Comics (CC-BY)',
        addedAt: Date.now(),
        totalChapters: 3,
        unreadCount: 3,
      },
      {
        id: 'cyber-ronin-webtoon',
        title: 'Cyber Ronin: Neon Protocol',
        author: 'Kaelen Vance',
        description:
          'A cyber-noir long-strip webtoon formatted specifically for vertical continuous high-speed scroll.',
        coverUrl:
          'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop&q=80',
        status: 'ongoing',
        sourceId: 'sample-source',
        sourceName: 'Open Comics (CC-BY)',
        addedAt: Date.now(),
        totalChapters: 1,
        unreadCount: 1,
      },
    ];
  },

  async getMangaDetails(mangaId: string): Promise<Manga> {
    const list = await this.getMangaList();
    const item = list.find((m) => m.id === mangaId);
    if (!item) throw new Error('Manga not found');
    return item;
  },

  async getChapters(mangaId: string): Promise<Chapter[]> {
    if (mangaId === 'pepper-and-carrot') {
      return [
        {
          id: 'pc-ch-01',
          mangaId: 'pepper-and-carrot',
          chapterNumber: 1,
          title: 'Ep 1: The Potion of Flight',
          releaseDate: '2024',
          isRead: false,
          lastReadPageIndex: 0,
          totalPages: 5,
          sourceId: 'sample-source',
        },
        {
          id: 'pc-ch-02',
          mangaId: 'pepper-and-carrot',
          chapterNumber: 2,
          title: 'Ep 2: Rainbow Potions',
          releaseDate: '2024',
          isRead: false,
          lastReadPageIndex: 0,
          totalPages: 4,
          sourceId: 'sample-source',
        },
        {
          id: 'pc-ch-03',
          mangaId: 'pepper-and-carrot',
          chapterNumber: 3,
          title: 'Ep 3: The Secret Ingredients',
          releaseDate: '2024',
          isRead: false,
          lastReadPageIndex: 0,
          totalPages: 4,
          sourceId: 'sample-source',
        },
      ];
    } else {
      return [
        {
          id: 'cr-ch-01',
          mangaId: 'cyber-ronin-webtoon',
          chapterNumber: 1,
          title: 'Prologue: Rain in Sector 7',
          releaseDate: '2024',
          isRead: false,
          lastReadPageIndex: 0,
          totalPages: 6,
          sourceId: 'sample-source',
        },
      ];
    }
  },

  async getPageList(chapterId: string): Promise<Page[]> {
    if (chapterId === 'pc-ch-01') {
      return [
        {
          index: 0,
          url: 'https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 1,
          url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 2,
          url: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 3,
          url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 4,
          url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=1000&auto=format&fit=crop&q=80',
        },
      ];
    } else if (chapterId === 'pc-ch-02') {
      return [
        {
          index: 0,
          url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 1,
          url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 2,
          url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 3,
          url: 'https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?w=1000&auto=format&fit=crop&q=80',
        },
      ];
    } else if (chapterId === 'pc-ch-03') {
      return [
        {
          index: 0,
          url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 1,
          url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 2,
          url: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 3,
          url: 'https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?w=1000&auto=format&fit=crop&q=80',
        },
      ];
    } else {
      // Cyber Ronin Webtoon long vertical panels
      return [
        {
          index: 0,
          url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 1,
          url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 2,
          url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 3,
          url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 4,
          url: 'https://images.unsplash.com/photo-1511447333015-45b65e60f6d5?w=1000&auto=format&fit=crop&q=80',
        },
        {
          index: 5,
          url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=1000&auto=format&fit=crop&q=80',
        },
      ];
    }
  },
};
