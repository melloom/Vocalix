/**
 * Freepik API service for fetching avatar icons
 */

const FREEPIK_API_KEY = import.meta.env.VITE_FREEPIK_API_KEY || '';
const FREEPIK_API_BASE = 'https://api.freepik.com/v1';

// Warn if API key is missing
if (!FREEPIK_API_KEY && import.meta.env.DEV) {
  console.warn('[Freepik] VITE_FREEPIK_API_KEY not set. Avatar fetching will be disabled.');
}

// Cache for fetched icons
const iconCache = new Map<string, string>();

/**
 * Search for icons on Freepik
 */
export async function searchFreepikIcons(query: string, limit: number = 24): Promise<any[]> {
  try {
    // Try multiple API endpoint formats
    const endpoints = [
      `${FREEPIK_API_BASE}/resources?locale=en-US&page=1&limit=${limit}&order=relevance&q=${encodeURIComponent(query)}&type=icon`,
      `${FREEPIK_API_BASE}/resources?q=${encodeURIComponent(query)}&limit=${limit}&type=icon`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'X-Freepik-Api-Key': FREEPIK_API_KEY,
            'Authorization': `Bearer ${FREEPIK_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          // Handle different response formats
          if (data.data && Array.isArray(data.data)) {
            return data.data;
          }
          if (Array.isArray(data)) {
            return data;
          }
          if (data.resources && Array.isArray(data.resources)) {
            return data.resources;
          }
        }
      } catch (e) {
        // Try next endpoint
        continue;
      }
    }

    console.warn('[Freepik] All API endpoints failed');
    return [];
  } catch (error) {
    console.warn('[Freepik] Failed to fetch icons:', error);
    return [];
  }
}

/**
 * Get download URL for an icon
 */
export async function getIconDownloadUrl(iconId: string): Promise<string | null> {
  // Check cache first
  if (iconCache.has(iconId)) {
    return iconCache.get(iconId)!;
  }

  try {
    // Try multiple download endpoint formats
    const endpoints = [
      `${FREEPIK_API_BASE}/resources/${iconId}/download`,
      `${FREEPIK_API_BASE}/resources/${iconId}`,
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          headers: {
            'X-Freepik-Api-Key': FREEPIK_API_KEY,
            'Authorization': `Bearer ${FREEPIK_API_KEY}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const data = await response.json();
          // Handle different response formats
          const downloadUrl = data.data?.download_url || data.data?.url || data.download_url || data.url;
          
          if (downloadUrl) {
            iconCache.set(iconId, downloadUrl);
            return downloadUrl;
          }
        }
      } catch (e) {
        // Try next endpoint
        continue;
      }
    }

    return null;
  } catch (error) {
    console.warn('[Freepik] Failed to get download URL:', error);
    return null;
  }
}

/**
 * Pre-fetch avatar icons for onboarding
 */
export async function fetchAvatarIcons(): Promise<Map<string, string>> {
  const avatarMap = new Map<string, string>();
  
  // Search queries for different avatar types
  const queries = [
    'avatar user person',
    'avatar profile',
    'avatar character',
    'avatar icon',
    'user icon',
    'person icon',
  ];

  try {
    // Fetch icons for each query
    for (const query of queries) {
      const icons = await searchFreepikIcons(query, 4);
      for (const icon of icons) {
        if (icon.id && !avatarMap.has(icon.id)) {
          const downloadUrl = await getIconDownloadUrl(icon.id);
          if (downloadUrl) {
            avatarMap.set(icon.id, downloadUrl);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[Freepik] Failed to pre-fetch avatars:', error);
  }

  return avatarMap;
}

