import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Manga, Chapter } from '../types';
import {
  getDownloadedMangaList,
  getDownloadedChaptersForManga,
  deleteDownloadedChapter,
  deleteDownloadsForManga,
  deleteAllDownloads,
  getDownloadsStorageStats,
  DownloadedChapterRecord,
} from '../services/downloads';
import { pickAndImportComicFile } from '../services/sources/localSource';
import { getAllManga } from '../services/storage';
import { colors } from '../theme/colors';

interface DownloadsScreenProps {
  onOpenManga: (manga: Manga) => void;
  onOpenChapter?: (chapter: Chapter, allChapters: Chapter[], manga: Manga) => void;
  onNavigateToBookmarks?: () => void;
  onNavigateToExtensions?: () => void;
  isFocused?: boolean;
}

interface MangaDownloadItem {
  manga: Manga;
  chapters: DownloadedChapterRecord[];
  isExpanded?: boolean;
}

export const DownloadsScreen = React.memo<DownloadsScreenProps>(({
  onOpenManga,
  onOpenChapter,
  onNavigateToBookmarks,
  onNavigateToExtensions,
  isFocused = true,
}) => {
  const [downloadedItems, setDownloadedItems] = useState<MangaDownloadItem[]>([]);
  const [localComics, setLocalComics] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [storageStats, setStorageStats] = useState<{
    chapterCount: number;
    totalPages: number;
    estimatedSizeMb: number;
  }>({ chapterCount: 0, totalPages: 0, estimatedSizeMb: 0 });
  const [activeFilter, setActiveFilter] = useState<'all' | 'downloaded' | 'local'>('all');
  const [expandedMangaIds, setExpandedMangaIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  const loadOfflineData = useCallback(async (isBackground = false) => {
    try {
      if (!isBackground) {
        setLoading(true);
      }
      const [mangasWithDownloads, allSaved, stats] = await Promise.all([
        getDownloadedMangaList(),
        getAllManga(),
        getDownloadsStorageStats(),
      ]);

      const localList = allSaved.filter((m) => m.sourceId === 'local-storage');
      setLocalComics(localList);
      setStorageStats(stats);

      // Fetch chapter records for each downloaded manga
      const items: MangaDownloadItem[] = await Promise.all(
        mangasWithDownloads.map(async (m) => {
          const chapters = await getDownloadedChaptersForManga(m.id);
          return {
            manga: m,
            chapters,
          };
        })
      );

      setDownloadedItems(items);
    } catch (err) {
      console.error('[DownloadsScreen] Error loading downloads:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadOfflineData();
  }, [loadOfflineData]);

  // Refresh whenever screen receives focus
  useEffect(() => {
    if (isFocused) {
      loadOfflineData(downloadedItems.length > 0);
    }
  }, [isFocused, loadOfflineData]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadOfflineData(false);
  };

  const toggleExpand = (mangaId: string) => {
    setExpandedMangaIds((prev) => {
      const next = new Set(prev);
      if (next.has(mangaId)) {
        next.delete(mangaId);
      } else {
        next.add(mangaId);
      }
      return next;
    });
  };

  const handleDeleteChapter = (chapterId: string, mangaId: string, chapterTitle: string) => {
    Alert.alert(
      'Delete Offline Chapter',
      `Delete "${chapterTitle}" from device storage?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDownloadedChapter(chapterId, mangaId);
              await loadOfflineData();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete chapter.');
            }
          },
        },
      ]
    );
  };

  const handleDeleteMangaDownloads = (mangaId: string, title: string) => {
    Alert.alert(
      'Delete All Downloads',
      `Delete all downloaded chapters for "${title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDownloadsForManga(mangaId);
              await loadOfflineData();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete downloads.');
            }
          },
        },
      ]
    );
  };

  const handleClearAllStorage = () => {
    if (storageStats.chapterCount === 0) {
      Alert.alert('Downloads Empty', 'You have no downloaded chapters to clear.');
      return;
    }
    Alert.alert(
      'Clear All Offline Downloads',
      `This will remove all ${storageStats.chapterCount} offline chapters (~${storageStats.estimatedSizeMb} MB) from your device.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteAllDownloads();
              await loadOfflineData();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to clear downloads.');
            }
          },
        },
      ]
    );
  };

  const handleImportLocal = async () => {
    try {
      setImporting(true);
      const imported = await pickAndImportComicFile();
      if (imported) {
        Alert.alert('Imported Successfully', `Added "${imported.title}" to offline library.`);
        await loadOfflineData();
        onOpenManga(imported);
      }
    } catch (err: any) {
      Alert.alert('Import Failed', err?.message || 'Unable to import file.');
    } finally {
      setImporting(false);
    }
  };

  const handleReadChapterOffline = (manga: Manga, chRecord: DownloadedChapterRecord, allRecords: DownloadedChapterRecord[]) => {
    if (!onOpenChapter) {
      onOpenManga(manga);
      return;
    }
    const currentChapter: Chapter = {
      id: chRecord.chapterId,
      mangaId: manga.id,
      chapterNumber: chRecord.chapterNumber,
      title: chRecord.title,
      sourceId: manga.sourceId,
      totalPages: chRecord.totalPages,
      isRead: false,
      lastReadPageIndex: 0,
    };
    const mappedAll: Chapter[] = allRecords.map((r) => ({
      id: r.chapterId,
      mangaId: manga.id,
      chapterNumber: r.chapterNumber,
      title: r.title,
      sourceId: manga.sourceId,
      totalPages: r.totalPages,
      isRead: false,
      lastReadPageIndex: 0,
    }));
    onOpenChapter(currentChapter, mappedAll, manga);
  };

  // Filter content
  const hasDownloads = downloadedItems.length > 0;
  const hasLocal = localComics.length > 0;
  const totalOfflineTitles = (activeFilter === 'local' ? 0 : downloadedItems.length) + (activeFilter === 'downloaded' ? 0 : localComics.length);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>DOWNLOADS</Text>
            <Text style={styles.headerSubtitle}>Offline Storage & Reading Hub</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleImportLocal}
              disabled={importing}
              activeOpacity={0.7}
            >
              {importing ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <Ionicons name="folder-open-outline" size={20} color={colors.accent} />
              )}
            </TouchableOpacity>
            {storageStats.chapterCount > 0 && (
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={handleClearAllStorage}
                activeOpacity={0.7}
              >
                <Ionicons name="trash-bin-outline" size={20} color={colors.danger} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Offline Banner & Storage Info Card */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <View style={styles.badgeRow}>
              <View style={styles.offlinePill}>
                <Ionicons name="flash" size={12} color="#10b981" />
                <Text style={styles.offlinePillText}>100% OFFLINE READY</Text>
              </View>
            </View>
            <Text style={styles.storageEstimateText}>
              ~{storageStats.estimatedSizeMb} MB Used
            </Text>
          </View>

          <View style={styles.statCountersRow}>
            <View style={styles.statCounterItem}>
              <Text style={styles.statCounterNumber}>{storageStats.chapterCount}</Text>
              <Text style={styles.statCounterLabel}>Offline Chapters</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCounterItem}>
              <Text style={styles.statCounterNumber}>{downloadedItems.length}</Text>
              <Text style={styles.statCounterLabel}>Saved Series</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCounterItem}>
              <Text style={styles.statCounterNumber}>{localComics.length}</Text>
              <Text style={styles.statCounterLabel}>Local .CBZ</Text>
            </View>
          </View>
        </View>

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'all' && styles.filterPillActive]}
            onPress={() => setActiveFilter('all')}
            delayPressIn={0}
          >
            <Text style={[styles.filterPillText, activeFilter === 'all' && styles.filterPillTextActive]}>
              All ({downloadedItems.length + localComics.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'downloaded' && styles.filterPillActive]}
            onPress={() => setActiveFilter('downloaded')}
            delayPressIn={0}
          >
            <Ionicons
              name="cloud-done"
              size={12}
              color={activeFilter === 'downloaded' ? '#ffffff' : '#10b981'}
            />
            <Text style={[styles.filterPillText, activeFilter === 'downloaded' && styles.filterPillTextActive]}>
              Downloaded ({downloadedItems.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterPill, activeFilter === 'local' && styles.filterPillActive]}
            onPress={() => setActiveFilter('local')}
            delayPressIn={0}
          >
            <Ionicons
              name="document-text-outline"
              size={12}
              color={activeFilter === 'local' ? '#ffffff' : colors.accent}
            />
            <Text style={[styles.filterPillText, activeFilter === 'local' && styles.filterPillTextActive]}>
              Local Files ({localComics.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
          >
            {/* Downloaded Extension Manga Section */}
            {activeFilter !== 'local' && downloadedItems.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Downloaded Chapters</Text>
                {downloadedItems.map(({ manga, chapters }) => {
                  const isExpanded = expandedMangaIds.has(manga.id);
                  return (
                    <View key={manga.id} style={styles.mangaCard}>
                      <TouchableOpacity
                        style={styles.mangaHeader}
                        onPress={() => onOpenManga(manga)}
                        activeOpacity={0.8}
                      >
                        <Image
                          source={{
                            uri: manga.coverUrl,
                            headers: {
                              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                              ...(manga.coverUrl.match(/https?:\/\/[^\/]+/)
                                ? { Referer: `${manga.coverUrl.match(/https?:\/\/[^\/]+/)?.[0]}/` }
                                : {}),
                            },
                          }}
                          style={styles.coverThumbnail}
                          contentFit="cover"
                          transition={150}
                        />

                        <View style={styles.mangaInfo}>
                          <Text style={styles.mangaTitle} numberOfLines={2}>
                            {manga.title}
                          </Text>
                          <Text style={styles.mangaSource} numberOfLines={1}>
                            {manga.sourceName || 'Online Source'}
                          </Text>
                          <View style={styles.mangaBadgeRow}>
                            <View style={styles.chapterBadge}>
                              <Ionicons name="download" size={11} color="#10b981" />
                              <Text style={styles.chapterBadgeText}>
                                {chapters.length} {chapters.length === 1 ? 'Chapter' : 'Chapters'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={styles.mangaActions}>
                          {chapters.length > 0 && (
                            <TouchableOpacity
                              style={styles.quickReadBtn}
                              onPress={() => handleReadChapterOffline(manga, chapters[0], chapters)}
                              activeOpacity={0.8}
                            >
                              <Ionicons name="play" size={14} color="#ffffff" />
                              <Text style={styles.quickReadText}>Read</Text>
                            </TouchableOpacity>
                          )}
                          <TouchableOpacity
                            style={styles.expandBtn}
                            onPress={() => toggleExpand(manga.id)}
                            activeOpacity={0.7}
                          >
                            <Ionicons
                              name={isExpanded ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color={colors.textSecondary}
                            />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>

                      {/* Expandable Chapter List */}
                      {isExpanded && (
                        <View style={styles.expandedChaptersContainer}>
                          <View style={styles.expandedHeader}>
                            <Text style={styles.expandedHeaderText}>
                              Offline Files ({chapters.length})
                            </Text>
                            <TouchableOpacity
                              onPress={() => handleDeleteMangaDownloads(manga.id, manga.title)}
                            >
                              <Text style={styles.deleteAllText}>Delete All</Text>
                            </TouchableOpacity>
                          </View>

                          {chapters.map((ch) => (
                            <View key={ch.chapterId} style={styles.chapterRow}>
                              <View style={styles.chapterInfo}>
                                <Text style={styles.chapterTitle} numberOfLines={1}>
                                  Ch. {ch.chapterNumber}: {ch.title}
                                </Text>
                                <Text style={styles.chapterMeta}>
                                  {ch.totalPages} pages • {new Date(ch.downloadedAt).toLocaleDateString()}
                                </Text>
                              </View>
                              <View style={styles.chapterActionsRow}>
                                <TouchableOpacity
                                  style={styles.readChapterMiniBtn}
                                  onPress={() => handleReadChapterOffline(manga, ch, chapters)}
                                >
                                  <Ionicons name="book-outline" size={14} color="#ffffff" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  style={styles.deleteChapterBtn}
                                  onPress={() =>
                                    handleDeleteChapter(ch.chapterId, manga.id, ch.title)
                                  }
                                >
                                  <Ionicons name="trash-outline" size={15} color={colors.danger} />
                                </TouchableOpacity>
                              </View>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            )}

            {/* Local CBZ/CBR Comics Section */}
            {activeFilter !== 'downloaded' && localComics.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Local Imported Comics (.CBZ)</Text>
                {localComics.map((manga) => (
                  <TouchableOpacity
                    key={manga.id}
                    style={styles.localMangaCard}
                    onPress={() => onOpenManga(manga)}
                    activeOpacity={0.8}
                  >
                    <Image
                      source={{ uri: manga.coverUrl }}
                      style={styles.localCoverThumbnail}
                      contentFit="cover"
                      transition={150}
                    />
                    <View style={styles.mangaInfo}>
                      <Text style={styles.mangaTitle} numberOfLines={2}>
                        {manga.title}
                      </Text>
                      <Text style={styles.mangaSource} numberOfLines={1}>
                        Local Device Storage
                      </Text>
                      <View style={styles.localBadge}>
                        <Ionicons name="folder" size={11} color={colors.accent} />
                        <Text style={styles.localBadgeText}>Local Comic</Text>
                      </View>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* Empty State */}
            {totalOfflineTitles === 0 && (
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="cloud-offline-outline" size={48} color={colors.accent} />
                </View>
                <Text style={styles.emptyTitle}>No Offline Manga Found</Text>
                <Text style={styles.emptySubtitle}>
                  {activeFilter === 'local'
                    ? 'No local comic files imported yet. Tap "+ Import .CBZ" below to add comic archives.'
                    : 'Download chapters while connected to the internet to read smoothly offline anytime.'}
                </Text>

                <View style={styles.emptyActionButtons}>
                  <TouchableOpacity
                    style={styles.emptyPrimaryBtn}
                    onPress={handleImportLocal}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="folder-open" size={16} color="#ffffff" />
                    <Text style={styles.emptyPrimaryBtnText}>Import .CBZ Comic</Text>
                  </TouchableOpacity>

                  {onNavigateToExtensions && (
                    <TouchableOpacity
                      style={styles.emptySecondaryBtn}
                      onPress={onNavigateToExtensions}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="compass-outline" size={16} color={colors.accent} />
                      <Text style={styles.emptySecondaryBtnText}>Explore Extensions</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.black,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  actionBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  offlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  offlinePillText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  storageEstimateText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  statCountersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: 4,
  },
  statCounterItem: {
    alignItems: 'center',
    flex: 1,
  },
  statCounterNumber: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '800',
  },
  statCounterLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.border,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 12,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterPillActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterPillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  filterPillTextActive: {
    color: '#ffffff',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  mangaCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    overflow: 'hidden',
  },
  mangaHeader: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  coverThumbnail: {
    width: 50,
    height: 70,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  mangaInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  mangaTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 18,
  },
  mangaSource: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  mangaBadgeRow: {
    flexDirection: 'row',
    marginTop: 5,
  },
  chapterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  chapterBadgeText: {
    color: '#10b981',
    fontSize: 10,
    fontWeight: '700',
  },
  mangaActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: 6,
  },
  quickReadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  quickReadText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  expandBtn: {
    padding: 6,
  },
  expandedChaptersContainer: {
    backgroundColor: '#0e0e14',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
  },
  expandedHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  expandedHeaderText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  deleteAllText: {
    color: colors.danger,
    fontSize: 11,
    fontWeight: '700',
  },
  chapterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  chapterInfo: {
    flex: 1,
    marginRight: 8,
  },
  chapterTitle: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  chapterMeta: {
    color: colors.textMuted,
    fontSize: 10,
    marginTop: 2,
  },
  chapterActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  readChapterMiniBtn: {
    backgroundColor: colors.primary,
    width: 28,
    height: 28,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteChapterBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  localMangaCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 8,
  },
  localCoverThumbnail: {
    width: 44,
    height: 60,
    borderRadius: 6,
    backgroundColor: colors.border,
  },
  localBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  localBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '600',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(45, 212, 191, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 24,
  },
  emptyActionButtons: {
    gap: 10,
    width: '100%',
    maxWidth: 240,
  },
  emptyPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  emptySecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptySecondaryBtnText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
