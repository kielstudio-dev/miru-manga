import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from './supabase';
import { setUserPro } from './monetization';
import { performFullCloudSync } from './cloudSync';

// Web Client ID from Google Cloud Console (OAuth 2.0 Web Client)
export const GOOGLE_WEB_CLIENT_ID = '351186385879-i7s95o654i3ka3upkncurji7sl0rad5q.apps.googleusercontent.com';

export interface AuthProfile {
  isAuthenticated: boolean;
  isAnonymous: boolean;
  userId: string | null;
  email: string | null;
  isPro: boolean;
}

// Configure Native Google Play Services Sign-In
try {
  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ['profile', 'email'],
    offlineAccess: true,
  });
} catch (err) {
  console.warn('[Auth] GoogleSignin configure error:', err);
}

/**
 * Returns current user authentication and profile status
 */
export async function getCurrentUserProfile(): Promise<AuthProfile> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      return {
        isAuthenticated: false,
        isAnonymous: true,
        userId: null,
        email: null,
        isPro: false,
      };
    }

    const isAnonymous = Boolean(session.user.is_anonymous);
    const email = session.user.email || null;
    const isPro = Boolean(session.user.user_metadata?.is_pro);

    return {
      isAuthenticated: true,
      isAnonymous,
      userId: session.user.id,
      email,
      isPro,
    };
  } catch (err) {
    console.error('[Auth] Error getting user profile:', err);
    return {
      isAuthenticated: false,
      isAnonymous: true,
      userId: null,
      email: null,
      isPro: false,
    };
  }
}

/**
 * Signs in using native Google 1-Tap bottom sheet (no browser, no supabase.co URL).
 * Links the Google identity to the existing anonymous user so all bookmarks are retained!
 */
export async function signInOrLinkGoogle(): Promise<{
  success: boolean;
  message: string;
  email?: string;
}> {
  try {
    // If client ID hasn't been configured yet, notify developer/user
    if (!GOOGLE_WEB_CLIENT_ID || GOOGLE_WEB_CLIENT_ID.includes('YOUR_GOOGLE_WEB_CLIENT_ID')) {
      return {
        success: false,
        message: 'Google Sign-In is awaiting your Google Web Client ID from Google Cloud Console.',
      };
    }

    // Verify Google Play Services is available
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

    // Open native Android Google account selector bottom sheet
    const signInResult = await GoogleSignin.signIn();

    // Extract ID token (compatible with both v12 and v13+ of the SDK)
    const idToken =
      (signInResult as any)?.data?.idToken ||
      (signInResult as any)?.idToken;

    if (!idToken) {
      return {
        success: false,
        message: 'Could not obtain Google authentication token. Please try again.',
      };
    }

    const { data: { session } } = await supabase.auth.getSession();
    const isAnonymous = session?.user?.is_anonymous ?? true;

    if (session?.user && isAnonymous) {
      // User is currently anonymous; link identity with ID Token so they retain all bookmarks!
      const { error: linkErr } = await (supabase.auth as any).linkIdentityIdToken({
        provider: 'google',
        token: idToken,
      });

      if (linkErr) {
        console.warn('[Auth] linkIdentityIdToken warning, attempting signInWithIdToken:', linkErr.message);
        const { error: directErr } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
        });
        if (directErr) throw directErr;
      }
    } else {
      // Direct sign in with ID token
      const { error: directErr } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (directErr) throw directErr;
    }

    // Refresh authenticated session
    const { data: { session: updatedSession } } = await supabase.auth.getSession();
    const user = updatedSession?.user;

    if (!user) {
      return {
        success: false,
        message: 'Unable to establish authenticated session with Google.',
      };
    }

    // Check if cloud account already has Pro status
    if (user.user_metadata?.is_pro) {
      await setUserPro(true);
    }

    // Perform two-way library cloud sync
    try {
      await performFullCloudSync();
    } catch (e) {
      // Non-blocking sync error
    }

    return {
      success: true,
      message: `Successfully connected as ${user.email || 'Google User'}!`,
      email: user.email,
    };
  } catch (err: any) {
    if (err.code === statusCodes.SIGN_IN_CANCELLED) {
      return {
        success: false,
        message: 'Google Sign-In was cancelled.',
      };
    } else if (err.code === statusCodes.IN_PROGRESS) {
      return {
        success: false,
        message: 'Google Sign-In is already in progress.',
      };
    } else if (err.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
      return {
        success: false,
        message: 'Google Play Services is not available or outdated on this device.',
      };
    }

    console.error('[Auth] Native Google Sign-In error:', err);
    return {
      success: false,
      message: err?.message || 'Google Sign-In failed.',
    };
  }
}

/**
 * Permanently attaches Lifetime Pro status to the user's Supabase cloud account
 */
export async function syncProStatusToCloud(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    await supabase.auth.updateUser({
      data: {
        is_pro: true,
        pro_activated_at: Date.now(),
      },
    });
  } catch (err) {
    console.warn('[Auth] Failed to sync Pro status to cloud:', err);
  }
}

/**
 * Signs out from both native Google Sign-In and Supabase, then resets to guest
 */
export async function signOutAndResetToGuest(): Promise<void> {
  try {
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      // Non-blocking Google Sign-In signout error
    }
    await supabase.auth.signOut();
    await supabase.auth.signInAnonymously();
  } catch (err) {
    console.warn('[Auth] Sign out error:', err);
  }
}
