import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { purchasePro, restorePurchases } from '../../services/monetization';
import { getCurrentUserProfile, signInOrLinkGoogle, AuthProfile } from '../../services/auth';
import { colors } from '../../theme/colors';

interface ProUpgradeModalProps {
  visible: boolean;
  onClose: () => void;
}

const PRO_FEATURES = [
  {
    icon: 'flash' as const,
    title: '100% Ad-Free Reading',
    description: 'No banners, no interruptions. Pure reading immersion.',
  },
  {
    icon: 'cloud-download' as const,
    title: 'Unlimited Offline Downloads',
    description: 'Save hundreds of chapters to device storage to read on airplanes, trains, or offline.',
  },
  {
    icon: 'color-palette' as const,
    title: 'Exclusive Pro Canvas Themes',
    description: 'True OLED pitch-black, custom tints, and premium webtoon visual filters.',
  },
  {
    icon: 'sync' as const,
    title: 'Cloud Reading Sync',
    description: 'Never lose your progress or bookmarks when switching devices.',
  },
  {
    icon: 'cube' as const,
    title: 'Unlimited Community Extensions',
    description: 'Connect to unlimited third-party community repositories with one tap.',
  },
];

export const ProUpgradeModal: React.FC<ProUpgradeModalProps> = ({ visible, onClose }) => {
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [authProfile, setAuthProfile] = useState<AuthProfile | null>(null);
  const [showGooglePrompt, setShowGooglePrompt] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);

  useEffect(() => {
    if (visible) {
      setShowGooglePrompt(false);
      getCurrentUserProfile().then(setAuthProfile);
    }
  }, [visible]);

  const executePurchase = async () => {
    try {
      setPurchasing(true);
      setShowGooglePrompt(false);
      const res = await purchasePro();
      if (res.success) {
        Alert.alert('Miru Lifetime Pro Activated', res.message, [
          { text: 'Awesome!', onPress: onClose },
        ]);
      } else {
        Alert.alert('Purchase Failed', res.message);
      }
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Unable to process purchase.');
    } finally {
      setPurchasing(false);
    }
  };

  const handleBuyClick = () => {
    // If the user is already signed in with a Google account, proceed straight to purchase
    if (authProfile && !authProfile.isAnonymous && authProfile.email) {
      executePurchase();
      return;
    }

    // Otherwise, gently prompt them to sign in with Google to protect their purchase
    setShowGooglePrompt(true);
  };

  const handleGoogleSignInAndBuy = async () => {
    try {
      setConnectingGoogle(true);
      const authRes = await signInOrLinkGoogle();
      if (authRes.success) {
        // Refresh profile state
        const updated = await getCurrentUserProfile();
        setAuthProfile(updated);
        // Automatically proceed to complete the Pro purchase
        await executePurchase();
      } else {
        // Offer graceful guest purchase if Google Sign-In is cancelled or still in setup mode
        Alert.alert(
          'Google Sign-In Notice',
          `${authRes.message}\n\nWould you like to proceed with the purchase as a Guest for now?`,
          [
            { text: 'Proceed as Guest', onPress: executePurchase },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } catch (err: any) {
      Alert.alert(
        'Connection Notice',
        `${err?.message || 'Could not connect to Google.'}\n\nWould you like to proceed as a Guest?`,
        [
          { text: 'Proceed as Guest', onPress: executePurchase },
          { text: 'Cancel', style: 'cancel' },
        ]
      );
    } finally {
      setConnectingGoogle(false);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const res = await restorePurchases();
      Alert.alert('Restore Purchases', res.message, [
        { text: 'OK', onPress: () => res.isPro && onClose() },
      ]);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to restore.');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard}>
          {/* Close Icon Button */}
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
            {showGooglePrompt ? (
              /* Google Sign-In Soft-Gate Step */
              <View style={styles.googlePromptContainer}>
                <View style={styles.shieldIconWrap}>
                  <Ionicons name="shield-checkmark" size={36} color="#10b981" />
                </View>

                <Text style={styles.promptTitle}>Protect Your Lifetime Access</Text>
                <Text style={styles.promptDesc}>
                  Sign in with Google to tie your Lifetime Pro license and saved manga library to your
                  account. If you ever switch devices or reinstall, your access is guaranteed forever.
                </Text>

                <TouchableOpacity
                  style={styles.googleBtn}
                  onPress={handleGoogleSignInAndBuy}
                  disabled={connectingGoogle}
                  activeOpacity={0.85}
                >
                  {connectingGoogle ? (
                    <ActivityIndicator size="small" color="#1a1a24" />
                  ) : (
                    <>
                      <Ionicons name="logo-google" size={18} color="#ffffff" />
                      <Text style={styles.googleBtnText}>Continue with Google</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.guestBtn}
                  onPress={executePurchase}
                  disabled={connectingGoogle}
                  activeOpacity={0.7}
                >
                  <Text style={styles.guestBtnText}>Skip & Continue as Guest</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.backBtn}
                  onPress={() => setShowGooglePrompt(false)}
                >
                  <Text style={styles.backBtnText}>← Back to feature list</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Standard Pro Feature View */
              <>
                {/* Header with Crown */}
                <View style={styles.header}>
                  <View style={styles.crownContainer}>
                    <Ionicons name="diamond" size={32} color="#7c5cff" />
                  </View>
                  <Text style={styles.title}>MIRU PRO</Text>
                  <Text style={styles.subtitle}>The Ultimate Manga & Comic Engine</Text>

                  {/* Account Protection Status Pill */}
                  {authProfile?.email && !authProfile.isAnonymous && (
                    <View style={styles.userLinkedBadge}>
                      <Ionicons name="checkmark-circle" size={13} color="#10b981" />
                      <Text style={styles.userLinkedText} numberOfLines={1}>
                        Linked to {authProfile.email}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Features List */}
                <View style={styles.featureList}>
                  {PRO_FEATURES.map((item, idx) => (
                    <View key={idx} style={styles.featureItem}>
                      <View style={styles.featureIconBox}>
                        <Ionicons name={item.icon} size={18} color="#7c5cff" />
                      </View>
                      <View style={styles.featureTextBox}>
                        <Text style={styles.featureTitle}>{item.title}</Text>
                        <Text style={styles.featureDesc}>{item.description}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {/* Lifetime Pricing Card */}
                <View style={styles.pricingBadge}>
                  <Text style={styles.pricingBadgeLabel}>ONE-TIME PAYMENT • NO SUBSCRIPTIONS</Text>
                  <Text style={styles.pricingAmount}>$2.99</Text>
                  <Text style={styles.pricingPeriod}>Lifetime access across all your devices</Text>
                </View>

                {/* CTA Button */}
                <TouchableOpacity
                  style={styles.ctaButton}
                  onPress={handleBuyClick}
                  disabled={purchasing}
                  activeOpacity={0.85}
                >
                  {purchasing ? (
                    <ActivityIndicator size="small" color="#ffffff" />
                  ) : (
                    <>
                      <Ionicons name="sparkles" size={18} color="#ffffff" />
                      <Text style={styles.ctaButtonText}>Unlock Lifetime Pro — $2.99</Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Restore Purchase Link */}
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={handleRestore}
                  disabled={restoring}
                >
                  {restoring ? (
                    <ActivityIndicator size="small" color={colors.textMuted} />
                  ) : (
                    <Text style={styles.restoreBtnText}>Already purchased? Restore Purchases</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.78)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#13131c',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.35)',
    maxHeight: '90%',
    paddingTop: 16,
    paddingHorizontal: 20,
    paddingBottom: 28,
  },
  closeBtn: {
    alignSelf: 'flex-end',
    padding: 6,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 18,
  },
  crownContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(124, 92, 255, 0.15)',
    borderWidth: 1.5,
    borderColor: '#7c5cff',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    color: '#ffffff',
    letterSpacing: 1,
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 4,
  },
  userLinkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.25)',
  },
  userLinkedText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 240,
  },
  featureList: {
    gap: 12,
    marginBottom: 18,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    gap: 12,
  },
  featureIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(124, 92, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  featureTextBox: {
    flex: 1,
  },
  featureTitle: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 2,
  },
  featureDesc: {
    color: '#94a3b8',
    fontSize: 11,
    lineHeight: 16,
  },
  pricingBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(124, 92, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.25)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  pricingBadgeLabel: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  pricingAmount: {
    fontSize: 28,
    fontWeight: '900',
    color: '#ffffff',
    marginVertical: 2,
  },
  pricingPeriod: {
    color: '#94a3b8',
    fontSize: 11,
  },
  ctaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#7c5cff',
    paddingVertical: 15,
    borderRadius: 14,
    gap: 8,
    shadowColor: '#7c5cff',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 10,
    elevation: 6,
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
  restoreBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    marginTop: 4,
  },
  restoreBtnText: {
    color: colors.textMuted,
    fontSize: 12,
  },

  /* Google Sign-In Soft-Gate Styles */
  googlePromptContainer: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  shieldIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1.5,
    borderColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  promptTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  promptDesc: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 6,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#4285F4',
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 10,
    shadowColor: '#4285F4',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },
  googleBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  guestBtn: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 12,
  },
  guestBtnText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  backBtn: {
    paddingVertical: 8,
  },
  backBtnText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
