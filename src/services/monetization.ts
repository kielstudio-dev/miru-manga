import { safeDbRun } from './storage';

const PRO_SETTINGS_KEY = 'vortex_pro_status';

// In-memory cache
let cachedIsPro: boolean | null = null;
const listeners = new Set<(isPro: boolean) => void>();

export async function isUserPro(): Promise<boolean> {
  if (cachedIsPro !== null) return cachedIsPro;

  return safeDbRun(async (db) => {
    const row = await db.getFirstAsync<{ value: string }>(
      `SELECT value FROM settings WHERE key = ?;`,
      [PRO_SETTINGS_KEY]
    );
    cachedIsPro = row?.value === 'true';
    return cachedIsPro;
  }, false);
}

export async function setUserPro(pro: boolean): Promise<void> {
  cachedIsPro = pro;
  await safeDbRun(async (db) => {
    await db.runAsync(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?);`,
      [PRO_SETTINGS_KEY, pro ? 'true' : 'false']
    );
  }, undefined);

  // Notify listeners
  listeners.forEach((callback) => {
    try {
      callback(pro);
    } catch (e) {
      // Ignore
    }
  });
}

export function subscribeToProStatus(callback: (isPro: boolean) => void): () => void {
  listeners.add(callback);
  // Initial call with current status
  isUserPro().then(callback);
  return () => {
    listeners.delete(callback);
  };
}

// Simulate In-App Purchase (ready to connect with react-native-iap or Google Play Billing)
export async function purchasePro(): Promise<{ success: boolean; message: string }> {
  try {
    // In production, invoke Google Play Billing: InAppPurchases.purchaseItemAsync('vortex_pro_lifetime')
    await setUserPro(true);
    return {
      success: true,
      message: '🎉 Congratulations! You are now a Vortex Pro member. All ads removed permanently!',
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Purchase could not be completed.',
    };
  }
}

export async function restorePurchases(): Promise<{ isPro: boolean; message: string }> {
  try {
    // In production, query Google Play purchase history
    const pro = await isUserPro();
    return {
      isPro: pro,
      message: pro
        ? '✅ Previous purchase found! Pro features are fully unlocked.'
        : 'ℹ️ No prior purchases found for this Google account.',
    };
  } catch (err: any) {
    return {
      isPro: false,
      message: err?.message || 'Failed to restore purchases.',
    };
  }
}
