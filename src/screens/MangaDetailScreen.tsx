import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Platform,
  Alert,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Manga, Chapter } from '../types';
import { sourceRegistry } from '../services/sources/registry';
import { getChaptersForManga, saveChapters, getMangaById, saveManga } from '../services/storage';
import {
  downloadChapter,
  deleteDownloadedChapter,
  getDownloadedChapterIdsForManga,
} from '../services/downloads';
import { ProUpgradeModal } from '../components/monetization/ProUpgradeModal';
import { colors } from '../theme/colors';
import { getProxyImageUrl } from '../utils/imageProxy';

interface MangaDetailScreenProps {
  manga: Manga;
  onBack: () => void;
  onOpenChapter: (chapter: Chapter, allChapters: Chapter[]) => void;
}

// Fixed chapter item row height for 60fps virtualization across 3,000+ chapters
const CHAPTER_ITEM_HEIGHT = 70;

interface ChapterRowProps {
  ch: Chapter;
  isDownloaded: boolean;
  isDownloading: boolean;
  isSelectionMode: boolean;
  isSelected: boolean;
  onPress: (ch: Chapter) => void;
  onLongPress: (ch: Chapter) => void;
  onDownloadPress: (ch: Chapter) => void;
  onToggleRead: (ch: Chapter) => void;
}

const ChapterRowItem = React.memo<ChapterRowProps>(
  ({
    ch,
    isDownloaded,
    isDownloading,
    isSelectionMode,
    isSelected,
    onPress,
    onLongPress,
    onDownloadPress,
    onToggleRead,
  }) => {
    return (
      <TouchableOpacity
        style={[
          styles.chapterItemRow,
          isSelected && styles.chapterItemRowSelected,
        ]}
        onPress={() => onPress(ch)}
        onLongPress={() => onLongPress(ch)}
        activeOpacity={0.7}
      >
        {isSelectionMode && (
          <View style={styles.selectionCheckbox}>
            <Ionicons
              name={isSelected ? 'checkbox' : 'square-outline'}
              size={22}
              color={isSelected ? colors.primary : colors.textMuted}
            />
          </View>
        )}

        <View style={styles.chapterInfoArea}>
          <View style={styles.chapterTitleRow}>
            <Text
              style={[
                styles.chapterTitle,
                ch.isRead && styles.chapterReadTitle,
              ]}
              numberOfLines={1}
            >
              {ch.title}
            </Text>
            {isDownloaded && (
              <View style={styles.downloadedBadge}>
                <Text style={styles.downloadedBadgeText}>OFFLINE</Text>
              </View>
            )}
          </View>

          <View style={styles.chapterMetaRow}>
            {Boolean(ch.releaseDate) && (
              <Text style={styles.chapterMetaText}>{ch.releaseDate}</Text>
            )}
            {Boolean(ch.releaseDate && ch.totalPages > 0) && (
              <Text style={styles.chapterMetaText}>•</Text>
            )}
            {ch.totalPages > 0 && (
              <Text style={styles.chapterMetaText}>{ch.totalPages} pages</Text>
            )}
          </View>
        </View>

        {!isSelectionMode && (
          <>
            <TouchableOpacity
              onPress={() => onDownloadPress(ch)}
              style={styles.downloadChapterBtn}
              disabled={isDownloading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color="#7c5cff" />
              ) : isDownloaded ? (
                <Ionicons name="cloud-done" size={21} color="#10b981" />
              ) : (
                <Ionicons name="download-outline" size={21} color={colors.textSecondary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onToggleRead(ch)}
              style={styles.readToggleBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons
                name={ch.isRead ? 'checkmark-circle' : 'ellipse-outline'}
                size={22}
                color={ch.isRead ? colors.primary : colors.textMuted}
              />
            </TouchableOpacity>
          </>
        )}
      </TouchableOpacity>
    );
  }
);

/**
 * Automatically detects whether the user is up to date on an ongoing or completed manga.
 * If true, chapters should automatically reverse (newest/latest at top) so when new chapters
 * go live, they appear right at the top for immediate access.
 */
function isUserUpToDateWithManga(
  chList: Chapter[],
  lastReadChapterId?: string | null
): boolean {
  if (!chList || chList.length <= 1) return false;

  const total = chList.length;
  const readChapters = chList.filter((c) => c.isRead);
  const readCount = readChapters.length;
  if (readCount === 0) return false;

  // 1. Every chapter has been read
  if (readCount === total) return true;

  const latestChapter = chList[total - 1];
  const secondLatest = total > 1 ? chList[total - 2] : null;
  const thirdLatest = total > 2 ? chList[total - 3] : null;

  // 2. The latest chapter is already marked as read
  if (latestChapter.isRead) return true;

  // 3. User finished up to the previous latest chapter (e.g. Ch 50 read, Ch 51 just released)
  if (secondLatest && secondLatest.isRead) return true;

  // 4. Batch release: up to 3 new chapters just dropped, and user finished up to the 3rd latest
  if (thirdLatest && thirdLatest.isRead && total - readCount <= 3) return true;

  // 5. User's recorded lastReadChapterId is one of the top 3 latest chapters and user has read multiple chapters
  if (lastReadChapterId) {
    const lastReadIdx = chList.findIndex((c) => c.id === lastReadChapterId);
    if (lastReadIdx >= 0 && lastReadIdx >= total - 3 && readCount >= Math.min(3, total - 1)) {
      return true;
    }
  }

  return false;
}

export const MangaDetailScreen: React.FC<MangaDetailScreenProps> = ({
  manga,
  onBack,
  onOpenChapter,
}) => {
  const [currentManga, setCurrentManga] = useState<Manga>(manga);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isFavorite, setIsFavorite] = useState<boolean>(Boolean(manga.isFavorite));
  const [downloadedChapterIds, setDownloadedChapterIds] = useState<Set<string>>(new Set());
  const [downloadingChapterId, setDownloadingChapterId] = useState<string | null>(null);
  const [downloadingBatch, setDownloadingBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [sortAscending, setSortAscending] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const userManuallyToggledSort = useRef<boolean>(false);

  // Multi-select state
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [showProModal, setShowProModal] = useState<boolean>(false);

  // Sync prop updates
  useEffect(() => {
    setCurrentManga(manga);
  }, [manga]);

  // Check stored database favorite status, offline downloads & fetch full synopsis/details
  useEffect(() => {
    async function checkSavedStatusAndDetails() {
      try {
        const stored = await getMangaById(manga.id);
        const isMangaCoverBad =
          !manga.coverUrl ||
          manga.coverUrl.includes('dflazy') ||
          manga.coverUrl.includes('blank.gif') ||
          manga.coverUrl.includes('unsplash');

        const isStoredCoverBad =
          !stored?.coverUrl ||
          stored.coverUrl.includes('dflazy') ||
          stored.coverUrl.includes('blank.gif') ||
          stored.coverUrl.includes('unsplash');

        if (stored) {
          if (stored.isFavorite !== undefined) {
            setIsFavorite(Boolean(stored.isFavorite));
          }
          if (
            stored.description &&
            !stored.description.startsWith('Online title from') &&
            !stored.description.startsWith('Search result from')
          ) {
            setCurrentManga((prev) => ({
              ...prev,
              ...stored,
              coverUrl: isStoredCoverBad
                ? (!isMangaCoverBad ? manga.coverUrl : prev.coverUrl)
                : stored.coverUrl,
            }));
          }
        }

        const downloadedIds = await getDownloadedChapterIdsForManga(manga.id);
        setDownloadedChapterIds(new Set(downloadedIds));

        // If synopsis/author is generic, cover is invalid, OR title/altTitle needs upgrading to English style, fetch full details
        const needsDetails =
          isMangaCoverBad ||
          isStoredCoverBad ||
          !stored?.description ||
          stored.description.startsWith('Online title from') ||
          stored.description.startsWith('Search result from') ||
          !stored.author ||
          stored.author === manga.sourceName ||
          stored.author === 'Unknown' ||
          !stored.altTitle ||
          (Boolean(manga.title) && manga.title !== stored.title);

        if (needsDetails) {
          setLoadingDetails(true);
          const source = sourceRegistry.get(manga.sourceId) || sourceRegistry.getLocalSource();
          if (source && source.getMangaDetails) {
            const details = await source.getMangaDetails(manga.id);
            if (details) {
              setCurrentManga((prev) => {
                const isDetailCoverBad =
                  !details.coverUrl ||
                  details.coverUrl.includes('dflazy') ||
                  details.coverUrl.includes('blank.gif') ||
                  details.coverUrl.includes('unsplash');

                let finalCover = details.coverUrl;
                if (isDetailCoverBad) {
                  finalCover = !isMangaCoverBad ? manga.coverUrl : prev.coverUrl;
                }

                const merged: Manga = {
                  ...prev,
                  ...details,
                  title: details.title || manga.title || prev.title,
                  altTitle: details.altTitle || manga.altTitle || prev.altTitle,
                  coverUrl: finalCover || prev.coverUrl,
                  isFavorite: prev.isFavorite,
                };
                saveManga(merged).catch(() => {});
                return merged;
              });
            }
          }
        }
      } catch (e) {
        // Fall back to prop
      } finally {
        setLoadingDetails(false);
      }
    }
    checkSavedStatusAndDetails();
  }, [manga.id, manga.sourceId]);

  const handleToggleFavorite = async () => {
    const nextState = !isFavorite;
    setIsFavorite(nextState);
    const updated = { ...currentManga, isFavorite: nextState };
    setCurrentManga(updated);
    await saveManga(updated);
  };

  const handleDownloadChapter = useCallback(
    async (ch: Chapter) => {
      if (downloadedChapterIds.has(ch.id)) {
        Alert.alert(
          'Downloaded Chapter',
          `"${ch.title}" is saved for offline reading.\n\nDo you want to delete this offline download?`,
          [
            { text: 'Keep Downloaded', style: 'cancel' },
            {
              text: 'Delete Offline Files',
              style: 'destructive',
              onPress: async () => {
                await deleteDownloadedChapter(ch.id);
                setDownloadedChapterIds((prev) => {
                  const next = new Set(prev);
                  next.delete(ch.id);
                  return next;
                });
              },
            },
          ]
        );
        return;
      }

      try {
        setDownloadingChapterId(ch.id);
        await downloadChapter(manga, ch);
        setDownloadedChapterIds((prev) => new Set(prev).add(ch.id));
      } catch (err: any) {
        if (err?.message?.includes('FREE_LIMIT_REACHED')) {
          Alert.alert(
            'Offline Download Limit',
            'Free accounts are limited to 5 offline chapters.\n\nUpgrade to Lifetime Pro for unlimited offline downloads!',
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Upgrade to Pro', onPress: () => setShowProModal(true) },
            ]
          );
        } else {
          Alert.alert('Download Failed', err?.message || 'Could not download chapter.');
        }
      } finally {
        setDownloadingChapterId(null);
      }
    },
    [downloadedChapterIds, manga]
  );

  const handleDownloadNextThree = async () => {
    const toDownload = chapters
      .filter((c) => !downloadedChapterIds.has(c.id))
      .slice(0, 3);
    if (toDownload.length === 0) {
      Alert.alert('All Downloaded', 'All available chapters are already downloaded offline!');
      return;
    }

    setDownloadingBatch(true);
    setBatchProgress({ current: 0, total: toDownload.length });
    try {
      for (let i = 0; i < toDownload.length; i++) {
        const ch = toDownload[i];
        setDownloadingChapterId(ch.id);
        setBatchProgress({ current: i + 1, total: toDownload.length });
        await downloadChapter(manga, ch);
        setDownloadedChapterIds((prev) => new Set(prev).add(ch.id));
      }
      Alert.alert('Downloads Complete', `Downloaded ${toDownload.length} chapters for offline reading! 📥`);
    } catch (err: any) {
      if (err?.message?.includes('FREE_LIMIT_REACHED')) {
        Alert.alert(
          'Offline Download Limit',
          'Free accounts are limited to 5 offline chapters.\n\nUpgrade to Lifetime Pro for unlimited offline downloads!',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Upgrade to Pro', onPress: () => setShowProModal(true) },
          ]
        );
      } else {
        Alert.alert('Download Error', err?.message || 'Error downloading batch.');
      }
    } finally {
      setDownloadingChapterId(null);
      setDownloadingBatch(false);
      setBatchProgress(null);
    }
  };

  useEffect(() => {
    async function fetchChapters() {
      try {
        setLoading(true);
        // First check SQLite
        let chList = await getChaptersForManga(manga.id);
        // If empty, containing legacy external redirect placeholders, or containing corrupted title with relative dates, re-fetch live readable chapters
        const needsFreshFetch =
          chList.length === 0 ||
          chList.some(
            (c) =>
              c.id.startsWith('ext::') ||
              c.title.match(/(?:days?|hours?|mins?|weeks?|months?|years?)\s+ago/i) ||
              c.title.toLowerCase().includes('first chapter')
          );
        if (needsFreshFetch) {
          const source = sourceRegistry.get(manga.sourceId) || sourceRegistry.getLocalSource();
          const freshList = await source.getChapters(manga.id);
          if (freshList && freshList.length > 0) {
            const sortedFresh = [...freshList].sort((a, b) => a.chapterNumber - b.chapterNumber);
            const existingById = new Map<string, Chapter>();
            const existingByNum = new Map<number, Chapter>();
            chList.forEach((c) => {
              existingById.set(c.id, c);
              existingByNum.set(c.chapterNumber, c);
            });
            const merged = sortedFresh.map((ch) => {
              const existing = existingById.get(ch.id) || existingByNum.get(ch.chapterNumber);
              return {
                ...ch,
                isRead: Boolean(ch.isRead || existing?.isRead),
                lastReadPageIndex:
                  ch.lastReadPageIndex && ch.lastReadPageIndex > 0
                    ? ch.lastReadPageIndex
                    : existing?.lastReadPageIndex || 0,
              };
            });
            await saveChapters(manga.id, merged, false);
            chList = merged;
          }
        }
        setChapters(chList);
        if (!userManuallyToggledSort.current) {
          const upToDate = isUserUpToDateWithManga(chList, manga.lastReadChapterId);
          setSortAscending(!upToDate);
        }
      } catch (err) {
        console.error('[MangaDetailScreen] Error fetching chapters:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchChapters();
  }, [manga]);

  // Pull-to-refresh live chapter list from the source provider
  const handleRefreshChapters = useCallback(async () => {
    try {
      setRefreshing(true);
      const source = sourceRegistry.get(manga.sourceId) || sourceRegistry.getLocalSource();
      if (source && source.getChapters) {
        const freshList = await source.getChapters(manga.id);
        if (freshList && freshList.length > 0) {
          // 1. Canonically sort chapters 1 -> N
          const sortedFresh = [...freshList].sort((a, b) => a.chapterNumber - b.chapterNumber);

          // 2. Merge with current state & memory to protect isRead and lastReadPageIndex
          const currentById = new Map<string, Chapter>();
          const currentByNum = new Map<number, Chapter>();
          chapters.forEach((c) => {
            currentById.set(c.id, c);
            currentByNum.set(c.chapterNumber, c);
          });

          const merged = sortedFresh.map((ch) => {
            const existing = currentById.get(ch.id) || currentByNum.get(ch.chapterNumber);
            return {
              ...ch,
              isRead: Boolean(ch.isRead || existing?.isRead),
              lastReadPageIndex:
                ch.lastReadPageIndex && ch.lastReadPageIndex > 0
                  ? ch.lastReadPageIndex
                  : existing?.lastReadPageIndex || 0,
            };
          });

          // 3. Save merged chapters (false = scraper sync, protects reading status)
          await saveChapters(manga.id, merged, false);
          setChapters(merged);

          // 4. Retain sort order: if the user was up to date or completed, maintain Recent ➔ 1
          // so newly released chapters appear right at the top
          if (!userManuallyToggledSort.current) {
            const upToDate = isUserUpToDateWithManga(merged, manga.lastReadChapterId);
            setSortAscending(!upToDate);
          }
        }
      }
    } catch (err: any) {
      console.warn('[MangaDetailScreen] Chapter refresh warning:', err?.message || err);
    } finally {
      setRefreshing(false);
    }
  }, [manga.id, manga.sourceId, manga.lastReadChapterId, chapters]);

  // Smart Resume / Next Chapter target
  const primaryAction = useMemo(() => {
    if (chapters.length === 0) return null;

    if (manga.lastReadChapterId) {
      const lastIdx = chapters.findIndex((c) => c.id === manga.lastReadChapterId);
      if (lastIdx >= 0) {
        const last = chapters[lastIdx];
        // If the last chapter was already finished and there is a subsequent chapter (e.g., new chapter just dropped):
        if (last.isRead && lastIdx < chapters.length - 1) {
          const next = chapters[lastIdx + 1];
          return {
            targetChapter: next,
            icon: 'play',
            label: `Read Ch. ${next.chapterNumber}`,
          };
        }
        // If all chapters up to the end are finished:
        if (last.isRead && lastIdx === chapters.length - 1) {
          return {
            targetChapter: chapters[0],
            icon: 'reload-outline',
            label: `Completed (Re-read Ch. 1)`,
          };
        }
        // Still reading this chapter:
        return {
          targetChapter: last,
          icon: 'play',
          label: `Resume Ch. ${last.chapterNumber} (p. ${(last.lastReadPageIndex || 0) + 1})`,
        };
      }
    }

    // No lastReadChapterId: check if some chapters are marked read
    const firstUnread = chapters.find((c) => !c.isRead);
    if (firstUnread) {
      return {
        targetChapter: firstUnread,
        icon: 'play',
        label: `Start Reading Ch. ${firstUnread.chapterNumber}`,
      };
    }

    return {
      targetChapter: chapters[0],
      icon: 'play',
      label: `Start Reading Ch. 1`,
    };
  }, [chapters, manga.lastReadChapterId]);

  // Compute displayed chapters based on sort order (1 ➔ Recent vs Recent ➔ 1)
  const displayedChapters = useMemo(
    () => (sortAscending ? chapters : [...chapters].reverse()),
    [chapters, sortAscending]
  );

  const toggleChapterRead = useCallback(
    async (ch: Chapter) => {
      const updated = chapters.map((c) =>
        c.id === ch.id ? { ...c, isRead: !c.isRead } : c
      );
      setChapters(updated);
      await saveChapters(manga.id, updated, true);
      if (!userManuallyToggledSort.current) {
        const upToDate = isUserUpToDateWithManga(updated, manga.lastReadChapterId);
        setSortAscending(!upToDate);
      }
    },
    [chapters, manga.id, manga.lastReadChapterId]
  );

  // Multi-select handlers
  const handleChapterPress = useCallback(
    (ch: Chapter) => {
      if (isSelectionMode) {
        setSelectedChapterIds((prev) => {
          const next = new Set(prev);
          if (next.has(ch.id)) {
            next.delete(ch.id);
          } else {
            next.add(ch.id);
          }
          return next;
        });
        return;
      }

      // Force all reading directly inside the app's ReaderView
      onOpenChapter(ch, chapters);
    },
    [isSelectionMode, onOpenChapter, chapters]
  );

  const handleChapterLongPress = useCallback(
    (ch: Chapter) => {
      if (!isSelectionMode) {
        setIsSelectionMode(true);
        setSelectedChapterIds(new Set([ch.id]));
      } else {
        handleChapterPress(ch);
      }
    },
    [isSelectionMode, handleChapterPress]
  );

  const handleSelectAll = () => {
    if (selectedChapterIds.size === displayedChapters.length) {
      setSelectedChapterIds(new Set());
    } else {
      setSelectedChapterIds(new Set(displayedChapters.map((c) => c.id)));
    }
  };

  const handleBatchDownloadSelected = async () => {
    const selectedList = chapters.filter(
      (c) => selectedChapterIds.has(c.id) && !downloadedChapterIds.has(c.id)
    );

    if (selectedList.length === 0) {
      Alert.alert(
        'Already Downloaded',
        'All selected chapters are already downloaded.'
      );
      return;
    }

    setDownloadingBatch(true);
    setBatchProgress({ current: 0, total: selectedList.length });
    try {
      for (let i = 0; i < selectedList.length; i++) {
        const ch = selectedList[i];
        setDownloadingChapterId(ch.id);
        setBatchProgress({ current: i + 1, total: selectedList.length });
        await downloadChapter(manga, ch);
        setDownloadedChapterIds((prev) => new Set(prev).add(ch.id));
      }
      Alert.alert(
        'Downloads Complete',
        `Successfully downloaded ${selectedList.length} chapters for offline reading! 📥`
      );
      setIsSelectionMode(false);
      setSelectedChapterIds(new Set());
    } catch (err: any) {
      if (err?.message?.includes('FREE_LIMIT_REACHED')) {
        Alert.alert(
          'Offline Download Limit',
          'Free accounts are limited to 5 offline chapters.\n\nUpgrade to Lifetime Pro for unlimited offline downloads!',
          [
            { text: 'Later', style: 'cancel' },
            { text: 'Upgrade to Pro', onPress: () => setShowProModal(true) },
          ]
        );
      } else {
        Alert.alert('Download Error', err?.message || 'Error occurred during batch download.');
      }
    } finally {
      setDownloadingChapterId(null);
      setDownloadingBatch(false);
      setBatchProgress(null);
    }
  };

  const handleBatchMarkRead = async (markAs: boolean) => {
    if (selectedChapterIds.size === 0) return;

    const updated = chapters.map((c) =>
      selectedChapterIds.has(c.id) ? { ...c, isRead: markAs } : c
    );
    setChapters(updated);
    await saveChapters(manga.id, updated, true);
    setIsSelectionMode(false);
    setSelectedChapterIds(new Set());
    if (!userManuallyToggledSort.current) {
      const upToDate = isUserUpToDateWithManga(updated, manga.lastReadChapterId);
      setSortAscending(!upToDate);
    }
  };

  const handleBatchDeleteSelected = async () => {
    const toDelete = chapters.filter(
      (c) => selectedChapterIds.has(c.id) && downloadedChapterIds.has(c.id)
    );

    if (toDelete.length === 0) {
      Alert.alert('No Offline Files', 'None of the selected chapters are downloaded offline.');
      return;
    }

    Alert.alert(
      'Delete Downloads',
      `Delete offline files for ${toDelete.length} selected chapters?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            for (const ch of toDelete) {
              await deleteDownloadedChapter(ch.id);
            }
            setDownloadedChapterIds((prev) => {
              const next = new Set(prev);
              toDelete.forEach((c) => next.delete(c.id));
              return next;
            });
            setIsSelectionMode(false);
            setSelectedChapterIds(new Set());
            Alert.alert('Deleted', 'Selected offline downloads deleted.');
          },
        },
      ]
    );
  };

  const renderChapterItem = useCallback(
    ({ item }: { item: Chapter }) => {
      const isDownloaded = downloadedChapterIds.has(item.id);
      const isDownloading = downloadingChapterId === item.id;
      const isSelected = selectedChapterIds.has(item.id);

      return (
        <ChapterRowItem
          ch={item}
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          isSelectionMode={isSelectionMode}
          isSelected={isSelected}
          onPress={handleChapterPress}
          onLongPress={handleChapterLongPress}
          onDownloadPress={handleDownloadChapter}
          onToggleRead={toggleChapterRead}
        />
      );
    },
    [
      downloadedChapterIds,
      downloadingChapterId,
      selectedChapterIds,
      isSelectionMode,
      handleChapterPress,
      handleChapterLongPress,
      handleDownloadChapter,
      toggleChapterRead,
    ]
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CHAPTER_ITEM_HEIGHT,
      offset: CHAPTER_ITEM_HEIGHT * index,
      index,
    }),
    []
  );

  const keyExtractor = useCallback((item: Chapter) => item.id, []);

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      {/* Hero Banner & Details */}
      <View style={styles.heroSection}>
        <Image
          source={{
            uri: getProxyImageUrl(currentManga.coverUrl),
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              ...(currentManga.coverUrl.match(/https?:\/\/[^\/]+/)
                ? { Referer: `${currentManga.coverUrl.match(/https?:\/\/[^\/]+/)?.[0]}/` }
                : {}),
            },
          }}
          style={styles.coverImage}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.heroDetails}>
          <Text style={styles.mangaTitle}>{currentManga.title}</Text>
          {Boolean(currentManga.altTitle) && (
            <Text style={styles.mangaAltTitle} numberOfLines={2}>
              {currentManga.altTitle}
            </Text>
          )}
          <Text style={styles.mangaAuthor}>{currentManga.author || 'Unknown'}</Text>
          <View style={styles.badgeRow}>
            <View style={styles.pillBadge}>
              <Text style={styles.pillBadgeText}>{currentManga.sourceName}</Text>
            </View>
            {currentManga.status && (
              <View style={[styles.pillBadge, { backgroundColor: colors.accent + '22' }]}>
                <Text style={[styles.pillBadgeText, { color: colors.accent }]}>
                  {currentManga.status.toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Action Buttons Row */}
      <View style={styles.mainActionsRow}>
        {primaryAction && (
          <TouchableOpacity
            style={styles.resumeButton}
            onPress={() => onOpenChapter(primaryAction.targetChapter, chapters)}
            activeOpacity={0.85}
          >
            <Ionicons name={primaryAction.icon as any} size={20} color="#ffffff" />
            <Text style={styles.resumeButtonText}>
              {primaryAction.label}
            </Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity
          style={[styles.bookmarkButton, isFavorite && styles.bookmarkButtonActive]}
          onPress={handleToggleFavorite}
          activeOpacity={0.85}
        >
          <Ionicons
            name={isFavorite ? 'bookmark' : 'bookmark-outline'}
            size={18}
            color={isFavorite ? '#ffffff' : colors.textPrimary}
          />
          <Text style={[styles.bookmarkButtonText, isFavorite && styles.bookmarkButtonTextActive]}>
            {isFavorite ? 'In Library' : 'Bookmark'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Synopsis */}
      <View style={styles.sectionCard}>
        <Text style={styles.sectionHeading}>Synopsis</Text>
        {currentManga.description ? (
          <Text style={styles.descriptionText}>{currentManga.description}</Text>
        ) : loadingDetails ? (
          <View style={styles.synopsisLoadingRow}>
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={styles.synopsisLoadingText}>Loading full synopsis...</Text>
          </View>
        ) : (
          <Text style={styles.descriptionText}>No synopsis provided by source.</Text>
        )}
      </View>

      {/* Chapters Section Toolbar */}
      <View style={styles.chapterSectionHeader}>
        {/* Left: Prominent Chapters Title & Count Badge */}
        <View style={styles.chapterTitleWrap}>
          <Text style={styles.chapterMainHeading}>Chapters</Text>
          <View style={styles.chapterCountBadge}>
            <Text style={styles.chapterCountBadgeText}>{chapters.length}</Text>
          </View>
        </View>

        {/* Right: Balanced, evenly spaced toolbar buttons */}
        {chapters.length > 0 && (
          <View style={styles.chapterControlsRow}>
            {/* Sort Toggle Button */}
            <TouchableOpacity
              style={styles.sortToggleBtn}
              onPress={() => {
                userManuallyToggledSort.current = true;
                setSortAscending((prev) => !prev);
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="swap-vertical" size={13} color="#a78bfa" />
              <Text style={styles.sortToggleText}>
                {sortAscending ? '1 ➔ Recent' : 'Recent ➔ 1'}
              </Text>
            </TouchableOpacity>

            {/* Multi-Select Mode Toggle */}
            <TouchableOpacity
              style={[styles.selectModeBtn, isSelectionMode && styles.selectModeBtnActive]}
              onPress={() => {
                setIsSelectionMode((prev) => !prev);
                setSelectedChapterIds(new Set());
              }}
              activeOpacity={0.8}
            >
              <Ionicons
                name={isSelectionMode ? 'close-circle' : 'checkbox-outline'}
                size={14}
                color={isSelectionMode ? '#ffffff' : '#a78bfa'}
              />
              <Text
                style={[
                  styles.selectModeBtnText,
                  isSelectionMode && styles.selectModeBtnTextActive,
                ]}
              >
                {isSelectionMode ? 'Done' : 'Select'}
              </Text>
            </TouchableOpacity>

            {/* Quick Batch Download Next 3 */}
            {!isSelectionMode && (
              <TouchableOpacity
                style={styles.batchDownloadBtn}
                onPress={handleDownloadNextThree}
                disabled={downloadingBatch}
                activeOpacity={0.8}
              >
                {downloadingBatch ? (
                  <View style={styles.batchDownloadLoading}>
                    <ActivityIndicator size="small" color="#7c5cff" />
                    {batchProgress && (
                      <Text style={styles.batchProgressText}>
                        {batchProgress.current}/{batchProgress.total}
                      </Text>
                    )}
                  </View>
                ) : (
                  <>
                    <Ionicons name="cloud-download-outline" size={14} color="#7c5cff" />
                    <Text style={styles.batchDownloadBtnText}>Next 3</Text>
                  </>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {/* Selection Mode Quick Select-All Strip */}
      {isSelectionMode && (
        <View style={styles.selectionToolbarStrip}>
          <TouchableOpacity
            style={styles.selectAllBtn}
            onPress={handleSelectAll}
            activeOpacity={0.7}
          >
            <Ionicons
              name={
                selectedChapterIds.size === displayedChapters.length && displayedChapters.length > 0
                  ? 'checkbox'
                  : 'square-outline'
              }
              size={16}
              color={colors.primary}
            />
            <Text style={styles.selectAllBtnText}>
              {selectedChapterIds.size === displayedChapters.length
                ? 'Deselect All'
                : `Select All (${displayedChapters.length})`}
            </Text>
          </TouchableOpacity>
          <Text style={styles.selectedCountText}>
            {selectedChapterIds.size} selected
          </Text>
        </View>
      )}

      {loading && (
        <ActivityIndicator size="small" color={colors.primary} style={{ marginTop: 20 }} />
      )}

      {!loading && chapters.length === 0 && (
        <View style={styles.emptyCard}>
          <Ionicons name="information-circle-outline" size={32} color={colors.accent} />
          <Text style={styles.emptyCardTitle}>No scanlation chapters available</Text>
          <Text style={styles.emptyCardSubtitle}>
            {manga.sourceId === 'mangadex-org'
              ? 'This title may have official publisher licenses (e.g. MANGA Plus, Viz, or Tappytoon) where chapters are linked externally. For full chapter scans, check the MangaRead, ManhuaPlus, or MangaSushi extensions!'
              : 'The source did not return readable chapters for this manga.'}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header Bar */}
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={onBack} style={styles.headerBtn} testID="detail-back-button" accessibilityLabel="Back to Catalog">
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {currentManga.title}
          </Text>
          <TouchableOpacity onPress={handleToggleFavorite} style={styles.headerBtn}>
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={22}
              color={isFavorite ? '#ef4444' : colors.textPrimary}
            />
          </TouchableOpacity>
        </View>

        {/* High performance virtualized FlatList */}
        <FlatList
          data={displayedChapters}
          keyExtractor={keyExtractor}
          renderItem={renderChapterItem}
          ListHeaderComponent={renderHeader}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          initialNumToRender={20}
          maxToRenderPerBatch={25}
          windowSize={11}
          removeClippedSubviews={Platform.OS === 'android'}
          getItemLayout={getItemLayout}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefreshChapters}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
        />

        {/* Floating Multi-Select Action Bar */}
        {isSelectionMode && selectedChapterIds.size > 0 && (
          <View style={styles.floatingActionBar}>
            <View style={styles.floatingActionRow}>
              <TouchableOpacity
                style={styles.floatingActionBtn}
                onPress={handleBatchDownloadSelected}
                disabled={downloadingBatch}
              >
                <Ionicons name="cloud-download-outline" size={20} color="#7c5cff" />
                <Text style={styles.floatingActionBtnText}>
                  {downloadingBatch
                    ? `${batchProgress?.current || 0}/${batchProgress?.total || 0}`
                    : `Download (${selectedChapterIds.size})`}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.floatingActionBtn}
                onPress={() => handleBatchMarkRead(true)}
              >
                <Ionicons name="checkmark-done" size={20} color="#10b981" />
                <Text style={styles.floatingActionBtnText}>Read</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.floatingActionBtn}
                onPress={() => handleBatchMarkRead(false)}
              >
                <Ionicons name="ellipse-outline" size={18} color="#9ca3af" />
                <Text style={styles.floatingActionBtnText}>Unread</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.floatingActionBtn}
                onPress={handleBatchDeleteSelected}
              >
                <Ionicons name="trash-outline" size={19} color="#ef4444" />
                <Text style={[styles.floatingActionBtnText, { color: '#ef4444' }]}>
                  Delete
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <ProUpgradeModal
          visible={showProModal}
          onClose={() => setShowProModal(false)}
        />
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  safeArea: {
    flex: 1,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerTitle: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginHorizontal: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 90,
  },
  headerContainer: {
    paddingTop: 16,
  },
  heroSection: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 16,
  },
  coverImage: {
    width: 110,
    height: 160,
    borderRadius: 12,
    backgroundColor: colors.card,
  },
  heroDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  mangaTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 4,
  },
  mangaAltTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontStyle: 'italic',
    marginBottom: 6,
    lineHeight: 16,
  },
  mangaAuthor: {
    color: colors.textSecondary,
    fontSize: 13,
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  pillBadgeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  mainActionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  resumeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  resumeButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  bookmarkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
  },
  bookmarkButtonActive: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  bookmarkButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
  },
  bookmarkButtonTextActive: {
    color: '#ffffff',
  },
  sectionCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 20,
  },
  sectionHeading: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  descriptionText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
  },
  chapterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 10,
  },
  chapterTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chapterMainHeading: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  chapterCountBadge: {
    backgroundColor: 'rgba(124, 92, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  chapterCountBadgeText: {
    color: '#a78bfa',
    fontSize: 12,
    fontWeight: '800',
  },
  chapterControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  sortToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124, 92, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.25)',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 9,
  },
  sortToggleText: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '700',
  },
  selectModeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124, 92, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  selectModeBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectModeBtnText: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '700',
  },
  selectModeBtnTextActive: {
    color: '#ffffff',
  },
  batchDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(124, 92, 255, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 9,
  },
  batchDownloadBtnText: {
    color: '#a78bfa',
    fontSize: 11,
    fontWeight: '700',
  },
  batchDownloadLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  batchProgressText: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '700',
  },
  selectionToolbarStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(124, 92, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectAllBtnText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  selectedCountText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  selectionCheckbox: {
    marginRight: 10,
  },
  chapterItemRow: {
    height: CHAPTER_ITEM_HEIGHT - 8,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chapterItemRowSelected: {
    backgroundColor: 'rgba(124, 92, 255, 0.14)',
    borderColor: colors.primary,
  },
  chapterInfoArea: {
    flex: 1,
    justifyContent: 'center',
  },
  chapterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chapterTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    flexShrink: 1,
  },
  chapterReadTitle: {
    color: colors.textMuted,
  },
  externalChapterTitle: {
    color: colors.textSecondary,
  },
  chapterMetaRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 3,
  },
  chapterMetaText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  downloadChapterBtn: {
    padding: 8,
    marginRight: 2,
  },
  downloadedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
  },
  downloadedBadgeText: {
    color: '#10b981',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  readToggleBtn: {
    padding: 6,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
  },
  emptyCardTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 6,
  },
  emptyCardSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  synopsisLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  synopsisLoadingText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  // Floating Action Bar for Multi-Select Mode
  floatingActionBar: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(18, 18, 26, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.4)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  floatingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  floatingActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 3,
  },
  floatingActionBtnText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
  },
});
