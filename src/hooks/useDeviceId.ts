import { useEffect, useState } from "react";
import { updateSupabaseDeviceHeader } from "@/integrations/supabase/client";

const DEVICE_STORAGE_KEY = "deviceId";
const LEGACY_DEVICE_STORAGE_KEY = "voice-note-device-id";
const SESSION_STORAGE_KEY = "deviceId"; // Fallback for private browsers

// Try to store device ID in multiple storage mechanisms for private browser support
const storeDeviceId = (id: string): void => {
  try {
    // Primary: localStorage (persists across sessions)
    localStorage.setItem(DEVICE_STORAGE_KEY, id);
  } catch (e) {
    console.debug("localStorage not available (private browsing?), trying sessionStorage");
  }
  
  try {
    // Fallback: sessionStorage (persists for session even in private mode)
    sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch (e) {
    console.debug("sessionStorage not available");
  }
  
  try {
    // Additional fallback: IndexedDB (more persistent in private mode)
    if ('indexedDB' in window) {
      const request = indexedDB.open('echo_garden_device', 1);
      request.onerror = () => console.debug("IndexedDB not available");
      request.onsuccess = () => {
        const db = request.result;
        const transaction = db.transaction(['device'], 'readwrite');
        const store = transaction.objectStore('device');
        store.put({ id: DEVICE_STORAGE_KEY, value: id, timestamp: Date.now() });
      };
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('device')) {
          db.createObjectStore('device', { keyPath: 'id' });
        }
      };
    }
  } catch (e) {
    console.debug("IndexedDB not available");
  }
};

// Try to retrieve device ID from multiple storage mechanisms (synchronous)
const getDeviceId = (): string | null => {
  // Try localStorage first
  try {
    const id = localStorage.getItem(DEVICE_STORAGE_KEY);
    if (id) return id;
  } catch (e) {
    console.debug("localStorage not accessible");
  }
  
  // Try legacy localStorage key
  try {
    const legacyId = localStorage.getItem(LEGACY_DEVICE_STORAGE_KEY);
    if (legacyId) {
      localStorage.removeItem(LEGACY_DEVICE_STORAGE_KEY);
      storeDeviceId(legacyId);
      return legacyId;
    }
  } catch (e) {
    console.debug("legacy localStorage not accessible");
  }
  
  // Try sessionStorage
  try {
    const id = sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (id) {
      // Try to promote to localStorage if possible
      try {
        localStorage.setItem(DEVICE_STORAGE_KEY, id);
      } catch (e) {
        // localStorage still not available, keep using sessionStorage
      }
      return id;
    }
  } catch (e) {
    console.debug("sessionStorage not accessible");
  }
  
  return null;
};

export const useDeviceId = () => {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      let id = getDeviceId();

      // If no ID found in sync storage, generate a new one
      if (!id) {
        id = crypto.randomUUID();
        storeDeviceId(id);
      }

      updateSupabaseDeviceHeader(id);
      setDeviceId(id);
      
      // Try IndexedDB as async backup (doesn't block)
      if ('indexedDB' in window && !id) {
        try {
          const request = indexedDB.open('echo_garden_device', 1);
          request.onerror = () => {};
          request.onsuccess = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('device')) {
              const upgradeRequest = indexedDB.open('echo_garden_device', 2);
              upgradeRequest.onupgradeneeded = () => {
                const upgradeDb = upgradeRequest.result;
                if (!upgradeDb.objectStoreNames.contains('device')) {
                  upgradeDb.createObjectStore('device', { keyPath: 'id' });
                }
              };
              return;
            }
            const transaction = db.transaction(['device'], 'readonly');
            const store = transaction.objectStore('device');
            const getRequest = store.get(DEVICE_STORAGE_KEY);
            getRequest.onsuccess = () => {
              const result = getRequest.result;
              if (result?.value && result.value !== id) {
                // Found ID in IndexedDB, use it and sync to other storage
                storeDeviceId(result.value);
                updateSupabaseDeviceHeader(result.value);
                setDeviceId(result.value);
              }
            };
          };
          request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains('device')) {
              db.createObjectStore('device', { keyPath: 'id' });
            }
          };
        } catch (e) {
          console.debug("IndexedDB not accessible");
        }
      }
    } catch (error) {
      console.error("Failed to initialize device ID", error);
      // Fallback: generate temporary ID
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
      updateSupabaseDeviceHeader(tempId);
      setDeviceId(tempId);
    }
  }, []);

  return deviceId;
};
