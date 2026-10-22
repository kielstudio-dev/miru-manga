import React, { useState, useEffect, useCallback } from 'react';
import { StyleSheet, BackHandler, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { Manga, Chapter } from './src/types';
import { BookmarksScreen } from './src/screens/BookmarksScreen';
import { DownloadsScreen } from './src/screens/DownloadsScreen';
import { ExtensionsScreen } from './src/screens/ExtensionsScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { MangaDetailScreen } from './src/screens/MangaDetailScreen';
import { ReaderView } from './src/components/reader/ReaderView';
import { BottomNavBar, MainTabType } from './src/components/navigation/BottomNavBar';
import { initializeInstalledExtensions } from './src/services/extensions/manager';
import { getDownloadedMangaList } from './src/services/downloads';
import { checkFavoriteMangaUpdates } from './src/services/updates';
import { colors } from './src/theme/colors';

type Screen = 'main' | 'manga-detail' | 'reader';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('main');
  const [activeTab, setActiveTab] = useState<MainTabType>('bookmarks');
  const [tabHistory, setTabHistory] = useState<MainTabType[]>(['bookmarks']);
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const [selectedChapter, setSelectedChapter] = useState<Chapter | null>(null);
  const [allChapters, setAllChapters] = useState<Chapter[]>([]);
  const [downloadCount, setDownloadCount] = useState<number>(0);

  const [visitedTabs, setVisitedTabs] = useState<Record<MainTabType, boolean>>({
    bookmarks: true,
    downloads: false,
    extensions: false,
    settings: false,
  });

  // Initialize dynamic extensions & check favorite updates in background on launch
  useEffect(() => {
    initializeInstalledExtensions();
    // Non-blocking silent update check for favorited titles
    checkFavoriteMangaUpdates().catch(() => {});
  }, []);

  // Update download count badge
  const refreshDownloadCount = useCallback(async () => {
    try {
      const list = await getDownloadedMangaList();
      setDownloadCount(list.length);
    } catch (e) {
      // Ignore
    }
  }, []);

  // Refresh download badge only on screen transitions back to main, NOT on every tab switch
  useEffect(() => {
    if (currentScreen === 'main') {
      refreshDownloadCount();
    }
  }, [refreshDownloadCount, currentScreen]);

  const handleSelectTab = useCallback((tab: MainTabType) => {
    setActiveTab((cur) => {
      if (cur !== tab) {
        setTabHistory((prev) => [...prev, tab]);
        return tab;
      }
      return cur;
    });
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  }, []);

  const handleNavigateToExtensions = useCallback(() => {
    handleSelectTab('extensions');
  }, [handleSelectTab]);

  const handleNavigateToDownloads = useCallback(() => {
    handleSelectTab('downloads');
  }, [handleSelectTab]);

  const handleNavigateToBookmarks = useCallback(() => {
    handleSelectTab('bookmarks');
  }, [handleSelectTab]);

  // Android hardware back button handler
  useEffect(() => {
    const onBackPress = () => {
      if (currentScreen === 'reader') {
        setCurrentScreen('manga-detail');
        return true;
      }
      if (currentScreen === 'manga-detail') {
        setCurrentScreen('main');
        return true;
      }
      if (currentScreen === 'main') {
        if (tabHistory.length > 1) {
          const nextHistory = [...tabHistory];
          nextHistory.pop(); // remove current tab
          const previousTab = nextHistory[nextHistory.length - 1];
          setTabHistory(nextHistory);
          setActiveTab(previousTab);
          return true;
        }
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [currentScreen, tabHistory]);

  const handleOpenManga = useCallback((manga: Manga) => {
    setSelectedManga(manga);
    setCurrentScreen('manga-detail');
  }, []);

  const handleOpenChapter = useCallback((chapter: Chapter, chapters: Chapter[]) => {
    setSelectedChapter(chapter);
    setAllChapters(chapters);
    setCurrentScreen('reader');
  }, []);

  const handleOpenChapterFromDownloads = useCallback((chapter: Chapter, chapters: Chapter[], manga: Manga) => {
    setSelectedManga(manga);
    setSelectedChapter(chapter);
    setAllChapters(chapters);
    setCurrentScreen('reader');
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <View style={styles.content}>
          {/* Main 4-Tab Container with Permanent Bottom Navigation Bar */}
          <View style={[styles.mainContainer, currentScreen !== 'main' && styles.hidden]}>
            {/* Tab 1: Bookmarks / Favorites Screen */}
            {visitedTabs.bookmarks && (
              <View style={[styles.tabContent, activeTab !== 'bookmarks' && styles.hidden]}>
                <BookmarksScreen
                  onOpenManga={handleOpenManga}
                  onNavigateToExtensions={handleNavigateToExtensions}
                  onNavigateToDownloads={handleNavigateToDownloads}
                  isFocused={currentScreen === 'main' && activeTab === 'bookmarks'}
                />
              </View>
            )}

            {/* Tab 2: Downloads Screen */}
            {visitedTabs.downloads && (
              <View style={[styles.tabContent, activeTab !== 'downloads' && styles.hidden]}>
                <DownloadsScreen
                  onOpenManga={handleOpenManga}
                  onOpenChapter={handleOpenChapterFromDownloads}
                  onNavigateToBookmarks={handleNavigateToBookmarks}
                  onNavigateToExtensions={handleNavigateToExtensions}
                  isFocused={currentScreen === 'main' && activeTab === 'downloads'}
                />
              </View>
            )}

            {/* Tab 3: Extensions Screen */}
            {visitedTabs.extensions && (
              <View style={[styles.tabContent, activeTab !== 'extensions' && styles.hidden]}>
                <ExtensionsScreen
                  onOpenManga={handleOpenManga}
                  showBackButton={false}
                  isFocused={currentScreen === 'main' && activeTab === 'extensions'}
                />
              </View>
            )}

            {/* Tab 4: Settings Screen */}
            {visitedTabs.settings && (
              <View style={[styles.tabContent, activeTab !== 'settings' && styles.hidden]}>
                <SettingsScreen
                  showBackButton={false}
                />
              </View>
            )}

            {/* Permanent Bottom Navigation Bar docked across all 4 main tabs */}
            <BottomNavBar
              currentTab={activeTab}
              onSelectTab={handleSelectTab}
              downloadCount={downloadCount}
            />
          </View>

          {/* Manga Detail Screen */}
          {currentScreen === 'manga-detail' && selectedManga && (
            <MangaDetailScreen
              manga={selectedManga}
              onBack={() => {
                setCurrentScreen('main');
                refreshDownloadCount();
              }}
              onOpenChapter={handleOpenChapter}
            />
          )}

          {/* Reader View */}
          {currentScreen === 'reader' && selectedManga && selectedChapter && (
            <ReaderView
              manga={selectedManga}
              chapter={selectedChapter}
              allChapters={allChapters}
              onBack={() => setCurrentScreen('manga-detail')}
              onSelectChapter={(nextCh) => setSelectedChapter(nextCh)}
            />
          )}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.black,
  },
  content: {
    flex: 1,
  },
  mainContainer: {
    flex: 1,
    backgroundColor: colors.black,
  },
  tabContent: {
    flex: 1,
  },
  hidden: {
    display: 'none',
  },
});
