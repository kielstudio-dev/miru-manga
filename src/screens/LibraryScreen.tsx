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
  Platform,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Manga } from '../types';
import { MangaCard } from '../components/library/MangaCard';
import { sourceRegistry } from '../services/sources/registry';
import { sampleSource } from '../services/sources/sampleSource';
import { pickAndImportComicFile } from '../services/sources/localSource';
import { getAllManga, saveManga, saveChapters, getMangaById } from '../services/storage';
import { getDownloadedMangaList } from '../services/downloads';
import { getInstalledExtensions, subscribeToInstalledExtensions } from '../services/extensions/manager';
import { ExtensionManifest } from '../services/extensions/types';
import { AdBanner } from '../components/monetization/AdBanner';
import { ProUpgradeModal } from '../components/monetization/ProUpgradeModal';
import { subscribeToProStatus } from '../services/monetization';
import { colors } from '../theme/colors';

interface LibraryScreenProps {
  onOpenManga: (manga: Manga) => void;
  onOpenSettings: () => void;
  onOpenExtensions: () => void;
  activeFilter?: string;
  onFilterChange?: (filter: string) => void;
  isFocused?: boolean;
}

export const LibraryScreen: React.FC<LibraryScreenProps> = ({
  onOpenManga,
  onOpenSettings,
  onOpenExtensions,
  activeFilter,
  onFilterChange,
  isFocused = true,
}) => {
  const [mangas, setMangas] = useState<Manga[]>([]);
  const [installedExtensions, setInstalledExtensions] = useState<ExtensionManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilterState] = useState<string>(activeFilter || 'all');

  // Keep state synced with external activeFilter changes (e.g. returning to manga's tab)
  useEffect(() => {
    if (activeFilter !== undefined && activeFilter !== selectedFilter) {
      setSelectedFilterState(activeFilter);
    }
  }, [activeFilter]);

  const setSelectedFilter = (filter: string | ((prev: string) => string)) => {
    setSelectedFilterState((prev) => {
      const next = typeof filter === 'function' ? filter(prev) : filter;
      if (onFilterChange) {
        onFilterChange(next);
      }
      return next;
    });
  };
  const [downloadedMangaIds, setDownloadedMangaIds] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [proModalVisible, setProModalVisible] = useState(false);

  useEffect(() => {
    const unsub = subscribeToProStatus(setIsPro);
    return unsub;
  }, []);

const ONLINE_CATEGORIES = [
  { id: 'views', label: '🔥 Top' },
  { id: 'new-manga', label: '✨ New' },
  { id: 'manhwa', label: '🇰🇷 Manhwa' },
  { id: 'manhua', label: '🇨🇳 Manhua' },
  { id: 'manga', label: '🇯🇵 Manga' },
  { id: 'isekai', label: '🌀 Isekai' },
  { id: 'fantasy', label: '⚔️ Fantasy' },
  { id: 'school-life', label: '🏫 School Life' },
];

  // Online titles state for active extension tab
  const [onlineMangas, setOnlineMangas] = useState<Manga[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('views');
  const [onlinePage, setOnlinePage] = useState<number>(1);
  const [hasMoreOnline, setHasMoreOnline] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);

  // Load library titles & installed extensions
  const loadLibrary = useCallback(async () => {
    try {
      // Sync sample comics to latest verified URLs
      const samples = await sampleSource.getMangaList();
      for (const s of samples) {
        await saveManga(s);
        const chs = await sampleSource.getChapters(s.id);
        await saveChapters(s.id, chs);
      }
      let saved = await getAllManga();
      setMangas(saved);

      const installed = await getInstalledExtensions();
      setInstalledExtensions(installed);

      const downloadedList = await getDownloadedMangaList();
      setDownloadedMangaIds(new Set(downloadedList.map((m) => m.id)));

      // Auto-synchronize any library titles from extensions with the updated English (Original) style
      const outdatedTitles = saved.filter(
        (m) =>
          m.sourceId !== 'local-storage' &&
          m.sourceId !== 'sample-source' &&
          (!m.title.includes('(') || !m.altTitle)
      );

      if (outdatedTitles.length > 0) {
        let hasUpdates = false;
        for (const m of outdatedTitles) {
          try {
            const source = sourceRegistry.get(m.sourceId);
            if (source && source.getMangaDetails) {
              const details = await source.getMangaDetails(m.id);
              if (details && details.title && (details.title !== m.title || details.altTitle !== m.altTitle)) {
                const updated: Manga = {
                  ...m,
                  title: details.title,
                  altTitle: details.altTitle || m.altTitle,
                  coverUrl: details.coverUrl || m.coverUrl,
                };
                await saveManga(updated);
                hasUpdates = true;
              }
            }
          } catch (e) {
            // Ignore individual failure
          }
        }
        if (hasUpdates) {
          const refreshed = await getAllManga();
          setMangas(refreshed);
        }
      }
    } catch (err) {
      console.error('[LibraryScreen] Error loading library:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
  }, [loadLibrary]);

  // Refresh library when screen receives focus
  useEffect(() => {
    if (isFocused) {
      getAllManga().then((saved) => setMangas(saved)).catch(() => {});
    }
  }, [isFocused]);

  // Subscribe to real-time extension install/uninstall events
  useEffect(() => {
    const unsub = subscribeToInstalledExtensions((installed) => {
      setInstalledExtensions(installed);
      // If currently active tab was for an extension that got uninstalled, immediately return to library
      setSelectedFilter((prev) => {
        if (prev.startsWith('ext::')) {
          const extId = prev.replace('ext::', '');
          const exists = installed.some((e) => e.id === extId);
          if (!exists) {
            return 'all';
          }
        }
        return prev;
      });
    });
    return unsub;
  }, []);

  // Fetch online titles with multi-page pre-fetching and pagination support
  const fetchOnline = useCallback(
    async (cat: string, page: number = 1) => {
      if (!selectedFilter.startsWith('ext::')) return;
      const extId = selectedFilter.replace('ext::', '');
      const source = sourceRegistry.get(extId);
      if (!source) return;

      try {
        if (page === 1) {
          setOnlineLoading(true);
          setOnlineError(null);
        } else {
          setLoadingMore(true);
        }

        if (searchQuery.trim().length > 1 && source.searchManga) {
          const results = await source.searchManga(searchQuery.trim());
          setOnlineMangas(results);
          setHasMoreOnline(false);
        } else {
          if (page === 1) {
            // Pre-fetch pages 1 & 2 concurrently to immediately load 35-40+ titles!
            const [p1, p2] = await Promise.all([
              source.getMangaList(1, cat),
              source.getMangaList(2, cat).catch(() => []),
            ]);
            const seen = new Set<string>();
            const combined: Manga[] = [];
            for (const item of [...p1, ...p2]) {
              if (!seen.has(item.id)) {
                seen.add(item.id);
                combined.push(item);
              }
            }
            setOnlineMangas(combined);
            setOnlinePage(p2.length > 0 ? 2 : 1);
            setHasMoreOnline(p2.length > 0);
          } else {
            const list = await source.getMangaList(page, cat);
            if (list.length === 0) {
              setHasMoreOnline(false);
            } else {
              setOnlineMangas((prev) => {
                const seen = new Set(prev.map((m) => m.id));
                const newlyAdded = list.filter((m) => !seen.has(m.id));
                return [...prev, ...newlyAdded];
              });
              setOnlinePage(page);
            }
          }
        }
      } catch (err: any) {
        console.error('[LibraryScreen] Online fetch failed:', err);
        if (page === 1) {
          setOnlineError(err?.message || 'Failed to connect to source server.');
        }
      } finally {
        setOnlineLoading(false);
        setLoadingMore(false);
      }
    },
    [selectedFilter, searchQuery]
  );

  // Trigger fetch when tab, category, or search changes
  useEffect(() => {
    if (selectedFilter.startsWith('ext::')) {
      const timer = setTimeout(() => {
        fetchOnline(selectedCategory, 1);
      }, searchQuery ? 400 : 0);
      return () => clearTimeout(timer);
    } else {
      // Reload library to ensure any new/updated bookmarks or title styles reflect immediately!
      getAllManga().then((saved) => setMangas(saved)).catch(() => {});
    }
  }, [selectedFilter, selectedCategory, searchQuery, fetchOnline]);

  // Load next page on bottom reach
  const handleLoadMoreOnline = () => {
    if (
      !selectedFilter.startsWith('ext::') ||
      onlineLoading ||
      loadingMore ||
      !hasMoreOnline ||
      searchQuery.trim().length > 1
    ) {
      return;
    }
    fetchOnline(selectedCategory, onlinePage + 1);
  };

  const handleRefresh = () => {
    setRefreshing(true);
    loadLibrary();
  };

  const handleImportFile = async () => {
    try {
      setImporting(true);
      const imported = await pickAndImportComicFile();
      if (imported) {
        Alert.alert('Imported Successfully', `Added "${imported.title}" to your library.`);
        await loadLibrary();
        onOpenManga(imported);
      }
    } catch (err: any) {
      Alert.alert('Import Failed', err?.message || 'Unable to import file.');
    } finally {
      setImporting(false);
    }
  };

  const isOnlineTab = selectedFilter.startsWith('ext::');

  // Filter local library items
  const filteredLocalMangas = mangas.filter((m) => {
    const query = searchQuery.toLowerCase().trim();
    const matchesSearch =
      m.title.toLowerCase().includes(query) ||
      Boolean(m.altTitle && m.altTitle.toLowerCase().includes(query)) ||
      Boolean(m.author && m.author.toLowerCase().includes(query));

    if (!matchesSearch) return false;

    if (selectedFilter === 'favorites') return Boolean(m.isFavorite);
    if (selectedFilter === 'downloads') return downloadedMangaIds.has(m.id);
    if (selectedFilter === 'local') return m.sourceId === 'local-storage';
    if (selectedFilter === 'open') return m.sourceId === 'sample-source';
    return true;
  });

  // Enrich online extension titles with existing local bookmark/read status
  const enrichedOnlineMangas = onlineMangas.map((om) => {
    const local = mangas.find((m) => m.id === om.id);
    return local ? { ...om, isFavorite: Boolean(local.isFavorite), lastReadChapterId: local.lastReadChapterId } : om;
  });

  const displayList = isOnlineTab ? enrichedOnlineMangas : filteredLocalMangas;

  // Recent read item for "Continue Reading" banner
  const recentManga = mangas.find((m) => m.lastReadAt && m.lastReadChapterId);

  const handleSelectManga = async (manga: Manga) => {
    const local = mangas.find((m) => m.id === manga.id) || (await getMangaById(manga.id));
    const isLocalCoverBad =
      !local?.coverUrl ||
      local.coverUrl.includes('dflazy') ||
      local.coverUrl.includes('blank.gif') ||
      local.coverUrl.includes('unsplash');

    const cleanCover = isLocalCoverBad ? manga.coverUrl : (local?.coverUrl || manga.coverUrl);
    // Always adopt the updated title and altTitle from the online source!
    const merged: Manga = {
      ...(local || {}),
      ...manga,
      title: manga.title || local?.title || '',
      altTitle: manga.altTitle || local?.altTitle || '',
      coverUrl: cleanCover,
    };
    await saveManga(merged);
    setMangas((prev) => {
      const idx = prev.findIndex((p) => p.id === merged.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = merged;
        return copy;
      }
      return [merged, ...prev];
    });
    onOpenManga(merged);
  };

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Top Header Bar */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>VORTEX</Text>
            <Text style={styles.headerSubtitle}>Manga & Comic Engine</Text>
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
              onPress={onOpenExtensions}
            >
              <Ionicons name="cube-outline" size={20} color={colors.accent} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionBtn}
              onPress={handleImportFile}
              disabled={importing}
            >
              {importing ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons name="folder-open-outline" size={20} color={colors.textPrimary} />
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionBtn} onPress={onOpenSettings}>
              <Ionicons name="settings-outline" size={20} color={colors.textPrimary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={
              isOnlineTab
                ? `Search ${installedExtensions.find((e) => `ext::${e.id}` === selectedFilter)?.name || 'Online'}...`
                : 'Search library titles, authors...'
            }
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

        {/* Scrollable Filter & Installed Source Tabs */}
        <View style={styles.filterPillsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterPillsContainer}
          >
            {/* Core Library Categories */}
            <TouchableOpacity
              style={[styles.pill, selectedFilter === 'all' && styles.activePill]}
              onPress={() => setSelectedFilter('all')}
            >
              <Text style={[styles.pillText, selectedFilter === 'all' && styles.activePillText]}>
                Library ({mangas.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, selectedFilter === 'favorites' && styles.activeFavoritePill]}
              onPress={() => setSelectedFilter('favorites')}
            >
              <Ionicons
                name="heart"
                size={13}
                color={selectedFilter === 'favorites' ? '#ffffff' : '#ef4444'}
              />
              <Text style={[styles.pillText, selectedFilter === 'favorites' && styles.activePillText]}>
                Favorites ({mangas.filter((m) => m.isFavorite).length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, selectedFilter === 'downloads' && styles.activeDownloadPill]}
              onPress={() => setSelectedFilter('downloads')}
            >
              <Ionicons
                name="cloud-done"
                size={13}
                color={selectedFilter === 'downloads' ? '#ffffff' : '#10b981'}
              />
              <Text style={[styles.pillText, selectedFilter === 'downloads' && styles.activePillText]}>
                Downloads 📥 ({downloadedMangaIds.size})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, selectedFilter === 'local' && styles.activePill]}
              onPress={() => setSelectedFilter('local')}
            >
              <Text style={[styles.pillText, selectedFilter === 'local' && styles.activePillText]}>
                Local .CBZ
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.pill, selectedFilter === 'open' && styles.activePill]}
              onPress={() => setSelectedFilter('open')}
            >
              <Text style={[styles.pillText, selectedFilter === 'open' && styles.activePillText]}>
                Open Comics
              </Text>
            </TouchableOpacity>

            {/* Visual divider separating core library from online extensions */}
            {installedExtensions.length > 0 && <View style={styles.tabDivider} />}

            {/* Dynamic Tabs for Each Installed Extension */}
            {installedExtensions.map((ext) => {
              const isSelected = selectedFilter === `ext::${ext.id}`;
              return (
                <TouchableOpacity
                  key={ext.id}
                  style={[styles.pill, styles.onlineSourcePill, isSelected && styles.activeOnlinePill]}
                  onPress={() => setSelectedFilter(`ext::${ext.id}`)}
                >
                  <Ionicons
                    name="globe-outline"
                    size={12}
                    color={isSelected ? '#ffffff' : colors.accent}
                  />
                  <Text style={[styles.pillText, isSelected && styles.activePillText]}>
                    {ext.name}
                  </Text>
                </TouchableOpacity>
              );
            })}

            {/* Add / Manage Sources shortcut at end of tabs */}
            <TouchableOpacity
              style={[styles.pill, styles.addSourcesPill]}
              onPress={onOpenExtensions}
            >
              <Ionicons name="add-circle-outline" size={14} color={colors.accent} />
              <Text style={[styles.pillText, { color: colors.accent, fontWeight: '700' }]}>
                + Sources
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* Category Filters for Online Extension (Top, New, Manhwa, Manhua, Manga, Isekai, Fantasy, School) */}
        {isOnlineTab && !searchQuery && (
          <View style={styles.categoryChipsWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipsContainer}
            >
              {ONLINE_CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    style={[styles.categoryChip, isActive && styles.activeCategoryChip]}
                    onPress={() => {
                      if (selectedCategory !== cat.id) {
                        setSelectedCategory(cat.id);
                        setOnlinePage(1);
                        fetchOnline(cat.id, 1);
                      }
                    }}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isActive && styles.activeCategoryChipText,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* List of Titles */}
        {loading || onlineLoading ? (
          <View style={styles.loadingCenter}>
            <ActivityIndicator size="large" color={colors.primary} />
            {onlineLoading && (
              <Text style={styles.onlineLoadingText}>
                Loading live titles from {installedExtensions.find((e) => `ext::${e.id}` === selectedFilter)?.name}...
              </Text>
            )}
          </View>
        ) : isOnlineTab && onlineError ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="cloud-offline-outline" size={48} color="#ef4444" />
            <Text style={[styles.emptyTitle, { color: '#ef4444' }]}>Source Temporarily Unavailable</Text>
            <Text style={styles.emptySubtitle}>
              {onlineError.includes('ConnectException') || onlineError.includes('fetch failed')
                ? 'Could not connect to the remote host. The domain might be blocked, offline, or experiencing downtime.'
                : onlineError}
            </Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity
                style={styles.errorRetryBtn}
                onPress={() => {
                  fetchOnline(selectedCategory, 1);
                }}
              >
                <Ionicons name="refresh" size={15} color="#ffffff" />
                <Text style={styles.errorRetryBtnText}>Retry Connection</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.errorManageBtn}
                onPress={onOpenExtensions}
              >
                <Ionicons name="cube-outline" size={15} color={colors.textPrimary} />
                <Text style={styles.errorManageBtnText}>Manage Sources</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <FlatList
            data={displayList}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.columnWrapper}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            onEndReached={handleLoadMoreOnline}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              loadingMore ? (
                <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
                    Loading more titles...
                  </Text>
                </View>
              ) : undefined
            }
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
              />
            }
            ListHeaderComponent={
              recentManga && !searchQuery && !isOnlineTab ? (
                <TouchableOpacity
                  style={styles.continueCard}
                  onPress={() => onOpenManga(recentManga)}
                  activeOpacity={0.88}
                >
                  <View style={styles.continueBadge}>
                    <Ionicons name="bookmark" size={14} color={colors.primary} />
                    <Text style={styles.continueBadgeText}>CONTINUE READING</Text>
                  </View>
                  <Text style={styles.continueTitle} numberOfLines={1}>
                    {recentManga.title}
                  </Text>
                  <Text style={styles.continueSubtitle}>Tap to resume where you left off</Text>
                </TouchableOpacity>
              ) : undefined
            }
            renderItem={({ item }) => (
              <MangaCard manga={item} onPress={handleSelectManga} />
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="book-outline" size={48} color={colors.borderLight} />
                <Text style={styles.emptyTitle}>
                  {isOnlineTab ? 'No titles found' : 'Your Library is empty'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {isOnlineTab
                    ? 'No matching results from this source.'
                    : 'Install extensions or import .cbz files to add comics.'}
                </Text>
              </View>
            }
          />
        )}

        {/* Floating Action Button (FAB) */}
        <TouchableOpacity
          style={[styles.fab, { bottom: isPro ? 24 : 72 }]}
          onPress={handleImportFile}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={26} color="#ffffff" />
        </TouchableOpacity>

        {/* Google AdMob Banner Container */}
        <AdBanner onUpgradePress={() => setProModalVisible(true)} />

        {/* Pro Upgrade Modal */}
        <ProUpgradeModal
          visible={proModalVisible}
          onClose={() => setProModalVisible(false)}
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
    paddingTop: Platform.OS === 'android' ? 30 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    width: 40,
    height: 40,
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
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  filterPillsWrapper: {
    marginBottom: 12,
  },
  filterPillsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChipsWrapper: {
    marginBottom: 10,
  },
  categoryChipsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 6,
  },
  categoryChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  activeCategoryChip: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  categoryChipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeCategoryChipText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  activeFavoritePill: {
    backgroundColor: '#ef4444',
    borderColor: '#dc2626',
  },
  activeDownloadPill: {
    backgroundColor: '#10b981',
    borderColor: '#059669',
  },
  activeOnlinePill: {
    backgroundColor: '#0ea5e9',
    borderColor: '#0284c7',
  },
  tabDivider: {
    width: 1,
    height: 22,
    backgroundColor: colors.borderLight,
    alignSelf: 'center',
    marginHorizontal: 4,
  },
  onlineSourcePill: {
    borderColor: 'rgba(14, 165, 233, 0.35)',
  },
  addSourcesPill: {
    backgroundColor: 'rgba(14, 165, 233, 0.08)',
    borderColor: 'rgba(14, 165, 233, 0.3)',
  },
  errorRetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  errorRetryBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  errorManageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
  },
  errorManageBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
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
    paddingBottom: 90,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  continueCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.primary + '55',
  },
  continueBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  continueBadgeText: {
    color: colors.primary,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  continueTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  continueSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  loadingCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  onlineLoadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 18,
  },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
  },
  proUpgradeHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#7c5cff',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  proUpgradeHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  proBadgeActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.4)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
  },
  proBadgeActiveText: {
    color: '#f59e0b',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
