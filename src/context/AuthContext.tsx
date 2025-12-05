import { createContext, useContext, useEffect, useState, useRef, useMemo, ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tables } from "@/integrations/supabase/types";
import { logError, logWarn } from "@/lib/logger";
import { CrossBrowserDetectionDialog } from "@/components/CrossBrowserDetectionDialog";
import { getOrRegisterPseudoId, getPseudoId } from "@/lib/pseudoId";

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
  
  // Pseudo ID state
  const [pseudoId, setPseudoId] = useState<string | null>(null);
  const pseudoIdInitializedRef = useRef(false);
  
  // Cross-browser detection state
  const [showCrossBrowserDialog, setShowCrossBrowserDialog] = useState(false);
  const [crossBrowserProfileId, setCrossBrowserProfileId] = useState<string | null>(null);
  const crossBrowserCheckDoneRef = useRef(false);
  
  // Prevent multiple simultaneous sign-in attempts
  const signInAttemptRef = useRef(false);
  const lastSignInAttemptRef = useRef<number>(0);
  const signInPromiseRef = useRef<Promise<void> | null>(null);

  // Sign in anonymously (with rate limiting to prevent spam)
  const signInAnonymously = async () => {
    // Prevent multiple simultaneous calls
    if (signInAttemptRef.current) {
      // If there's already a sign-in in progress, return that promise
      if (signInPromiseRef.current) {
        return signInPromiseRef.current;
      }
      return;
    }
    
    // Rate limiting: Don't attempt more than once per 5 minutes
    const now = Date.now();
    const timeSinceLastAttempt = now - lastSignInAttemptRef.current;
    const MIN_COOLDOWN = 5 * 60 * 1000; // 5 minutes
    
    if (timeSinceLastAttempt < MIN_COOLDOWN && lastSignInAttemptRef.current > 0) {
      console.log(`[Auth] Sign-in attempt blocked - cooldown active (${Math.round((MIN_COOLDOWN - timeSinceLastAttempt) / 1000)}s remaining)`);
      return;
    }
    
    // Check if we already have a session before attempting
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      setUserId(session.user.id);
      return;
    }
    
    signInAttemptRef.current = true;
    lastSignInAttemptRef.current = now;
    
    const signInPromise = (async () => {
      try {
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          // If anonymous auth is disabled, don't spam console - just return
          if (error.message?.includes("Anonymous sign-ins are disabled") || error.message?.includes("disabled")) {
            console.warn("⚠️ Anonymous Auth is not enabled in Supabase. Enable it at: https://supabase.com/dashboard/project/xgblxtopsapvacyaurcr/auth/providers");
            signInAttemptRef.current = false;
            return; // Don't throw - app can still work
          }
          throw error;
        }
        
        if (data.user) {
          setUserId(data.user.id);
          console.log('[Auth] Signed in anonymously:', data.user.id.substring(0, 8) + '...');
        }
      } catch (error: any) {
        // Only log if it's not the "disabled" error
        if (!error?.message?.includes("Anonymous sign-ins are disabled") && !error?.message?.includes("disabled")) {
          logError("Failed to sign in anonymously", error);
        }
        // Don't throw - let app continue without auth
      } finally {
        signInAttemptRef.current = false;
        signInPromiseRef.current = null;
      }
    })();
    
    signInPromiseRef.current = signInPromise;
    return signInPromise;
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
        // Don't automatically try to sign in on auth state change
        // This was causing too many sign-in attempts
        // Only sign in when explicitly needed (e.g., during onboarding)
      }
    });

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  // Backward compatibility: Get deviceId from localStorage if it exists
  const deviceId = useMemo(() => {
    if (typeof window === "undefined") return null;
    try {
      return localStorage.getItem("deviceId");
    } catch {
      return null;
    }
  }, []);

  // Initialize pseudo_id on mount
  useEffect(() => {
    if (pseudoIdInitializedRef.current) return;
    pseudoIdInitializedRef.current = true;
    
    // Get or register pseudo_id
    getOrRegisterPseudoId().then((id) => {
      if (id) {
        setPseudoId(id);
      }
    }).catch((error) => {
      console.error('[AuthContext] Error initializing pseudo_id:', error);
    });
  }, []);

  // Load profile when userId changes or deviceId exists
  const {
    data: profile,
    isLoading: isProfileLoading,
    refetch: refetchProfile,
  } = useQuery({
    queryKey: ["profile", userId, profileId, deviceId, pseudoId],
    queryFn: async () => {
      // Removed debug logging to reduce console noise
      
      // PRIORITY 1: Check by pseudo_id FIRST (most privacy-preserving)
      // This is the new primary lookup method
      if (pseudoId) {
        try {
          const { data: pseudoProfile, error: pseudoError } = await Promise.race([
            supabase
              .from("profiles")
              .select("*")
              .eq("pseudo_id", pseudoId)
              .maybeSingle(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Pseudo profile lookup timeout')), 3000)
            )
          ]) as any;

          if (pseudoError) {
            if (pseudoError.code !== "PGRST116" && pseudoError.message !== 'Pseudo profile lookup timeout') {
              logError("Error loading profile by pseudo_id", pseudoError);
            }
          } else if (pseudoProfile) {
            // Found profile by pseudo_id
            const profileIdFromPseudo = pseudoProfile.id;
            localStorage.setItem(PROFILE_STORAGE_KEY, profileIdFromPseudo);
            setProfileId(profileIdFromPseudo);
            
            // Link this profile to the auth user if not already linked
            const profileWithAuth = pseudoProfile as any;
            if (!profileWithAuth.auth_user_id && userId) {
              try {
                await supabase
                  .from("profiles")
                  .update({ auth_user_id: userId } as any)
                  .eq("id", profileIdFromPseudo);
              } catch (linkError) {
                console.error('[AuthContext] Failed to link profile to auth user:', linkError);
              }
            }
            
            return pseudoProfile as ProfileRow;
          }
        } catch (pseudoLookupError: any) {
          if (pseudoLookupError?.message !== 'Pseudo profile lookup timeout') {
            console.error('[AuthContext] Exception in pseudo_id lookup:', pseudoLookupError?.message || pseudoLookupError);
          }
        }
      }
      
      // PRIORITY 2: Check by device_id (backward compatibility)
      // This ensures we find existing accounts even if auth_user_id lookup fails
      if (deviceId) {
        try {
          const { data: deviceProfile, error: deviceError } = await Promise.race([
            supabase
              .from("profiles")
              .select("*")
              .eq("device_id", deviceId)
              .maybeSingle(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Device profile lookup timeout')), 3000)
            )
          ]) as any;

          if (deviceError) {
            if (deviceError.code !== "PGRST116" && deviceError.message !== 'Device profile lookup timeout') {
              logError("Error loading profile by device_id", deviceError);
              console.error('[AuthContext] Device profile lookup error:', {
                code: deviceError.code,
                message: deviceError.message
              });
            } else if (deviceError.code === "PGRST116") {
              // No profile found by device_id
            } else {
              // Device profile lookup timed out
            }
          } else if (deviceProfile) {
            // Found profile by device_id
            const profileIdFromDevice = deviceProfile.id;
            localStorage.setItem(PROFILE_STORAGE_KEY, profileIdFromDevice);
            setProfileId(profileIdFromDevice);
            
            // Link this profile to the auth user if not already linked
            const profileWithAuth = deviceProfile as any;
            if (!profileWithAuth.auth_user_id && userId) {
              // Linking profile to auth user
              try {
                await supabase
                  .from("profiles")
                  .update({ auth_user_id: userId } as any)
                  .eq("id", profileIdFromDevice);
                // Successfully linked profile to auth user
              } catch (linkError) {
                console.error('[AuthContext] Failed to link profile to auth user:', linkError);
                // Continue anyway - profile is still valid
              }
            }
            
            return deviceProfile as ProfileRow;
          }
        } catch (deviceLookupError: any) {
          // Only log non-timeout errors as errors; timeouts are expected fallback behavior
          if (deviceLookupError?.message === 'Device profile lookup timeout') {
            // Timeout is expected - silently continue to auth_user_id lookup
          } else {
            console.error('[AuthContext] Exception in device_id lookup:', deviceLookupError?.message || deviceLookupError);
          }
          // Continue to check by auth_user_id
        }
      }
      
      // Fallback: Try by auth_user_id if we have userId
      if (userId) {
        // Checking for profile by auth_user_id
        try {
          const { data: authProfile, error: authError } = await Promise.race([
            supabase
              .from("profiles")
              .select("*")
              .eq("auth_user_id" as any, userId)
              .maybeSingle(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Auth profile lookup timeout')), 3000)
            )
          ]) as any;

          if (authError) {
            if (authError.code !== "PGRST116" && authError.message !== 'Auth profile lookup timeout') {
              logError("Error loading profile by auth_user_id", authError);
              console.error('[AuthContext] Error loading profile by auth_user_id:', {
                code: authError.code,
                message: authError.message
              });
            } else if (authError.code === "PGRST116") {
              // No profile found by auth_user_id
            } else {
              // Auth profile lookup timed out
            }
          } else if (authProfile) {
            // Found profile by auth_user_id
            const profileIdFromDb = authProfile.id;
            if (profileIdFromDb !== profileId) {
              localStorage.setItem(PROFILE_STORAGE_KEY, profileIdFromDb);
              setProfileId(profileIdFromDb);
            }
            return authProfile as ProfileRow;
          }
        } catch (authLookupError: any) {
          console.error('[AuthContext] Exception in auth_user_id lookup:', authLookupError?.message || authLookupError);
        }
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

      // No profile found by any method
      return null;
    },
    // Enable query if we have userId, deviceId, or pseudoId (to find existing profiles)
    enabled: (!!userId || !!deviceId || !!pseudoId) && isInitialized,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnMount: false,
  });

  // CRITICAL: If profile query completes and returns null, clear profileId and force redirect
  useEffect(() => {
    // Only check if query is enabled and has finished loading
    const queryEnabled = (!!userId || !!deviceId) && isInitialized;
    if (queryEnabled && !isProfileLoading && profile === null && profileId) {
      console.warn('[AuthContext] Profile is null after loading - clearing profileId and redirecting to onboarding');
      localStorage.removeItem(PROFILE_STORAGE_KEY);
      setProfileId(null);
      // Force redirect to home which will show onboarding
      if (typeof window !== 'undefined') {
        window.location.href = '/';
      }
    }
  }, [profile, isProfileLoading, profileId, userId, deviceId, isInitialized]);

  // Debug: Log when query enabled condition changes
  useEffect(() => {
    const queryEnabled = (!!userId || !!deviceId) && isInitialized;
    // Query enabled condition check (removed debug logging)
  }, [userId, deviceId, isInitialized]);

  // Update profileId when profile loads
  useEffect(() => {
    // In development, Supabase profile lookups can fail (500) even when the profile exists.
    // To avoid constantly logging the user out, we ONLY update profileId when we successfully
    // load a profile, and we DO NOT clear profileId when profile is null.
    //
    // This means:
    // - If we find a profile, we sync profileId with that value.
    // - If we don't find a profile (or the request fails), we keep whatever profileId
    //   we already have (usually from localStorage), so existing accounts stay logged in.
    if (profile?.id && profile.id !== profileId) {
      console.log('[AuthContext] ✅ Profile loaded, updating profileId:', profile.id, profile.handle);
      setProfileId(profile.id);
      try {
        localStorage.setItem(PROFILE_STORAGE_KEY, profile.id);
      } catch (error) {
        logError("Failed to save profileId", error);
      }
    } else if (profile) {
      // Profile already set
    }
  }, [profile, profileId]);

  // Check for cross-browser sessions when profile loads
  useEffect(() => {
    if (!profile?.id || !deviceId || crossBrowserCheckDoneRef.current) {
      return;
    }

    // Only check once per profile load
    crossBrowserCheckDoneRef.current = true;

    const checkCrossBrowser = async () => {
      try {
        const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
        
        // @ts-ignore - RPC function exists but not in types
        const { data, error } = await (supabase.rpc as any)(
          "check_cross_browser_sessions",
          {
            p_profile_id: profile.id,
            p_current_user_agent: userAgent,
            p_current_device_id: deviceId,
          }
        );

        if (error) {
          // If function doesn't exist yet, silently fail
          if (error.code === "42883" || error.message?.includes("does not exist")) {
            return;
          }
          // Silently handle network errors (connection lost, CORS, etc.)
          if (error.message?.includes("Load failed") || 
              error.message?.includes("network") ||
              error.message?.includes("Failed to fetch") ||
              error.message?.includes("connection")) {
            return; // Silently fail on network errors
          }
          console.error("Error checking cross-browser sessions:", error);
          return;
        }

        // If we found cross-browser sessions, show the dialog
        if (data && Array.isArray(data) && data.length > 0) {
          setCrossBrowserProfileId(profile.id);
          setShowCrossBrowserDialog(true);
        }
      } catch (error: any) {
        // Silently handle network errors
        if (error?.message?.includes("Load failed") || 
            error?.message?.includes("network") ||
            error?.message?.includes("Failed to fetch") ||
            error?.message?.includes("connection")) {
          return; // Silently fail on network errors
        }
        console.error("Error checking cross-browser sessions:", error);
      }
    };

    // Small delay to ensure profile is fully loaded
    const timeoutId = setTimeout(checkCrossBrowser, 500);
    return () => clearTimeout(timeoutId);
  }, [profile?.id, deviceId]);

  // Reset cross-browser check when profile changes
  useEffect(() => {
    crossBrowserCheckDoneRef.current = false;
  }, [profile?.id]);

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

  const getUserAgent = () => {
    if (typeof navigator === "undefined") return null;
    return navigator.userAgent;
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {showCrossBrowserDialog && crossBrowserProfileId && (
        <CrossBrowserDetectionDialog
          profileId={crossBrowserProfileId}
          deviceId={deviceId}
          userAgent={getUserAgent()}
          onConfirm={() => {
            // User confirmed - they want to sign in
            // The profile is already loaded, so we just dismiss the dialog
            setShowCrossBrowserDialog(false);
            setCrossBrowserProfileId(null);
            crossBrowserCheckDoneRef.current = true;
          }}
          onDismiss={() => {
            // User dismissed - they want to continue as guest or skip
            setShowCrossBrowserDialog(false);
            setCrossBrowserProfileId(null);
            crossBrowserCheckDoneRef.current = true;
          }}
        />
      )}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
