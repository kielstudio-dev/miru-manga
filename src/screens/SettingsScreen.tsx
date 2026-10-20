import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Switch,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as Updates from 'expo-updates';
import { ReaderMode, BackgroundTheme, ReaderSettings } from '../types';
import { getSettings, saveSettings, createBackupData, restoreBackupData } from '../services/storage';
import { subscribeToProStatus, setUserPro, restorePurchases } from '../services/monetization';
import { getCloudSyncStatus, performFullCloudSync, CloudSyncStatus } from '../services/cloudSync';
import { signInOrLinkGoogle, signOutAndResetToGuest } from '../services/auth';
import { ProUpgradeModal } from '../components/monetization/ProUpgradeModal';
import { colors } from '../theme/colors';

interface SettingsScreenProps {
  onBack?: () => void;
  showBackButton?: boolean;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onBack,
  showBackButton = false,
}) => {
  const [settings, setSettings] = useState<ReaderSettings>({
    mode: 'webtoon',
    theme: 'black',
    keepScreenOn: true,
    showPageNumbers: true,
    cropBorders: false,
  });

  const [isPro, setIsPro] = useState(false);
  const [proModalVisible, setProModalVisible] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [ageGateVisible, setAgeGateVisible] = useState(false);
  const [backupLoading, setBackupLoading] = useState(false);
  const [restoreLoading, setRestoreLoading] = useState(false);

  // Cloud Sync State
  const [syncStatus, setSyncStatus] = useState<CloudSyncStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [linkingGoogle, setLinkingGoogle] = useState(false);

  // OTA Updates State
  const [checkingUpdate, setCheckingUpdate] = useState(false);

  useEffect(() => {
    getSettings().then((s) => {
      if (s) setSettings(s);
    });
    getCloudSyncStatus().then(setSyncStatus);
    const unsub = subscribeToProStatus(setIsPro);
    return unsub;
  }, []);

  const handleCloudSync = async () => {
    try {
      setSyncing(true);
      const res = await performFullCloudSync();
      const nextStatus = await getCloudSyncStatus();
      setSyncStatus(nextStatus);
      Alert.alert(res.success ? 'Cloud Sync Successful' : 'Sync Notice', res.message);
    } catch (err: any) {
      Alert.alert('Sync Error', err?.message || 'Could not sync.');
    } finally {
      setSyncing(false);
    }
  };

  const handleLinkGoogle = async () => {
    try {
      setLinkingGoogle(true);
      const res = await signInOrLinkGoogle();
      const nextStatus = await getCloudSyncStatus();
      setSyncStatus(nextStatus);
      Alert.alert(res.success ? 'Account Connected' : 'Google Sign-In Notice', res.message);
    } catch (e: any) {
      Alert.alert('Notice', e?.message || 'Could not connect to Google.');
    } finally {
      setLinkingGoogle(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? Your device will revert to a local guest session.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await signOutAndResetToGuest();
            const nextStatus = await getCloudSyncStatus();
            setSyncStatus(nextStatus);
            Alert.alert('Signed Out', 'You are now browsing in a guest session.');
          },
        },
      ]
    );
  };

  const handleCheckForUpdates = async () => {
    try {
      setCheckingUpdate(true);
      if (__DEV__) {
        Alert.alert('Development Mode', 'Over-The-Air updates are only active in installed APK builds.');
        return;
      }
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert('Update Found', 'Downloading the latest version in the background...');
        await Updates.fetchUpdateAsync();
        Alert.alert(
          'Update Ready! 🚀',
          'The newest update has been downloaded. Would you like to reload the app now?',
          [
            { text: 'Later', style: 'cancel' },
            {
              text: 'Reload Now',
              onPress: async () => {
                await Updates.reloadAsync();
              },
            },
          ]
        );
      } else {
        Alert.alert('Up to Date ✅', 'You are already running the latest version of Miru Manga!');
      }
    } catch (error: any) {
      Alert.alert(
        'Update Notice',
        error?.message || 'Could not reach update server. Check your internet connection.'
      );
    } finally {
      setCheckingUpdate(false);
    }
  };

  const handleToggleNsfw = async (value: boolean) => {
    if (value) {
      setAgeGateVisible(true);
    } else {
      await handleUpdate({ showNsfw: false });
    }
  };

  const handleConfirmAgeGate = async () => {
    setAgeGateVisible(false);
    await handleUpdate({ showNsfw: true });
    Alert.alert(
      'Mature Mode Enabled (18+)',
      '18+ content filters have been disabled. You can now load and browse mature community repositories in the Extensions tab.'
    );
  };

  const handleCreateBackup = async () => {
    try {
      setBackupLoading(true);
      const json = await createBackupData();
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `miru_manga_backup_${dateStr}_${Date.now().toString().slice(-4)}.json`;
      const fileUri = `${FileSystem.documentDirectory || FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, json);

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export Miru Backup',
          UTI: 'public.json',
        });
      } else {
        Alert.alert('Backup Created', `Backup exported to: ${fileUri}`);
      }
    } catch (err: any) {
      Alert.alert('Backup Failed', err?.message || 'Could not export backup data.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleRestoreBackup = async () => {
    try {
      setRestoreLoading(true);
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', '*/*'],
        copyToCacheDirectory: true,
      });

      if (res.canceled || !res.assets || res.assets.length === 0) {
        return;
      }

      const selectedUri = res.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(selectedUri);
      const result = await restoreBackupData(content);

      const updated = await getSettings();
      setSettings(updated);

      Alert.alert(
        'Restore Successful! 🎉',
        `Successfully restored ${result.mangaCount} manga titles and ${result.chapterCount} chapters with reading progress and settings.`
      );
    } catch (err: any) {
      Alert.alert('Restore Failed', err?.message || 'Please select a valid Miru Manga backup JSON file.');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const res = await restorePurchases();
      Alert.alert('Restore Purchases', res.message);
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to restore purchases.');
    } finally {
      setRestoring(false);
    }
  };

  const handleToggleTestPro = async () => {
    const next = !isPro;
    await setUserPro(next);
    Alert.alert(
      next ? 'Pro Mode Active' : 'Free Mode Active',
      next
        ? 'Test mode: Pro enabled. Ads hidden, unlimited offline downloads unlocked.'
        : 'Test mode: Free tier enabled. Ads active for testing.'
    );
  };

  const handleUpdate = async (patch: Partial<ReaderSettings>) => {
    const updated = await saveSettings(patch);
    setSettings(updated);
  };

  const handleClearCache = async () => {
    try {
      if (FileSystem.cacheDirectory) {
        const cacheDir = `${FileSystem.cacheDirectory}manga_pages/`;
        const info = await FileSystem.getInfoAsync(cacheDir);
        if (info.exists) {
          await FileSystem.deleteAsync(cacheDir, { idempotent: true });
        }
      }
      Alert.alert('Cache Cleared', 'All temporary extracted comic pages have been purged.');
    } catch (err) {
      console.error('Failed to clear cache:', err);
      Alert.alert('Error', 'Unable to clear cache directory.');
    }
  };

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
              <Text style={styles.headerTitle}>Settings & Compliance</Text>
              <View style={{ width: 40 }} />
            </>
          ) : (
            <View>
              <Text style={styles.tabHeaderTitle}>SETTINGS</Text>
              <Text style={styles.tabHeaderSubtitle}>Reader Preferences & Cache</Text>
            </View>
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          {/* Vortex Membership Section */}
          <Text style={styles.sectionHeader}>Membership & Monetization</Text>
          <View style={[styles.card, isPro ? styles.proCard : styles.freeCard]}>
            <View style={styles.membershipHeader}>
              <View style={[styles.membershipIconWrap, isPro && styles.membershipIconWrapPro]}>
                <Ionicons
                  name={isPro ? 'diamond' : 'sparkles'}
                  size={20}
                  color={isPro ? '#f59e0b' : '#7c5cff'}
                />
              </View>
              <View style={styles.membershipInfo}>
                <Text style={styles.membershipTitle}>
                  {isPro ? 'Miru Lifetime Pro 👑' : 'Free Tier (Ad-Supported)'}
                </Text>
                <Text style={styles.membershipSubtitle}>
                  {isPro
                    ? '100% ad-free, unlimited downloads, exclusive canvas themes.'
                    : 'Standard reading. Upgrade to remove ads & unlock unlimited offline downloads.'}
                </Text>
              </View>
            </View>

            {isPro ? (
              <View style={styles.proActionRow}>
                <TouchableOpacity
                  style={styles.restoreOutlineBtn}
                  onPress={handleRestore}
                  disabled={restoring}
                >
                  <Text style={styles.restoreOutlineText}>
                    {restoring ? 'Checking...' : 'Restore Purchases'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.testToggleBtn}
                  onPress={handleToggleTestPro}
                >
                  <Text style={styles.testToggleText}>Toggle Free (Test)</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.freeActionRow}>
                <TouchableOpacity
                  style={styles.upgradeBtn}
                  onPress={() => setProModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="sparkles" size={15} color="#ffffff" />
                  <Text style={styles.upgradeBtnText}>Upgrade to Pro — $2.99</Text>
                </TouchableOpacity>

                <View style={styles.freeSecondaryRow}>
                  <TouchableOpacity
                    style={styles.restoreTextBtn}
                    onPress={handleRestore}
                    disabled={restoring}
                  >
                    <Text style={styles.restoreTextBtnLabel}>Restore Purchases</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.testToggleBtn}
                    onPress={handleToggleTestPro}
                  >
                    <Text style={styles.testToggleText}>Toggle Pro (Test)</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>

          {/* Reader Preferences Section */}
          <Text style={styles.sectionHeader}>Default Reading Engine</Text>
          <View style={styles.card}>
            {(['webtoon', 'rtl', 'ltr'] as ReaderMode[]).map((m) => {
              const label =
                m === 'webtoon'
                  ? 'Vertical Webtoon (Continuous Scroll)'
                  : m === 'rtl'
                  ? 'Manga Mode (Right-to-Left)'
                  : 'Comic Mode (Left-to-Right)';

              const isSelected = settings.mode === m;
              return (
                <TouchableOpacity
                  key={m}
                  style={styles.radioRow}
                  onPress={() => handleUpdate({ mode: m })}
                >
                  <Text style={styles.rowLabel}>{label}</Text>
                  <Ionicons
                    name={isSelected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={isSelected ? colors.primary : colors.textMuted}
                  />
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Canvas Backdrop */}
          <Text style={styles.sectionHeader}>Canvas Backdrop</Text>
          <View style={styles.card}>
            <View style={styles.themeRow}>
              {(['black', 'dark', 'sepia', 'white'] as BackgroundTheme[]).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => handleUpdate({ theme: t })}
                  style={[
                    styles.themeCircle,
                    { backgroundColor: colors.readerThemes[t] },
                    settings.theme === t && styles.activeThemeCircle,
                  ]}
                >
                  {settings.theme === t && (
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

          {/* Content & Safety (18+) */}
          <Text style={styles.sectionHeader}>Content & Safety (18+)</Text>
          <View style={styles.card}>
            <View style={styles.switchRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.rowLabel}>Show Mature (18+) Content</Text>
                  {settings.showNsfw && (
                    <View style={styles.nsfwTag}>
                      <Text style={styles.nsfwTagText}>18+</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.rowSubtitle}>
                  Enables browsing and installing external 18+ adult manhwa & doujinshi sources.
                </Text>
              </View>
              <Switch
                value={Boolean(settings.showNsfw)}
                onValueChange={handleToggleNsfw}
                trackColor={{ false: '#262635', true: '#ef4444' }}
                thumbColor="#ffffff"
              />
            </View>

            {Boolean(settings.showNsfw) && (
              <View style={[styles.switchRow, { borderTopWidth: 1, borderTopColor: colors.border }]}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={styles.rowLabel}>Blur Mature Covers</Text>
                  <Text style={styles.rowSubtitle}>
                    Blurs explicit cover art until opened to protect privacy in public.
                  </Text>
                </View>
                <Switch
                  value={settings.blurNsfwCovers !== false}
                  onValueChange={(val) => handleUpdate({ blurNsfwCovers: val })}
                  trackColor={{ false: '#262635', true: colors.primary }}
                  thumbColor="#ffffff"
                />
              </View>
            )}
          </View>

          {/* Cloud Library Backup Section */}
          <Text style={styles.sectionHeader}>Cloud Backup & Sync</Text>
          <View style={[styles.card, styles.cloudCard]}>
            <View style={styles.cloudStatusRow}>
              <View style={styles.cloudStatusBadge}>
                <View
                  style={[
                    styles.cloudActiveDot,
                    syncStatus?.email ? { backgroundColor: '#10b981' } : undefined,
                  ]}
                />
                <Text style={styles.cloudStatusBadgeText}>
                  {syncStatus?.email
                    ? 'Google Protected'
                    : syncStatus?.isAuthenticated
                    ? 'Guest Cloud Sync'
                    : 'Standby'}
                </Text>
              </View>
              {syncStatus?.email ? (
                <TouchableOpacity onPress={handleSignOut} style={styles.signOutBtn} activeOpacity={0.7}>
                  <Text style={styles.signOutBtnText}>Sign Out</Text>
                </TouchableOpacity>
              ) : syncStatus?.userId ? (
                <Text style={styles.cloudUserIdText} numberOfLines={1}>
                  ID: {syncStatus.userId.slice(0, 8)}...
                </Text>
              ) : null}
            </View>

            <View style={styles.cloudInfoBody}>
              <Text style={styles.cloudInfoTitle}>
                {syncStatus?.email ? syncStatus.email : 'Automatic Library Backup'}
              </Text>
              <Text style={styles.cloudInfoSubtitle}>
                {syncStatus?.lastSyncTime
                  ? `Last synced: ${new Date(syncStatus.lastSyncTime).toLocaleDateString()} at ${new Date(syncStatus.lastSyncTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : 'Sync your bookmarks and reading progress seamlessly across devices.'}
              </Text>
            </View>

            {/* If anonymous guest, offer Google link button for lifetime recovery */}
            {!syncStatus?.email && (
              <TouchableOpacity
                style={styles.linkGoogleBtn}
                onPress={handleLinkGoogle}
                disabled={linkingGoogle}
                activeOpacity={0.8}
              >
                {linkingGoogle ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="logo-google" size={15} color="#ffffff" />
                    <Text style={styles.linkGoogleBtnText}>Link Google Account for Recovery</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={styles.cloudSyncActionBtn}
              onPress={handleCloudSync}
              disabled={syncing}
              activeOpacity={0.8}
            >
              {syncing ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <>
                  <Ionicons name="cloud-upload" size={16} color="#ffffff" />
                  <Text style={styles.cloudSyncActionBtnText}>Sync Library Now</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Backup & Restore Section */}
          <Text style={styles.sectionHeader}>Data & Backup (JSON)</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={handleCreateBackup}
              disabled={backupLoading}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.rowLabel}>Export Library Backup (.json)</Text>
                <Text style={styles.rowSubtitle}>
                  Exports all bookmarks, chapter reading history, and custom repositories into a portable JSON file.
                </Text>
              </View>
              {backupLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View style={styles.backupIconCircle}>
                  <Ionicons name="cloud-upload-outline" size={18} color={colors.accent} />
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionRow, { borderTopWidth: 1, borderTopColor: colors.border }]}
              onPress={handleRestoreBackup}
              disabled={restoreLoading}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.rowLabel}>Restore Library Backup (.json)</Text>
                <Text style={styles.rowSubtitle}>
                  Select a previously exported JSON backup to restore your library on any device.
                </Text>
              </View>
              {restoreLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View style={styles.backupIconCircle}>
                  <Ionicons name="cloud-download-outline" size={18} color={colors.primary} />
                </View>
              )}
            </TouchableOpacity>
          </View>

          {/* Storage Management */}
          <Text style={styles.sectionHeader}>Device Storage</Text>
          <View style={styles.card}>
            <TouchableOpacity style={styles.actionRow} onPress={handleClearCache}>
              <View>
                <Text style={styles.rowLabel}>Clear Extracted Cache</Text>
                <Text style={styles.rowSubtitle}>
                  Purges temporary page image files from unpacked .cbz/.zip archives
                </Text>
              </View>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </TouchableOpacity>
          </View>

          {/* App Updates Section */}
          <Text style={styles.sectionHeader}>App Updates & Version</Text>
          <View style={[styles.card, styles.updateCard]}>
            <View style={styles.updateCardRow}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.rowLabel}>Miru Manga v1.0.1</Text>
                  <View style={styles.otaBadge}>
                    <Text style={styles.otaBadgeText}>Live Patch Active 🚀</Text>
                  </View>
                </View>
                <Text style={styles.rowSubtitle}>
                  {Updates.updateId
                    ? `Running cloud update: ${Updates.updateId.slice(0, 8)}...`
                    : 'Tap check to fetch the newest features and improvements without reinstalling.'}
                </Text>
              </View>

              <TouchableOpacity
                style={styles.checkUpdateBtn}
                onPress={handleCheckForUpdates}
                disabled={checkingUpdate}
                activeOpacity={0.8}
              >
                {checkingUpdate ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <>
                    <Ionicons name="refresh" size={16} color="#ffffff" />
                    <Text style={styles.checkUpdateBtnText}>Check</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Legal Guardrail & Architecture Notice */}
          <Text style={styles.sectionHeader}>Architecture & Play Store Safety</Text>
          <View style={[styles.card, styles.complianceCard]}>
            <View style={styles.complianceHeader}>
              <Ionicons name="shield-checkmark" size={22} color={colors.accent} />
              <Text style={styles.complianceTitle}>Independent Media Player Legal Model</Text>
            </View>
            <Text style={styles.complianceText}>
              • <Text style={styles.boldText}>Zero Copyright Infringement:</Text> This application
              operates purely as an independent media file player. It contains no hosted pirated content,
              scrapers, or unlawful distribution channels.
            </Text>
            <Text style={styles.complianceText}>
              • <Text style={styles.boldText}>User-Provided Content:</Text> All local files (.cbz, .zip, .cbr)
              are processed solely on the device's local filesystem.
            </Text>
            <Text style={styles.complianceText}>
              • <Text style={styles.boldText}>Safe Monetization Blueprint:</Text> This architecture complies
              with Google Play & App Store policies, allowing legitimate monetization through reading tools,
              cloud sync, and non-intrusive AdMob banner placement.
            </Text>
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Miru Manga v1.0.1 (Live OTA Verified) • Kiel Studio Devs</Text>
            <Text style={[styles.footerText, { marginTop: 4, color: colors.textMuted }]}>
              Support: kielstudio.dev@gmail.com
            </Text>
          </View>
        </ScrollView>

        {/* Pro Upgrade Modal */}
        <ProUpgradeModal
          visible={proModalVisible}
          onClose={() => setProModalVisible(false)}
        />

        {/* Age Gate Verification Modal */}
        <Modal
          visible={ageGateVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setAgeGateVisible(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.ageGateContainer}>
              <View style={styles.ageGateIconWrap}>
                <Ionicons name="shield-half" size={32} color="#ef4444" />
              </View>
              <Text style={styles.ageGateTitle}>Age Verification (18+)</Text>
              <Text style={styles.ageGateSubtitle}>Adult & Mature Content Warning</Text>
              <Text style={styles.ageGateMessage}>
                To comply with Google Play Store developer policies, explicit and mature manga/webtoons
                require explicit age verification. Enabling this allows you to load third-party adult
                sources and view mature media on your private device.
                {'\n\n'}
                Are you 18 years of age or older?
              </Text>

              <View style={styles.ageGateActions}>
                <TouchableOpacity
                  style={styles.ageGateConfirmBtn}
                  onPress={handleConfirmAgeGate}
                  activeOpacity={0.8}
                >
                  <Ionicons name="checkmark-circle" size={18} color="#ffffff" />
                  <Text style={styles.ageGateConfirmText}>I am 18 or older</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.ageGateCancelBtn}
                  onPress={() => setAgeGateVisible(false)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.ageGateCancelText}>Cancel / Stay in Safe Mode</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
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
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  tabHeaderTitle: {
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  tabHeaderSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeader: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    paddingHorizontal: 16,
  },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  rowSubtitle: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
    maxWidth: 260,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  themeRow: {
    flexDirection: 'row',
    gap: 16,
    paddingVertical: 14,
  },
  themeCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeThemeCircle: {
    borderColor: colors.primary,
    transform: [{ scale: 1.15 }],
  },
  complianceCard: {
    padding: 16,
    backgroundColor: '#0e1726',
    borderColor: '#1e293b',
  },
  complianceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  complianceTitle: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
  },
  complianceText: {
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  boldText: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  footer: {
    alignItems: 'center',
    marginTop: 30,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  proCard: {
    borderColor: 'rgba(245, 158, 11, 0.4)',
    backgroundColor: '#161309',
    paddingVertical: 14,
  },
  freeCard: {
    borderColor: 'rgba(124, 92, 255, 0.3)',
    backgroundColor: '#12101e',
    paddingVertical: 14,
  },
  membershipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  membershipIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(124, 92, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  membershipIconWrapPro: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
  },
  membershipInfo: {
    flex: 1,
  },
  membershipTitle: {
    color: colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  membershipSubtitle: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  proActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(245, 158, 11, 0.15)',
  },
  restoreOutlineBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  restoreOutlineText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  testToggleBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  testToggleText: {
    color: colors.textMuted,
    fontSize: 11,
    textDecorationLine: 'underline',
  },
  freeActionRow: {
    gap: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(124, 92, 255, 0.15)',
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#7c5cff',
    paddingVertical: 10,
    borderRadius: 10,
  },
  upgradeBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
  },
  freeSecondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  restoreTextBtn: {
    paddingVertical: 4,
  },
  restoreTextBtnLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  nsfwTag: {
    backgroundColor: '#ef4444',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  nsfwTagText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  backupIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  ageGateContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#12121c',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    padding: 24,
    alignItems: 'center',
  },
  ageGateIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  ageGateTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  ageGateSubtitle: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  ageGateMessage: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    marginVertical: 16,
  },
  ageGateActions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  ageGateConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#dc2626',
    paddingVertical: 13,
    borderRadius: 12,
  },
  ageGateConfirmText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  ageGateCancelBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  ageGateCancelText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  cloudCard: {
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  cloudStatusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cloudStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  cloudActiveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10b981',
  },
  cloudStatusBadgeText: {
    color: '#10b981',
    fontSize: 11,
    fontWeight: '700',
  },
  cloudUserIdText: {
    color: colors.textMuted,
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  cloudInfoBody: {
    marginBottom: 16,
  },
  cloudInfoTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  cloudInfoSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  cloudSyncActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    width: '100%',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
    elevation: 3,
  },
  cloudSyncActionBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  linkGoogleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#3b82f6',
    paddingVertical: 11,
    borderRadius: 10,
    marginBottom: 10,
  },
  linkGoogleBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  signOutBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  signOutBtnText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '600',
  },
  updateCard: {
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  updateCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  otaBadge: {
    backgroundColor: 'rgba(124, 92, 255, 0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(124, 92, 255, 0.3)',
  },
  otaBadgeText: {
    color: '#a78bfa',
    fontSize: 10,
    fontWeight: '700',
  },
  checkUpdateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#7c5cff',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 10,
    shadowColor: '#7c5cff',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  checkUpdateBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
