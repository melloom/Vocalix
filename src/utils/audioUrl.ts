/**
 * Audio URL utilities for Supabase Storage CDN
 * Optimized for CDN caching and performance
 */

import { supabase } from "@/integrations/supabase/client";
import { offlineStorage } from "./offlineStorage";
import { getOptimalAudioQuality, getAudioQualityParams, AudioQuality } from "./adaptiveBitrate";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_PUBLIC_URL = import.meta.env.VITE_SUPABASE_PUBLIC_URL || SUPABASE_URL;

/**
 * Get audio URL with CDN optimization
 * Uses Supabase Storage's built-in CDN for fast global delivery
 * 
 * @param audioPath - Path to audio file in storage
 * @param options - Configuration options
 * @returns Promise resolving to audio URL
 */
export async function getAudioUrl(
  audioPath: string,
  options: {
    /** Check offline storage first (default: true) */
    checkOffline?: boolean;
    /** Clip ID for offline check (optional) */
    clipId?: string;
    /** Use public URL if bucket is public (default: false, uses signed URL) */
    usePublicUrl?: boolean;
    /** Expiry time in seconds for signed URLs (default: 86400 = 24 hours for better CDN caching) */
    expiresIn?: number;
    /** Force refresh URL even if cached (default: false) */
    forceRefresh?: boolean;
    /** Audio quality level (default: auto-detect based on connection) */
    quality?: AudioQuality;
    /** Enable adaptive bitrate (default: true) */
    adaptiveBitrate?: boolean;
  } = {}
): Promise<string> {
  const {
    checkOffline = true,
    clipId,
    usePublicUrl = false,
    expiresIn = 86400, // 24 hours for better CDN caching
    forceRefresh = false,
    quality,
    adaptiveBitrate = true,
  } = options;

  // Determine audio quality if adaptive bitrate is enabled
  const audioQuality = quality || (adaptiveBitrate ? getOptimalAudioQuality() : 'medium');

  // Check offline storage first if enabled and clipId provided
  if (checkOffline && clipId) {
    try {
      const audioBlob = await offlineStorage.getAudioBlob(clipId);
      if (audioBlob) {
        // Use offline version (faster, no network request)
        return URL.createObjectURL(audioBlob);
      }
    } catch (error) {
      // Silently fall through to online version
      console.debug("Offline storage check failed, using online URL", error);
    }
  }

  // Use public URL if bucket is public and option enabled
  // Public URLs are more cache-friendly and CDN-optimized
  if (usePublicUrl && SUPABASE_PUBLIC_URL) {
    let publicUrl = `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/audio/${audioPath}`;
    
    // Add quality parameters if adaptive bitrate is enabled and not original
    if (adaptiveBitrate && audioQuality !== 'original') {
      const qualityParams = getAudioQualityParams(audioQuality);
      const params = new URLSearchParams(qualityParams);
      publicUrl += `?${params.toString()}`;
    }
    
    // Validate public URL works (optional check)
    if (!forceRefresh) {
      return publicUrl;
    }
    
    // If force refresh, try to validate URL exists
    try {
      const response = await fetch(publicUrl, { method: "HEAD" });
      if (response.ok) {
        return publicUrl;
      }
    } catch (error) {
      // Fall through to signed URL
      console.debug("Public URL check failed, using signed URL", error);
    }
  }

  // Use signed URL (works with private/public buckets, still uses CDN)
  // Longer expiry time (24 hours) allows better browser/CDN caching
  try {
    const { data, error } = await supabase.storage
      .from("audio")
      .createSignedUrl(audioPath, expiresIn);

    if (error) throw error;
    if (!data?.signedUrl) {
      throw new Error("Failed to get signed URL");
    }

    return data.signedUrl;
  } catch (error) {
    console.error("Failed to get audio URL:", error);
    throw error;
  }
}

/**
 * Get multiple audio URLs efficiently
 * Useful for prefetching or batch operations
 * 
 * @param audioPaths - Array of audio paths
 * @param options - Configuration options
 * @returns Promise resolving to Map of path -> URL
 */
export async function getAudioUrls(
  audioPaths: string[],
  options: {
    usePublicUrl?: boolean;
    expiresIn?: number;
  } = {}
): Promise<Map<string, string>> {
  const {
    usePublicUrl = false,
    expiresIn = 86400,
  } = options;

  const urlMap = new Map<string, string>();

  if (usePublicUrl && SUPABASE_PUBLIC_URL) {
    // Use public URLs for batch operations
    audioPaths.forEach((path) => {
      urlMap.set(path, `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/audio/${path}`);
    });
    return urlMap;
  }

  // Get signed URLs for each path
  // Note: Supabase doesn't have a batch signed URL API, so we do it sequentially
  // In production, consider using public bucket or implementing batch signing server-side
  for (const path of audioPaths) {
    try {
      const url = await getAudioUrl(path, { checkOffline: false, expiresIn });
      urlMap.set(path, url);
    } catch (error) {
      console.warn(`Failed to get URL for ${path}:`, error);
      // Continue with other paths
    }
  }

  return urlMap;
}

/**
 * Prefetch audio URL for better performance
 * Fetches the URL and caches it, returns cached version on subsequent calls
 * 
 * @param audioPath - Path to audio file
 * @param clipId - Optional clip ID for caching key
 * @returns Promise resolving to audio URL
 */
const urlCache = new Map<string, { url: string; expiresAt: number }>();

export async function prefetchAudioUrl(
  audioPath: string,
  clipId?: string,
  expiresIn: number = 86400
): Promise<string> {
  const cacheKey = clipId || audioPath;
  const cached = urlCache.get(cacheKey);

  // Return cached URL if still valid (refresh 1 hour before expiry)
  if (cached && cached.expiresAt > Date.now() + 3600000) {
    return cached.url;
  }

  // Fetch new URL
  const url = await getAudioUrl(audioPath, {
    checkOffline: !!clipId,
    clipId,
    expiresIn,
  });

  // Cache the URL
  urlCache.set(cacheKey, {
    url,
    expiresAt: Date.now() + expiresIn * 1000,
  });

  return url;
}

/**
 * Clear URL cache
 * Useful for testing or manual cache invalidation
 */
export function clearAudioUrlCache(): void {
  urlCache.clear();
}

/**
 * Check if audio bucket is public
 * Returns true if public URLs can be used
 */
export async function isAudioBucketPublic(): Promise<boolean> {
  try {
    // Try to access a test file with public URL
    // If this works, bucket is public
    const testPath = "test-access-check"; // This path doesn't need to exist
    const publicUrl = `${SUPABASE_PUBLIC_URL}/storage/v1/object/public/audio/${testPath}`;
    const response = await fetch(publicUrl, { method: "HEAD" });
    
    // Even if file doesn't exist, a 404 means bucket is public (403 means private)
    return response.status !== 403;
  } catch (error) {
    return false;
  }
}

