import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Manga } from '../../types';
import { colors } from '../../theme/colors';

interface MangaCardProps {
  manga: Manga;
  onPress: (manga: Manga) => void;
  onLongPress?: (manga: Manga) => void;
  width?: number;
  blurCover?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 48) / 2;

export const MangaCard = React.memo<MangaCardProps>(
  ({
    manga,
    onPress,
    onLongPress,
    width = CARD_WIDTH,
    blurCover = false,
  }) => {
    const isNsfw = Boolean(
      manga.isNsfw ||
        manga.sourceId?.toLowerCase().includes('18') ||
        manga.sourceName?.includes('18+')
    );
    const shouldBlur = isNsfw && blurCover;

    return (
      <TouchableOpacity
        style={[styles.container, { width }]}
        onPress={() => onPress(manga)}
        onLongPress={onLongPress ? () => onLongPress(manga) : undefined}
        delayLongPress={350}
        delayPressIn={0}
        activeOpacity={0.8}
      >
      <View style={styles.imageContainer}>
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
          style={styles.coverImage}
          contentFit="cover"
          transition={150}
          cachePolicy="memory-disk"
          priority="high"
          recyclingKey={manga.id || manga.coverUrl}
          blurRadius={shouldBlur ? 16 : 0}
        />

        {/* 18+ Blurred Overlay Icon */}
        {shouldBlur && (
          <View style={styles.blurOverlay}>
            <Ionicons name="eye-off-outline" size={24} color="#ffffff" />
            <Text style={styles.blurOverlayText}>18+ Cover</Text>
          </View>
        )}

        {/* Source Badge */}
        <View style={styles.sourceBadge}>
          <Text style={styles.sourceBadgeText} numberOfLines={1}>
            {manga.sourceName}
          </Text>
        </View>

        {/* 18+ Badge */}
        {isNsfw && !shouldBlur && (
          <View style={styles.nsfwBadge}>
            <Text style={styles.nsfwBadgeText}>18+</Text>
          </View>
        )}

        {/* Favorite / Bookmark Badge */}
        {Boolean(manga.isFavorite) && (
          <View style={styles.favoriteBadge}>
            <Ionicons name="heart" size={12} color="#ffffff" />
          </View>
        )}

        {/* Unread Count Badge */}
        {Boolean(manga.unreadCount && manga.unreadCount > 0) && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{manga.unreadCount}</Text>
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.title} numberOfLines={2}>
          {manga.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {manga.author || 'Unknown'}
        </Text>
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => {
  return (
    prev.manga.id === next.manga.id &&
    prev.manga.title === next.manga.title &&
    prev.manga.coverUrl === next.manga.coverUrl &&
    prev.manga.isFavorite === next.manga.isFavorite &&
    prev.manga.unreadCount === next.manga.unreadCount &&
    prev.width === next.width &&
    prev.blurCover === next.blurCover
  );
});

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  imageContainer: {
    width: '100%',
    aspectRatio: 0.7,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  sourceBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    right: 6,
    backgroundColor: 'rgba(10, 10, 12, 0.78)',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  sourceBadgeText: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '600',
  },
  favoriteBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    backgroundColor: '#ef4444',
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  unreadBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: colors.primary,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 5,
  },
  unreadBadgeText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
  infoContainer: {
    marginTop: 8,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  author: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  blurOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  blurOverlayText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  nsfwBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#dc2626',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  nsfwBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
});
