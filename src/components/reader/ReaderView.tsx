import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { Manga, Chapter, Page, ReaderMode, BackgroundTheme } from '../../types';
import { sourceRegistry } from '../../services/sources/registry';
import { updateProgress, getSettings, saveSettings } from '../../services/storage';
import { WebtoonReader } from './WebtoonReader';
import { PagedReader } from './PagedReader';
import { ReaderOverlay } from './ReaderOverlay';
import { getDownloadedPages } from '../../services/downloads';
import { colors } from '../../theme/colors';
import { isChapterInRecentWindow, getFreshPageUrl } from '../../utils/chapterFreshness';

interface ReaderViewProps {
  manga: Manga;
  chapter: Chapter;
  allChapters: Chapter[];
  onBack: () => void;
  onSelectChapter: (chapter: Chapter) => void;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  manga,
  chapter,
  allChapters,
  onBack,
  onSelectChapter,
}) => {
  const [pages, setPages] = useState<Page[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initialPageStart = chapter.isRead ? 0 : (chapter.lastReadPageIndex || 0);
  const [currentPage, setCurrentPage] = useState(initialPageStart);
  const [overlayVisible, setOverlayVisible] = useState(false);
  const [mode, setMode] = useState<ReaderMode>('webtoon');
  const [theme, setTheme] = useState<BackgroundTheme>('black');

  // Load user settings on mount
  useEffect(() => {
    getSettings().then((s) => {
      if (s) {
        setMode(s.mode || 'webtoon');
        setTheme(s.theme || 'black');
      }
    });
  }, []);

  // Fetch page list for current chapter (prioritize local offline downloads, unless in active re-check window)
  const loadPages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const isRecent = isChapterInRecentWindow(chapter, allChapters);

      // Check local offline downloaded pages first (if not in recent auto-recheck window)
      const localPages = await getDownloadedPages(chapter.id);
      if (localPages && localPages.length > 0 && !isRecent) {
        setPages(localPages);
        const startIdx = chapter.isRead ? 0 : (chapter.lastReadPageIndex || 0);
        setCurrentPage(startIdx);
        return;
      }

      const source = sourceRegistry.get(chapter.sourceId) || sourceRegistry.getLocalSource();
      const rawPages = await source.getPageList(chapter.id);

      // For recent chapters (uploaded/updated in last 2-3 days or top 3 ongoing releases),
      // apply a 3-hour window cache-buster so expo-image refreshes corrected images automatically
      // if the scanlation provider replaced scrambled/jumbled pages
      const processedPages = rawPages.map((p) => ({
        ...p,
        url: getFreshPageUrl(p.url, isRecent),
      }));

      setPages(processedPages);
      const startIdx = chapter.isRead ? 0 : (chapter.lastReadPageIndex || 0);
      setCurrentPage(startIdx);
    } catch (err: any) {
      console.error('[ReaderView] Error loading chapter pages:', err);
      setError(err?.message || 'Failed to load chapter pages.');
    } finally {
      setLoading(false);
    }
  }, [chapter, allChapters]);

  // Force-reload chapter pages directly from source with immediate cache-busting
  const handleReloadChapter = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const source = sourceRegistry.get(chapter.sourceId) || sourceRegistry.getLocalSource();
      const freshPages = await source.getPageList(chapter.id);

      const timestamp = Date.now();
      const cacheBustedPages = freshPages.map((p) => ({
        ...p,
        url: getFreshPageUrl(p.url, true, timestamp),
      }));

      setPages(cacheBustedPages);
      Alert.alert(
        'Chapter Reloaded 🔄',
        `Successfully reloaded ${freshPages.length} pages fresh from the source with updated ordering and images.`
      );
    } catch (err: any) {
      console.error('[ReaderView] Error reloading chapter:', err);
      Alert.alert('Reload Notice', err?.message || 'Could not fetch fresh chapter pages from source.');
    } finally {
      setLoading(false);
    }
  }, [chapter]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  // Handle page changes & sync to storage
  const handlePageChange = useCallback(
    (index: number) => {
      setCurrentPage(index);
      const isFinished = pages.length > 0 && index >= pages.length - 1;
      updateProgress(manga.id, chapter.id, index, isFinished);
    },
    [manga.id, chapter.id, pages.length]
  );

  const handleModeChange = (newMode: ReaderMode) => {
    setMode(newMode);
    saveSettings({ mode: newMode });
  };

  const handleThemeChange = (newTheme: BackgroundTheme) => {
    setTheme(newTheme);
    saveSettings({ theme: newTheme });
  };

  // Chapter navigation
  const currentIndex = allChapters.findIndex((c) => c.id === chapter.id);
  const hasPrevChapter = currentIndex > 0;
  const hasNextChapter = currentIndex < allChapters.length - 1;

  const handlePrevChapter = () => {
    if (hasPrevChapter) {
      onSelectChapter(allChapters[currentIndex - 1]);
    }
  };

  const handleNextChapter = () => {
    if (hasNextChapter) {
      onSelectChapter(allChapters[currentIndex + 1]);
    }
  };

  const currentBgColor = colors.readerThemes[theme] || colors.readerThemes.black;
  const isLightCanvas =
    theme === 'white' ||
    theme === 'sepia' ||
    currentBgColor.toLowerCase() === '#ffffff' ||
    currentBgColor.toLowerCase() === '#f6f1de';

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: currentBgColor }]}>
        <StatusBar hidden={!overlayVisible} style={isLightCanvas ? 'dark' : 'light'} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, isLightCanvas && { color: '#4b5563' }]}>
          Opening {chapter.title}...
        </Text>
      </View>
    );
  }

  if (error || pages.length === 0) {
    const isUnreleased = Boolean(
      error?.includes('not yet been published') ||
      error?.includes('placeholder') ||
      (!error && pages.length === 0)
    );
    const prevChapter = hasPrevChapter ? allChapters[currentIndex - 1] : null;

    if (isUnreleased) {
      return (
        <View style={[styles.centerContainer, { backgroundColor: currentBgColor }]}>
          <StatusBar hidden={false} style={isLightCanvas ? 'dark' : 'light'} />
          <View
            style={[
              styles.emptyCard,
              isLightCanvas && {
                backgroundColor: 'rgba(0, 0, 0, 0.03)',
                borderColor: 'rgba(0, 0, 0, 0.1)',
              },
            ]}
          >
            <View style={styles.iconCircle}>
              <Ionicons name="time-outline" size={40} color="#f59e0b" />
            </View>

            <View style={styles.statusBadge}>
              <Text style={styles.statusBadgeText}>CHAPTER NOT YET PUBLISHED</Text>
            </View>

            <Text style={[styles.emptyCardTitle, isLightCanvas && { color: '#111827' }]}>
              {chapter.title}
            </Text>
            <Text style={[styles.emptyCardSubtitle, isLightCanvas && { color: '#4b5563' }]}>
              This chapter has been registered by {manga.sourceName || 'the source provider'}, but image pages have not been uploaded by the scanlator yet.
            </Text>

            {prevChapter && (
              <TouchableOpacity
                style={styles.primaryActionBtn}
                onPress={() => onSelectChapter(prevChapter)}
                activeOpacity={0.85}
              >
                <Ionicons name="book-outline" size={18} color="#ffffff" />
                <Text style={styles.primaryActionText}>Read {prevChapter.title}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[
                styles.secondaryActionBtn,
                isLightCanvas && { backgroundColor: 'rgba(0, 0, 0, 0.06)' },
              ]}
              onPress={loadPages}
              activeOpacity={0.8}
            >
              <Ionicons
                name="refresh-outline"
                size={16}
                color={isLightCanvas ? '#1f2937' : colors.textPrimary}
              />
              <Text
                style={[
                  styles.secondaryActionText,
                  isLightCanvas && { color: '#1f2937' },
                ]}
              >
                Check Again / Refresh
              </Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
              <Text style={[styles.backText, isLightCanvas && { color: '#6b7280' }]}>
                ‹ Return to Chapter List
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.centerContainer, { backgroundColor: currentBgColor }]}>
        <StatusBar hidden={false} style={isLightCanvas ? 'dark' : 'light'} />
        <View
          style={[
            styles.emptyCard,
            isLightCanvas && {
              backgroundColor: 'rgba(0, 0, 0, 0.03)',
              borderColor: 'rgba(0, 0, 0, 0.1)',
            },
          ]}
        >
          <View style={[styles.iconCircle, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
            <Ionicons name="cloud-offline-outline" size={40} color={colors.danger} />
          </View>
          <Text style={[styles.errorTitle, isLightCanvas && { color: '#dc2626' }]}>
            Could Not Load Pages
          </Text>
          <Text style={[styles.errorMessage, isLightCanvas && { color: '#4b5563' }]}>
            {error || 'Connection failed while retrieving pages.'}
          </Text>
          <TouchableOpacity style={styles.primaryActionBtn} onPress={loadPages}>
            <Ionicons name="refresh-outline" size={18} color="#ffffff" />
            <Text style={styles.primaryActionText}>Retry Loading</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.backBtn} onPress={onBack}>
            <Text style={[styles.backText, isLightCanvas && { color: '#6b7280' }]}>
              ‹ Return to Manga
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: currentBgColor }]}>
      <StatusBar hidden={!overlayVisible} style="light" />

      {mode === 'webtoon' ? (
        <WebtoonReader
          pages={pages}
          initialPage={initialPageStart}
          chapterTitle={chapter.title}
          onPageChange={handlePageChange}
          onToggleOverlay={() => setOverlayVisible((prev) => !prev)}
          backgroundColor={currentBgColor}
          onPrevChapter={handlePrevChapter}
          onNextChapter={handleNextChapter}
          hasPrevChapter={hasPrevChapter}
          hasNextChapter={hasNextChapter}
        />
      ) : (
        <PagedReader
          pages={pages}
          currentPage={currentPage}
          mode={mode}
          onPageChange={handlePageChange}
          onToggleOverlay={() => setOverlayVisible((prev) => !prev)}
          backgroundColor={currentBgColor}
        />
      )}

      <ReaderOverlay
        visible={overlayVisible}
        mangaTitle={manga.title}
        chapterTitle={chapter.title}
        currentPage={currentPage}
        totalPages={pages.length}
        mode={mode}
        theme={theme}
        onBack={onBack}
        onPageSelect={handlePageChange}
        onModeChange={handleModeChange}
        onThemeChange={handleThemeChange}
        onPrevChapter={handlePrevChapter}
        onNextChapter={handleNextChapter}
        hasPrevChapter={hasPrevChapter}
        hasNextChapter={hasNextChapter}
        onReloadChapter={handleReloadChapter}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: 14,
  },
  errorTitle: {
    color: colors.danger,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  errorMessage: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    maxWidth: 360,
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusBadge: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  statusBadgeText: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  emptyCardTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyCardSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 10,
  },
  primaryActionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  secondaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    width: '100%',
    justifyContent: 'center',
    marginBottom: 10,
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: colors.primary,
    borderRadius: 10,
    marginBottom: 10,
  },
  retryText: {
    color: '#fff',
    fontWeight: '600',
  },
  backBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  backText: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
