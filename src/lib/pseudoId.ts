/**
 * Pseudo ID Management
 * 
 * Handles registration and lookup of pseudonymized device IDs
 */

import { getOrCreateDeviceId } from "./deviceId";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Get or register pseudo_id for the current device
 * 
 * @returns Promise<string | null> - The pseudo_id, or null if registration fails
 */
export async function getOrRegisterPseudoId(): Promise<string | null> {
  try {
    // Get device ID
    const deviceId = await getOrCreateDeviceId();
    if (!deviceId) {
      console.error('[PseudoID] Failed to get device ID');
      return null;
    }

    // Check if we already have a pseudo_id stored
    const storedPseudoId = localStorage.getItem('vocalix_pseudo_id');
    if (storedPseudoId) {
      return storedPseudoId;
    }

    // Call the pseudonymize-device function
    const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    if (!SUPABASE_PUBLISHABLE_KEY) {
      console.error('[PseudoID] VITE_SUPABASE_PUBLISHABLE_KEY is not defined');
      return null;
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/pseudonymize-device`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_PUBLISHABLE_KEY,
        'Authorization': `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({ deviceId }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error('[PseudoID] Failed to pseudonymize device ID:', error);
      return null;
    }

    const { pseudoId } = await response.json();
    
    if (!pseudoId) {
      console.error('[PseudoID] No pseudoId returned from function');
      return null;
    }

    // Store pseudo_id for future use
    localStorage.setItem('vocalix_pseudo_id', pseudoId);
    
    return pseudoId;
  } catch (error) {
    console.error('[PseudoID] Error getting/registering pseudo_id:', error);
    return null;
  }
}

/**
 * Get stored pseudo_id without registering
 */
export function getPseudoId(): string | null {
  try {
    return localStorage.getItem('vocalix_pseudo_id');
  } catch {
    return null;
  }
}

/**
 * Clear pseudo_id (for "burn persona" feature)
 */
export function clearPseudoId(): void {
  try {
    localStorage.removeItem('vocalix_pseudo_id');
  } catch (error) {
    console.error('[PseudoID] Error clearing pseudo_id:', error);
  }
}

