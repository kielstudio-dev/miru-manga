import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';
import { setUserPro } from './monetization';
import { performFullCloudSync } from './cloudSync';

// Required for web browser OAuth redirect completion on native devices
WebBrowser.maybeCompleteAuthSession();

export interface AuthProfile {
  isAuthenticated: boolean;
  isAnonymous: boolean;
  userId: string | null;
  email: string | null;
  isPro: boolean;
}

/**
 * Parses URL query parameters and hash fragments
 */
function parseUrlTokens(url: string): { accessToken?: string; refreshToken?: string; code?: string } {
  try {
    // Check hash fragment (#access_token=...)
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      const hashStr = url.substring(hashIndex + 1);
      const hashParams = new URLSearchParams(hashStr);
      const accessToken = hashParams.get('access_token') || undefined;
      const refreshToken = hashParams.get('refresh_token') || undefined;
      if (accessToken && refreshToken) {
        return { accessToken, refreshToken };
      }
    }

    // Check query params (?code=...)
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      const queryStr = url.substring(queryIndex + 1);
      const queryParams = new URLSearchParams(queryStr);
      const code = queryParams.get('code') || undefined;
      if (code) {
        return { code };
      }
    }
  } catch (err) {
    console.warn('[Auth] Failed to parse URL tokens:', err);
  }

  return {};
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
 * Signs in with Google or links an existing anonymous session to a Google account.
 * This preserves all existing bookmarks and reading history!
 */
export async function signInOrLinkGoogle(): Promise<{
  success: boolean;
  message: string;
  email?: string;
}> {
  try {
    const redirectUrl = Linking.createURL('auth/callback', { scheme: 'mirumanga' });
    const { data: { session } } = await supabase.auth.getSession();
    const isAnonymous = session?.user?.is_anonymous ?? true;

    let authUrl: string | null = null;

    if (session?.user && isAnonymous) {
      // User is currently anonymous; link identity to preserve bookmarks under the same user_id
      const { data, error } = await supabase.auth.linkIdentity({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) {
        console.warn('[Auth] linkIdentity warning, falling back to signInWithOAuth:', error.message);
        // Fallback to direct OAuth
        const oauthRes = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl,
            skipBrowserRedirect: true,
          },
        });
        if (oauthRes.error) throw oauthRes.error;
        authUrl = oauthRes.data?.url || null;
      } else {
        authUrl = data?.url || null;
      }
    } else {
      // Normal direct OAuth sign-in
      const oauthRes = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });
      if (oauthRes.error) throw oauthRes.error;
      authUrl = oauthRes.data?.url || null;
    }

    if (!authUrl) {
      return {
        success: false,
        message: 'Could not generate Google authorization link.',
      };
    }

    // Launch web browser sheet for Google Sign-In
    const browserResult = await WebBrowser.openAuthSessionAsync(authUrl, redirectUrl);

    if (browserResult.type !== 'success' || !browserResult.url) {
      return {
        success: false,
        message: 'Google Sign-In was cancelled.',
      };
    }

    // Process callback tokens
    const { accessToken, refreshToken, code } = parseUrlTokens(browserResult.url);

    if (accessToken && refreshToken) {
      await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
    } else if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    }

    // Verify authenticated user
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
    console.error('[Auth] Google Sign-In error:', err);
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
 * Signs out and gracefully reverts to an anonymous guest session
 */
export async function signOutAndResetToGuest(): Promise<void> {
  try {
    await supabase.auth.signOut();
    await supabase.auth.signInAnonymously();
  } catch (err) {
    console.warn('[Auth] Sign out error:', err);
  }
}
