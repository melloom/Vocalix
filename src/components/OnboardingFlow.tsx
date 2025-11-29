import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { Wand2, CheckCircle2, Mic, Radio, Headphones, Speaker, Volume2, RadioIcon, Zap, Music, Sparkles, ArrowRight, Loader2, Lock } from "lucide-react";

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
// Note: Freepik API requires backend (CORS blocked in browser)
// Using DiceBear which works great from browser

// Avatar types - using unique identifiers for diverse avatars
type AvatarType = 
  | 'avatar1' | 'avatar2' | 'avatar3' | 'avatar4' | 'avatar5' | 'avatar6'
  | 'avatar7' | 'avatar8' | 'avatar9' | 'avatar10' | 'avatar11' | 'avatar12'
  | 'avatar13' | 'avatar14' | 'avatar15' | 'avatar16' | 'avatar17' | 'avatar18'
  | 'avatar19' | 'avatar20' | 'avatar21' | 'avatar22' | 'avatar23' | 'avatar24';

const AVATAR_TYPES: AvatarType[] = [
  'avatar1', 'avatar2', 'avatar3', 'avatar4', 'avatar5', 'avatar6',
  'avatar7', 'avatar8', 'avatar9', 'avatar10', 'avatar11', 'avatar12',
  'avatar13', 'avatar14', 'avatar15', 'avatar16', 'avatar17', 'avatar18',
  'avatar19', 'avatar20', 'avatar21', 'avatar22', 'avatar23', 'avatar24',
];

// Map avatar types to emojis for display (backward compatibility)
const AVATAR_TYPE_TO_EMOJI: Record<AvatarType, string> = {
  avatar1: '👤', avatar2: '👥', avatar3: '👨', avatar4: '👩', avatar5: '🧑', avatar6: '👤',
  avatar7: '👥', avatar8: '👨', avatar9: '👩', avatar10: '🧑', avatar11: '👤', avatar12: '👥',
  avatar13: '👨', avatar14: '👩', avatar15: '🧑', avatar16: '👤', avatar17: '👥', avatar18: '👨',
  avatar19: '👩', avatar20: '🧑', avatar21: '👤', avatar22: '👥', avatar23: '👨', avatar24: '👩',
};

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

// Free Avatar Icon APIs - Multiple sources for diverse profile avatars
const getAvatarUrl = (avatarId: AvatarType): string => {
  const seed = avatarId.replace('avatar', '');
  const avatarNum = parseInt(seed) || 1;
  
  // Use different avatar APIs for variety (all free, no API key needed)
  const avatarSources = [
    // DiceBear - diverse styles
    () => {
      const styles = ['avataaars', 'personas', 'identicon', 'bottts', 'lorelei', 'micah'];
      const styleIndex = (avatarNum - 1) % styles.length;
      const style = styles[styleIndex];
      const uniqueSeed = `echo-avatar-${avatarNum}-style-${styleIndex}-seed-${avatarNum * 127 + styleIndex * 31}`;
      const bgColors = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf'][avatarNum % 5];
      return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(uniqueSeed)}&backgroundColor=${bgColors}&radius=50`;
    },
    // UI Avatars - simple icons
    () => {
      const names = ['Alex', 'Sam', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Avery', 'Quinn', 'Sage', 'Blake', 'Drew', 'Reese', 'Finley', 'Hayden', 'Rowan', 'Parker', 'Cameron', 'Devin', 'Emery', 'River', 'Phoenix', 'Skyler', 'Indigo', 'Arden'];
      const name = names[(avatarNum - 1) % names.length];
      return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random&color=fff&size=128&bold=true&format=svg`;
    },
    // Adorable Avatars - cute icons
    () => {
      const seed = `echo${avatarNum}avatar${avatarNum * 23}`;
      return `https://api.adorable.io/avatars/128/${encodeURIComponent(seed)}.png`;
    },
    // RoboHash - robot/icon avatars
    () => {
      const seed = `echo-avatar-${avatarNum}`;
      const sets = ['set1', 'set2', 'set3', 'set4', 'set5'][Math.floor((avatarNum - 1) / 5) % 5];
      return `https://robohash.org/${encodeURIComponent(seed)}?set=${sets}&size=128x128`;
    },
  ];
  
  // Distribute avatars across different sources
  const sourceIndex = Math.floor((avatarNum - 1) / 6) % avatarSources.length;
  return avatarSources[sourceIndex]();
};

// Avatar Component - uses multiple free avatar APIs for profile icons
const AvatarIcon = ({ 
  type, 
  className = "",
  imageUrl
}: { 
  type: AvatarType; 
  className?: string;
  imageUrl?: string | null;
}) => {
  const [avatarUrl, setAvatarUrl] = useState<string>(imageUrl || getAvatarUrl(type));
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  // Update URL if imageUrl prop changes
  useEffect(() => {
    if (imageUrl) {
      setAvatarUrl(imageUrl);
      setImageError(false);
      setImageLoaded(false);
    }
  }, [imageUrl]);
  
  const handleImageError = () => {
    if (!imageError) {
      setImageError(true);
      // Try fallback avatar URL
      const fallbackUrl = getAvatarUrl(type);
      if (fallbackUrl !== avatarUrl) {
        setAvatarUrl(fallbackUrl);
        setImageError(false);
        setImageLoaded(false);
      }
    }
  };
  
  return (
    <div 
      className={`rounded-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-red-600/20 to-rose-600/20 ${className}`}
      style={{ minWidth: '100%', minHeight: '100%', aspectRatio: '1' }}
    >
      {!imageError ? (
        <img 
          src={avatarUrl}
          alt={`Avatar ${type}`}
          className={`w-full h-full object-cover rounded-full transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={handleImageError}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-white text-xl font-bold bg-gradient-to-br from-red-600 to-rose-600 rounded-full">
          {AVATAR_TYPE_TO_EMOJI[type] || '👤'}
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
  const [avatarImages, setAvatarImages] = useState<Map<string, string>>(new Map());
  const [avatarsLoading, setAvatarsLoading] = useState(false);
  
  // Note: Freepik API doesn't work from browser due to CORS restrictions
  // Using DiceBear which works perfectly and generates unique avatars
  // If Freepik is needed, it would need to be called from a Supabase Edge Function
  useEffect(() => {
    console.log('[Avatar] Using DiceBear avatars (no CORS issues, all unique)');
    setAvatarsLoading(false);
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

  // Load reCAPTCHA Enterprise script
  useEffect(() => {
    const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
    const isDevelopment = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
    if (!RECAPTCHA_SITE_KEY) {
      console.log('[OnboardingFlow] No reCAPTCHA Enterprise site key configured, skipping verification');
      console.log('[OnboardingFlow] To enable: Set VITE_RECAPTCHA_SITE_KEY environment variable');
      setRecaptchaLoading(false);
      setRecaptchaAvailable(false);
      return;
    }

    // Check if Enterprise script is already loaded
    const checkEnterpriseLoaded = () => {
      if (typeof window !== 'undefined' && (window as any).grecaptcha && (window as any).grecaptcha.enterprise) {
        console.log('[OnboardingFlow] ✅ reCAPTCHA Enterprise already loaded');
        setRecaptchaLoading(false);
        setRecaptchaAvailable(true);
        setRecaptchaError(false);
        return true;
      }
      return false;
    };

    // Check immediately
    if (checkEnterpriseLoaded()) {
      return;
    }

    // Load Enterprise script dynamically
    const loadEnterpriseScript = () => {
      // Check if script already exists
      const existingScript = document.querySelector(`script[src*="recaptcha/enterprise.js"]`);
      if (existingScript) {
        console.log('[OnboardingFlow] Enterprise script already in DOM, waiting for load...');
        // If script exists but Enterprise API isn't ready, wait for it
        if (!checkEnterpriseLoaded()) {
          // Wait for it to become available
          let waitAttempts = 0;
          const waitInterval = setInterval(() => {
            waitAttempts++;
            if (checkEnterpriseLoaded() || waitAttempts >= 50) {
              clearInterval(waitInterval);
              if (!checkEnterpriseLoaded()) {
                console.warn('[OnboardingFlow] Script in DOM but Enterprise API not available');
                setRecaptchaError(true);
                setRecaptchaLoading(false);
              }
            }
          }, 100);
        }
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = true;
      
      let checkReadyInterval: NodeJS.Timeout | null = null;
      
      script.onload = () => {
        console.log('[OnboardingFlow] ✅ reCAPTCHA Enterprise script loaded, waiting for API...');
        
        // Wait a moment for grecaptcha to initialize
        setTimeout(() => {
          // Try multiple methods to check if Enterprise is ready
          const checkAndSetReady = () => {
            if (checkEnterpriseLoaded()) {
              console.log('[OnboardingFlow] ✅ reCAPTCHA Enterprise is ready!');
              setRecaptchaLoading(false);
              setRecaptchaAvailable(true);
              setRecaptchaError(false);
              return true;
            }
            return false;
          };

          // Method 1: Check if already available
          if (checkAndSetReady()) {
            return;
          }

          // Method 2: Use ready() callback if available
          if (typeof window !== 'undefined' && (window as any).grecaptcha) {
            try {
              // Check if enterprise exists
              if ((window as any).grecaptcha.enterprise) {
                if ((window as any).grecaptcha.enterprise.ready) {
                  (window as any).grecaptcha.enterprise.ready(() => {
                    console.log('[OnboardingFlow] ✅ Enterprise ready() callback fired');
                    if (checkAndSetReady()) {
                      return;
                    }
                    // If still not ready after callback, wait a bit more
                    setTimeout(() => {
                      if (!checkAndSetReady()) {
                        console.warn('[OnboardingFlow] Enterprise API not ready after callback');
                        // Don't set error - might still work on execute
                        setRecaptchaLoading(false);
                      }
                    }, 1000);
                  });
                } else {
                  // Enterprise exists but no ready() - check directly
                  if (checkAndSetReady()) {
                    return;
                  }
                }
              }
            } catch (e) {
              console.warn('[OnboardingFlow] Error checking Enterprise ready:', e);
            }
          }

          // Method 3: Poll for availability (fallback)
          let pollAttempts = 0;
          const maxPollAttempts = 50; // 5 seconds
          checkReadyInterval = setInterval(() => {
            pollAttempts++;
            if (checkAndSetReady() || pollAttempts >= maxPollAttempts) {
              if (checkReadyInterval) clearInterval(checkReadyInterval);
              if (pollAttempts >= maxPollAttempts && !checkEnterpriseLoaded()) {
                console.warn('[OnboardingFlow] Enterprise API not available after polling, but will try on execute');
                // Don't set error - Enterprise might still work when we execute it
                setRecaptchaLoading(false);
              }
            }
          }, 100);
        }, 500); // Wait 500ms after script load
      };
      
      script.onerror = (e) => {
        console.error('[OnboardingFlow] ❌ Failed to load reCAPTCHA Enterprise script:', e);
        if (checkReadyInterval) clearInterval(checkReadyInterval);
        setRecaptchaError(true);
        setRecaptchaLoading(false);
        
        if (!isDevelopment) {
          console.error('[OnboardingFlow] Possible causes:');
          console.error('  1. Domain not registered in reCAPTCHA console');
          console.error('  2. Network/CSP blocking Google scripts');
          console.error('  3. Invalid site key');
          console.error('[OnboardingFlow] Site key:', RECAPTCHA_SITE_KEY ? 'Set' : 'Missing');
          console.error('[OnboardingFlow] Domain:', currentDomain);
        }
      };
      
      document.head.appendChild(script);
    };

    // Load script
    loadEnterpriseScript();

    // Fallback: Check periodically if script loaded externally
    let attempts = 0;
    const maxAttempts = 40;
    const checkInterval = setInterval(() => {
      attempts++;
      if (checkEnterpriseLoaded() || attempts >= maxAttempts) {
        clearInterval(checkInterval);
        if (attempts >= maxAttempts && !checkEnterpriseLoaded()) {
          if (!isDevelopment) {
            console.error('[OnboardingFlow] ❌ reCAPTCHA Enterprise did not load within timeout');
          }
          setRecaptchaLoading(false);
          if (!checkEnterpriseLoaded()) {
            setRecaptchaError(true);
          }
        }
      }
    }, 500);

    return () => clearInterval(checkInterval);
  }, [RECAPTCHA_SITE_KEY]);

  const handleSubmit = async () => {
    if (!handle.trim()) {
      toast({
        title: "Handle required",
        description: "Please enter a handle",
        variant: "destructive",
      });
      return;
    }

    // If reCAPTCHA Enterprise is still loading, wait a bit
    if (RECAPTCHA_SITE_KEY && recaptchaLoading) {
      toast({
        title: "Loading verification",
        description: "Please wait for verification to load",
        variant: "default",
      });
      return;
    }
    
    // Execute reCAPTCHA Enterprise if available (it's invisible, runs automatically)
    // We'll get the token right before submitting to backend
    if (RECAPTCHA_SITE_KEY && recaptchaAvailable && !recaptchaError) {
      // Token will be obtained when executing Enterprise in the validation step
      // No need to check for token here - Enterprise executes on-demand
    } else if (RECAPTCHA_SITE_KEY && recaptchaError) {
      console.warn('[OnboardingFlow] reCAPTCHA Enterprise unavailable, proceeding without verification');
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

      // Execute reCAPTCHA Enterprise and get token
      let enterpriseToken: string | null = null;
      if (RECAPTCHA_SITE_KEY) {
        try {
          // Always try to execute Enterprise - it might be available even if we didn't detect it
          if (typeof window !== 'undefined') {
            // Wait a moment and check if Enterprise loaded
            await new Promise(resolve => setTimeout(resolve, 100));
            
            // Check if Enterprise is available
            const grecaptcha = (window as any).grecaptcha;
            const enterprise = grecaptcha?.enterprise;
            
            if (enterprise) {
              console.log('[OnboardingFlow] Executing reCAPTCHA Enterprise...');
              try {
                // Try to use ready() callback first
                if (enterprise.ready) {
                  await new Promise<void>((resolve) => {
                    enterprise.ready(async () => {
                      try {
                        enterpriseToken = await enterprise.execute(RECAPTCHA_SITE_KEY, {
                          action: 'ACCOUNT_CREATION'
                        });
                        console.log('[OnboardingFlow] ✅ reCAPTCHA Enterprise token obtained');
                        setRecaptchaToken(enterpriseToken);
                        resolve();
                      } catch (error) {
                        console.error('[OnboardingFlow] Failed to execute Enterprise:', error);
                        resolve(); // Continue without token
                      }
                    });
                  });
                } else {
                  // Execute directly if ready() isn't available
                  enterpriseToken = await enterprise.execute(RECAPTCHA_SITE_KEY, {
                    action: 'ACCOUNT_CREATION'
                  });
                  console.log('[OnboardingFlow] ✅ reCAPTCHA Enterprise token obtained (direct execute)');
                  setRecaptchaToken(enterpriseToken);
                }
              } catch (error: any) {
                console.warn('[OnboardingFlow] Enterprise execution error:', error?.message || error);
                // Continue without token - backend will handle gracefully
              }
            } else {
              console.log('[OnboardingFlow] Enterprise not available yet, will try without token');
            }
          }
        } catch (error: any) {
          console.warn('[OnboardingFlow] Enterprise execution error:', error?.message || error);
          // Continue without token - backend will handle gracefully
        }
      } else {
        console.log('[OnboardingFlow] No reCAPTCHA site key configured, skipping verification');
      }

      // Validate account creation with reCAPTCHA Enterprise token (if validation function exists)
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
            recaptcha_token: enterpriseToken || recaptchaToken || undefined,
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
          // Reset Enterprise token if verification failed
          if (errorMessage.includes('reCAPTCHA') || errorMessage.includes('verification')) {
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
            // Reset Enterprise token if verification failed
            if (validationData.reason?.includes('reCAPTCHA')) {
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

      // Reset Enterprise token if needed (no ref needed for Enterprise)
      setRecaptchaToken(null);

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
          <Card className="w-full max-w-md mx-auto lg:mx-0 border-2 border-red-900/50 dark:border-red-800/40 shadow-2xl bg-gradient-to-br from-red-950/95 via-amber-950/90 to-red-950/95 dark:from-red-950/90 dark:via-amber-950/85 dark:to-red-950/90 backdrop-blur-xl relative overflow-hidden animate-in fade-in-0 slide-in-from-right-5 duration-700 transition-all duration-300">
            
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
                <AvatarIcon 
                  type={selectedAvatar} 
                  className="w-14 h-14"
                  imageUrl={avatarImages.get(selectedAvatar)}
                />
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
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 p-3 rounded-xl bg-gradient-to-br from-red-950/50 via-amber-950/40 to-red-900/30 dark:from-red-950/40 dark:via-amber-950/30 dark:to-red-900/25 border border-red-900/40 dark:border-red-800/30 max-h-96 overflow-y-auto">
                  {AVATAR_TYPES.map((avatarType, index) => {
                    const isActive = selectedAvatar === avatarType;
                    return (
                      <button
                        key={avatarType}
                        type="button"
                        onClick={() => setSelectedAvatar(avatarType)}
                        className={`flex h-16 w-full items-center justify-center rounded-lg transition-all duration-300 animate-in fade-in-0 zoom-in-95 ${
                          isActive
                            ? "scale-110 shadow-lg shadow-red-500/40 ring-2 ring-red-400/30 z-10"
                            : "hover:scale-105 active:scale-95"
                        }`}
                        style={{ animationDelay: `${index * 30}ms` }}
                        title={`Avatar ${index + 1}`}
                      >
                        {avatarsLoading && index < 8 ? (
                          <div className="w-10 h-10 rounded-full bg-slate-700 animate-pulse" />
                        ) : (
                          <AvatarIcon 
                            type={avatarType} 
                            className={`w-10 h-10 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
                            imageUrl={avatarImages.get(avatarType)}
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

              {/* reCAPTCHA Enterprise - Invisible, runs automatically */}
              {/* Only show subtle notice if Enterprise fails - it's not blocking */}
              {RECAPTCHA_SITE_KEY && recaptchaError && recaptchaLoading === false && (
                <div className="text-xs text-center text-gray-500/60 dark:text-gray-600/60 py-1">
                  <p className="text-xs">Verification will be attempted automatically</p>
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
