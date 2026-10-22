import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ReaderMode, BackgroundTheme } from '../../types';
import { colors } from '../../theme/colors';

interface ReaderOverlayProps {
  visible: boolean;
  mangaTitle: string;
  chapterTitle: string;
  currentPage: number;
  totalPages: number;
  mode: ReaderMode;
  theme: BackgroundTheme;
  onBack: () => void;
  onPageSelect: (pageIndex: number) => void;
  onModeChange: (mode: ReaderMode) => void;
  onThemeChange: (theme: BackgroundTheme) => void;
  onPrevChapter?: () => void;
  onNextChapter?: () => void;
  hasPrevChapter?: boolean;
  hasNextChapter?: boolean;
  onReloadChapter?: () => void;
}

export const ReaderOverlay: React.FC<ReaderOverlayProps> = ({
  visible,
  mangaTitle,
  chapterTitle,
  currentPage,
  totalPages,
  mode,
  theme,
  onBack,
  onPageSelect,
  onModeChange,
  onThemeChange,
  onPrevChapter,
  onNextChapter,
  hasPrevChapter,
  hasNextChapter,
  onReloadChapter,
}) => {
  if (!visible) return null;

  return (
    <View style={styles.absoluteContainer} pointerEvents="box-none">
      {/* Top Header Bar */}
      <View style={styles.topBar}>
        <SafeAreaView style={styles.topSafeArea}>
          <View style={styles.topContent}>
            <TouchableOpacity onPress={onBack} style={styles.iconButton}>
              <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
            </TouchableOpacity>

            <View style={styles.titleContainer}>
              <Text style={styles.mangaTitle} numberOfLines={1}>
                {mangaTitle}
              </Text>
              <Text style={styles.chapterTitle} numberOfLines={1}>
                {chapterTitle}
              </Text>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {onReloadChapter && (
                <TouchableOpacity
                  onPress={onReloadChapter}
                  style={styles.iconButton}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityLabel="Reload chapter from source"
                >
                  <Ionicons name="refresh-outline" size={20} color={colors.textPrimary} />
                </TouchableOpacity>
              )}
              <View style={styles.pageBadge}>
                <Text style={styles.pageBadgeText}>
                  {currentPage + 1}/{totalPages}
                </Text>
              </View>
            </View>
          </View>
        </SafeAreaView>
      </View>

      {/* Bottom Control Bar */}
      <View style={styles.bottomBar}>
        <SafeAreaView style={styles.bottomSafeArea}>
          {/* Chapter & Page Stepper */}
          <View style={styles.chapterNavRow}>
            <TouchableOpacity
              onPress={onPrevChapter}
              disabled={!hasPrevChapter}
              style={[styles.chapterNavBtn, !hasPrevChapter && styles.disabledBtn]}
            >
              <Ionicons
                name="play-skip-back"
                size={18}
                color={hasPrevChapter ? colors.textPrimary : colors.textMuted}
              />
              <Text
                style={[
                  styles.chapterNavBtnText,
                  !hasPrevChapter && styles.disabledText,
                ]}
              >
                Prev Ch
              </Text>
            </TouchableOpacity>

            {/* Quick Page Steppers */}
            <View style={styles.pageQuickJumper}>
              <TouchableOpacity
                onPress={() => onPageSelect(Math.max(0, currentPage - 1))}
                disabled={currentPage === 0}
                style={styles.stepBtn}
              >
                <Ionicons name="chevron-back" size={20} color={colors.textPrimary} />
              </TouchableOpacity>

              <Text style={styles.sliderPageLabel}>
                Page {currentPage + 1} of {totalPages}
              </Text>

              <TouchableOpacity
                onPress={() => onPageSelect(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage >= totalPages - 1}
                style={styles.stepBtn}
              >
                <Ionicons name="chevron-forward" size={20} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              onPress={onNextChapter}
              disabled={!hasNextChapter}
              style={[styles.chapterNavBtn, !hasNextChapter && styles.disabledBtn]}
            >
              <Text
                style={[
                  styles.chapterNavBtnText,
                  !hasNextChapter && styles.disabledText,
                ]}
              >
                Next Ch
              </Text>
              <Ionicons
                name="play-skip-forward"
                size={18}
                color={hasNextChapter ? colors.textPrimary : colors.textMuted}
              />
            </TouchableOpacity>
          </View>

          {/* Reading Mode Selector */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>Reading Mode</Text>
            <View style={styles.modePillGroup}>
              <TouchableOpacity
                style={[styles.modePill, mode === 'webtoon' && styles.activePill]}
                onPress={() => onModeChange('webtoon')}
              >
                <Ionicons
                  name="swap-vertical"
                  size={15}
                  color={mode === 'webtoon' ? '#fff' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.modePillText,
                    mode === 'webtoon' && styles.activePillText,
                  ]}
                >
                  Webtoon
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modePill, mode === 'rtl' && styles.activePill]}
                onPress={() => onModeChange('rtl')}
              >
                <Ionicons
                  name="arrow-back-circle-outline"
                  size={15}
                  color={mode === 'rtl' ? '#fff' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.modePillText,
                    mode === 'rtl' && styles.activePillText,
                  ]}
                >
                  Manga (RTL)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modePill, mode === 'ltr' && styles.activePill]}
                onPress={() => onModeChange('ltr')}
              >
                <Ionicons
                  name="arrow-forward-circle-outline"
                  size={15}
                  color={mode === 'ltr' ? '#fff' : colors.textSecondary}
                />
                <Text
                  style={[
                    styles.modePillText,
                    mode === 'ltr' && styles.activePillText,
                  ]}
                >
                  Comic (LTR)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Theme Color Selector */}
          <View style={styles.sectionRow}>
            <Text style={styles.sectionLabel}>Canvas Backdrop</Text>
            <View style={styles.themeGroup}>
              {(['black', 'dark', 'sepia', 'white'] as BackgroundTheme[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => onThemeChange(t)}
                  style={[
                    styles.themeCircle,
                    { backgroundColor: colors.readerThemes[t] },
                    theme === t && styles.activeThemeCircle,
                  ]}
                >
                  {theme === t && (
                    <Ionicons
                      name="checkmark"
                      size={14}
                      color={t === 'white' || t === 'sepia' ? '#000' : '#fff'}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </SafeAreaView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  absoluteContainer: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    zIndex: 999,
  },
  topBar: {
    backgroundColor: 'rgba(10, 10, 12, 0.94)',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: Platform.OS === 'android' ? 36 : 0,
  },
  topSafeArea: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  titleContainer: {
    flex: 1,
    marginHorizontal: 12,
  },
  mangaTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  chapterTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  pageBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: colors.primaryLight,
    borderWidth: 1,
    borderColor: colors.primary + '55',
  },
  pageBadgeText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  bottomBar: {
    backgroundColor: 'rgba(10, 10, 12, 0.94)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingBottom: Platform.OS === 'android' ? 20 : 10,
  },
  bottomSafeArea: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  chapterNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  chapterNavBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chapterNavBtnText: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: '600',
  },
  disabledBtn: {
    opacity: 0.35,
  },
  disabledText: {
    color: colors.textMuted,
  },
  pageQuickJumper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  stepBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  sliderPageLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionRow: {
    marginTop: 10,
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  modePillGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  modePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activePill: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  modePillText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activePillText: {
    color: '#ffffff',
  },
  themeGroup: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
  },
  themeCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeThemeCircle: {
    borderColor: colors.primary,
    transform: [{ scale: 1.15 }],
  },
});
