import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../../theme/colors';

export type MainTabType = 'bookmarks' | 'downloads' | 'extensions' | 'settings';

interface BottomNavBarProps {
  currentTab: MainTabType;
  onSelectTab: (tab: MainTabType) => void;
  downloadCount?: number;
  bookmarkCount?: number;
}

interface TabConfig {
  id: MainTabType;
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  badge?: number;
}

export const BottomNavBar = React.memo<BottomNavBarProps>(({
  currentTab,
  onSelectTab,
  downloadCount = 0,
  bookmarkCount = 0,
}) => {
  const insets = useSafeAreaInsets();

  const tabs: TabConfig[] = [
    {
      id: 'bookmarks',
      label: 'Bookmarks',
      activeIcon: 'bookmark',
      inactiveIcon: 'bookmark-outline',
      badge: bookmarkCount > 0 ? bookmarkCount : undefined,
    },
    {
      id: 'downloads',
      label: 'Downloads',
      activeIcon: 'cloud-download',
      inactiveIcon: 'cloud-download-outline',
      badge: downloadCount > 0 ? downloadCount : undefined,
    },
    {
      id: 'extensions',
      label: 'Extensions',
      activeIcon: 'compass',
      inactiveIcon: 'compass-outline',
    },
    {
      id: 'settings',
      label: 'Settings',
      activeIcon: 'settings',
      inactiveIcon: 'settings-outline',
    },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          paddingBottom: Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 8),
        },
      ]}
    >
      <View style={styles.navRow}>
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              testID={`bottom-tab-${tab.id}`}
              style={styles.tabButton}
              onPress={() => onSelectTab(tab.id)}
              delayPressIn={0}
              activeOpacity={0.7}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <View style={styles.iconWrapper}>
                <Ionicons
                  name={isActive ? tab.activeIcon : tab.inactiveIcon}
                  size={22}
                  color={isActive ? colors.primary : colors.textMuted}
                />
                {Boolean(typeof tab.badge === 'number' && tab.badge > 0 && tab.id === 'downloads') && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>
                      {(tab.badge ?? 0) > 99 ? '99+' : tab.badge}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.label,
                  isActive ? styles.activeLabel : styles.inactiveLabel,
                ]}
                numberOfLines={1}
              >
                {tab.label}
              </Text>
              <View style={styles.indicatorContainer}>
                {isActive && <View style={styles.activeDot} />}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0c0c12',
    borderTopWidth: 1,
    borderTopColor: '#1d1d28',
    paddingTop: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 16,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 2,
  },
  iconWrapper: {
    width: 36,
    height: 26,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -4,
    backgroundColor: colors.accent,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    borderWidth: 1.5,
    borderColor: '#0c0c12',
  },
  badgeText: {
    color: '#0a0a0c',
    fontSize: 9,
    fontWeight: '800',
  },
  label: {
    fontSize: 11,
    marginTop: 2,
    letterSpacing: 0.2,
  },
  activeLabel: {
    color: '#ffffff',
    fontWeight: '700',
  },
  inactiveLabel: {
    color: colors.textMuted,
    fontWeight: '500',
  },
  indicatorContainer: {
    height: 4,
    marginTop: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.9,
    shadowRadius: 3,
    elevation: 3,
  },
});
