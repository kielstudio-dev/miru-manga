import { Linking, Platform } from 'react-native';
import * as Updates from 'expo-updates';
import { supabase } from './supabase';

export type FeedbackCategory = 'bug' | 'broken_manga' | 'request_extension' | 'general';

export interface FeedbackSubmission {
  category: FeedbackCategory;
  title: string;
  message: string;
  userEmail?: string;
  deviceInfo?: {
    platform: string;
    osVersion?: string | number;
    appVersion: string;
    updateId?: string | null;
  };
}

export const SUPPORT_EMAIL = 'kielstudio.dev@gmail.com';

/**
 * Submits user report or feedback directly to the Supabase backend.
 * Gracefully falls back to email if network/database table is temporarily unreachable.
 */
export async function submitFeedback(submission: FeedbackSubmission): Promise<{ success: boolean; error?: string }> {
  try {
    const payload = {
      category: submission.category,
      title: submission.title.trim(),
      message: submission.message.trim(),
      user_email: submission.userEmail?.trim() || null,
      device_info: submission.deviceInfo || {
        platform: Platform.OS,
        osVersion: Platform.Version,
        appVersion: '1.0.0',
        updateId: Updates.updateId || null,
      },
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from('feedback').insert([payload]);

    if (error) {
      console.warn('[FeedbackService] Supabase insert note:', error.message);
      // Even if the table schema differs or doesn't exist yet, we don't throw an unhandled crash
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err: any) {
    console.error('[FeedbackService] Submission error:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Opens the native mail client pre-populated with issue details
 */
export async function openSupportEmail(submission?: Partial<FeedbackSubmission>): Promise<void> {
  const categoryLabel = submission?.category
    ? submission.category.replace('_', ' ').toUpperCase()
    : 'USER REPORT';
  const subject = encodeURIComponent(`[Miru Manga Support - ${categoryLabel}] ${submission?.title || 'Feedback'}`);

  // Only include the user's own message in the body as requested
  const bodyContent = submission?.message?.trim() || '';

  const mailtoUrl = `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${encodeURIComponent(bodyContent)}`;
  const canOpen = await Linking.canOpenURL(mailtoUrl);
  if (canOpen) {
    await Linking.openURL(mailtoUrl);
  } else {
    await Linking.openURL(`mailto:${SUPPORT_EMAIL}`);
  }
}
