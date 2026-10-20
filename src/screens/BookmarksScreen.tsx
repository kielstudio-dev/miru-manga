import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Manga, ReaderSettings } from '../types';
import { MangaCard } from '../components/library/MangaCard';
import { sampleSource } from '../services/sources/sampleSource';
import { pickAndImportComicFile } from '../services/sources/localSource';
import {
  getAllManga,
  saveManga,
  saveChapters,
  toggleBookmarkManga,
  markAllChaptersReadForManga,
  getSettings,
} from '../services/storage';
import { AdBanner } from '../components/monetization/AdBanner';
import { ProUpgradeModal } from '../components/monetization/ProUpgradeModal';
import { subscribeToProStatus } from '../services/monetization';
import { colors } from '../theme/colors';

interface BookmarksScreenProps {
  onOpenManga: (manga: Manga) => void;
  onNavigateToExtensions?: () => void;
  onNavigateToDownloads?: () => void;
  isFocused?: boolean;
}

type FilterType = 'all' | 'favorites' | 'reading' | 'completed' | 'local';

export const BookmarksScreen: React.FC<BookmarksScreenProps> = ({
  onOpenManga,
  onNavigateToExtensions,
  onNavigateToDownloads,
  isFocused = true,
}) => {
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [importing, setImporting] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [proModalVisible, setProModalVisible] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);

  // Quick Action Long-Press State
  const [selectedQuickManga, setSelectedQuickManga] = useState<Manga | null>(null);
  const [quickActionVisible, setQuickActionVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((cur) => (cur === msg ? null : cur));
    }, 2400);
  };

  const handleOpenQuickAction = (manga: Manga) => {
    setSelectedQuickManga(manga);
    setQuickActionVisible(true);
  };

  useEffect(() => {
    const unsub = subscribeToProStatus(setIsPro);
    return unsub;
  }, []);

  const loadBookmarks = useCallback(async () => {
    try {
      const [saved, curSettings] = await Promise.all([
        getAllManga(),
        getSettings(),
      ]);
      if (curSettings) setSettings(curSettings);
      if (saved.length === 0) {
        const samples = await sampleSource.getMangaList();
        for (const s of samples) {
          await saveManga({ ...s, isFavorite: true }); // Bookmark samples initially so app is never empty!
          const chs = await sampleSource.getChapters(s.id);
          await saveChapters(s.id, chs);
        }
        const refreshed = await getAllManga();
        setMangas(refreshed);
      } else {
        setMangas(saved);
      }
    } catch (err) {
      console.error('[BookmarksScreen] Error loading bookmarks:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  // Refresh whenever screen receives focus
  useEffect(() => {
    if (isFocused) {
      getAllManga().then((saved) => setMangas(saved)).catch(() => {});
    }
  }, [isFocused]);

  const handleRefresh = () => {
    setRefreshing(true);
    loadBookmarks();
  };

  const handleImportFile = async () => {
    try {
      setImporting(true);
      const imported = await pickAndImportComicFile();
      if (imported) {
        Alert.alert('Imported Successfully', `Added "${imported.title}" to bookmarks.`);
        await loadBookmarks();
        onOpenManga(imported);
      }
    } catch (err: any) {
      Alert.alert('Import Failed', err?.message || 'Unable to import file.');
    } finally {
      setImporting(false);
    }
  };

  // Helper: check if a title belongs in user's saved collection
  const isInLibrary = (m: Manga) =>
    Boolean(m.isFavorite || m.lastReadChapterId || m.sourceId === 'local-storage');

  // Completed by user: saved in library, has chapters loaded, and user has 0 unread chapters left!
  const isCompletedByUser = (m: Manga) =>
    isInLibrary(m) && (m.totalChapters ?? 0) > 0 && (m.unreadCount ?? 0) === 0;

  // Reading in progress: has reading progress and still has unread chapters
  const isReadingByUser = (m: Manga) =>
    isInLibrary(m) && Boolean(m.lastReadChapterId) && !isCompletedByUser(m);

  // Recent read item for "Continue Reading" hero card
  const recentManga = mangas.find((m) => m.lastReadAt && m.lastReadChapterId);

  // Filter bookmarked manga
  const filteredMangas = mangas.filter((m) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !query ||
      m.title.toLowerCase().includes(query) ||
      Boolean(m.altTitle && m.altTitle.toLowerCase().includes(query)) ||
      Boolean(m.author && m.author.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    // Filters
    if (activeFilter === 'favorites') return Boolean(m.isFavorite);
    if (activeFilter === 'reading') return isReadingByUser(m);
    if (activeFilter === 'completed') return isCompletedByUser(m);
    if (activeFilter === 'local') return m.sourceId === 'local-storage';

    // 'all': returns bookmarked titles, reading titles, or imported titles
    return isInLibrary(m);
  });

  const handleToggleQuickBookmark = async () => {
    if (!selectedQuickManga) return;
    try {
      const isNowBookmarked = await toggleBookmarkManga(selectedQuickManga);
      await loadBookmarks();
      setQuickActionVisible(false);
      showToast(
        isNowBookmarked
          ? `Added "${selectedQuickManga.title}" to Bookmarks! ❤️`
          : `Removed "${selectedQuickManga.title}" from Bookmarks.`
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update bookmarks.');
    }
  };

  const handleToggleMarkCompleted = async () => {
    if (!selectedQuickManga) return;
    try {
      const isCurrentlyCompleted = isCompletedByUser(selectedQuickManga);
      await markAllChaptersReadForManga(selectedQuickManga.id, !isCurrentlyCompleted);
      await loadBookmarks();
      setQuickActionVisible(false);
      showToast(
        !isCurrentlyCompleted
          ? `Marked "${selectedQuickManga.title}" as Completed! 🎉`
          : `Marked "${selectedQuickManga.title}" as In Progress.`
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update reading status.');
    }
  };

  const favoritesCount = mangas.filter((m) => m.isFavorite).length;
  const readingCount = mangas.filter(isReadingByUser).length;
  const completedCount = mangas.filter(isCompletedByUser).length;

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>BOOKMARKS</Text>
            <Text style={styles.headerSubtitle}>
              {mangas.length > 0
                ? `${favoritesCount} Favorited • ${readingCount} Reading • ${completedCount} Completed`
                : 'Manga & Comic Dashboard'}
            </Text>
          </View>
          <View style={styles.headerActions}>
            {isPro ? (
              <TouchableOpacity
                style={styles.proBadgeActive}
                onPress={() => setProModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="diamond" size={13} color="#f59e0b" />
                <Text style={styles.proBadgeActiveText}>PRO</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.proUpgradeHeaderBtn}
                onPress={() => setProModalVisible(true)}
                activeOpacity={0.8}
              >
                <Ionicons name="sparkles" size={13} color="#ffffff" />
                <Text style={styles.proUpgradeHeaderText}>PRO</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleImportFile}
              disabled={importing}
              activeOpacity={0.7}
            >
              {importing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="folder-open-outline" size={20} color={colors.textPrimary} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search bookmarks, authors, titles..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Filter Pills */}
        <View style={styles.filterPillsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsContainer}
          >
            <TouchableOpacity
              style={[styles.pill, activeFilter === 'all' && styles.activePill]}
              onPress={() => setActiveFilter('all')}
            >
              <Text style={[styles.pillText, activeFilter === 'all' && styles.activePillText]}>
                All Bookmarks
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, activeFilter === 'favorites' && styles.activeFavoritePill]}
              onPress={() => setActiveFilter('favorites')}
            >
              <Ionicons
                name="heart"
                size={13}
                color={activeFilter === 'favorites' ? '#ffffff' : '#ef4444'}
              />
              <Text style={[styles.pillText, activeFilter === 'favorites' && styles.activePillText]}>
                Favorites ({favoritesCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, activeFilter === 'reading' && styles.activePill]}
              onPress={() => setActiveFilter('reading')}
            >
              <Ionicons
                name="book-outline"
                size={13}
                color={activeFilter === 'reading' ? '#ffffff' : colors.accent}
              />
              <Text style={[styles.pillText, activeFilter === 'reading' && styles.activePillText]}>
                Reading ({readingCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, activeFilter === 'completed' && styles.activePill]}
              onPress={() => setActiveFilter('completed')}
            >
              <Ionicons
                name="checkmark-circle-outline"
                size={13}
                color={activeFilter === 'completed' ? '#ffffff' : '#10b981'}
              />
              <Text style={[styles.pillText, activeFilter === 'completed' && styles.activePillText]}>
                Completed ({completedCount})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, activeFilter === 'local' && styles.activePill]}
              onPress={() => setActiveFilter('local')}
            >
              <Ionicons
                name="folder-outline"
                size={13}
                color={activeFilter === 'local' ? '#ffffff' : colors.textMuted}
              />
              <Text style={[styles.pillText, activeFilter === 'local' && styles.activePillText]}>
                Local .CBZ
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Manga Grid / List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredMangas}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={filteredMangas.length > 0 ? styles.columnWrapper : undefined}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
            ListHeaderComponent={
              <>
                {/* Continue Reading Shelf Card */}
                {Boolean(recentManga && !searchQuery && activeFilter !== 'favorites') && (
                  <TouchableOpacity
                    style={styles.continueCard}
                    onPress={() => onOpenManga(recentManga!)}
                    activeOpacity={0.85}
                  >
                    <Image
                      source={{
                        uri: recentManga!.coverUrl,
                        headers: {
                          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                          ...(recentManga!.coverUrl.match(/https?:\/\/[^\/]+/)
                            ? { Referer: `${recentManga!.coverUrl.match(/https?:\/\/[^\/]+/)?.[0]}/` }
                            : {}),
                        },
                      }}
                      style={styles.continueCover}
                      contentFit="cover"
                      transition={150}
                    />
                    <View style={styles.continueInfo}>
                      <View style={styles.continueBadge}>
                        <Ionicons name="time-outline" size={12} color={colors.accent} />
                        <Text style={styles.continueBadgeText}>CONTINUE READING</Text>
                      </View>
                      <Text style={styles.continueTitle} numberOfLines={1}>
                        {recentManga!.title}
                      </Text>
                      <Text style={styles.continueSource} numberOfLines={1}>
                        {recentManga!.sourceName}
                      </Text>
                    </View>
                    <View style={styles.continuePlayBtn}>
                      <Ionicons name="play" size={18} color="#ffffff" />
                    </View>
                  </TouchableOpacity>
                )}
              </>
            }
            renderItem={({ item }) => (
              <MangaCard
                manga={item}
                onPress={onOpenManga}
                onLongPress={handleOpenQuickAction}
                blurCover={Boolean(settings?.blurNsfwCovers)}
              />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <View style={styles.emptyIconCircle}>
                  <Ionicons name="bookmark-outline" size={44} color={colors.primary} />
                </View>
                <Text style={styles.emptyTitle}>
                  {searchQuery ? 'No bookmarks match your search' : 'No Bookmarks Found'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery
                    ? `No titles in your bookmarks match "${searchQuery}".`
                    : activeFilter === 'favorites'
                    ? 'Tap the heart icon on any manga to pin it to your favorites.'
                    : activeFilter === 'reading'
                    ? 'Titles you start reading will appear here automatically.'
                    : activeFilter === 'completed'
                    ? 'Titles where you have finished reading all chapters will appear here.'
                    : 'Discover thousands of manga from online extensions or import your own .CBZ comic files.'}
                </Text>

                <View style={styles.emptyActions}>
                  {onNavigateToExtensions && (
                    <TouchableOpacity
                      style={styles.emptyPrimaryBtn}
                      onPress={onNavigateToExtensions}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="compass" size={16} color="#ffffff" />
                      <Text style={styles.emptyPrimaryBtnText}>Explore Extensions</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={styles.emptySecondaryBtn}
                    onPress={handleImportFile}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="folder-open-outline" size={16} color={colors.textPrimary} />
                    <Text style={styles.emptySecondaryBtnText}>Import .CBZ Comic</Text>
                  </TouchableOpacity>
                </View>
              </View>
            }
          />
        )}

        {/* Ad Banner on Free tier */}
        <AdBanner />

        {/* Pro Upgrade Modal */}
        <ProUpgradeModal
          visible={proModalVisible}
          onClose={() => setProModalVisible(false)}
        />

        {/* Quick Action Long Press Modal */}
        <Modal
          visible={quickActionVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setQuickActionVisible(false)}
        >
          <TouchableOpacity
            style={styles.quickModalBackdrop}
            activeOpacity={1}
            onPress={() => setQuickActionVisible(false)}
          >
            <View style={styles.quickModalContainer} onStartShouldSetResponder={() => true}>
              <View style={styles.quickModalDragPill} />

              {selectedQuickManga && (
                <>
                  <View style={styles.quickModalMangaHeader}>
                    <Image
                      source={{
                        uri: selectedQuickManga.coverUrl,
                        headers: {
                          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                          ...(selectedQuickManga.coverUrl.match(/https?:\/\/[^\/]+/)
                            ? { Referer: `${selectedQuickManga.coverUrl.match(/https?:\/\/[^\/]+/)?.[0]}/` }
                            : {}),
                        },
                      }}
                      style={styles.quickModalCover as any}
                      contentFit="cover"
                      transition={150}
                    />
                    <View style={styles.quickModalInfo}>
                      <Text style={styles.quickModalTitle} numberOfLines={2}>
                        {selectedQuickManga.title}
                      </Text>
                      <Text style={styles.quickModalAuthor} numberOfLines={1}>
                        {selectedQuickManga.author || selectedQuickManga.sourceName || 'Online Source'}
                      </Text>
                      <View style={styles.quickModalStatusRow}>
                        <View style={styles.inLibraryBadge}>
                          <Ionicons name="heart" size={12} color="#ffffff" />
                          <Text style={styles.inLibraryText}>In Bookmarks</Text>
                        </View>
                        {isCompletedByUser(selectedQuickManga) && (
                          <View style={[styles.inLibraryBadge, { backgroundColor: 'rgba(16, 185, 129, 0.16)', marginLeft: 6 }]}>
                            <Ionicons name="checkmark-circle" size={12} color="#10b981" />
                            <Text style={[styles.inLibraryText, { color: '#10b981' }]}>Completed</Text>
                          </View>
                        )}
                      </View>
                    </View>
                  </View>

                  {/* Actions */}
                  <View style={styles.quickModalActions}>
                    {/* 1. Primary Action: Read Now / Continue Reading */}
                    <TouchableOpacity
                      style={styles.quickModalBtnPrimary}
                      onPress={() => {
                        setQuickActionVisible(false);
                        onOpenManga(selectedQuickManga);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="book-outline" size={18} color="#ffffff" />
                      <Text style={styles.quickModalBtnPrimaryText}>
                        {selectedQuickManga.lastReadChapterId ? 'Continue Reading' : 'View & Read Manga'}
                      </Text>
                    </TouchableOpacity>

                    {/* 2. Secondary Action: Mark as Completed / In Progress */}
                    {Boolean((selectedQuickManga.totalChapters ?? 0) > 0) && (
                      <TouchableOpacity
                        style={styles.quickModalBtnSecondary}
                        onPress={handleToggleMarkCompleted}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={isCompletedByUser(selectedQuickManga) ? 'refresh-outline' : 'checkmark-done-circle'}
                          size={18}
                          color={isCompletedByUser(selectedQuickManga) ? colors.textSecondary : '#10b981'}
                        />
                        <Text style={styles.quickModalBtnSecondaryText}>
                          {isCompletedByUser(selectedQuickManga)
                            ? 'Mark as In Progress'
                            : 'Mark All Read (Completed)'}
                        </Text>
                      </TouchableOpacity>
                    )}

                    {/* 3. Refined Soft Action: Remove from Bookmarks */}
                    <TouchableOpacity
                      style={styles.quickModalBtnRemoveSoft}
                      onPress={handleToggleQuickBookmark}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="trash-outline" size={16} color="#f87171" />
                      <Text style={styles.quickModalBtnRemoveSoftText}>
                        Remove from Bookmarks
                      </Text>
                    </TouchableOpacity>

                    {/* 4. Cancel Button */}
                    <TouchableOpacity
                      style={styles.quickModalCancelBtn}
                      onPress={() => setQuickActionVisible(false)}
                      activeOpacity={0.7}
                    >
                      <Text style={styles.quickModalCancelText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Floating Toast Notification */}
        {toastMessage && (
          <View style={styles.toastContainer}>
            <Ionicons name="checkmark-circle" size={16} color="#10b981" />
            <Text style={styles.toastText} numberOfLines={1}>
              {toastMessage}
            </Text>
          </View>
        )}
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
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
  proUpgradeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  proUpgradeHeaderText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  proBadgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  proBadgeActiveText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '800',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
    paddingHorizontal: 12,
    height: 44,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    height: '100%',
  },
  filterPillsWrapper: {
    marginBottom: 10,
  },
  filterPillsContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  pill: {
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
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  activeFavoritePill: {
    backgroundColor: '#ef4444',
    borderColor: '#ef4444',
  },
  pillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activePillText: {
    color: '#ffffff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 16,
  },
  continueCover: {
    width: 52,
    height: 72,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  continueInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  continueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  continueBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  continueTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  continueSource: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  continuePlayBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 50,
    paddingHorizontal: 20,
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: 'rgba(124, 92, 255, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  emptyActions: {
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
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  quickModalContainer: {
    backgroundColor: '#12121a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  quickModalDragPill: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignSelf: 'center',
    marginBottom: 16,
  },
  quickModalMangaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  quickModalCover: {
    width: 52,
    height: 74,
    borderRadius: 8,
    backgroundColor: colors.border,
  },
  quickModalInfo: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  quickModalTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  quickModalAuthor: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  quickModalStatusRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  inLibraryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  inLibraryText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '700',
  },
  quickModalActions: {
    gap: 10,
  },
  quickModalBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  quickModalBtnRemoveSoft: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.22)',
    paddingVertical: 12,
    borderRadius: 12,
  },
  quickModalBtnRemoveSoftText: {
    color: '#f87171',
    fontSize: 13,
    fontWeight: '700',
  },
  quickModalBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  quickModalBtnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 13,
    borderRadius: 12,
  },
  quickModalBtnSecondaryText: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  quickModalCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  quickModalCancelText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  toastContainer: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    backgroundColor: '#1b1b26',
    borderWidth: 1,
    borderColor: '#2e2e42',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
