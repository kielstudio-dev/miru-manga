import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  View,
  FlatList,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { Page, ReaderMode } from '../../types';
import { ZoomableImage } from './ZoomableImage';
import { EdgeHandleDrawer } from './EdgeHandleDrawer';

interface PagedReaderProps {
  pages: Page[];
  currentPage: number;
  mode: ReaderMode; // 'rtl' or 'ltr'
  onPageChange: (index: number) => void;
  onToggleOverlay: () => void;
  backgroundColor: string;
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const PagedReader: React.FC<PagedReaderProps> = ({
  pages,
  currentPage,
  mode,
  onPageChange,
  onToggleOverlay,
  backgroundColor,
}) => {
  const flatListRef = useRef<FlatList>(null);
  const isRTL = mode === 'rtl';

  const displayPages = isRTL ? [...pages].reverse() : pages;

  const toDisplayIndex = (logicalIndex: number) =>
    isRTL ? pages.length - 1 - logicalIndex : logicalIndex;

  const toLogicalIndex = (dispIndex: number) =>
    isRTL ? pages.length - 1 - dispIndex : dispIndex;

  useEffect(() => {
    const dispIdx = toDisplayIndex(currentPage);
    if (flatListRef.current && dispIdx >= 0 && dispIdx < displayPages.length) {
      try {
        flatListRef.current.scrollToIndex({ index: dispIdx, animated: false });
      } catch (e) {
        // Ignored if layout not yet finished
      }
    }
  }, [currentPage, isRTL]);

  const handleNextPage = () => {
    if (currentPage < pages.length - 1) {
      onPageChange(currentPage + 1);
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 0) {
      onPageChange(currentPage - 1);
    }
  };

  const handleLeftTap = () => {
    if (isRTL) {
      handleNextPage();
    } else {
      handlePrevPage();
    }
  };

  const handleRightTap = () => {
    if (isRTL) {
      handlePrevPage();
    } else {
      handleNextPage();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <FlatList
        ref={flatListRef}
        data={displayPages}
        keyExtractor={(item) => `paged-${item.index}-${item.url}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={toDisplayIndex(currentPage)}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            if (flatListRef.current) {
              flatListRef.current.scrollToIndex({ index: info.index, animated: false });
            }
          }, 60);
        }}
        getItemLayout={(_, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const offsetX = e.nativeEvent.contentOffset.x;
          const dispIdx = Math.round(offsetX / SCREEN_WIDTH);
          const logicalIdx = toLogicalIndex(dispIdx);
          if (logicalIdx >= 0 && logicalIdx < pages.length) {
            onPageChange(logicalIdx);
          }
        }}
        renderItem={({ item }) => (
          <View style={{ width: SCREEN_WIDTH, height: SCREEN_HEIGHT }}>
            <ZoomableImage
              uri={item.url}
              width={SCREEN_WIDTH}
              height={SCREEN_HEIGHT}
              onCenterTap={onToggleOverlay}
            />
          </View>
        )}
      />

      {/* Edge Touch Strips for One-Handed Page Turning (does not block center pinch) */}
      <View style={styles.touchOverlay} pointerEvents="box-none">
        <TouchableOpacity
          style={styles.edgeTouchArea}
          onPress={handleLeftTap}
          activeOpacity={1}
        />
        <View style={styles.centerArea} pointerEvents="none" />
        <TouchableOpacity
          style={styles.edgeTouchArea}
          onPress={handleRightTap}
          activeOpacity={1}
        />
      </View>

      {/* Game Turbo / Edge Panel Style Handle on the Screen Border */}
      <EdgeHandleDrawer onToggle={onToggleOverlay} isOpen={false} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  touchOverlay: {
    ...StyleSheet.absoluteFill,
    flexDirection: 'row',
  },
  edgeTouchArea: {
    width: '20%',
    height: '100%',
  },
  centerArea: {
    width: '60%',
    height: '100%',
  },
});
