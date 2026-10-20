import { safeDbRun } from './storage';
import { supabase } from './supabase';

const PRO_SETTINGS_KEY = 'miru_pro_status';

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
    await setUserPro(true);

    // Sync Pro status to cloud account metadata if available
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await supabase.auth.updateUser({
          data: { is_pro: true, pro_purchased_at: Date.now() },
        });
      }
    } catch (cloudErr) {
      console.warn('[Monetization] Cloud Pro sync notice:', cloudErr);
    }

    return {
      success: true,
      message: '🎉 Congratulations! You are now a Miru Lifetime Pro member. All ads removed permanently!',
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
    let pro = await isUserPro();

    // Check cloud session if local SQLite doesn't show Pro yet
    if (!pro) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.user_metadata?.is_pro) {
          await setUserPro(true);
          pro = true;
        }
      } catch (e) {
        // Ignore
      }
    }

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
