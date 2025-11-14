import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { updateSupabaseDeviceHeader } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { storeDeviceMetadata, isValidDeviceId, detectSuspiciousEnvironment } from "@/lib/deviceSecurity";
import { logError, logWarn } from "@/lib/logger";

const DEVICE_STORAGE_KEY = "deviceId";
const LEGACY_DEVICE_STORAGE_KEY = "voice-note-device-id";
const PROFILE_STORAGE_KEY = "profileId";

type ProfileRow = Tables<"profiles">;

interface AuthContextType {
  deviceId: string | null;
  profileId: string | null;
  profile: ProfileRow | null;
  isLoading: boolean;
  isInitialized: boolean;
  refetchProfile: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [deviceId, setDeviceId] = useState<string | null>(() => {
    // Initialize synchronously to prevent flicker
    if (typeof window === "undefined") return null;
    try {
      let id = localStorage.getItem(DEVICE_STORAGE_KEY);
      if (!id) {
        const legacyId = localStorage.getItem(LEGACY_DEVICE_STORAGE_KEY);
        if (legacyId && isValidDeviceId(legacyId)) {
          id = legacyId;
          localStorage.removeItem(LEGACY_DEVICE_STORAGE_KEY);
        } else {
          id = crypto.randomUUID();
        }
        localStorage.setItem(DEVICE_STORAGE_KEY, id);
      }
      
      // Security: Validate device ID format
      if (!isValidDeviceId(id)) {
        logWarn("Invalid device ID format, generating new one");
        id = crypto.randomUUID();
        localStorage.setItem(DEVICE_STORAGE_KEY, id);
      }
      
      // Security: Check for suspicious environment
      const envCheck = detectSuspiciousEnvironment();
      if (envCheck.isSuspicious) {
        logWarn("Suspicious environment detected", envCheck.reasons);
        // Log but don't block - let server handle it
      }
      
      // Store device metadata for security tracking
      storeDeviceMetadata(id);
      updateSupabaseDeviceHeader(id);
      return id;
    } catch (error) {
      logError("Failed to initialize device ID", error);
      return null;
    }
  });

  const [profileId, setProfileId] = useState<string | null>(() => {
    // Initialize synchronously
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(PROFILE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  // Initialize immediately if we have deviceId (which is set synchronously)
  const [isInitialized, setIsInitialized] = useState(() => {
    // If deviceId exists, we're already initialized
    return typeof window !== "undefined" && !!localStorage.getItem(DEVICE_STORAGE_KEY);
  });
  const queryClient = useQueryClient();

  // Listen for profileId changes in localStorage (from other tabs/windows)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === PROFILE_STORAGE_KEY) {
        setProfileId(e.newValue);
        if (e.newValue) {
          queryClient.invalidateQueries({ queryKey: ["profile", deviceId] });
        }
      }
      if (e.key === DEVICE_STORAGE_KEY) {
        const newDeviceId = e.newValue;
        if (newDeviceId && newDeviceId !== deviceId) {
          setDeviceId(newDeviceId);
          updateSupabaseDeviceHeader(newDeviceId);
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [deviceId, queryClient]);

  // Load profile when deviceId or profileId changes
  const {
    data: profile,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["profile", deviceId, profileId],
    queryFn: async () => {
      if (!deviceId) return null;

      // First try to get profile by deviceId
      const { data: deviceProfile, error: deviceError } = await supabase
        .from("profiles")
        .select("*")
        .eq("device_id", deviceId)
        .maybeSingle();

      if (deviceError && deviceError.code !== "PGRST116") {
        // PGRST116 is "not found" which is fine
        logError("Error loading profile by device", deviceError);
      }

      if (deviceProfile) {
        const profileIdFromDb = deviceProfile.id;
        if (profileIdFromDb !== profileId) {
          localStorage.setItem(PROFILE_STORAGE_KEY, profileIdFromDb);
          setProfileId(profileIdFromDb);
        }
        return deviceProfile as ProfileRow;
      }

      // If profileId exists but no device match, try loading by profileId
      if (profileId) {
        const { data: idProfile, error: idError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", profileId)
          .maybeSingle();

        if (idError && idError.code !== "PGRST116") {
          logError("Error loading profile by ID", idError);
        }

        if (idProfile) {
          return idProfile as ProfileRow;
        }
      }

      return null;
    },
    enabled: !!deviceId && isInitialized,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes (as per performance optimization requirements)
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    retry: 1,
    // Don't refetch if we have a profileId in localStorage - it means we should have a profile
    refetchOnMount: false,
  });

  // Update profileId when profile loads
  useEffect(() => {
    if (profile?.id && profile.id !== profileId) {
      setProfileId(profile.id);
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, profile.id);
      } catch (error) {
        logError("Failed to save profileId", error);
      }
    } else if (!profile && profileId) {
      // Profile not found but profileId exists - clear it
      setProfileId(null);
      try {
        localStorage.removeItem(PROFILE_STORAGE_KEY);
      } catch (error) {
        logError("Failed to clear profileId", error);
      }
    }
  }, [profile, profileId]);

  // Ensure initialized state is set when deviceId is available
  useEffect(() => {
    if (deviceId && !isInitialized) {
      setIsInitialized(true);
    }
  }, [deviceId, isInitialized]);

  const value = useMemo(
    () => ({
      deviceId,
      profileId: profile?.id ?? profileId,
      profile: profile ?? null,
      isLoading: !isInitialized || isProfileLoading,
      isInitialized,
      refetchProfile: () => {
        queryClient.invalidateQueries({ queryKey: ["profile", deviceId, profileId] });
        refetchProfile();
      },
    }),
    [deviceId, profileId, profile, isInitialized, isProfileLoading, queryClient, refetchProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

