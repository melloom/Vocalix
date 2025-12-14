/**
 * Content filtering utilities for client-side content security
 * Works in conjunction with server-side filtering and moderation
 */

import { supabase } from "../lib/supabase";

export interface ContentFilterResult {
  shouldFilter: boolean;
  reason: string | null;
  severity: "low" | "medium" | "high";
}

/**
 * Check if content should be filtered based on security rules
 */
export async function checkContentFilter(
  clipId: string
): Promise<ContentFilterResult> {
  try {
    // Call server-side filter function
    const { data, error } = await supabase.rpc("filter_content_by_security_rules", {
      p_clip_id: clipId,
    });

    if (error) {
      console.error("Error checking content filter:", error);
      // On error, allow content (fail open)
      return { shouldFilter: false, reason: null, severity: "low" };
    }

    if (data === true) {
      return {
        shouldFilter: true,
        reason: "Content violates security rules",
        severity: "medium",
      };
    }

    return { shouldFilter: false, reason: null, severity: "low" };
  } catch (error) {
    console.error("Error in checkContentFilter:", error);
    return { shouldFilter: false, reason: null, severity: "low" };
  }
}

/**
 * Check content against filter rules (client-side basic checks)
 */
export function checkContentFilterRules(
  text: string | null | undefined,
  contentRating?: string | null
): ContentFilterResult {
  // Check for empty or null text
  if (!text || text.trim().length === 0) {
    return { shouldFilter: false, reason: null, severity: "low" };
  }

  // Check content rating
  if (contentRating === "explicit") {
    return {
      shouldFilter: true,
      reason: "Explicit content rating",
      severity: "medium",
    };
  }

  // Basic spam pattern detection
  const repeatedCharPattern = /(.)\1{20,}/;
  if (repeatedCharPattern.test(text)) {
    return {
      shouldFilter: true,
      reason: "Suspicious pattern detected",
      severity: "low",
    };
  }

  // Check for excessive links (potential spam)
  const linkPattern = /https?:\/\//g;
  const linkMatches = text.match(linkPattern);
  if (linkMatches && linkMatches.length > 3) {
    return {
      shouldFilter: true,
      reason: "Excessive links detected",
      severity: "medium",
    };
  }

  // Check for excessive capitalization (potential spam)
  if (text.length > 20) {
    const uppercaseCount = (text.match(/[A-Z]/g) || []).length;
    const uppercaseRatio = uppercaseCount / text.length;
    if (uppercaseRatio > 0.8) {
      return {
        shouldFilter: true,
        reason: "Excessive capitalization",
        severity: "low",
      };
    }
  }

  return { shouldFilter: false, reason: null, severity: "low" };
}

/**
 * Filter clips array based on content security rules
 */
export async function filterClipsBySecurity(
  clips: any[]
): Promise<any[]> {
  if (!clips || clips.length === 0) {
    return [];
  }

  // Batch check all clips
  const filterPromises = clips.map(async (clip) => {
    const filterResult = await checkContentFilter(clip.id);
    return {
      clip,
      shouldFilter: filterResult.shouldFilter,
    };
  });

  const results = await Promise.all(filterPromises);

  // Return only clips that should not be filtered
  return results
    .filter((result) => !result.shouldFilter)
    .map((result) => result.clip);
}

/**
 * Check if a clip should be hidden based on its status and moderation data
 */
export function shouldHideClip(clip: any): boolean {
  // Hide if status is hidden or removed
  if (clip.status === "hidden" || clip.status === "removed") {
    return true;
  }

  // Hide if moderation data indicates it should be hidden
  if (clip.moderation?.flag === true && clip.moderation?.risk >= 7) {
    return true;
  }

  return false;
}

/**
 * Get content filter status for display
 */
export function getContentFilterStatus(clip: any): {
  isFiltered: boolean;
  reason: string | null;
  canBypass: boolean;
} {
  const isFiltered = shouldHideClip(clip);
  const reason = clip.moderation?.reasons?.[0] || null;
  const canBypass = false; // Users cannot bypass filters

  return { isFiltered, reason, canBypass };
}

