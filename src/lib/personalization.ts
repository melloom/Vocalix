/**
 * Personalization utilities for tracking user behavior and preferences
 */

import { supabase } from "@/integrations/supabase/client";
import { logError, logWarn } from "@/lib/logger";

// Utility function to detect device type
export function getDeviceType(): string {
  if (typeof navigator === 'undefined') return 'desktop';
  const userAgent = navigator.userAgent.toLowerCase();
  if (/mobile|android|iphone|ipod/i.test(userAgent)) return 'mobile';
  if (/tablet|ipad/i.test(userAgent)) return 'tablet';
  return 'desktop';
}

/**
 * Track when a user skips a clip
 */
export async function trackClipSkip(
  clipId: string,
  profileId: string,
  options?: {
    skipReason?: 'too_long' | 'not_interested' | 'already_heard' | 'poor_quality' | 'other';
    listenDurationSeconds?: number;
  }
): Promise<void> {
  try {
    const deviceType = getDeviceType();
    
    const { error } = await supabase
      .from('clip_skips')
      .upsert({
        profile_id: profileId,
        clip_id: clipId,
        skip_reason: options?.skipReason || 'other',
        listen_duration_seconds: options?.listenDurationSeconds || null,
        device_type: deviceType,
        skipped_at: new Date().toISOString(),
      }, {
        onConflict: 'profile_id,clip_id',
      });

    if (error) {
      logError('trackClipSkip', error);
    }
  } catch (err) {
    logWarn('Failed to track clip skip', err);
    // Don't throw - this is non-critical
  }
}

/**
 * Update listening pattern when user listens to a clip
 */
export async function updateListeningPattern(
  profileId: string,
  durationSeconds: number
): Promise<void> {
  try {
    const deviceType = getDeviceType();
    
    const { error } = await supabase.rpc('update_listening_pattern', {
      p_profile_id: profileId,
      p_duration_seconds: durationSeconds,
      p_device_type: deviceType,
    });

    if (error) {
      logError('updateListeningPattern', error);
    }
  } catch (err) {
    logWarn('Failed to update listening pattern', err);
    // Don't throw - this is non-critical
  }
}

/**
 * Get user's listening hours pattern
 */
export async function getUserListeningHours(
  profileId: string,
  daysBack: number = 30
): Promise<Array<{ hour: number; listen_count: number; avg_duration_seconds: number }>> {
  try {
    const { data, error } = await supabase.rpc('get_user_listening_hours', {
      p_profile_id: profileId,
      p_days_back: daysBack,
    });

    if (error) {
      logError('getUserListeningHours', error);
      return [];
    }

    return data || [];
  } catch (err) {
    logWarn('Failed to get user listening hours', err);
    return [];
  }
}

/**
 * Get user preferences
 */
export async function getUserPreferences(profileId: string) {
  try {
    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('profile_id', profileId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      logError('getUserPreferences', error);
      return null;
    }

    return data;
  } catch (err) {
    logWarn('Failed to get user preferences', err);
    return null;
  }
}

/**
 * Update user preferences
 */
export async function updateUserPreferences(
  profileId: string,
  preferences: Partial<{
    preferred_duration_min: number;
    preferred_duration_max: number;
    preferred_topics: string[];
    preferred_creators: string[];
    voice_preferences: Record<string, any>;
    time_preferences: Record<string, any>;
    feed_algorithm_preferences: Record<string, any>;
    privacy_preferences: Record<string, any>;
  }>
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('user_preferences')
      .upsert({
        profile_id: profileId,
        ...preferences,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'profile_id',
      });

    if (error) {
      logError('updateUserPreferences', error);
      return false;
    }

    return true;
  } catch (err) {
    logWarn('Failed to update user preferences', err);
    return false;
  }
}

/**
 * Reset personalization data for a user
 */
export async function resetPersonalization(profileId: string): Promise<boolean> {
  try {
    // Delete skip history
    await supabase
      .from('clip_skips')
      .delete()
      .eq('profile_id', profileId);

    // Delete listening patterns
    await supabase
      .from('listening_patterns')
      .delete()
      .eq('profile_id', profileId);

    // Reset preferences to defaults
    await supabase
      .from('user_preferences')
      .delete()
      .eq('profile_id', profileId);

    return true;
  } catch (err) {
    logError('resetPersonalization', err);
    return false;
  }
}

