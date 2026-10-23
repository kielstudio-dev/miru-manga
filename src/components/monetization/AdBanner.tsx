import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { subscribeToProStatus } from '../../services/monetization';

interface AdBannerProps {
  onUpgradePress?: () => void;
}

export const AdBanner: React.FC<AdBannerProps> = ({ onUpgradePress }) => {
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToProStatus(setIsPro);
    return unsubscribe;
  }, []);

  if (isPro) return null;

  return (
    <View style={styles.container}>
      <View style={styles.adContent}>
        <View style={styles.adBadge}>
          <Text style={styles.adBadgeText}>SPONSORED</Text>
        </View>

        <View style={styles.adInfo}>
          <Text style={styles.adTitle} numberOfLines={1}>
            Support Free Manga Reading
          </Text>
          <Text style={styles.adSubtitle} numberOfLines={1}>
            Enjoying Miru Manga? Upgrade to Lifetime Pro for 100% ad-free reading!
          </Text>
        </View>

        {onUpgradePress && (
          <TouchableOpacity
            style={styles.removeAdsBtn}
            onPress={onUpgradePress}
            delayPressIn={0}
            activeOpacity={0.8}
          >
            <Ionicons name="sparkles" size={13} color="#ffffff" />
            <Text style={styles.removeAdsText}>Go Pro</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'rgba(16, 16, 24, 0.95)',
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  adContent: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 26, 38, 0.9)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 8,
  },
  adBadge: {
    backgroundColor: '#3b82f6',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  adBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  adInfo: {
    flex: 1,
  },
  adTitle: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '700',
  },
  adSubtitle: {
    color: '#94a3b8',
    fontSize: 10,
  },
  removeAdsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#7c5cff',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  removeAdsText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '700',
  },
});
