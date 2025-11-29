import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Wand2, CheckCircle2, Mic, Radio, Headphones, Speaker, Volume2, RadioIcon, Zap, Music, Sparkles, ArrowRight, Loader2, Lock } from "lucide-react";
import ReCAPTCHA from "react-google-recaptcha";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
import { useToast } from "@/hooks/use-toast";
import { handleSchema, isReservedHandle } from "@/lib/validation";
import { useAuth } from "@/context/AuthContext";
import { useDeviceId } from "@/hooks/useDeviceId";
import { fetchAvatarIcons, searchFreepikIcons, getIconDownloadUrl } from "@/services/freepikApi";

// Avatar types using Freepik icons
type AvatarType = string; // Will be Freepik icon IDs

// Default avatar IDs from Freepik (will be populated from API)
const DEFAULT_AVATAR_IDS = [
  'avatar-1', 'avatar-2', 'avatar-3', 'avatar-4', 'avatar-5', 'avatar-6',
  'avatar-7', 'avatar-8', 'avatar-9', 'avatar-10', 'avatar-11', 'avatar-12',
  'avatar-13', 'avatar-14', 'avatar-15', 'avatar-16', 'avatar-17', 'avatar-18',
  'avatar-19', 'avatar-20', 'avatar-21', 'avatar-22', 'avatar-23', 'avatar-24',
];

// Map avatar types to emojis for display (backward compatibility)
const AVATAR_TYPE_TO_EMOJI: Record<string, string> = {
  // Will be populated dynamically
};

const AVATAR_TYPES: AvatarType[] = DEFAULT_AVATAR_IDS;

const SPEAKEASY_ADJECTIVES = ["Deep", "Smooth", "Rough", "Bass", "Sharp", "Warm", "Cool", "Raw", "Crisp", "Low", "High", "Loud"];
const SPEAKEASY_NOUNS = ["Voice", "Echo", "Static", "Signal", "Wave", "Tone", "Sound", "Vibe", "Beat", "Flow", "Pulse", "Reverb"];

const generateHandle = () => {
  const adj = SPEAKEASY_ADJECTIVES[Math.floor(Math.random() * SPEAKEASY_ADJECTIVES.length)];
  const noun = SPEAKEASY_NOUNS[Math.floor(Math.random() * SPEAKEASY_NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
};

// Generate avatar type from handle (deterministic)
const generateAvatarFromHandle = (handle: string): AvatarType => {
  let hash = 0;
  for (let i = 0; i < handle.length; i++) {
    hash = handle.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_TYPES[Math.abs(hash) % AVATAR_TYPES.length];
};

// Freepik avatar configuration
type AvatarConfig = {
  id: string;
  imageUrl: string | null;
  gradientClasses: string;
  emoji: string;
};

// Avatar configurations with gradients
const AVATAR_GRADIENTS = [
  'bg-gradient-to-br from-red-600 to-rose-600 dark:from-red-500 dark:to-rose-500',
  'bg-gradient-to-br from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-500',
  'bg-gradient-to-br from-blue-600 to-cyan-600 dark:from-blue-500 dark:to-cyan-500',
  'bg-gradient-to-br from-emerald-600 to-teal-600 dark:from-emerald-500 dark:to-teal-500',
  'bg-gradient-to-br from-amber-600 to-orange-600 dark:from-amber-500 dark:to-orange-500',
  'bg-gradient-to-br from-violet-600 to-purple-600 dark:from-violet-500 dark:to-purple-500',
  'bg-gradient-to-br from-pink-600 to-rose-600 dark:from-pink-500 dark:to-rose-500',
  'bg-gradient-to-br from-yellow-600 to-amber-600 dark:from-yellow-500 dark:to-amber-500',
  'bg-gradient-to-br from-orange-600 to-red-600 dark:from-orange-500 dark:to-red-500',
  'bg-gradient-to-br from-green-600 to-emerald-600 dark:from-green-500 dark:to-emerald-500',
  'bg-gradient-to-br from-slate-600 to-slate-800 dark:from-slate-500 dark:to-slate-700',
  'bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-600 dark:to-gray-800',
];

// Freepik Avatar Component
const FreepikAvatar = ({ 
  type, 
  className = "",
  imageUrl,
  gradientClasses 
}: { 
  type: AvatarType; 
  className?: string;
  imageUrl?: string | null;
  gradientClasses?: string;
}) => {
  const gradient = gradientClasses || AVATAR_GRADIENTS[Math.abs(type.charCodeAt(0)) % AVATAR_GRADIENTS.length];
  
  return (
    <div 
      className={`rounded-full ${gradient} flex items-center justify-center shadow-md overflow-hidden ${className}`}
      style={{ minWidth: '100%', minHeight: '100%', aspectRatio: '1' }}
    >
      {imageUrl ? (
        <img 
          src={imageUrl} 
          alt={`Avatar ${type}`}
          className="w-full h-full object-cover"
          onError={(e) => {
            // Fallback to gradient if image fails to load
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white text-2xl">
          👤
        </div>
      )}
    </div>
  );
};

interface OnboardingFlowProps {
  onComplete: (profileId: string) => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const [handle, setHandle] = useState(generateHandle());
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarType>(AVATAR_TYPES[0]);
  const [isLoading, setIsLoading] = useState(false);
  const [honeypot, setHoneypot] = useState("");
  const [recaptchaToken, setRecaptchaToken] = useState<string | null>(null);
  const [recaptchaAvailable, setRecaptchaAvailable] = useState(false);
  const [recaptchaError, setRecaptchaError] = useState(false);
  const [recaptchaLoading, setRecaptchaLoading] = useState(true);
  const [recaptchaKey, setRecaptchaKey] = useState(0); // Key to force remount on retry
  const [avatarImages, setAvatarImages] = useState<Map<string, string>>(new Map());
  const [fetchedAvatarIds, setFetchedAvatarIds] = useState<string[]>([]);
  const [avatarsLoading, setAvatarsLoading] = useState(true);
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  
  // Fetch Freepik avatars on mount
  useEffect(() => {
    const loadAvatars = async () => {
      try {
        setAvatarsLoading(true);
        // Search for avatar icons with diverse queries
        const avatarQueries = [
          'avatar user',
          'avatar person',
          'avatar profile',
          'avatar character',
          'user icon',
          'person icon',
        ];
        
        const avatarMap = new Map<string, string>();
        const fetchedIds: string[] = [];
        
        // Fetch icons from multiple queries to get variety
        for (const query of avatarQueries) {
          if (fetchedIds.length >= 24) break; // Limit to 24 avatars
          
          const icons = await searchFreepikIcons(query, 4);
          for (const icon of icons) {
            if (fetchedIds.length >= 24) break;
            if (icon.id && !fetchedIds.includes(icon.id)) {
              const downloadUrl = await getIconDownloadUrl(icon.id);
              if (downloadUrl) {
                // Use the actual Freepik icon ID as the avatar type
                const avatarId = icon.id;
                avatarMap.set(avatarId, downloadUrl);
                AVATAR_TYPE_TO_EMOJI[avatarId] = '👤';
                fetchedIds.push(avatarId);
              }
            }
          }
        }
        
        // Update state with fetched avatars
        setFetchedAvatarIds(fetchedIds);
        setAvatarImages(avatarMap);
        
        // Set first avatar as selected if we have fetched avatars
        if (fetchedIds.length > 0 && selectedAvatar === AVATAR_TYPES[0]) {
          setSelectedAvatar(fetchedIds[0]);
        }
      } catch (error) {
        console.warn('[OnboardingFlow] Failed to load Freepik avatars:', error);
        // Fallback to default avatars if API fails
        setFetchedAvatarIds(AVATAR_TYPES);
      } finally {
        setAvatarsLoading(false);
      }
    };
    
    loadAvatars();
  }, []);
  
  // CRITICAL: Always call hooks (React rules), but handle errors gracefully
  let toast: any;
  let userId: string | null = null;
  let signInAnonymously: (() => Promise<void>) | null = null;
  
  // Wrap hook calls in try-catch to prevent crashes
  try {
    const toastHook = useToast();
    toast = toastHook.toast;
  } catch (e) {
    console.warn("[OnboardingFlow] useToast failed, using fallback:", e);
    toast = ({ title, description, variant }: any) => {
      console.log(`[Toast ${variant || 'default'}]: ${title} - ${description}`);
    };
  }
  
  try {
    const auth = useAuth();
    userId = auth.userId || null;
    signInAnonymously = auth.signInAnonymously || null;
  } catch (e) {
    console.warn("[OnboardingFlow] useAuth failed, continuing without auth:", e);
  }
  
  // Get deviceId from hook, with fallback state
  const hookDeviceId = useDeviceId();
  const [deviceId, setDeviceId] = useState<string | null>(hookDeviceId);
  
  // Generate deviceId manually if hook failed or returned null
  useEffect(() => {
    if (!deviceId) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const stored = localStorage.getItem('deviceId');
          if (stored) {
            setDeviceId(stored);
          } else {
            const newId = crypto.randomUUID();
            localStorage.setItem('deviceId', newId);
            setDeviceId(newId);
          }
        } else {
          const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
          setDeviceId(tempId);
        }
      } catch (storageError) {
        console.warn("[OnboardingFlow] localStorage failed, generating temp ID:", storageError);
        const tempId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        setDeviceId(tempId);
      }
    } else if (hookDeviceId && hookDeviceId !== deviceId) {
      setDeviceId(hookDeviceId);
    }
  }, [hookDeviceId, deviceId]);

  const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY;

  // Update avatar when handle changes
  useEffect(() => {
    setSelectedAvatar(generateAvatarFromHandle(handle));
  }, [handle]);

  // Check if reCAPTCHA script is loaded
  useEffect(() => {
    if (!RECAPTCHA_SITE_KEY) {
      console.log('[OnboardingFlow] No reCAPTCHA site key configured, skipping verification');
      setRecaptchaLoading(false);
      setRecaptchaAvailable(false);
      return;
    }

    console.log('[OnboardingFlow] Checking reCAPTCHA availability...', {
      siteKey: RECAPTCHA_SITE_KEY ? 'Set' : 'Missing',
      domain: typeof window !== 'undefined' ? window.location.hostname : 'unknown',
      recaptchaKey: recaptchaKey,
    });

    // Check if reCAPTCHA script is already loaded
    const checkRecaptchaLoaded = () => {
      if (typeof window !== 'undefined' && (window as any).grecaptcha) {
        console.log('[OnboardingFlow] reCAPTCHA already loaded');
        setRecaptchaLoading(false);
        setRecaptchaAvailable(true);
        setRecaptchaError(false);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkRecaptchaLoaded()) {
      return;
    }

    // Wait for script to load (with timeout)
    // The ReCAPTCHA component will load the script, so we wait for it
    let attempts = 0;
    const maxAttempts = 30; // 15 seconds max (increased for slower connections)
    const checkInterval = setInterval(() => {
      attempts++;
      if (checkRecaptchaLoaded() || attempts >= maxAttempts) {
        clearInterval(checkInterval);
        if (attempts >= maxAttempts && !checkRecaptchaLoaded()) {
          // Only warn in production - in development it's expected if key isn't set
          const isDevelopment = typeof window !== 'undefined' && 
            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
          if (!isDevelopment) {
            console.warn('[OnboardingFlow] reCAPTCHA script did not load within timeout');
            console.warn('[OnboardingFlow] This may indicate:');
            console.warn('  1. Domain not registered in reCAPTCHA console');
            console.warn('  2. Network/CSP blocking Google scripts');
            console.warn('  3. Invalid site key');
          } else {
            console.debug('[OnboardingFlow] reCAPTCHA not configured for development (this is normal)');
          }
          setRecaptchaLoading(false);
          setRecaptchaError(true);
        }
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [RECAPTCHA_SITE_KEY, recaptchaKey]);

  const handleSubmit = async () => {
    if (!handle.trim()) {
      toast({
        title: "Handle required",
        description: "Please enter a handle",
        variant: "destructive",
      });
      return;
    }

    // Require reCAPTCHA if it's configured and available
    // Only skip if it failed to load or isn't available
    if (RECAPTCHA_SITE_KEY && recaptchaAvailable && !recaptchaError && !recaptchaToken) {
      toast({
        title: "Verification required",
        description: "Please complete the reCAPTCHA verification",
        variant: "destructive",
      });
      return;
    }
    
    // If reCAPTCHA is still loading, wait a bit
    if (RECAPTCHA_SITE_KEY && recaptchaLoading) {
      toast({
        title: "Loading verification",
        description: "Please wait for reCAPTCHA to load",
        variant: "default",
      });
      return;
    }
    
    // If reCAPTCHA had an error, log it but allow submission (fallback)
    if (RECAPTCHA_SITE_KEY && recaptchaError) {
      console.warn('[OnboardingFlow] reCAPTCHA unavailable, proceeding without verification');
    }

    const normalizedHandle = handle.toLowerCase().trim();

    try {
      const validatedHandle = handleSchema.parse(normalizedHandle);
      if (validatedHandle !== normalizedHandle) {
        setHandle(validatedHandle);
      }
    } catch (error: any) {
      toast({
        title: "Invalid handle",
        description: error.errors?.[0]?.message || "Handle validation failed",
        variant: "destructive",
      });
      return;
    }

    if (isReservedHandle(normalizedHandle)) {
      toast({
        title: "Handle reserved",
        description: "This handle is reserved. Try another!",
        variant: "destructive",
      });
      setHandle(generateHandle());
      return;
    }

    // Check handle availability
    try {
      const { data: isAvailable, error: checkError } = await supabase
        .rpc("is_handle_available" as any, {
          p_handle: normalizedHandle,
        });

      if (checkError) {
        console.warn("Handle availability check failed:", checkError);
      } else if (!isAvailable) {
        toast({
          title: "Handle taken",
          description: "This handle is already in use. Try another!",
          variant: "destructive",
        });
        setHandle(generateHandle());
        return;
      }
    } catch (checkError) {
      console.warn("Handle availability check failed:", checkError);
    }

    setIsLoading(true);

    try {
      if (honeypot) {
        console.warn("Honeypot field was filled - potential bot");
        toast({
          title: "Verification failed",
          description: "Please try again",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }

      // Ensure we have an auth user
      let currentUserId = userId;
      if (!currentUserId) {
        await signInAnonymously();
        const { data: { session } } = await supabase.auth.getSession();
        currentUserId = session?.user?.id || null;
        if (!currentUserId) {
          throw new Error("Failed to create anonymous user. Please enable Anonymous Auth in Supabase.");
        }
      }

      // Store avatar type (we'll use the type name as the identifier)
      const avatarType = selectedAvatar;
      // Map avatar type to emoji for storage
      const avatarEmoji = AVATAR_TYPE_TO_EMOJI[avatarType] || '🎧';

      // Ensure we have a device ID - generate one if missing
      // CRITICAL: Must save to localStorage BEFORE creating profile so RLS policy can read x-device-id header
      let finalDeviceId = deviceId;
      if (!finalDeviceId) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const stored = localStorage.getItem('deviceId');
            if (stored) {
              finalDeviceId = stored;
            } else {
              finalDeviceId = crypto.randomUUID();
              // CRITICAL: Save to localStorage immediately so the x-device-id header is set
              localStorage.setItem('deviceId', finalDeviceId);
            }
          } else {
            finalDeviceId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            // Try to save even if localStorage might not work
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('deviceId', finalDeviceId);
              }
            } catch (e) {
              // Ignore - will use temp ID
            }
          }
        } catch (e) {
          finalDeviceId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        }
      } else {
        // Ensure deviceId is in localStorage even if we got it from useAuth
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            const stored = localStorage.getItem('deviceId');
            if (stored !== finalDeviceId) {
              localStorage.setItem('deviceId', finalDeviceId);
            }
          }
        } catch (e) {
          // Ignore - continue with existing deviceId
        }
      }

      // Validate account creation with reCAPTCHA token (if validation function exists)
      // This ensures reCAPTCHA is verified on the backend
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const validationResponse = await fetch(`${SUPABASE_URL}/functions/v1/validate-account-creation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token || ''}`,
            'x-device-id': finalDeviceId, // Include device ID header for validation
            'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '', // Required for edge functions
          },
          body: JSON.stringify({
            handle: normalizedHandle,
            device_id: finalDeviceId,
            recaptcha_token: recaptchaToken || undefined,
            honeypot: honeypot || undefined,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          }),
        });

        // If function doesn't exist (404), skip validation gracefully
        if (validationResponse.status === 404) {
          console.warn('[OnboardingFlow] Validation function not found, skipping backend validation');
          // If reCAPTCHA is configured and we have a token, log warning but continue
          // The token will still be validated if there's a database trigger
          if (RECAPTCHA_SITE_KEY && !recaptchaToken) {
            console.warn('[OnboardingFlow] reCAPTCHA token missing but validation function unavailable');
          }
        } else if (!validationResponse.ok) {
          // For other errors, try to parse error message
          const errorData = await validationResponse.json().catch(() => ({}));
          const errorMessage = errorData.reason || errorData.error || 'Account validation failed';
          
          toast({
            title: "Validation failed",
            description: errorMessage,
            variant: "destructive",
          });
          setIsLoading(false);
          // Reset reCAPTCHA if token expired or invalid
          if (recaptchaRef.current && (errorMessage.includes('reCAPTCHA') || errorMessage.includes('verification'))) {
            recaptchaRef.current.reset();
            setRecaptchaToken(null);
          }
          return;
        } else {
          // Success - parse validation response
          const validationData = await validationResponse.json();

          if (!validationData.allowed) {
            toast({
              title: "Validation failed",
              description: validationData.reason || "Account creation not allowed. Please try again.",
              variant: "destructive",
            });
            setIsLoading(false);
            // Reset reCAPTCHA if token expired
            if (recaptchaRef.current && validationData.reason?.includes('reCAPTCHA')) {
              recaptchaRef.current.reset();
              setRecaptchaToken(null);
            }
            return;
          }

          // Handle retry_after if present
          if (validationData.retry_after) {
            toast({
              title: "Rate limit exceeded",
              description: `Please try again after ${validationData.retry_after}`,
              variant: "destructive",
            });
            setIsLoading(false);
            return;
          }

          // Check handle availability from validation
          if (validationData.handle_available === false) {
            toast({
              title: "Handle taken",
              description: "This handle is already in use. Try another!",
              variant: "destructive",
            });
            setHandle(generateHandle());
            setIsLoading(false);
            return;
          }
        }
      } catch (validationError: any) {
        // Network errors or other exceptions - log but allow graceful degradation
        console.warn('[OnboardingFlow] Account validation error:', validationError.message);
        
        // Only block if reCAPTCHA is required and we're in production
        // In development, allow graceful degradation
        const isDevelopment = typeof window !== 'undefined' && 
          (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
        
        if (!isDevelopment && RECAPTCHA_SITE_KEY && recaptchaAvailable && !recaptchaError && !recaptchaToken) {
          toast({
            title: "Verification required",
            description: "Please complete the reCAPTCHA verification before creating your account.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
        
        // Continue with profile creation if validation is optional or in development
      }

      // Create profile
      // Log debug info to help diagnose RLS issues
      console.log('[OnboardingFlow] Creating profile with:', {
        auth_user_id: currentUserId,
        device_id: finalDeviceId,
        handle: normalizedHandle,
        deviceIdInStorage: localStorage.getItem('deviceId'),
      });

      const { data, error } = await supabase
        .from("profiles")
        .insert({
          auth_user_id: currentUserId,
          device_id: finalDeviceId,
          handle: normalizedHandle,
          emoji_avatar: avatarEmoji, // Store as emoji instead of type name
        } as any)
        .select()
        .single();

      if (error) {
        console.error('[OnboardingFlow] Profile creation error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
          device_id: finalDeviceId,
          deviceIdInStorage: localStorage.getItem('deviceId'),
        });

        if (error.code === "23505") {
          if (error.message?.includes("handle") || error.message?.includes("idx_profiles_handle_lower")) {
            toast({
              title: "Handle taken",
              description: "This handle is already in use. Try another!",
              variant: "destructive",
            });
            setHandle(generateHandle());
          } else {
            toast({
              title: "Account creation failed",
              description: error.message || "Please try again",
              variant: "destructive",
            });
          }
        } else if (error.code === "42501" || error.code === "PGRST301" || error.message?.includes("permission denied") || error.message?.includes("403") || error.code === 403) {
          // RLS policy violation - provide helpful error message
          console.error('[OnboardingFlow] RLS policy violation. Check:');
          console.error('  1. Device ID in localStorage:', localStorage.getItem('deviceId'));
          console.error('  2. Device ID in insert:', finalDeviceId);
          console.error('  3. x-device-id header should be set automatically by supabase client');
          toast({
            title: "Permission denied",
            description: "Unable to create account. The device ID header may not match. Please refresh and try again.",
            variant: "destructive",
          });
        } else {
          throw error;
        }
        setIsLoading(false);
        return;
      }

      if (recaptchaRef.current) {
        recaptchaRef.current.reset();
        setRecaptchaToken(null);
      }

      localStorage.setItem("profileId", data.id);
      window.dispatchEvent(new StorageEvent("storage", {
        key: "profileId",
        newValue: data.id,
      }));
      
      toast({
        title: "Welcome to The Echo Chamber!",
        description: "Your identity has been created. Start speaking your mind.",
      });
      
      onComplete(data.id);
    } catch (error: any) {
      console.error("Onboarding error:", error);
      toast({
        title: "Something went wrong",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // CRITICAL: Wrap entire render in try-catch to prevent crashes
  try {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Dark speakeasy background elements */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Subtle animated gradient orbs - burgundy/amber accents */}
        <div className="absolute top-20 left-10 w-64 h-64 bg-amber-900/10 dark:bg-amber-900/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-red-950/10 dark:bg-red-950/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-amber-950/5 dark:bg-amber-950/3 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        
        {/* Subtle grid pattern overlay - darker speakeasy vibe */}
        <div className="absolute inset-0 opacity-[0.03] dark:opacity-[0.02]" style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />
        
        {/* Animated gradient orbs for depth */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-red-950/10 dark:bg-red-950/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '8s' }} />
        <div className="absolute bottom-0 left-1/4 w-96 h-96 bg-amber-950/10 dark:bg-amber-950/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '10s', animationDelay: '2s' }} />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        {/* Top header with welcome and link account button */}
        <div className="flex items-center justify-between mb-8 lg:mb-12 relative z-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-red-950/60 to-amber-950/60 dark:from-red-900/50 dark:to-amber-900/50 px-5 py-2.5 text-sm font-bold text-white dark:text-white border border-red-800/60 dark:border-red-700/50 shadow-lg backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-500">
            <Radio className="h-4 w-4" />
            Welcome to The Echo Chamber
          </div>
          <Button
            asChild
            variant="outline"
            className="rounded-full border-2 border-red-900/40 dark:border-red-800/30 hover:border-red-500 dark:hover:border-red-500 hover:bg-red-950/20 dark:hover:bg-red-950/20 text-foreground transition-all duration-300 group animate-in fade-in-0 zoom-in-95 duration-500"
            size="default"
          >
            <Link to="/link-pin" className="flex items-center gap-2 px-4 py-2">
              <Lock className="h-4 w-4 group-hover:scale-110 transition-transform duration-200" />
              <span className="text-sm font-semibold">Link Account</span>
            </Link>
          </Button>
        </div>

        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 lg:items-center">
          {/* Left side - Speakeasy Reddit-themed welcome */}
          <div className="space-y-8 text-center lg:text-left relative z-10 animate-in fade-in-0 slide-in-from-left-5 duration-700">

            <div className="space-y-6">
              <div className="relative">
                <h1 className="text-5xl font-extrabold tracking-tight text-white dark:text-white sm:text-6xl lg:text-7xl leading-tight animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150 drop-shadow-lg">
                  Join The
                  <span className="block bg-gradient-to-r from-red-500 via-red-400 to-amber-500 dark:from-red-400 dark:via-red-300 dark:to-amber-400 bg-clip-text text-transparent animate-in fade-in-0 duration-1000 delay-300">
                    Echo Chamber
                  </span>
                </h1>
                </div>
              <p className="text-lg text-gray-200 dark:text-gray-200 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-semibold animate-in fade-in-0 slide-in-from-bottom-3 duration-700 delay-300">
                Create your identity. Speak your mind. Stay anonymous. Your voice, your rules.
              </p>
            </div>

            {/* Expanded content section */}
            <div className="space-y-6 pt-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-450">
              <div className="prose dark:prose-invert max-w-none">
                <h3 className="text-2xl font-bold text-white dark:text-white mb-3 flex items-center gap-2">
                  <Mic className="h-5 w-5 text-red-400 dark:text-red-400" />
                  What is The Echo Chamber?
                </h3>
                <p className="text-base text-gray-200 dark:text-gray-200 leading-relaxed mb-4 font-medium">
                  Reddit for your voice. Share 30-second audio clips—thoughts, rants, stories, whatever. Your identity stays anonymous. Only your voice and handle show.
                </p>
                <p className="text-base text-gray-200 dark:text-gray-200 leading-relaxed mb-4 font-medium">
                  Speak your mind. Listen to others. Upvote what hits. No BS, no filters—just raw voice in an underground community.
                </p>
              </div>

              <div className="rounded-2xl border border-red-900/50 dark:border-red-800/40 bg-gradient-to-br from-red-950/30 to-amber-950/30 dark:from-red-950/25 dark:to-amber-950/25 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:border-red-700/60">
                <h4 className="font-bold text-white dark:text-white mb-3 flex items-center gap-2">
                  <Radio className="h-5 w-5 text-red-400 dark:text-red-400" />
                  How It Works
                </h4>
                <ul className="space-y-3 text-sm text-gray-200 dark:text-gray-200">
                  {[
                    "Record or upload 30-second audio clips about anything",
                    "Listen to voices, react, reply—engage with the community",
                    "AI moderation keeps it real—trolls get filtered out",
                    "Stay anonymous—no personal info required, ever"
                  ].map((item, index) => (
                    <li key={index} className="flex items-start gap-2 animate-in fade-in-0 slide-in-from-left-2 font-medium" style={{ animationDelay: `${index * 100}ms` }}>
                      <span className="text-red-400 dark:text-red-400 mt-1 font-bold">•</span>
                      <span>{item}</span>
                  </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 pt-4">
              {[
                { 
                  icon: Mic, 
                  title: "Anonymous & Raw",
                  description: "Speak freely—your identity stays hidden, only your voice shows",
                  iconBg: "from-amber-900/50 to-amber-800/50 dark:from-amber-900/40 dark:to-amber-800/40",
                  iconColor: "text-amber-400 dark:text-amber-400",
                  delay: 0
                },
                { 
                  icon: Headphones, 
                  title: "30-Second Clips",
                  description: "Quick hits. Record your thoughts in under 30 seconds",
                  iconBg: "from-red-900/50 to-red-800/50 dark:from-red-900/40 dark:to-red-800/40",
                  iconColor: "text-red-400 dark:text-red-400",
                  delay: 100
                },
                { 
                  icon: Radio, 
                  title: "Real Community",
                  description: "AI filters the noise. Real voices, real conversations",
                  iconBg: "from-amber-800/50 to-red-800/50 dark:from-amber-800/40 dark:to-red-800/40",
                  iconColor: "text-amber-400 dark:text-amber-400",
                  delay: 200
                },
              ].map(({ icon: Icon, title, description, iconBg, iconColor, delay }) => (
                <div
                  key={title}
                  className="group flex flex-col gap-3 rounded-2xl border border-red-900/40 dark:border-red-800/30 bg-gradient-to-br from-red-950/30 to-amber-950/30 dark:from-red-950/25 dark:to-amber-950/25 p-6 backdrop-blur-sm hover:bg-gradient-to-br hover:from-red-950/40 hover:to-amber-950/40 dark:hover:from-red-950/35 dark:hover:to-amber-950/35 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3"
                  style={{ animationDelay: `${delay}ms` }}
                >
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${iconBg} ${iconColor} shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-bold text-white dark:text-white mb-1.5 text-base">{title}</p>
                    <p className="text-xs text-gray-200 dark:text-gray-200 leading-relaxed font-medium">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right side - Clean modern form */}
          <Card className="w-full max-w-md mx-auto lg:mx-0 border-2 border-red-900/50 dark:border-red-800/40 shadow-2xl bg-slate-950/98 dark:bg-black/95 backdrop-blur-xl relative overflow-hidden animate-in fade-in-0 slide-in-from-right-5 duration-700 transition-all duration-300">
            
            {/* Decorative corner accents - subtle */}
            <div className="absolute top-0 left-0 w-16 h-16 border-t-2 border-l-2 border-red-800/30 dark:border-red-700/30 rounded-tl-2xl"></div>
            <div className="absolute bottom-0 right-0 w-16 h-16 border-b-2 border-r-2 border-red-800/30 dark:border-red-700/30 rounded-br-2xl"></div>

            {/* Progress Indicator */}
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-gray-300 dark:text-gray-300">Setup Progress</span>
                <span className="text-xs font-bold text-red-400 dark:text-red-400">
                  {Math.round((((selectedAvatar ? 1 : 0) + (handle.trim() ? 1 : 0) + (recaptchaToken || !RECAPTCHA_SITE_KEY ? 1 : 0)) / 3) * 100)}%
                </span>
            </div>
              <Progress 
                value={((selectedAvatar ? 1 : 0) + (handle.trim() ? 1 : 0) + (recaptchaToken || !RECAPTCHA_SITE_KEY ? 1 : 0)) / 3 * 100} 
                className="h-2 bg-red-950/40 dark:bg-red-950/30"
              />
            </div>

            <CardHeader className="space-y-3 text-center pb-6 relative z-10 px-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-900/60 via-red-800/50 to-amber-900/50 dark:from-red-900/50 dark:via-red-800/40 dark:to-amber-900/40 mb-3 shadow-xl ring-2 ring-red-700/40 dark:ring-red-700/30 animate-in zoom-in-50 duration-500 hover:scale-105 transition-transform duration-300">
                {avatarsLoading ? (
                  <div className="w-14 h-14 rounded-full bg-slate-700 animate-pulse" />
                ) : (
                  <FreepikAvatar 
                    type={selectedAvatar} 
                    className="w-14 h-14" 
                    imageUrl={avatarImages.get(selectedAvatar)}
                    gradientClasses={AVATAR_GRADIENTS[AVATAR_TYPES.indexOf(selectedAvatar) % AVATAR_GRADIENTS.length]}
                  />
                )}
              </div>
              <CardTitle className="text-3xl font-extrabold text-white dark:text-white animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
                Create Your Identity
              </CardTitle>
              <p className="text-sm text-gray-300 dark:text-gray-300 font-semibold animate-in fade-in-0 slide-in-from-bottom-3 duration-700 delay-150">
                Pick an avatar and choose your handle
              </p>
            </CardHeader>

            <CardContent className="space-y-6 relative z-10">
              {/* Avatar Selection */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-white dark:text-white flex items-center gap-2">
                  <Mic className="h-4 w-4 text-red-400 dark:text-red-400" />
                  Choose Your Avatar
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 p-3 rounded-xl bg-slate-900/50 dark:bg-slate-950/50 border border-red-900/30 dark:border-red-800/20 max-h-96 overflow-y-auto">
                  {(fetchedAvatarIds.length > 0 ? fetchedAvatarIds : AVATAR_TYPES).map((avatarType, index) => {
                    const isActive = selectedAvatar === avatarType;
                    return (
                      <button
                        key={avatarType}
                        type="button"
                        onClick={() => setSelectedAvatar(avatarType)}
                        className={`flex h-16 w-full items-center justify-center rounded-lg border-2 transition-all duration-300 animate-in fade-in-0 zoom-in-95 bg-slate-900/80 dark:bg-slate-950/80 ${
                          isActive
                            ? "border-red-500 bg-gradient-to-br from-red-950/70 to-amber-950/50 dark:from-red-950/60 dark:to-amber-950/40 scale-110 shadow-lg shadow-red-500/40 ring-2 ring-red-400/30 z-10"
                            : "border-slate-700 dark:border-slate-800 hover:border-red-500 dark:hover:border-red-500 hover:bg-red-950/20 dark:hover:bg-red-950/20 hover:scale-105 active:scale-95"
                        }`}
                        style={{ animationDelay: `${index * 30}ms` }}
                        title={avatarType.charAt(0).toUpperCase() + avatarType.slice(1)}
                      >
                        {avatarsLoading ? (
                          <div className="w-10 h-10 rounded-full bg-slate-700 animate-pulse" />
                        ) : (
                          <FreepikAvatar 
                            type={avatarType} 
                            className={`w-10 h-10 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
                            imageUrl={avatarImages.get(avatarType)}
                            gradientClasses={AVATAR_GRADIENTS[index % AVATAR_GRADIENTS.length]}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Handle Input */}
              <div className="space-y-3">
                <label className="text-sm font-bold text-white dark:text-white flex items-center gap-2">
                  <Radio className="h-4 w-4 text-red-400 dark:text-red-400" />
                  Your Handle
                </label>
                <div className="relative flex gap-2">
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="DeepVoice42"
                    maxLength={20}
                    className="h-12 text-center text-lg font-semibold tracking-wide border-2 border-red-900/40 dark:border-red-800/30 focus:border-red-500 dark:focus:border-red-500 focus:ring-2 focus:ring-red-500/30 bg-slate-900/90 dark:bg-black/80 text-white dark:text-white transition-all duration-200"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setHandle(generateHandle());
                    }}
                    className="h-12 w-12 shrink-0 border-2 border-red-900/40 dark:border-red-800/30 hover:bg-gradient-to-br hover:from-red-950/50 hover:to-amber-950/40 dark:hover:from-red-950/40 dark:hover:to-amber-950/30 hover:border-red-500 dark:hover:border-red-500 transition-all hover:scale-105 active:scale-95"
                    title="Generate random handle"
                  >
                    <Wand2 className="h-5 w-5 text-red-400 dark:text-red-400" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-300 dark:text-gray-300 font-semibold">
                    Keep it clean, 20 characters max
                  </p>
                  <span className={`text-xs font-bold transition-colors duration-200 ${
                    handle.length > 18 
                      ? 'text-red-400 dark:text-red-400' 
                      : handle.length > 15 
                      ? 'text-amber-400 dark:text-amber-400'
                      : 'text-gray-400 dark:text-gray-400'
                  }`}>
                    {handle.length}/20
                  </span>
                </div>
              </div>

              {/* Honeypot */}
              <div className="hidden" aria-hidden="true">
                <Input
                  type="text"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                />
              </div>

              {/* reCAPTCHA */}
              {RECAPTCHA_SITE_KEY && (
                <div className="flex flex-col items-center gap-2">
                  {recaptchaLoading && (
                    <div className="text-xs text-gray-300 dark:text-gray-300 text-center font-medium">
                      <p>Loading verification...</p>
                    </div>
                  )}
                  {!recaptchaError && !recaptchaLoading && (
                    <div className="flex justify-center">
                      <ReCAPTCHA
                        key={recaptchaKey}
                        ref={recaptchaRef}
                        sitekey={RECAPTCHA_SITE_KEY}
                        onChange={(token) => {
                          if (token) {
                            setRecaptchaToken(token);
                            setRecaptchaAvailable(true);
                            setRecaptchaError(false);
                            console.log('[OnboardingFlow] reCAPTCHA verified successfully');
                          }
                        }}
                        onExpired={() => {
                          console.log('[OnboardingFlow] reCAPTCHA expired, resetting');
                          setRecaptchaToken(null);
                          setRecaptchaAvailable(false);
                        }}
                        onError={(error) => {
                          // Check if we're in development
                          const isDevelopment = typeof window !== 'undefined' && 
                            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                          
                          if (isDevelopment) {
                            // In development, log as warning and provide helpful guidance
                            console.warn('[OnboardingFlow] reCAPTCHA error in development:', error);
                            console.warn('[OnboardingFlow] This is normal if:');
                            console.warn('  1. No reCAPTCHA site key is configured (app will work without it)');
                            console.warn('  2. Site key is invalid or not registered for localhost');
                            console.warn('  3. To fix: Add localhost to your reCAPTCHA site domains at https://www.google.com/recaptcha/admin');
                            console.warn('[OnboardingFlow] The app will continue to work - reCAPTCHA is optional in development');
                          } else {
                            // In production, log as error
                            console.error('[OnboardingFlow] reCAPTCHA error:', error);
                            console.error('[OnboardingFlow] reCAPTCHA site key:', RECAPTCHA_SITE_KEY ? 'Set' : 'Missing');
                            console.error('[OnboardingFlow] Current domain:', typeof window !== 'undefined' ? window.location.hostname : 'unknown');
                          }
                          
                          setRecaptchaToken(null);
                          // Don't mark as error immediately - allow retry
                          setTimeout(() => {
                            if (!recaptchaToken) {
                              setRecaptchaError(true);
                            }
                          }, 2000);
                        }}
                        asyncScriptOnLoad={() => {
                          console.log('[OnboardingFlow] reCAPTCHA script loaded successfully');
                          console.log('[OnboardingFlow] reCAPTCHA site key:', RECAPTCHA_SITE_KEY ? 'Set' : 'Missing');
                          console.log('[OnboardingFlow] Current domain:', typeof window !== 'undefined' ? window.location.hostname : 'unknown');
                          setRecaptchaLoading(false);
                          setRecaptchaAvailable(true);
                          setRecaptchaError(false);
                        }}
                        asyncScriptOnError={() => {
                          // Check if we're in development
                          const isDevelopment = typeof window !== 'undefined' && 
                            (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
                          
                          const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
                          const siteKeySet = !!RECAPTCHA_SITE_KEY;
                          const siteKeyPreview = RECAPTCHA_SITE_KEY 
                            ? `${RECAPTCHA_SITE_KEY.substring(0, 10)}...${RECAPTCHA_SITE_KEY.substring(RECAPTCHA_SITE_KEY.length - 4)}`
                            : 'Not set';
                          
                          if (isDevelopment) {
                            // In development, log as warning
                            console.warn('[OnboardingFlow] reCAPTCHA script failed to load (development mode)');
                            console.warn('[OnboardingFlow] Site key:', siteKeyPreview);
                            console.warn('[OnboardingFlow] Domain:', currentDomain);
                            console.warn('[OnboardingFlow] This is normal if reCAPTCHA is not configured for localhost');
                            console.warn('[OnboardingFlow] The app will work without reCAPTCHA - it\'s optional in development');
                            console.warn('[OnboardingFlow] To enable: Add localhost to your reCAPTCHA site at https://www.google.com/recaptcha/admin');
                          } else {
                            // In production, log as error with full diagnostics
                            console.error('[OnboardingFlow] ❌ reCAPTCHA script failed to load');
                            console.error('[OnboardingFlow] Diagnostics:');
                            console.error('  - Site key:', siteKeySet ? siteKeyPreview : '❌ MISSING');
                            console.error('  - Domain:', currentDomain);
                            console.error('  - Environment:', isDevelopment ? 'Development' : 'Production');
                            console.error('[OnboardingFlow] Possible causes:');
                            if (!siteKeySet) {
                              console.error('  ❌ Site key not set - Check VITE_RECAPTCHA_SITE_KEY environment variable');
                            } else {
                              console.error('  1. Domain not registered in reCAPTCHA console');
                              console.error('     → Go to https://www.google.com/recaptcha/admin');
                              console.error('     → Add domain:', currentDomain);
                              console.error('  2. Network/CSP blocking Google scripts');
                              console.error('     → Check browser console for CSP errors');
                              console.error('     → Check network tab for blocked requests');
                              console.error('  3. Invalid site key');
                              console.error('     → Verify site key matches Google console');
                            }
                            console.error('[OnboardingFlow] Quick fix:');
                            console.error('  1. Open https://www.google.com/recaptcha/admin');
                            console.error('  2. Click your site → Settings');
                            console.error('  3. Add domain:', currentDomain);
                            console.error('  4. Wait 5-10 minutes and retry');
                          }
                          
                          setRecaptchaLoading(false);
                          setRecaptchaAvailable(false);
                          setRecaptchaError(true);
                        }}
                        theme="light"
                        size="normal"
                      />
                    </div>
                  )}
                  {recaptchaError && !recaptchaLoading && (
                    <div className="text-xs text-muted-foreground text-center space-y-2 p-4 rounded-lg bg-red-950/20 dark:bg-red-950/10 border border-red-900/30 dark:border-red-800/20">
                      <p className="text-red-400 dark:text-red-400 font-semibold mb-2">reCAPTCHA unavailable</p>
                      <p className="text-gray-300 dark:text-gray-400 mb-3">You can still create your account without verification</p>
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            console.log('[OnboardingFlow] Retrying reCAPTCHA...');
                            // Reset all states
                            setRecaptchaError(false);
                            setRecaptchaLoading(true);
                            setRecaptchaAvailable(false);
                            setRecaptchaToken(null);
                            
                            // Force remount by changing key - this will reload the script
                            setRecaptchaKey(prev => prev + 1);
                            
                            // Remove any existing reCAPTCHA scripts to force reload
                            if (typeof window !== 'undefined') {
                              // Remove existing script tags
                              const existingScripts = document.querySelectorAll('script[src*="recaptcha"]');
                              existingScripts.forEach(script => script.remove());
                              
                              // Clear grecaptcha if it exists
                              if ((window as any).grecaptcha) {
                                delete (window as any).grecaptcha;
                              }
                            }
                            
                            // Wait a bit for cleanup, then check if it loads
                            setTimeout(() => {
                              // The component will remount with new key and try to load
                              // asyncScriptOnLoad will handle success
                              // If it still fails, asyncScriptOnError will set error again
                            }, 500);
                          }}
                          className="text-xs px-4 py-2 bg-red-900/40 dark:bg-red-900/30 hover:bg-red-900/60 dark:hover:bg-red-900/50 text-white rounded-lg border border-red-800/50 dark:border-red-700/40 transition-all duration-200 hover:scale-105 active:scale-95 font-semibold"
                        >
                          Retry reCAPTCHA
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            // Allow proceeding without reCAPTCHA
                            setRecaptchaError(false);
                            setRecaptchaLoading(false);
                            console.log('[OnboardingFlow] Proceeding without reCAPTCHA verification');
                          }}
                          className="text-xs text-amber-400 dark:text-amber-400 hover:text-amber-300 dark:hover:text-amber-300 hover:underline font-medium"
                        >
                          Continue without verification
                        </button>
                      </div>
                      <div className="mt-3 pt-3 border-t border-red-900/30 dark:border-red-800/20">
                        <p className="text-xs text-gray-400 dark:text-gray-500">
                          Troubleshooting: Check console for details. Common causes:
                        </p>
                        <ul className="text-xs text-gray-500 dark:text-gray-600 mt-1 text-left list-disc list-inside space-y-0.5">
                          <li>Domain not registered in reCAPTCHA console</li>
                          <li>Network/CSP blocking Google scripts</li>
                          <li>Invalid or missing site key</li>
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-3 pt-6 px-6">
              {/* Ready indicator */}
              {handle.trim() && selectedAvatar && (recaptchaToken || !RECAPTCHA_SITE_KEY) && !isLoading && (
                <div className="flex items-center justify-center gap-2 text-xs text-amber-400 dark:text-amber-400 animate-in fade-in-0 zoom-in-95 duration-300 mb-1">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Ready to create your identity</span>
                </div>
              )}
              
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !handle.trim() || !deviceId}
                className={`w-full h-14 text-base font-semibold bg-gradient-to-r from-amber-600 via-amber-500 to-red-600 hover:from-amber-700 hover:via-amber-600 hover:to-red-700 text-white shadow-lg hover:shadow-xl hover:shadow-amber-500/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden ${
                  handle.trim() && selectedAvatar && (recaptchaToken || !RECAPTCHA_SITE_KEY) && !isLoading 
                    ? 'ring-2 ring-red-500/50 ring-offset-2 ring-offset-slate-900 dark:ring-offset-slate-950' 
                    : ''
                }`}
                size="lg"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></span>
                {isLoading ? (
                  <span className="flex items-center gap-2 relative z-10">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Creating your identity...
                  </span>
                ) : (
                  <span className="flex items-center gap-2 relative z-10">
                    <span className="group-hover:translate-x-1 transition-transform duration-200">
                    <CheckCircle2 className="h-5 w-5" />
                    </span>
                    Enter The Chamber
                    <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
                  </span>
                )}
              </Button>
              <p className="text-xs text-center text-gray-300 dark:text-gray-300 leading-relaxed font-medium">
                By continuing, you agree to keep it real and respectful
              </p>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
    );
  } catch (error: any) {
    // CRITICAL: If anything crashes, show a simple fallback onboarding
    console.error("[OnboardingFlow] Render error, showing fallback:", error);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <h1 className="text-3xl font-bold text-amber-400 dark:text-amber-400">Welcome to Echo Garden</h1>
          <p className="text-muted-foreground">Something went wrong loading the full onboarding. Please refresh the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }
};
