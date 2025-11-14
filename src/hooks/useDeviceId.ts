import { useEffect, useState } from "react";
import { updateSupabaseDeviceHeader } from "@/integrations/supabase/client";

const DEVICE_STORAGE_KEY = "deviceId";
const LEGACY_DEVICE_STORAGE_KEY = "voice-note-device-id";

export const useDeviceId = () => {
  const [deviceId, setDeviceId] = useState<string | null>(null);

  useEffect(() => {
    try {
      let id = localStorage.getItem(DEVICE_STORAGE_KEY);

      if (!id) {
        const legacyId = localStorage.getItem(LEGACY_DEVICE_STORAGE_KEY);
        if (legacyId) {
          id = legacyId;
          localStorage.removeItem(LEGACY_DEVICE_STORAGE_KEY);
        } else {
          id = crypto.randomUUID();
        }
        localStorage.setItem(DEVICE_STORAGE_KEY, id);
      }

      updateSupabaseDeviceHeader(id);
      setDeviceId(id);
    } catch (error) {
      console.error("Failed to initialize device ID", error);
    }
  }, []);

  return deviceId;
};
