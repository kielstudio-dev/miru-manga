import React, { useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Platform,
  Modal,
  ScrollView,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { ExtensionManifest } from '../services/extensions/types';
import {
  fetchRepositoryExtensions,
  getInstalledExtensions,
  installExtension,
  uninstallExtension,
  getCustomRepos,
  addCustomRepo,
  removeCustomRepo,
  COMMUNITY_PRESET_URL,
  COMMUNITY_NSFW_PRESET_URL,
  COMMUNITY_CUONG_PRESET_URL,
} from '../services/extensions/manager';
import { Manga, ReaderSettings } from '../types';
import { sourceRegistry } from '../services/sources/registry';
import {
  saveManga,
  getMangaById,
  toggleBookmarkManga,
  getBookmarkedMangaIds,
  getSettings,
  saveSettings,
} from '../services/storage';
import { colors } from '../theme/colors';
import { getCachedCatalog, setCachedCatalog } from '../services/catalogCache';
import { getProxyImageUrl } from '../utils/imageProxy';

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

interface ExtensionsScreenProps {
  onBack?: () => void;
  onOpenManga: (manga: Manga) => void;
  showBackButton?: boolean;
  isFocused?: boolean;
}

export const ExtensionsScreen = React.memo<ExtensionsScreenProps>(({
  onBack,
  onOpenManga,
  showBackButton = false,
  isFocused = true,
}) => {
  const [activeTab, setActiveTab] = useState<'available' | 'installed'>('available');
  const [extensions, setExtensions] = useState<ExtensionManifest[]>([]);
  const [savedRepos, setSavedRepos] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [searchExtQuery, setSearchExtQuery] = useState('');

  // Community Repo Modal State
  const [repoModalVisible, setRepoModalVisible] = useState(false);
  const [repoUrlInput, setRepoUrlInput] = useState('');
  const [addingRepo, setAddingRepo] = useState(false);
  const [settings, setSettings] = useState<ReaderSettings | null>(null);

  // Manga browser mode when clicking on an installed extension
  const [browsingExtension, setBrowsingExtension] = useState<ExtensionManifest | null>(null);
  const [extensionMangaList, setExtensionMangaList] = useState<Manga[]>([]);
  const [browsingLoading, setBrowsingLoading] = useState(false);
  const [browseSearchQuery, setBrowseSearchQuery] = useState('');
  const [browseCategory, setBrowseCategory] = useState('views');
  const [browsePage, setBrowsePage] = useState(1);
  const [browseHasMore, setBrowseHasMore] = useState(true);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);

  // Quick Action Long-Press State
  const [bookmarkedMangaIds, setBookmarkedMangaIds] = useState<Set<string>>(new Set());
  const [selectedQuickManga, setSelectedQuickManga] = useState<Manga | null>(null);
  const [quickActionVisible, setQuickActionVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const refreshBookmarkedIds = useCallback(async () => {
    try {
      const ids = await getBookmarkedMangaIds();
      setBookmarkedMangaIds(ids);
    } catch (e) {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (isFocused) {
      refreshBookmarkedIds();
    }
  }, [refreshBookmarkedIds, browsingExtension, isFocused]);

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

  const handleToggleQuickBookmark = async () => {
    if (!selectedQuickManga) return;
    try {
      const isNowBookmarked = await toggleBookmarkManga(selectedQuickManga);
      setBookmarkedMangaIds((prev) => {
        const next = new Set(prev);
        if (isNowBookmarked) {
          next.add(selectedQuickManga.id);
        } else {
          next.delete(selectedQuickManga.id);
        }
        return next;
      });

      setQuickActionVisible(false);
      showToast(
        isNowBookmarked
          ? `Added "${selectedQuickManga.title}" to Library! ❤️`
          : `Removed "${selectedQuickManga.title}" from Library.`
      );
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to update library.');
    }
  };

  const loadData = async (isBackground = false) => {
    try {
      if (!isBackground) {
        setLoading(true);
      }
      const [list, repos, curSettings] = await Promise.all([
        fetchRepositoryExtensions(),
        getCustomRepos(),
        getSettings(),
      ]);
      setExtensions(list);
      setSavedRepos(repos);
      if (curSettings) setSettings(curSettings);
    } catch (err) {
      console.error('Error fetching extensions:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddRepo = async (presetUrl?: string) => {
    const target = presetUrl || repoUrlInput.trim();
    if (!target) {
      Alert.alert('Empty URL', 'Please enter a valid repository JSON URL.');
      return;
    }
    try {
      setAddingRepo(true);
      await addCustomRepo(target);
      await loadData();
      setRepoUrlInput('');
      setRepoModalVisible(false);
      Alert.alert('Repository Added', 'Community repository has been loaded successfully! You can now install its sources.');
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to add repository.');
    } finally {
      setAddingRepo(false);
    }
  };

  const handleAddNsfwRepo = async () => {
    if (!settings?.showNsfw) {
      Alert.alert(
        'Age Verification (18+)',
        'This community repository includes mature 18+ content, adult manhwa, and uncensored comics.\n\nAre you 18 years of age or older?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'I am 18 or older',
            style: 'default',
            onPress: async () => {
              const updated = await saveSettings({ showNsfw: true });
              setSettings(updated);
              await handleAddRepo(COMMUNITY_NSFW_PRESET_URL);
            },
          },
        ]
      );
      return;
    }
    await handleAddRepo(COMMUNITY_NSFW_PRESET_URL);
  };

  const handleRemoveRepo = async (url: string) => {
    Alert.alert('Remove Repository', 'Do you want to remove this community repository from your app?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeCustomRepo(url);
          await loadData();
        },
      },
    ]);
  };

  useEffect(() => {
    if (isFocused) {
      loadData(extensions.length > 0);
    }
  }, [isFocused]);

  const handleInstall = async (ext: ExtensionManifest) => {
    try {
      setActionLoadingId(ext.id);
      await installExtension(ext);
      await loadData();
      Alert.alert('Installed', `${ext.name} extension has been added!`);
    } catch (err: any) {
      Alert.alert('Install Failed', err?.message || 'Could not install extension.');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUninstall = async (ext: ExtensionManifest) => {
    try {
      setActionLoadingId(ext.id);
      await uninstallExtension(ext.id);
      await loadData();
    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Could not uninstall extension.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Android hardware back handler for sub-views within ExtensionsScreen
  useEffect(() => {
    if (!isFocused) return;
    const onBackPress = () => {
      if (quickActionVisible) {
        setQuickActionVisible(false);
        return true;
      }
      if (repoModalVisible) {
        setRepoModalVisible(false);
        return true;
      }
      if (browsingExtension) {
        if (browseSearchQuery) {
          setBrowseSearchQuery('');
          return true;
        }
        setBrowsingExtension(null);
        return true;
      }
      return false;
    };

    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [isFocused, browsingExtension, browseSearchQuery, quickActionVisible, repoModalVisible]);

  // Browse titles from an installed extension
  const handleBrowseSource = (ext: ExtensionManifest) => {
    setBrowseSearchQuery('');
    const src = sourceRegistry.get(ext.id);
    const cats = src?.getCategories ? src.getCategories() : ONLINE_CATEGORIES;
    const initialCat = cats[0]?.id || 'views';
    setBrowseCategory(initialCat);
    setBrowsePage(1);
    setBrowsingExtension(ext);
  };

  // Search or fetch titles when browsing an extension
  const fetchBrowsingTitles = useCallback(
    async (cat: string, page: number = 1) => {
      if (!browsingExtension) return;
      const source = sourceRegistry.get(browsingExtension.id);
      if (!source) return;

      try {
        if (page === 1) {
          setBrowsingLoading(true);
        } else {
          setBrowseLoadingMore(true);
        }

        if (browseSearchQuery.trim().length > 1 && source.searchManga) {
          const results = await source.searchManga(browseSearchQuery.trim());
          setExtensionMangaList(results);
          setBrowseHasMore(false);
        } else {
          if (page === 1) {
            // Step 1: Check instant local cache for 0ms visual rendering
            const cached = await getCachedCatalog(browsingExtension.id, cat, 1);
            if (cached && cached.length > 0) {
              setExtensionMangaList(cached);
              setBrowsingLoading(false);
            }

            // Step 2: Fetch fresh catalog in background (Stale-While-Revalidate)
            try {
              const p1 = await source.getMangaList(1, cat);
              if (p1 && p1.length > 0) {
                setExtensionMangaList(p1);
                setBrowsePage(1);
                setBrowseHasMore(true);
                await setCachedCatalog(browsingExtension.id, cat, 1, p1);

                // Proactively prefetch top covers for instant display
                for (let i = 0; i < Math.min(10, p1.length); i++) {
                  const cUrl = p1[i]?.coverUrl;
                  if (cUrl && cUrl.startsWith('http')) {
                    Image.prefetch(cUrl).catch(() => {});
                  }
                }
              }
            } catch (err) {
              // If background fetch failed but we had cache, retain cached results
              if (!cached || cached.length === 0) {
                setExtensionMangaList([]);
              }
            } finally {
              setBrowsingLoading(false);
            }
          } else {
            const list = await source.getMangaList(page, cat);
            if (list.length === 0) {
              setBrowseHasMore(false);
            } else {
              setExtensionMangaList((prev) => {
                const seen = new Set(prev.map((m) => m.id));
                const newlyAdded = list.filter((m) => !seen.has(m.id));
                return [...prev, ...newlyAdded];
              });
              setBrowsePage(page);
              setCachedCatalog(browsingExtension.id, cat, page, list).catch(() => {});
            }
          }
        }
      } catch (err) {
        console.error('Error fetching source manga:', err);
      } finally {
        setBrowsingLoading(false);
        setBrowseLoadingMore(false);
      }
    },
    [browsingExtension, browseSearchQuery]
  );

  useEffect(() => {
    if (browsingExtension) {
      const delay = setTimeout(() => {
        fetchBrowsingTitles(browseCategory, 1);
      }, browseSearchQuery ? 400 : 0);
      return () => clearTimeout(delay);
    }
  }, [browsingExtension, browseCategory, browseSearchQuery, fetchBrowsingTitles]);

  const handleLoadMoreBrowse = () => {
    if (
      !browsingExtension ||
      browsingLoading ||
      browseLoadingMore ||
      !browseHasMore ||
      browseSearchQuery.trim().length > 1
    ) {
      return;
    }
    fetchBrowsingTitles(browseCategory, browsePage + 1);
  };

  const handleSelectMangaFromSource = async (manga: Manga) => {
    const existing = await getMangaById(manga.id);
    const isExistingCoverBad =
      !existing?.coverUrl ||
      existing.coverUrl.includes('dflazy') ||
      existing.coverUrl.includes('blank.gif') ||
      existing.coverUrl.includes('unsplash');

    const cleanCover = isExistingCoverBad ? manga.coverUrl : existing.coverUrl;
    const resolved = existing ? { ...existing, ...manga, coverUrl: cleanCover } : manga;
    if (!existing) {
      await saveManga(resolved);
    }
    onOpenManga(resolved);
  };

  const filteredExtensions = extensions
    .filter((e) => (activeTab === 'installed' ? e.installed : true))
    .filter((e) => {
      // Hide 18+ extensions when mature toggle is disabled
      if (!settings?.showNsfw && e.isNsfw) return false;
      if (!searchExtQuery.trim()) return true;
      const q = searchExtQuery.toLowerCase();
      return (
        e.name.toLowerCase().includes(q) ||
        e.lang.toLowerCase().includes(q) ||
        (e.description && e.description.toLowerCase().includes(q))
      );
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  // View: Browsing Manga from selected extension
  if (browsingExtension) {
    const activeBrowsingSource = sourceRegistry.get(browsingExtension.id);
    const sourceCategories = activeBrowsingSource?.getCategories
      ? activeBrowsingSource.getCategories()
      : ONLINE_CATEGORIES;

    return (
      <View style={styles.container}>
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.headerBar}>
            <TouchableOpacity
              onPress={() => {
                setBrowsingExtension(null);
                setBrowseSearchQuery('');
              }}
              style={styles.headerBtn}
            >
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>
            <View style={styles.headerTitleWrap}>
              <Text style={styles.headerTitle}>{browsingExtension.name}</Text>
              <Text style={styles.headerSubtitle}>
                {browseSearchQuery ? `Search Results` : 'Popular Titles'}
              </Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Search Bar for browsing this extension */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder={`Search ${browsingExtension.name}...`}
              placeholderTextColor={colors.textMuted}
              value={browseSearchQuery}
              onChangeText={setBrowseSearchQuery}
            />
            {browseSearchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setBrowseSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Category Chips Bar for browsing this source */}
          {!browseSearchQuery && (
            <View style={styles.categoryChipsWrapper}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryChipsContainer}
              >
                {sourceCategories.map((cat) => {
                  const isActive = browseCategory === cat.id;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      style={[styles.categoryChip, isActive && styles.activeCategoryChip]}
                      onPress={() => {
                        if (browseCategory !== cat.id) {
                          setBrowseCategory(cat.id);
                          setBrowsePage(1);
                          fetchBrowsingTitles(cat.id, 1);
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

          {browsingLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color={colors.primary} />
              <Text style={styles.loadingText}>Fetching manga from {browsingExtension.name}...</Text>
            </View>
          ) : (
            <FlatList
              data={extensionMangaList}
              keyExtractor={(item) => item.id}
              numColumns={2}
              columnWrapperStyle={styles.columnWrapper}
              contentContainerStyle={styles.browseListContent}
              onEndReached={handleLoadMoreBrowse}
              onEndReachedThreshold={0.5}
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              ListFooterComponent={
                browseLoadingMore ? (
                  <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color={colors.primary} />
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
                      Loading more titles...
                    </Text>
                  </View>
                ) : undefined
              }
              renderItem={({ item }) => {
                const isBookmarked =
                  bookmarkedMangaIds.has(item.id) ||
                  bookmarkedMangaIds.has(`title::${item.title.toLowerCase().trim()}`);
                return (
                  <TouchableOpacity
                    style={styles.browseCard}
                    onPress={() => handleSelectMangaFromSource(item)}
                    onLongPress={() => handleOpenQuickAction(item)}
                    delayLongPress={350}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.browseCardCoverWrapper, isBookmarked && styles.browseCardCoverWrapperBookmarked]}>
                      <Image
                        source={{
                          uri: getProxyImageUrl(item.coverUrl),
                          headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                            ...(item.coverUrl.match(/https?:\/\/[^\/]+/)
                              ? { Referer: `${item.coverUrl.match(/https?:\/\/[^\/]+/)?.[0]}/` }
                              : {}),
                          },
                        }}
                        style={styles.browseCardCover as any}
                        contentFit="cover"
                        transition={150}
                        cachePolicy="memory-disk"
                      />
                      {isBookmarked && (
                        <View style={styles.browseBookmarkBadge}>
                          <Ionicons name="bookmark" size={10} color="#ffffff" />
                          <Text style={styles.browseBookmarkBadgeText}>IN LIBRARY</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.browseCardTitle} numberOfLines={2}>
                      {item.title}
                    </Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={
                <View style={styles.centerContainer}>
                  {browsingExtension?.isNsfw ? (
                    <View style={styles.ispBlockCard}>
                      <View style={styles.ispBlockIconWrap}>
                        <Ionicons name="shield-outline" size={30} color="#f59e0b" />
                      </View>
                      <Text style={styles.ispBlockTitle}>ISP Network Restriction Detected</Text>
                      <Text style={styles.ispBlockSubtitle}>
                        Your internet service provider (e.g. PLDT / Globe) redirected "{browsingExtension.name}" to 10.254.254.1 via local DNS.
                      </Text>

                      <View style={styles.ispSolutionBox}>
                        <Text style={styles.ispSolutionHeading}>💡 RECOMMENDED SOLUTIONS</Text>
                        <Text style={styles.ispSolutionStep}>
                          • <Text style={{ fontWeight: '700', color: colors.accent }}>MangaDex (18+ Adult & Erotica)</Text>: Install from the 18+ repository. Over 29,000+ titles and 100% immune to ISP blocks.
                        </Text>
                        <Text style={styles.ispSolutionStep}>
                          • <Text style={{ fontWeight: '700', color: '#ffffff' }}>Android Private DNS</Text>: On your phone, go to Settings → Network & Internet → Private DNS → enter <Text style={{ color: '#38bdf8', fontWeight: '700' }}>one.one.one.one</Text> or <Text style={{ color: '#38bdf8', fontWeight: '700' }}>dns.google</Text> to bypass ISP blocks.
                        </Text>
                      </View>

                      <TouchableOpacity
                        style={styles.ispBackBtn}
                        onPress={() => {
                          setBrowsingExtension(null);
                          setActiveTab('available');
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="arrow-back" size={16} color="#ffffff" />
                        <Text style={styles.ispBackBtnText}>Explore Other 18+ Sources</Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <>
                      <Ionicons name="search-outline" size={40} color={colors.borderLight} />
                      <Text style={styles.emptyTitle}>No manga found</Text>
                      <Text style={styles.emptySubtitle}>Try searching for another keyword or selecting a different category.</Text>
                    </>
                  )}
                </View>
              }
            />
          )}

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
                          uri: getProxyImageUrl(selectedQuickManga.coverUrl),
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
                          {selectedQuickManga.author || browsingExtension?.name || 'Online Source'}
                        </Text>
                        <View style={styles.quickModalStatusRow}>
                          {bookmarkedMangaIds.has(selectedQuickManga.id) ? (
                            <View style={styles.inLibraryBadge}>
                              <Ionicons name="heart" size={12} color="#ffffff" />
                              <Text style={styles.inLibraryText}>In Your Library</Text>
                            </View>
                          ) : (
                            <View style={styles.notInLibraryBadge}>
                              <Ionicons name="bookmark-outline" size={12} color={colors.textMuted} />
                              <Text style={styles.notInLibraryText}>Not in Library</Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>

                    {/* Actions */}
                    <View style={styles.quickModalActions}>
                      {bookmarkedMangaIds.has(selectedQuickManga.id) ? (
                        <>
                          {/* 1. Primary: View Details & Chapters */}
                          <TouchableOpacity
                            style={styles.quickModalBtnPrimary}
                            onPress={() => {
                              setQuickActionVisible(false);
                              handleSelectMangaFromSource(selectedQuickManga);
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="book-outline" size={18} color="#ffffff" />
                            <Text style={styles.quickModalBtnPrimaryText}>View Details & Chapters</Text>
                          </TouchableOpacity>

                          {/* 2. Refined Soft Action: Remove from Library */}
                          <TouchableOpacity
                            style={styles.quickModalBtnRemoveSoft}
                            onPress={handleToggleQuickBookmark}
                            activeOpacity={0.7}
                          >
                            <Ionicons name="trash-outline" size={16} color="#f87171" />
                            <Text style={styles.quickModalBtnRemoveSoftText}>
                              Remove from Library
                            </Text>
                          </TouchableOpacity>
                        </>
                      ) : (
                        <>
                          {/* 1. Primary: Add to Library */}
                          <TouchableOpacity
                            style={styles.quickModalBtnPrimary}
                            onPress={handleToggleQuickBookmark}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="heart" size={18} color="#ffffff" />
                            <Text style={styles.quickModalBtnPrimaryText}>
                              Add to Library
                            </Text>
                          </TouchableOpacity>

                          {/* 2. Secondary: View Details */}
                          <TouchableOpacity
                            style={styles.quickModalBtnSecondary}
                            onPress={() => {
                              setQuickActionVisible(false);
                              handleSelectMangaFromSource(selectedQuickManga);
                            }}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="book-outline" size={18} color={colors.textPrimary} />
                            <Text style={styles.quickModalBtnSecondaryText}>View Details & Chapters</Text>
                          </TouchableOpacity>
                        </>
                      )}

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
              <Ionicons name="checkmark-circle" size={17} color="#10b981" />
              <Text style={styles.toastText}>
                {toastMessage}
              </Text>
            </View>
          )}
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.headerBar}>
          {showBackButton && onBack ? (
            <>
              <TouchableOpacity onPress={onBack} style={styles.headerBtn}>
                <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>Extensions</Text>
            </>
          ) : (
            <View>
              <Text style={styles.tabHeaderTitle}>EXTENSIONS</Text>
              <Text style={styles.tabHeaderSubtitle}>Sources & Discovery</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.addRepoHeaderBtn}
            onPress={() => setRepoModalVisible(true)}
            activeOpacity={0.8}
          >
            <Ionicons name="add-circle" size={16} color="#ffffff" />
            <Text style={styles.addRepoHeaderText}>+ Repo</Text>
          </TouchableOpacity>
        </View>

        {/* Informational Banner */}
        <View style={styles.bannerCard}>
          <View style={styles.bannerHeader}>
            <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
            <Text style={styles.bannerTitle}>Open Modular Architecture</Text>
          </View>
          <Text style={styles.bannerText}>
            The core app contains no scraped content. Extensions are dynamic plugins loaded
            from external repositories on your private device.
          </Text>
        </View>

        {/* Tabs */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'available' && styles.activeTabBtn]}
            onPress={() => setActiveTab('available')}
            delayPressIn={0}
          >
            <Text
              style={[styles.tabText, activeTab === 'available' && styles.activeTabText]}
            >
              Available ({extensions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabBtn, activeTab === 'installed' && styles.activeTabBtn]}
            onPress={() => setActiveTab('installed')}
            delayPressIn={0}
          >
            <Text
              style={[styles.tabText, activeTab === 'installed' && styles.activeTabText]}
            >
              Installed ({extensions.filter((e) => e.installed).length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Search Bar for Extensions */}
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={18} color={colors.textMuted} style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder={`Search ${activeTab === 'installed' ? 'installed' : 'available'} extensions...`}
            placeholderTextColor={colors.textMuted}
            value={searchExtQuery}
            onChangeText={setSearchExtQuery}
          />
          {searchExtQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchExtQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Prompt to add community repo if none added */}
        {savedRepos.length === 0 && activeTab === 'available' && (
          <TouchableOpacity
            style={styles.repoPromptCard}
            onPress={() => setRepoModalVisible(true)}
            activeOpacity={0.85}
          >
            <View style={styles.repoPromptIcon}>
              <Ionicons name="git-network-outline" size={20} color={colors.accent} />
            </View>
            <View style={styles.repoPromptTextWrap}>
              <Text style={styles.repoPromptTitle}>Connect Community Manga Hub</Text>
              <Text style={styles.repoPromptSubtitle}>
                Tap to load 50+ community manga & manhwa sources with 1 tap.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
          </TouchableOpacity>
        )}

        {/* Extensions List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={filteredExtensions}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            initialNumToRender={10}
            maxToRenderPerBatch={8}
            windowSize={5}
            removeClippedSubviews={Platform.OS === 'android'}
            renderItem={({ item }) => (
              <View style={styles.extensionCard}>
                <View style={styles.extensionIconContainer}>
                  {item.icon ? (
                    <Image
                      source={{ uri: item.icon }}
                      style={styles.extensionIcon as any}
                      contentFit="cover"
                      transition={200}
                    />
                  ) : (
                    <Ionicons name="book-outline" size={22} color={colors.accent} />
                  )}
                </View>

                <View style={styles.extensionInfo}>
                  <Text style={styles.extensionName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <View style={styles.metaRow}>
                    <View style={styles.langBadge}>
                      <Text style={styles.langBadgeText}>{item.lang}</Text>
                    </View>
                    {item.isNsfw && (
                      <View style={styles.nsfwBadge}>
                        <Text style={styles.nsfwBadgeText}>18+</Text>
                      </View>
                    )}
                    <Text style={styles.versionText}>v{item.version}</Text>
                  </View>
                  <Text style={styles.extensionDesc} numberOfLines={2}>
                    {item.description}
                  </Text>
                </View>

                {/* Action Button */}
                <View style={styles.actionsGroup}>
                  {item.installed ? (
                    <View style={styles.installedActions}>
                      <TouchableOpacity
                        style={styles.browseBtn}
                        onPress={() => handleBrowseSource(item)}
                        delayPressIn={0}
                      >
                        <Ionicons name="compass-outline" size={16} color="#ffffff" />
                        <Text style={styles.browseBtnText}>Browse</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.uninstallBtn}
                        onPress={() => handleUninstall(item)}
                        disabled={actionLoadingId === item.id}
                        delayPressIn={0}
                      >
                        <Ionicons name="trash-outline" size={18} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.installBtn}
                      onPress={() => handleInstall(item)}
                      disabled={actionLoadingId === item.id}
                      delayPressIn={0}
                    >
                      {actionLoadingId === item.id ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons name="download-outline" size={16} color="#ffffff" />
                          <Text style={styles.installBtnText}>Install</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.centerContainer}>
                <Ionicons name="cube-outline" size={48} color={colors.borderLight} />
                <Text style={styles.emptyTitle}>
                  {searchExtQuery ? 'No matching extensions' : 'No extensions found'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {searchExtQuery
                    ? `No extensions match "${searchExtQuery}".`
                    : activeTab === 'installed'
                    ? 'You have not installed any extensions yet.'
                    : 'Tap "+ Repo" above to add community repositories.'}
                </Text>
              </View>
            }
          />
        )}

        {/* Add / Manage Community Repositories Modal */}
        <Modal
          visible={repoModalVisible}
          animationType="slide"
          transparent
          onRequestClose={() => setRepoModalVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.modalTitle}>Community Repositories</Text>
                  <Text style={styles.modalSubtitle}>Load external third-party manga sources</Text>
                </View>
                <TouchableOpacity
                  style={styles.modalCloseBtn}
                  onPress={() => setRepoModalVisible(false)}
                >
                  <Ionicons name="close" size={20} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                {/* 1-Tap Preset Section */}
                <Text style={styles.modalSectionLabel}>1-TAP COMMUNITY PRESET</Text>
                <View style={styles.presetCard}>
                  <View style={styles.presetIconWrap}>
                    <Ionicons name="globe" size={24} color={colors.accent} />
                  </View>
                  <View style={styles.presetInfo}>
                    <Text style={styles.presetTitle}>Community Manga Hub</Text>
                    <Text style={styles.presetDesc}>
                      MangaDex (70k+ titles), MangaRead, MangaSushi, and ManhuaPlus.
                    </Text>
                  </View>
                  {savedRepos.includes(COMMUNITY_PRESET_URL) ? (
                    <View style={styles.presetAddedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                      <Text style={styles.presetAddedText}>Loaded</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.presetAddBtn}
                      onPress={() => handleAddRepo(COMMUNITY_PRESET_URL)}
                      disabled={addingRepo}
                      activeOpacity={0.8}
                    >
                      {addingRepo ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons name="add" size={15} color="#ffffff" />
                          <Text style={styles.presetAddBtnText}>Add</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Tachiyomi / Mihon Global Catalog Preset */}
                <View style={[styles.presetCard, { marginTop: 10, borderColor: 'rgba(56, 189, 248, 0.3)' }]}>
                  <View style={[styles.presetIconWrap, { backgroundColor: 'rgba(56, 189, 248, 0.12)' }]}>
                    <Ionicons name="library-outline" size={22} color="#38bdf8" />
                  </View>
                  <View style={styles.presetInfo}>
                    <Text style={styles.presetTitle}>Tachiyomi Global Catalog</Text>
                    <Text style={styles.presetDesc}>
                      1,400+ international community extensions (Spanish, French, Indonesian, Italian).
                    </Text>
                  </View>
                  {savedRepos.includes(COMMUNITY_CUONG_PRESET_URL) ? (
                    <View style={styles.presetAddedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                      <Text style={styles.presetAddedText}>Loaded</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.presetAddBtn, { backgroundColor: '#0284c7' }]}
                      onPress={() => handleAddRepo(COMMUNITY_CUONG_PRESET_URL)}
                      disabled={addingRepo}
                      activeOpacity={0.8}
                    >
                      {addingRepo ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons name="add" size={15} color="#ffffff" />
                          <Text style={styles.presetAddBtnText}>Add</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* 18+ Mature Community Preset */}
                <View style={[styles.presetCard, { marginTop: 10, borderColor: 'rgba(239, 68, 68, 0.3)' }]}>
                  <View style={[styles.presetIconWrap, { backgroundColor: 'rgba(239, 68, 68, 0.12)' }]}>
                    <Ionicons name="warning-outline" size={22} color="#ef4444" />
                  </View>
                  <View style={styles.presetInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Text style={styles.presetTitle}>Mature 18+ Manga Hub</Text>
                      <View style={styles.nsfwBadge}>
                        <Text style={styles.nsfwBadgeText}>18+</Text>
                      </View>
                    </View>
                    <Text style={styles.presetDesc}>
                      Manhwa18, Hentai2Read, and ToonGod. Adult webtoons & doujinshi.
                    </Text>
                  </View>
                  {savedRepos.includes(COMMUNITY_NSFW_PRESET_URL) ? (
                    <View style={styles.presetAddedBadge}>
                      <Ionicons name="checkmark-circle" size={16} color="#10b981" />
                      <Text style={styles.presetAddedText}>Loaded</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={[styles.presetAddBtn, { backgroundColor: '#dc2626' }]}
                      onPress={handleAddNsfwRepo}
                      disabled={addingRepo}
                      activeOpacity={0.8}
                    >
                      {addingRepo ? (
                        <ActivityIndicator size="small" color="#ffffff" />
                      ) : (
                        <>
                          <Ionicons name="add" size={15} color="#ffffff" />
                          <Text style={styles.presetAddBtnText}>Add</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>

                {/* Custom URL Input Section */}
                <Text style={styles.modalSectionLabel}>CUSTOM REPOSITORY URL</Text>
                <View style={styles.customUrlCard}>
                  <Text style={styles.customUrlHelp}>
                    Enter any repository manifest URL (supports Tachiyomi, Mihon, Keiyoushi, and Miru formats):
                  </Text>
                  <TextInput
                    style={styles.modalUrlInput}
                    placeholder="https://example.com/repo/index.json"
                    placeholderTextColor={colors.textMuted}
                    value={repoUrlInput}
                    onChangeText={setRepoUrlInput}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[
                      styles.addCustomBtn,
                      (!repoUrlInput.trim() || addingRepo) && styles.disabledBtn,
                    ]}
                    onPress={() => handleAddRepo()}
                    disabled={!repoUrlInput.trim() || addingRepo}
                    activeOpacity={0.8}
                  >
                    {addingRepo ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <>
                        <Ionicons name="add-circle-outline" size={16} color="#ffffff" />
                        <Text style={styles.addCustomBtnText}>Add Custom Repository</Text>
                      </>
                    )}
                  </TouchableOpacity>
                </View>

                {/* Active Repositories List */}
                {savedRepos.length > 0 && (
                  <>
                    <Text style={styles.modalSectionLabel}>
                      ACTIVE REPOSITORIES ({savedRepos.length})
                    </Text>
                    {savedRepos.map((r, idx) => (
                      <View key={idx} style={styles.activeRepoItem}>
                        <View style={styles.activeRepoInfo}>
                          <Ionicons name="link" size={16} color={colors.primary} />
                          <Text style={styles.activeRepoText} numberOfLines={1}>
                            {r === COMMUNITY_PRESET_URL
                              ? 'Community Manga Hub (Preset)'
                              : r === COMMUNITY_CUONG_PRESET_URL
                              ? 'Tachiyomi Global Catalog (Preset)'
                              : r === COMMUNITY_NSFW_PRESET_URL
                              ? 'Mature 18+ Manga Hub (Preset)'
                              : r}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.removeRepoBtn}
                          onPress={() => handleRemoveRepo(r)}
                        >
                          <Ionicons name="trash-outline" size={16} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                    ))}
                  </>
                )}

                {/* Safe Harbor Legal Disclaimer */}
                <View style={styles.disclaimerBox}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.textMuted} />
                  <Text style={styles.disclaimerText}>
                    DMCA Notice: Miru Manga is an independent media player engine developed by Kiel Studio Devs (kielstudio.dev@gmail.com). It does not
                    host, index, or distribute copyrighted content. Repositories are maintained by
                    autonomous third-party communities.
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
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
    paddingTop: Platform.OS === 'android' ? 30 : 0,
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
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  headerTitleWrap: {
    alignItems: 'center',
  },
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  tabHeaderTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  tabHeaderSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  bannerCard: {
    backgroundColor: '#0e1726',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    margin: 16,
    padding: 12,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  bannerTitle: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  bannerText: {
    color: colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeTabBtn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#ffffff',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  extensionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  extensionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 9,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  extensionIcon: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  extensionInfo: {
    flex: 1,
    marginRight: 8,
  },
  extensionName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 3,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  langBadge: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  langBadgeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  nsfwBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  nsfwBadgeText: {
    color: '#ef4444',
    fontSize: 9,
    fontWeight: '800',
  },
  versionText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  extensionDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  actionsGroup: {
    marginLeft: 6,
    justifyContent: 'center',
  },
  installedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  browseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
  },
  browseBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  uninstallBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  installBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 12,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySubtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
  },
  browseListContent: {
    padding: 16,
    paddingBottom: 40,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  browseCard: {
    width: '48%',
    marginBottom: 16,
  },
  browseCardCover: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  browseCardTitle: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 6,
    lineHeight: 16,
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
  addRepoHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
  },
  addRepoHeaderText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  repoPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0c1626',
    borderWidth: 1,
    borderColor: '#1e3a5f',
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    gap: 10,
  },
  repoPromptIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  repoPromptTextWrap: {
    flex: 1,
  },
  repoPromptTitle: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '700',
  },
  repoPromptSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#12121a',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
  },
  modalSubtitle: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalScrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  modalSectionLabel: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginTop: 12,
  },
  presetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 12,
  },
  presetIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: 'rgba(56, 189, 248, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  presetInfo: {
    flex: 1,
  },
  presetTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  presetDesc: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  presetAddedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  presetAddedText: {
    color: '#10b981',
    fontSize: 12,
    fontWeight: '700',
  },
  presetAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  presetAddBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  customUrlCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  customUrlHelp: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 10,
  },
  modalUrlInput: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textPrimary,
    fontSize: 13,
    marginBottom: 12,
  },
  addCustomBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 11,
    borderRadius: 10,
  },
  addCustomBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  disabledBtn: {
    opacity: 0.4,
  },
  activeRepoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  activeRepoInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 10,
  },
  activeRepoText: {
    color: colors.textPrimary,
    fontSize: 12,
    flex: 1,
  },
  removeRepoBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    padding: 12,
    marginTop: 16,
  },
  disclaimerText: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    flex: 1,
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
  browseCardCoverWrapper: {
    position: 'relative',
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  browseCardCoverWrapperBookmarked: {
    borderColor: 'rgba(124, 92, 255, 0.65)',
  },
  browseBookmarkBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 5,
  },
  browseBookmarkBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
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
  notInLibraryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  notInLibraryText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
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
    maxWidth: '88%',
    backgroundColor: '#1b1b26',
    borderWidth: 1,
    borderColor: '#2e2e42',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 999,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    flexShrink: 1,
  },
  ispBlockCard: {
    backgroundColor: '#16141e',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 10,
    width: '90%',
    maxWidth: 380,
  },
  ispBlockIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  ispBlockTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  ispBlockSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 14,
  },
  ispSolutionBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    width: '100%',
    marginBottom: 14,
  },
  ispSolutionHeading: {
    color: '#f59e0b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  ispSolutionStep: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 6,
  },
  ispBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  ispBackBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
