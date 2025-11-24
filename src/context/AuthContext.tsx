import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { logError, logWarn } from "@/lib/logger";

const PROFILE_STORAGE_KEY = "profileId";

type ProfileRow = Tables<"profiles">;

interface AuthContextType {
  userId: string | null; // Supabase auth user ID
  profileId: string | null;
  profile: ProfileRow | null;
  isLoading: boolean;
  isInitialized: boolean;
  refetchProfile: () => void;
  signInAnonymously: () => Promise<void>;
  deviceId: string | null; // Backward compatibility - kept for existing code
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [userId, setUserId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem(PROFILE_STORAGE_KEY);
    } catch {
      return null;
    }
  });

  const [isInitialized, setIsInitialized] = useState(false);
  const queryClient = useQueryClient();

  // Sign in anonymously
  const signInAnonymously = async () => {
    try {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        // If anonymous auth is disabled, don't spam console - just return
        if (error.message?.includes("Anonymous sign-ins are disabled") || error.message?.includes("disabled")) {
          console.warn("⚠️ Anonymous Auth is not enabled in Supabase. Enable it at: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/auth/providers");
          return; // Don't throw - app can still work
        }
        throw error;
      }
      
      if (data.user) {
        setUserId(data.user.id);
        logWarn("Signed in anonymously:", data.user.id);
      }
    } catch (error: any) {
      // Only log if it's not the "disabled" error
      if (!error?.message?.includes("Anonymous sign-ins are disabled") && !error?.message?.includes("disabled")) {
        logError("Failed to sign in anonymously", error);
      }
      // Don't throw - let app continue without auth
    }
  };

  // Initialize auth state with timeout for mobile
  useEffect(() => {
    let mounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let initialized = false;

    // Set a timeout to force initialization after 500ms (mobile fallback)
    // This ensures the app renders even if auth hangs - very aggressive
    const forceInit = () => {
      if (mounted && !initialized) {
        console.log('[Auth] Force initializing after 500ms timeout');
        initialized = true;
        setIsInitialized(true);
      }
    };
    timeoutId = setTimeout(forceInit, 500);

    // Helper to mark as initialized
    const markInitialized = () => {
      if (mounted && !initialized) {
        initialized = true;
        setIsInitialized(true);
        if (timeoutId) clearTimeout(timeoutId);
      }
    };

    // Check for existing session
    Promise.race([
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!mounted) return;
        
        if (session?.user) {
          setUserId(session.user.id);
          markInitialized();
        } else {
          // No session - try to sign in anonymously (with timeout)
          Promise.race([
            signInAnonymously(),
            new Promise<void>((resolve) => setTimeout(resolve, 2000)) // 2 second timeout
          ]).then(() => {
            markInitialized();
          }).catch(() => {
            // Silently fail - anonymous auth might not be enabled
            // App can still work, just won't have auth
            markInitialized();
          });
        }
      }),
      new Promise<void>((resolve) => setTimeout(resolve, 2500)) // Backup timeout
    ]).catch(() => {
      // If everything fails, still initialize after timeout
      markInitialized();
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      
      if (session?.user) {
        setUserId(session.user.id);
      } else {
        setUserId(null);
        // Try to sign in anonymously again (but don't block)
        // Only try once per minute to avoid spam
        const lastAttempt = sessionStorage.getItem("last_anonymous_auth_attempt");
        const now = Date.now();
        if (!lastAttempt || (now - parseInt(lastAttempt, 10)) > 60000) {
          sessionStorage.setItem("last_anonymous_auth_attempt", now.toString());
          signInAnonymously().catch(() => {
            // Silently fail - anonymous auth might not be enabled yet
          });
        }
      }
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  // Load profile when userId changes
  const {
    data: profile,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["profile", userId, profileId],
    queryFn: async () => {
      if (!userId) return null;

      // Try to get profile by auth_user_id first (new way)
      // Note: auth_user_id may not be in TypeScript types yet, but exists in DB
      const { data: authProfile, error: authError } = await supabase
        .from("profiles")
        .select("*")
        .eq("auth_user_id" as any, userId)
        .maybeSingle();

      if (authError && authError.code !== "PGRST116") {
        logError("Error loading profile by auth_user_id", authError);
      }

      if (authProfile) {
        const profileIdFromDb = authProfile.id;
        if (profileIdFromDb !== profileId) {
          localStorage.setItem(PROFILE_STORAGE_KEY, profileIdFromDb);
          setProfileId(profileIdFromDb);
        }
        return authProfile as ProfileRow;
      }

      // Fallback: Try by profileId if it exists (backward compatibility)
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
          // Link this profile to the auth user if not already linked
          // Note: auth_user_id may not be in TypeScript types yet, but exists in DB
          const profileWithAuth = idProfile as any;
          if (!profileWithAuth.auth_user_id && userId) {
            await supabase
              .from("profiles")
              .update({ auth_user_id: userId } as any)
              .eq("id", profileId);
          }
          return idProfile as ProfileRow;
        }
      }

      return null;
    },
    enabled: !!userId && isInitialized,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
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
      // Profile not found - clear it
      setProfileId(null);
      try {
        localStorage.removeItem(PROFILE_STORAGE_KEY);
      } catch (error) {
        logError("Failed to clear profileId", error);
      }
    }
  }, [profile, profileId]);

  // Listen for profileId changes in localStorage (from other tabs/windows)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === PROFILE_STORAGE_KEY) {
        setProfileId(e.newValue);
        if (e.newValue) {
          queryClient.invalidateQueries({ queryKey: ["profile", userId] });
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [userId, queryClient]);

  // Backward compatibility: Get deviceId from localStorage if it exists
  const deviceId = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("deviceId");
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(
    () => ({
      userId,
      profileId: profile?.id ?? profileId,
      profile: profile ?? null,
      isLoading: !isInitialized || isProfileLoading,
      isInitialized,
      deviceId, // Backward compatibility
      refetchProfile: () => {
        queryClient.invalidateQueries({ queryKey: ["profile", userId, profileId] });
        refetchProfile();
      },
      signInAnonymously,
    }),
    [userId, profileId, profile, isInitialized, isProfileLoading, deviceId, queryClient, refetchProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  // Don't throw on mobile - return safe defaults instead
  if (context === undefined) {
    console.warn("[AuthContext] useAuth called outside AuthProvider, returning defaults");
    return {
      userId: null,
      profileId: null,
      profile: null,
      isLoading: false,
      isInitialized: true, // Pretend initialized so app doesn't wait
      refetchProfile: () => {},
      signInAnonymously: async () => {},
      deviceId: null,
    };
  }
  return context;
};
