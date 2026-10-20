import React, { useRef, useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  Dimensions,
  TouchableOpacity,
  ActivityIndicator,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Page } from '../../types';
import { EdgeHandleDrawer } from './EdgeHandleDrawer';
import { colors } from '../../theme/colors';

interface WebtoonReaderProps {
  pages: Page[];
  initialPage: number;
  chapterTitle?: string;
  onPageChange: (index: number) => void;
  onToggleOverlay: () => void;
  backgroundColor: string;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  hasPrevChapter?: boolean;
  hasNextChapter?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Global cache for measured image heights to prevent height collapse during scroll
const pageHeightCache: Record<string, number> = {};

const WebtoonPageItem: React.FC<{
  item: Page;
  onPress: () => void;
}> = ({ item, onPress }) => {
  const cached = pageHeightCache[item.url];
  const [loading, setLoading] = useState(!cached);
  const [pageHeight, setPageHeight] = useState<number>(cached || SCREEN_WIDTH * 1.4);

  const hostMatch = item.url.match(/https?:\/\/[^\/]+/);
  const imageHeaders: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    ...(hostMatch ? { Referer: `${hostMatch[0]}/` } : {}),
  };

  return (
    <View style={[styles.pageWrapper, { width: SCREEN_WIDTH, minHeight: pageHeight }]}>
      <Image
        source={{
          uri: item.url,
          headers: imageHeaders,
        }}
        style={{
          width: SCREEN_WIDTH,
          height: pageHeight,
        }}
        contentFit="contain"
        contentPosition="top center"
        transition={150}
        cachePolicy="disk"
        onLoadStart={() => {
          if (!cached) setLoading(true);
        }}
        onLoad={(e) => {
          setLoading(false);
          if (e.source.width && e.source.height && e.source.height > 0) {
            const exactHeight = (SCREEN_WIDTH * e.source.height) / e.source.width;
            pageHeightCache[item.url] = exactHeight;
            setPageHeight(exactHeight);
          }
        }}
        onError={() => setLoading(false)}
      />
      {loading && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color="#7c5cff" />
        </View>
      )}
    </View>
  );
};

export const WebtoonReader: React.FC<WebtoonReaderProps> = ({
  pages,
  initialPage,
  chapterTitle,
  onPageChange,
  onToggleOverlay,
  backgroundColor,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter,
  hasNextChapter,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const initialPageRef = useRef(initialPage);
  const [currentPageIndex, setCurrentPageIndex] = useState(initialPage);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [isZoomed, setIsZoomed] = useState(false);
  const lastChapterKeyRef = useRef<string | null>(null);

  // Pinch-to-zoom shared values for the view
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // Generate unique chapter key
  const chapterKey = pages.length > 0 ? `${pages[0]?.url}-${pages.length}` : '';

  // Only reset when switching to a completely new chapter
  useEffect(() => {
    if (chapterKey && chapterKey !== lastChapterKeyRef.current) {
      lastChapterKeyRef.current = chapterKey;
      scale.value = 1;
      savedScale.value = 1;
      translateX.value = 0;
      translateY.value = 0;
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
      setIsZoomed(false);
      setScrollProgress(0);
      setCurrentPageIndex(0);

      if (flatListRef.current) {
        flatListRef.current.scrollToOffset({ offset: 0, animated: false });
      }
    }
  }, [chapterKey]);

  const updateZoomState = (zoomed: boolean) => {
    setIsZoomed(zoomed);
  };

  const handleToggleOverlay = () => {
    onToggleOverlay();
  };

  // Pinch gesture (requires 2 pointers)
  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      'worklet';
      scale.value = Math.max(1, Math.min(savedScale.value * e.scale, 3.5));
    })
    .onEnd(() => {
      'worklet';
      if (scale.value < 1.08) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(updateZoomState)(false);
      } else {
        savedScale.value = scale.value;
        runOnJS(updateZoomState)(true);
      }
    });

  // Pan gesture: ONLY enabled when zoomed in (isZoomed is true).
  // When isZoomed is false, pan is disabled so FlatList gets 100% of single-finger vertical drag events!
  const panGesture = Gesture.Pan()
    .enabled(isZoomed)
    .onUpdate((e) => {
      'worklet';
      translateX.value = savedTranslateX.value + e.translationX;
      translateY.value = savedTranslateY.value + e.translationY;
    })
    .onEnd(() => {
      'worklet';
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  // Double tap to toggle zoom between 1x and 2.2x
  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(300)
    .onEnd(() => {
      'worklet';
      if (scale.value > 1.2) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
        runOnJS(updateZoomState)(false);
      } else {
        scale.value = withTiming(2.2);
        savedScale.value = 2.2;
        runOnJS(updateZoomState)(true);
      }
    });

  // Single tap to toggle HUD overlay
  const singleTapGesture = Gesture.Tap()
    .numberOfTaps(1)
    .maxDuration(250)
    .onEnd(() => {
      'worklet';
      runOnJS(handleToggleOverlay)();
    });

  const composedGestures = Gesture.Simultaneous(
    pinchGesture,
    panGesture,
    Gesture.Exclusive(doubleTapGesture, singleTapGesture)
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: scale.value },
      { translateX: translateX.value },
      { translateY: translateY.value },
    ],
  }));

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    const totalHeight = contentSize.height - layoutMeasurement.height;
    if (totalHeight > 0) {
      const p = Math.min(1, Math.max(0, contentOffset.y / totalHeight));
      setScrollProgress(p);
    }
  };

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ index?: number | null }> }) => {
      if (viewableItems.length > 0 && typeof viewableItems[0].index === 'number') {
        const idx = viewableItems[0].index;
        setCurrentPageIndex(idx);
        onPageChange(idx);
      }
    }
  ).current;

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 35,
    minimumViewTime: 200,
  }).current;

  const scrollToPage = (targetIndex: number) => {
    if (targetIndex >= 0 && targetIndex < pages.length && flatListRef.current) {
      try {
        flatListRef.current.scrollToIndex({ index: targetIndex, animated: true });
        setCurrentPageIndex(targetIndex);
        onPageChange(targetIndex);
      } catch (e) {
        // Fallback
      }
    }
  };

  const isLightCanvas =
    backgroundColor.toLowerCase() === '#ffffff' ||
    backgroundColor.toLowerCase() === '#f6f1de' ||
    backgroundColor.toLowerCase() === 'white' ||
    backgroundColor.toLowerCase() === 'sepia';

  const renderFooter = () => (
    <View style={styles.footerContainer}>
      <View
        style={[
          styles.footerGlowDivider,
          isLightCanvas && { backgroundColor: 'rgba(124, 92, 255, 0.25)' },
        ]}
      />
      <Ionicons name="checkmark-done-circle" size={48} color="#7c5cff" style={styles.footerIcon} />
      <Text style={[styles.footerHeading, isLightCanvas && { color: '#111827' }]}>
        End of Chapter
      </Text>
      <Text style={[styles.footerSubtext, isLightCanvas && { color: '#4b5563' }]}>
        {chapterTitle || 'You reached the end of this chapter'}
      </Text>

      <View style={styles.footerActionsRow}>
        {hasPrevChapter && (
          <TouchableOpacity
            style={[
              styles.footerSecondaryBtn,
              isLightCanvas && {
                backgroundColor: 'rgba(0, 0, 0, 0.05)',
                borderColor: 'rgba(0, 0, 0, 0.12)',
              },
            ]}
            onPress={onPrevChapter}
            activeOpacity={0.8}
          >
            <Ionicons name="arrow-back" size={16} color={isLightCanvas ? '#1f2937' : '#ffffff'} />
            <Text
              style={[
                styles.footerSecondaryBtnText,
                isLightCanvas && { color: '#1f2937' },
              ]}
            >
              Prev Chapter
            </Text>
          </TouchableOpacity>
        )}

        {hasNextChapter ? (
          <TouchableOpacity
            style={styles.footerPrimaryBtn}
            onPress={onNextChapter}
            activeOpacity={0.85}
          >
            <Text style={styles.footerPrimaryBtnText}>Next Chapter</Text>
            <Ionicons name="arrow-forward" size={18} color="#ffffff" />
          </TouchableOpacity>
        ) : (
          <View
            style={[
              styles.caughtUpBadge,
              isLightCanvas && {
                backgroundColor: 'rgba(124, 92, 255, 0.12)',
                borderColor: '#7c5cff',
              },
            ]}
          >
            <Text
              style={[
                styles.caughtUpBadgeText,
                isLightCanvas && { color: '#6d28d9' },
              ]}
            >
              You're all caught up! ✨
            </Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <GestureDetector gesture={composedGestures}>
        <Animated.View style={[{ flex: 1 }, animatedStyle]}>
          <FlatList
            ref={flatListRef}
            data={pages}
            keyExtractor={(item) => `webtoon-page-${item.index}-${item.url}`}
            scrollEnabled={!isZoomed}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            scrollEventThrottle={32}
            bounces={false}
            overScrollMode="never"
            removeClippedSubviews={false}
            initialNumToRender={pages.length}
            maxToRenderPerBatch={pages.length}
            windowSize={11}
            initialScrollIndex={
              initialPageRef.current > 0 && initialPageRef.current < pages.length
                ? initialPageRef.current
                : undefined
            }
            onScrollToIndexFailed={(info) => {
              setTimeout(() => {
                if (flatListRef.current) {
                  flatListRef.current.scrollToIndex({ index: info.index, animated: false });
                }
              }, 100);
            }}
            onViewableItemsChanged={onViewableItemsChanged}
            viewabilityConfig={viewabilityConfig}
            renderItem={({ item }) => (
              <WebtoonPageItem item={item} onPress={onToggleOverlay} />
            )}
            ListFooterComponent={renderFooter}
          />
        </Animated.View>
      </GestureDetector>

      {/* Right Edge Visible Scrollbar / Progress Track */}
      <View style={styles.sideProgressRail} pointerEvents="none">
        <View
          style={[
            styles.sideProgressFill,
            { height: `${Math.round(Math.max(0.04, scrollProgress) * 100)}%` },
          ]}
        />
      </View>

      {/* Floating Side Page Indicator Badge */}
      <View style={styles.sideFloatingBadge} pointerEvents="none">
        <Text style={styles.sideFloatingBadgeText}>
          {currentPageIndex + 1}/{pages.length}
        </Text>
      </View>

      {/* Bottom Floating Quick Stepper (1/8 -> 2/8 -> 3/8) */}
      <View style={styles.bottomQuickBar}>
        <TouchableOpacity
          style={[styles.quickStepBtn, currentPageIndex === 0 && styles.quickStepBtnDisabled]}
          disabled={currentPageIndex === 0}
          onPress={() => scrollToPage(currentPageIndex - 1)}
          activeOpacity={0.7}
        >
          <Ionicons
            name="chevron-back"
            size={16}
            color={currentPageIndex === 0 ? 'rgba(255,255,255,0.25)' : '#ffffff'}
          />
          <Text
            style={[
              styles.quickStepBtnText,
              currentPageIndex === 0 && styles.quickStepBtnTextDisabled,
            ]}
          >
            Prev
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.quickPillBadge}
          onPress={onToggleOverlay}
          activeOpacity={0.8}
        >
          <Text style={styles.quickPillBadgeText}>
            {currentPageIndex + 1} / {pages.length}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.quickStepBtn,
            currentPageIndex >= pages.length - 1 && styles.quickStepBtnDisabled,
          ]}
          disabled={currentPageIndex >= pages.length - 1}
          onPress={() => scrollToPage(currentPageIndex + 1)}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.quickStepBtnText,
              currentPageIndex >= pages.length - 1 && styles.quickStepBtnTextDisabled,
            ]}
          >
            Next
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={
              currentPageIndex >= pages.length - 1
                ? 'rgba(255,255,255,0.25)'
                : '#ffffff'
            }
          />
        </TouchableOpacity>
      </View>

      {/* Game Turbo / Edge Panel Style Handle on the Screen Border */}
      <EdgeHandleDrawer onToggle={onToggleOverlay} isOpen={false} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  pageWrapper: {
    backgroundColor: 'transparent',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  loadingBox: {
    ...StyleSheet.absoluteFill,
    height: 300,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Visible Side Progress Rail
  sideProgressRail: {
    position: 'absolute',
    right: 2,
    top: 75,
    bottom: 95,
    width: 3.5,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 2,
    overflow: 'hidden',
    zIndex: 996,
  },
  sideProgressFill: {
    width: '100%',
    backgroundColor: '#7c5cff',
    borderRadius: 2,
  },
  sideFloatingBadge: {
    position: 'absolute',
    right: 12,
    top: 40,
    backgroundColor: 'rgba(12, 12, 18, 0.85)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.4)',
    zIndex: 996,
  },
  sideFloatingBadgeText: {
    color: '#e2e8f0',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // Bottom Floating Quick Stepper
  bottomQuickBar: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(18, 18, 26, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.14)',
    borderRadius: 24,
    paddingHorizontal: 6,
    paddingVertical: 5,
    zIndex: 997,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  quickStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
  },
  quickStepBtnDisabled: {
    opacity: 0.4,
  },
  quickStepBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '600',
    marginHorizontal: 3,
  },
  quickStepBtnTextDisabled: {
    color: 'rgba(255,255,255,0.3)',
  },
  quickPillBadge: {
    backgroundColor: '#7c5cff',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    marginHorizontal: 4,
  },
  quickPillBadgeText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
  // End of Chapter Footer
  footerContainer: {
    width: SCREEN_WIDTH,
    paddingTop: 48,
    paddingBottom: 110, // Generous clearance so Prev/Next Chapter buttons sit well above the floating pagination bar
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerGlowDivider: {
    width: '80%',
    height: 1,
    backgroundColor: 'rgba(124, 92, 255, 0.35)',
    marginBottom: 32,
  },
  footerIcon: {
    marginBottom: 12,
  },
  footerHeading: {
    fontSize: 22,
    fontWeight: '800',
    color: '#ffffff',
    marginBottom: 6,
  },
  footerSubtext: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
  },
  footerActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  footerPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7c5cff',
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    elevation: 4,
  },
  footerPrimaryBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  footerSecondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.16)',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
  },
  footerSecondaryBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  caughtUpBadge: {
    backgroundColor: 'rgba(124, 92, 255, 0.15)',
    borderWidth: 1,
    borderColor: '#7c5cff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  caughtUpBadgeText: {
    color: '#a78bfa',
    fontSize: 14,
    fontWeight: '700',
  },
});
