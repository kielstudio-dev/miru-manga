import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { Manga } from '../types';
import { getAllManga, saveManga, toggleFavorite } from './storage';

const LAST_SYNC_KEY = 'miru_last_cloud_sync_time';

export interface CloudSyncStatus {
  isAuthenticated: boolean;
  isAnonymous: boolean;
  userId: string | null;
  email: string | null;
  lastSyncTime: number | null;
}

/**
 * Ensures user is authenticated via Anonymous Sign-In or existing session.
 * Zero personal info or friction required from the user.
 */
export async function ensureAuthenticatedUser() {
  try {
    const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
    if (session?.user) {
      return session.user;
    }

    // Try Anonymous Sign-In
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn('[CloudSync] Anonymous sign-in notice:', error.message);
      return null;
    }
    return data.user;
  } catch (err: any) {
    console.warn('[CloudSync] Auth check failed:', err?.message || err);
    return null;
  }
}

/**
 * Gets current cloud account and sync status
 */
export async function getCloudSyncStatus(): Promise<CloudSyncStatus> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const rawTime = await AsyncStorage.getItem(LAST_SYNC_KEY);
    const lastSyncTime = rawTime ? parseInt(rawTime, 10) : null;

    if (!session?.user) {
      return {
        isAuthenticated: false,
        isAnonymous: true,
        userId: null,
        email: null,
        lastSyncTime,
      };
    }

    return {
      isAuthenticated: true,
      isAnonymous: Boolean(session.user.is_anonymous),
      userId: session.user.id,
      email: session.user.email || null,
      lastSyncTime,
    };
  } catch (e) {
    return {
      isAuthenticated: false,
      isAnonymous: true,
      userId: null,
      email: null,
      lastSyncTime: null,
    };
  }
}

/**
 * Synchronizes local SQLite library with Supabase cloud database
 */
export async function performFullCloudSync(): Promise<{
  success: boolean;
  uploadedCount: number;
  downloadedCount: number;
  message: string;
}> {
  const user = await ensureAuthenticatedUser();
  if (!user) {
    return {
      success: false,
      uploadedCount: 0,
      downloadedCount: 0,
      message: 'Unable to connect to cloud backup. Please check your internet connection or cloud service settings.',
    };
  }

  try {
    // 1. Fetch all local favorites
    const localAll = await getAllManga();
    const localFavorites = localAll.filter((m) => m.isFavorite);

    let uploadedCount = 0;
    if (localFavorites.length > 0) {
      const payload = localFavorites.map((m) => ({
        user_id: user.id,
        manga_id: m.id,
        title: m.title,
        alt_title: m.altTitle || '',
        cover_url: m.coverUrl || '',
        author: m.author || '',
        status: m.status || 'ongoing',
        source_id: m.sourceId,
        source_name: m.sourceName,
        added_at: m.addedAt || Date.now(),
      }));

      const { error: upsertErr } = await supabase
        .from('user_bookmarks')
        .upsert(payload, { onConflict: 'user_id,manga_id' });

      if (upsertErr) {
        console.warn('[CloudSync] Upsert error:', upsertErr.message);
      } else {
        uploadedCount = localFavorites.length;
      }
    }

    // 2. Fetch cloud bookmarks for this user
    let downloadedCount = 0;
    const { data: cloudBookmarks, error: fetchErr } = await supabase
      .from('user_bookmarks')
      .select('*')
      .eq('user_id', user.id);

    if (!fetchErr && cloudBookmarks && cloudBookmarks.length > 0) {
      const localIdMap = new Set(localFavorites.map((m) => m.id));

      for (const row of cloudBookmarks) {
        if (!localIdMap.has(row.manga_id)) {
          const restoredManga: Manga = {
            id: row.manga_id,
            title: row.title,
            altTitle: row.alt_title || '',
            coverUrl: row.cover_url || '',
            author: row.author || '',
            description: '',
            status: row.status || 'ongoing',
            sourceId: row.source_id,
            sourceName: row.source_name,
            addedAt: Number(row.added_at || Date.now()),
            isFavorite: true,
          };
          await saveManga(restoredManga);
          downloadedCount++;
        }
      }
    }

    // Save timestamp
    const now = Date.now();
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(now));

    return {
      success: true,
      uploadedCount,
      downloadedCount,
      message: `Sync complete! Uploaded ${uploadedCount} bookmarks, restored ${downloadedCount} new titles.`,
    };
  } catch (err: any) {
    console.error('[CloudSync] Full sync error:', err);
    return {
      success: false,
      uploadedCount: 0,
      downloadedCount: 0,
      message: err?.message || 'Sync failed.',
    };
  }
}

/**
 * Non-blocking background sync when an individual bookmark is toggled
 */
export async function syncSingleBookmarkToCloud(manga: Manga, isFavorite: boolean) {
  try {
    const user = await ensureAuthenticatedUser();
    if (!user) return;

    if (isFavorite) {
      await supabase.from('user_bookmarks').upsert(
        {
          user_id: user.id,
          manga_id: manga.id,
          title: manga.title,
          alt_title: manga.altTitle || '',
          cover_url: manga.coverUrl || '',
          author: manga.author || '',
          status: manga.status || 'ongoing',
          source_id: manga.sourceId,
          source_name: manga.sourceName,
          added_at: manga.addedAt || Date.now(),
        },
        { onConflict: 'user_id,manga_id' }
      );
    } else {
      await supabase
        .from('user_bookmarks')
        .delete()
        .eq('user_id', user.id)
        .eq('manga_id', manga.id);
    }
  } catch (err) {
    // Non-blocking background error, ignore
    console.warn('[CloudSync] Single bookmark sync error:', err);
  }
}
