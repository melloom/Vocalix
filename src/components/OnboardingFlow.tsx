import { useState, useRef, useEffect, useMemo } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Wand2, CheckCircle2, Mic, Radio, Headphones, Speaker, Volume2, RadioIcon, Zap, Music, Sparkles, ArrowRight, Loader2, Lock, MessageCircle, Repeat2, Link2, Users, TrendingUp, Search, Bookmark, Calendar, Download, PlayCircle, Filter, Bell, Award, Globe, MapPin, Layers, Compass, Shield, MailX, UserX, Smartphone, ChevronDown, ChevronRight, HelpCircle, X, Trash2, BookOpen, Menu } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
import { useToast } from "@/hooks/use-toast";
import { handleSchema, isReservedHandle } from "@/lib/validation";
import { useAuth } from "@/context/AuthContext";
import { useDeviceId } from "@/hooks/useDeviceId";
import { FAQAnswerDialog } from "@/components/FAQAnswerDialog";
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
// ONLY visual icons - NO letters, NO initials, NO emojis
const getAvatarUrl = (avatarId: AvatarType): string => {
  const seed = avatarId.replace('avatar', '');
  const avatarNum = parseInt(seed) || 1;
  
  // Guaranteed visual-only styles - NO letters, NO initials, NO text
  // Only styles that show actual faces/characters/icons
  const dicebearVisualStyles = [
    'avataaars',           // Cartoon faces - guaranteed visual
    'personas',            // Illustrated people - guaranteed visual
    'bottts',              // Robots - guaranteed visual
    'lorelei',             // Illustrated faces - guaranteed visual
    'micah',               // Illustrated people - guaranteed visual
    'big-ears',            // Cartoon faces - guaranteed visual
    'big-smile',           // Cartoon faces - guaranteed visual
    'adventurer',          // Adventure characters - guaranteed visual
    'adventurer-neutral',  // Neutral adventure characters - guaranteed visual
    'croodles',            // Hand-drawn style - guaranteed visual
    'rings',               // Ring-based geometric avatars - guaranteed visual
    'pixel-art',           // Pixel art characters - guaranteed visual
    'funky',               // Colorful fun characters - guaranteed visual
  ];
  
  const styleIndex = (avatarNum - 1) % dicebearVisualStyles.length;
  const style = dicebearVisualStyles[styleIndex];
  // Create highly unique seed to ensure each avatar is distinct
  // Multiply by large primes to avoid patterns
  const uniqueSeed = `echo-${avatarNum}-${style}-${avatarNum * 173 + styleIndex * 293 + 7919}`;
  const bgColors = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'e0bbff', 'ffbea3', 'a8e6cf', 'ffb3ba', 'bae1ff', 'baffc9', 'ffffba'][avatarNum % 12];
  
  // Primary: DiceBear visual styles - force fresh load with cache busting
  // Version 2: Removed all letter/initial styles, only visual icons
  const version = 'v2-visual-only';
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(uniqueSeed)}&backgroundColor=${bgColors}&radius=50&v=${version}`;
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
      // Try multiple fallback sources
      const seed = type.replace('avatar', '');
      const avatarNum = parseInt(seed) || 1;
      
      // Fallback sources - all visual, no letters
      const fallbackSources = [
        () => {
          const styles = ['avataaars', 'personas', 'bottts', 'lorelei', 'micah'];
          const style = styles[avatarNum % styles.length];
          return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(`fallback-${avatarNum}-${Date.now()}`)}&backgroundColor=b6e3f4&radius=50`;
        },
        () => `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(`fallback-pixel-${avatarNum}`)}&size=128`,
        () => `https://api.dicebear.com/7.x/funky/svg?seed=${encodeURIComponent(`fallback-funky-${avatarNum}`)}&size=128`,
        () => `https://robohash.org/${encodeURIComponent(`fallback-${avatarNum}`)}?set=set1&size=128x128&bgset=bg1`,
      ];
      
      // Try next fallback source based on current attempt
      const currentAttempt = parseInt(sessionStorage.getItem(`avatar-fallback-${type}`) || '0');
      if (currentAttempt < fallbackSources.length) {
        sessionStorage.setItem(`avatar-fallback-${type}`, String(currentAttempt + 1));
        const fallbackUrl = fallbackSources[currentAttempt]();
        if (fallbackUrl !== avatarUrl) {
          setAvatarUrl(fallbackUrl);
          setImageError(false);
          setImageLoaded(false);
        }
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
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-700 rounded-full">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      )}
    </div>
  );
};

interface OnboardingFlowProps {
  onComplete: (profileId: string) => void;
}

export const OnboardingFlow = ({ onComplete }: OnboardingFlowProps) => {
  const navigate = useNavigate();
  const location = useLocation();
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
  const [activeSection, setActiveSection] = useState<string>("overview");
  const [loadedSections, setLoadedSections] = useState<Set<string>>(new Set(["overview", "get-started"]));
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [showPostOnboardingConfirmation, setShowPostOnboardingConfirmation] = useState(false);
  const [createdProfileId, setCreatedProfileId] = useState<string | null>(null);
  const [faqId, setFaqId] = useState<string | null>(null);
  const scrollableContentRef = useRef<HTMLDivElement>(null);
  
  // Detect if device is mobile (memoized to prevent re-renders)
  const isMobile = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      (window.innerWidth <= 768 && 'ontouchstart' in window) ||
      navigator.maxTouchPoints > 0
    );
  }, []);
  
  // Note: Freepik API doesn't work from browser due to CORS restrictions
  // Using DiceBear which works perfectly and generates unique avatars
  // If Freepik is needed, it would need to be called from a Supabase Edge Function
  useEffect(() => {
    setAvatarsLoading(false);
  }, []);

  // Check for FAQ parameter in URL
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const faqParam = urlParams.get("faq");
    if (faqParam) {
      setFaqId(faqParam);
    }
  }, [location.search]);

  // Handle FAQ dialog close
  const handleFAQClose = () => {
    setFaqId(null);
    // Remove FAQ parameter from URL
    const urlParams = new URLSearchParams(location.search);
    urlParams.delete("faq");
    const newSearch = urlParams.toString();
    navigate({ search: newSearch ? `?${newSearch}` : "" }, { replace: true });
  };
  
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
  
  // Generate deviceId manually if hook failed or returned null (use ref to prevent multiple runs)
  const deviceIdInitializedRef = useRef(false);
  useEffect(() => {
    // Prevent multiple initializations
    if (deviceIdInitializedRef.current && deviceId) {
      return;
    }
    
    if (!deviceId) {
      deviceIdInitializedRef.current = true;
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
  
  // Removed debug logging to reduce console noise

  // Update avatar when handle changes
  useEffect(() => {
    setSelectedAvatar(generateAvatarFromHandle(handle));
  }, [handle]);

  // Load reCAPTCHA v3 script (use ref to prevent multiple initializations)
  const recaptchaInitializedRef = useRef(false);
  useEffect(() => {
    // Prevent multiple initializations
    if (recaptchaInitializedRef.current) {
      return;
    }
    
    if (!RECAPTCHA_SITE_KEY) {
      setRecaptchaLoading(false);
      setRecaptchaAvailable(false);
      recaptchaInitializedRef.current = true;
      return;
    }
    
    recaptchaInitializedRef.current = true;

    // Check if v3 script is already loaded
    const checkV3Loaded = () => {
      if (typeof window !== 'undefined' && (window as any).grecaptcha && typeof (window as any).grecaptcha.execute === 'function') {
        console.log('[OnboardingFlow] ✅ reCAPTCHA v3 API available!');
        setRecaptchaLoading(false);
        setRecaptchaAvailable(true);
        setRecaptchaError(false);
        return true;
      }
      return false;
    };

    // Check immediately in case script was loaded elsewhere
    if (checkV3Loaded()) {
      return;
    }

    // Load v3 script dynamically
    const loadV3Script = () => {
      // Check if script already exists
      const existingScript = document.querySelector(`script[src*="recaptcha/api.js"]`);
      if (existingScript) {
        // If script exists but v3 API isn't ready, wait for it (silently)
        if (!checkV3Loaded()) {
          // Wait for it to become available (longer timeout on mobile)
          let waitAttempts = 0;
          const maxWaitAttempts = isMobile ? 100 : 50; // 10 seconds on mobile, 5 on desktop
          const waitInterval = setInterval(() => {
              waitAttempts++;
              if (checkV3Loaded() || waitAttempts >= maxWaitAttempts) {
                clearInterval(waitInterval);
                if (!checkV3Loaded()) {
                // Silently fail - reCAPTCHA is optional
                setRecaptchaError(true);
                setRecaptchaLoading(false);
              }
            }
          }, 100);
        }
        return;
      }

      const script = document.createElement('script');
      script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
      script.async = true;
      script.defer = false;
      script.id = 'recaptcha-v3-script';
      
      let checkReadyInterval: NodeJS.Timeout | null = null;
      let readyTimeout: NodeJS.Timeout | null = null;
      
      script.onload = () => {
        // Function to check and set ready state
        const checkAndSetReady = () => {
          if (checkV3Loaded()) {
            if (checkReadyInterval) clearInterval(checkReadyInterval);
            if (readyTimeout) clearTimeout(readyTimeout);
            setRecaptchaLoading(false);
            setRecaptchaAvailable(true);
            setRecaptchaError(false);
            return true;
          }
          return false;
        };

        // Try to use grecaptcha.ready() if available
        const tryReadyCallback = () => {
          if (typeof window !== 'undefined' && (window as any).grecaptcha) {
            try {
              const grecaptcha = (window as any).grecaptcha;
              
              // Check if v3 API exists (has execute function)
              if (typeof grecaptcha.ready === 'function') {
                grecaptcha.ready(() => {
                  // v3 ready() callback executed
                  setTimeout(() => {
                    if (!checkAndSetReady()) {
                      // Still not ready, but might work on execute
                      setRecaptchaLoading(false);
                    }
                  }, 500);
                });
                return true;
              } else if (typeof grecaptcha.execute === 'function') {
                // v3 exists but no ready() method
                // v3 API exists, checking directly
                setTimeout(() => {
                  checkAndSetReady();
                }, 1000);
                return true;
              }
            } catch (e) {
              console.warn('[OnboardingFlow] Error checking v3 API:', e);
            }
          }
          return false;
        };

        // Strategy 1: Try ready() callback immediately
        if (tryReadyCallback()) {
          // Set a timeout in case ready() never fires (longer on mobile)
          const readyTimeoutMs = isMobile ? 5000 : 2000;
          readyTimeout = setTimeout(() => {
            if (!checkAndSetReady()) {
              // v3 ready() timeout, starting polling
              startPolling();
            }
          }, readyTimeoutMs);
        } else {
          // Strategy 2: Wait a bit then check
          setTimeout(() => {
            if (!checkAndSetReady()) {
              // v3 not immediately available, starting polling
              startPolling();
            }
          }, 1000);
        }

        // Strategy 3: Poll as fallback (longer on mobile)
        const startPolling = () => {
          let pollAttempts = 0;
          const maxPollAttempts = isMobile ? 120 : 60; // 12 seconds on mobile, 6 on desktop
          checkReadyInterval = setInterval(() => {
            pollAttempts++;
            if (checkAndSetReady() || pollAttempts >= maxPollAttempts) {
              if (checkReadyInterval) clearInterval(checkReadyInterval);
              if (pollAttempts >= maxPollAttempts && !checkV3Loaded()) {
                console.warn('[OnboardingFlow] v3 API not available after polling - will attempt execution anyway');
                // Don't set as error - might work when we try to execute
                setRecaptchaLoading(false);
              }
            }
          }, 100);
        };
      };
      
      script.onerror = (error) => {
        const currentDomain = typeof window !== 'undefined' ? window.location.hostname : 'unknown';
        const currentPort = typeof window !== 'undefined' ? window.location.port : '';
        const fullHost = currentPort ? `${currentDomain}:${currentPort}` : currentDomain;
        
        console.error('[OnboardingFlow] ❌ Failed to load reCAPTCHA v3 script');
        console.error('[OnboardingFlow] Script URL:', script.src);
        console.error('[OnboardingFlow] Current domain:', currentDomain);
        console.error('[OnboardingFlow] Full hostname:', fullHost);
        console.error('[OnboardingFlow] Site key:', RECAPTCHA_SITE_KEY || 'NOT SET');
        console.error('');
        console.error('[OnboardingFlow] 🔧 Troubleshooting:');
        console.error('  1. Make sure you created a v3 key (NOT Enterprise)');
        console.error('  2. Go to: https://www.google.com/recaptcha/admin');
        console.error('  3. Click on your site key');
        console.error('  4. In Domains section, add these two (NO port numbers):');
        console.error('     - localhost');
        console.error('     - 127.0.0.1');
        console.error('  5. Wait 5-10 minutes after saving');
        console.error('  6. Hard refresh (Ctrl+Shift+R)');
        
        if (checkReadyInterval) clearInterval(checkReadyInterval);
        if (readyTimeout) clearTimeout(readyTimeout);
        setRecaptchaError(true);
        setRecaptchaLoading(false);
      };
      
      document.head.appendChild(script);
    };

    // Load script
    loadV3Script();

    // Fallback: Check periodically if script loaded externally (longer on mobile)
    let attempts = 0;
    const maxAttempts = isMobile ? 80 : 40; // 40 seconds on mobile, 20 on desktop
    const checkInterval = setInterval(() => {
      attempts++;
        if (checkV3Loaded() || attempts >= maxAttempts) {
          clearInterval(checkInterval);
          if (attempts >= maxAttempts && !checkV3Loaded()) {
            // Silently fail - reCAPTCHA is optional, won't block users
            setRecaptchaLoading(false);
            if (!checkV3Loaded()) {
              setRecaptchaError(true);
            }
          }
        }
    }, 500);

    return () => {
      clearInterval(checkInterval);
      recaptchaInitializedRef.current = false;
    };
  }, [RECAPTCHA_SITE_KEY, isMobile]);

  const handleSubmit = async () => {
    // Check if we're in development mode (used throughout the function)
    const isDevelopment = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    
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
        // Check for existing session first before attempting sign-in
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession?.user) {
          currentUserId = existingSession.user.id;
        } else {
          // Only sign in if we don't have a session
          if (signInAnonymously) {
            await signInAnonymously();
            const { data: { session } } = await supabase.auth.getSession();
            currentUserId = session?.user?.id || null;
            if (!currentUserId) {
              throw new Error("Failed to create anonymous user. Please enable Anonymous Auth in Supabase.");
            }
          } else {
            throw new Error("Authentication not available. Please refresh the page.");
          }
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
          // Try localStorage first
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              const stored = localStorage.getItem('deviceId');
              if (stored) {
                finalDeviceId = stored;
              }
            } catch (e) {
              // localStorage might not be available (private browsing, quota exceeded)
            }
          }
          
          // Fallback to sessionStorage if localStorage failed
          if (!finalDeviceId && typeof window !== 'undefined' && window.sessionStorage) {
            try {
              const stored = sessionStorage.getItem('deviceId');
              if (stored) {
                finalDeviceId = stored;
                // Try to promote to localStorage
                try {
                  if (window.localStorage) {
                    localStorage.setItem('deviceId', finalDeviceId);
                  }
                } catch (e) {
                  // Keep using sessionStorage
                }
              }
            } catch (e) {
              // sessionStorage also not available
            }
          }
          
          // Generate new ID if still not found
          if (!finalDeviceId) {
            // Use crypto.randomUUID() if available, fallback for older browsers
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
              finalDeviceId = crypto.randomUUID();
            } else {
              // Fallback UUID generation
              finalDeviceId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
              });
            }
            
            // CRITICAL: Save to storage immediately so the x-device-id header is set
            try {
              if (typeof window !== 'undefined' && window.localStorage) {
                localStorage.setItem('deviceId', finalDeviceId);
              }
            } catch (e) {
              // Try sessionStorage as fallback
              try {
                if (window.sessionStorage) {
                  sessionStorage.setItem('deviceId', finalDeviceId);
                }
              } catch (e2) {
                // Both failed, will use temp ID
              }
            }
          }
        } catch (e) {
          // Last resort: generate temp ID
          finalDeviceId = `temp-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        }
      } else {
        // Ensure deviceId is in storage even if we got it from useAuth
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            try {
              const stored = localStorage.getItem('deviceId');
              if (stored !== finalDeviceId) {
                localStorage.setItem('deviceId', finalDeviceId);
              }
            } catch (e) {
              // Try sessionStorage as fallback
              try {
                if (window.sessionStorage) {
                  sessionStorage.setItem('deviceId', finalDeviceId);
                }
              } catch (e2) {
                // Both failed, continue with existing deviceId
              }
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
            // Execute v3 reCAPTCHA
            if (typeof window !== 'undefined') {
              // Wait longer on mobile to ensure script has time to initialize
              const initDelay = isMobile ? 1000 : 500;
              await new Promise(resolve => setTimeout(resolve, initDelay));
              
              const grecaptcha = (window as any).grecaptcha;
              
              // In development, skip reCAPTCHA if it's not working (graceful degradation)
              if (!grecaptcha || typeof grecaptcha.execute !== 'function') {
                if (isDevelopment) {
                  // reCAPTCHA not available in development, continuing without verification
                } else {
                  console.warn('[OnboardingFlow] reCAPTCHA not loaded - this may be a configuration issue');
                }
              } else {
                // Try more times on mobile - v3 might load slowly on mobile networks
                const maxAttempts = isMobile ? 5 : 3;
                for (let attempt = 0; attempt < maxAttempts; attempt++) {
                  if (grecaptcha && typeof grecaptcha.execute === 'function') {
                    try {
                      // Strategy 1: Try ready() callback (longer timeout on mobile)
                      if (typeof grecaptcha.ready === 'function') {
                        enterpriseToken = await new Promise<string | null>((resolve) => {
                          const timeoutMs = isMobile ? 5000 : 2000;
                          const timeout = setTimeout(() => {
                            resolve(null); // Timeout - try direct execute
                          }, timeoutMs);
                          
                          grecaptcha.ready(async () => {
                            clearTimeout(timeout);
                            try {
                              const token = await grecaptcha.execute(RECAPTCHA_SITE_KEY, {
                                action: 'ACCOUNT_CREATION'
                              });
                              if (!isDevelopment) {
                                // reCAPTCHA v3 token obtained
                              }
                              resolve(token);
                            } catch (error: any) {
                              // In development, silently fail
                              if (!isDevelopment) {
                                console.warn('[OnboardingFlow] v3 ready() execution failed:', error?.message || error);
                              }
                              resolve(null);
                            }
                          });
                        });
                      }
                      
                      // Strategy 2: Direct execute if ready() didn't work or doesn't exist
                      if (!enterpriseToken) {
                        try {
                          enterpriseToken = await grecaptcha.execute(RECAPTCHA_SITE_KEY, {
                            action: 'ACCOUNT_CREATION'
                          });
                          if (!isDevelopment) {
                            // reCAPTCHA v3 token obtained (direct)
                          }
                        } catch (error: any) {
                          // In development, silently fail
                          if (!isDevelopment && error?.message && !error.message.includes('Invalid site key')) {
                            console.warn('[OnboardingFlow] Direct execute failed:', error?.message || error);
                          }
                        }
                      }
                      
                      if (enterpriseToken) {
                        setRecaptchaToken(enterpriseToken);
                        console.log('[OnboardingFlow] ✅ reCAPTCHA token obtained successfully:', enterpriseToken.substring(0, 20) + '...');
                        break; // Success!
                      }
                    } catch (error: any) {
                      // In development, silently fail
                      if (!isDevelopment) {
                        console.warn(`[OnboardingFlow] v3 attempt ${attempt + 1} failed:`, error?.message || error);
                      }
                    }
                  }
                  
                  // Wait longer before next attempt on mobile
                  if (!enterpriseToken && attempt < maxAttempts - 1) {
                    const retryDelay = isMobile ? 1000 : 500;
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                  }
                }
              }
              
              if (!enterpriseToken && !isDevelopment) {
                console.warn('[OnboardingFlow] Could not obtain reCAPTCHA token after all attempts');
                console.warn('[OnboardingFlow] Check:');
                console.warn('  1. Script loaded? Check Network tab for recaptcha/api.js');
                console.warn('  2. Domain registered? localhost and 127.0.0.1 in reCAPTCHA console');
                console.warn('  3. Is it a v3 key? (NOT Enterprise)');
                console.warn('  4. Site key correct?', RECAPTCHA_SITE_KEY ? `${RECAPTCHA_SITE_KEY.substring(0, 15)}...` : 'missing');
              }
            }
        } catch (error: any) {
          // In development, silently fail
          if (!isDevelopment) {
            console.warn('[OnboardingFlow] Enterprise execution error:', error?.message || error);
          }
          // Continue without token - backend will handle gracefully
        }
      } else {
        if (!isDevelopment) {
          // No reCAPTCHA site key configured, skipping verification
        }
      }

      // Validate account creation with reCAPTCHA Enterprise token (if validation function exists)
      // This ensures reCAPTCHA is verified on the backend
      try {
        const finalRecaptchaToken = enterpriseToken || recaptchaToken || undefined;
        console.log('[OnboardingFlow] Calling validate-account-creation with token:', finalRecaptchaToken ? finalRecaptchaToken.substring(0, 20) + '...' : 'none');
        
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
            recaptcha_token: finalRecaptchaToken,
            honeypot: honeypot || undefined,
            user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
          }),
        }).catch((fetchError) => {
          // Catch network errors and wrap them
          console.warn('[OnboardingFlow] Validation fetch error:', fetchError);
          throw new Error('Network error during validation');
        });

        // If function doesn't exist (404), skip validation gracefully
        if (validationResponse.status === 404) {
          if (!isDevelopment) {
            console.warn('[OnboardingFlow] Validation function not found, skipping backend validation');
          }
          // Continue without validation - function may not be deployed yet
        } else if (validationResponse.status === 400) {
          // Parse 400 errors - might be missing reCAPTCHA token in production
          const errorData = await validationResponse.json().catch(() => {
            // If JSON parsing fails, return empty object
            return {};
          });
          const errorMessage = errorData.reason || errorData.error || 'Account validation failed';
          
          // Log the full error for debugging
          console.error('[OnboardingFlow] Validation failed (400):', {
            status: validationResponse.status,
            errorData,
            errorMessage,
            requestBody: {
              handle: normalizedHandle,
              device_id: finalDeviceId,
              has_recaptcha_token: !!(enterpriseToken || recaptchaToken),
            }
          });
          
          // In development, if it's a reCAPTCHA error, allow it to proceed
          if (isDevelopment && (errorMessage.includes('reCAPTCHA') || errorMessage.includes('verification'))) {
            // Silently continue in development - reCAPTCHA may not be configured
            console.warn('[OnboardingFlow] Allowing request in development despite reCAPTCHA error');
          } else if (errorMessage.includes('reCAPTCHA') || errorMessage.includes('verification')) {
            // If it's a reCAPTCHA error in production, try to proceed anyway (fail open for better UX)
            // But log it for monitoring
            console.warn('[OnboardingFlow] reCAPTCHA validation failed, but allowing request to proceed:', errorMessage);
            // Reset Enterprise token if verification failed
            setRecaptchaToken(null);
          } else {
            // For other validation errors (handle taken, rate limit, etc), show error and block
            toast({
              title: "Validation failed",
              description: errorMessage,
              variant: "destructive",
            });
            setIsLoading(false);
            return;
          }
        } else if (!validationResponse.ok) {
          // For other errors, try to parse error message
          const errorData = await validationResponse.json().catch(() => {
            // If JSON parsing fails, return empty object
            return {};
          });
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
          const validationData = await validationResponse.json().catch(() => {
            // If JSON parsing fails, return default object
            return { allowed: true };
          });

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
        // In development, silently continue
        if (!isDevelopment) {
          console.warn('[OnboardingFlow] Account validation error:', validationError.message);
        }
        
        // Only block if reCAPTCHA is required and we're in production
        // On mobile, be more lenient - allow registration if reCAPTCHA fails after multiple attempts
        // In development, allow graceful degradation
        
        if (!isDevelopment && RECAPTCHA_SITE_KEY && recaptchaAvailable && !recaptchaError && !recaptchaToken) {
          // On mobile, show a warning but allow proceeding after a delay and retry
          if (isMobile) {
            toast({
              title: "Verification issue",
              description: "reCAPTCHA verification is taking longer than expected. Retrying...",
              variant: "default",
            });
            // Wait a bit more on mobile before allowing
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Try one more time
            try {
              const grecaptcha = (window as any).grecaptcha;
              if (grecaptcha && typeof grecaptcha.execute === 'function') {
                const finalToken = await grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: 'ACCOUNT_CREATION' });
                if (finalToken) {
                  setRecaptchaToken(finalToken);
                  // Mobile: Successfully obtained reCAPTCHA token on retry
                  // Continue with registration - token is now set
                } else {
                  // Allow registration to proceed on mobile even without token
                  console.warn('[OnboardingFlow] Mobile: Proceeding without reCAPTCHA token after retry');
                  // Continue anyway - backend will handle it
                }
              } else {
                console.warn('[OnboardingFlow] Mobile: reCAPTCHA not available, proceeding anyway');
                // Continue anyway - backend will handle it
              }
            } catch (e) {
              // Allow registration to proceed on mobile
              console.warn('[OnboardingFlow] Mobile: reCAPTCHA error, proceeding anyway:', e);
              // Continue anyway - backend will handle it
            }
          } else {
            // Desktop: require reCAPTCHA
            toast({
              title: "Verification required",
              description: "Please complete the reCAPTCHA verification before creating your account.",
              variant: "destructive",
            });
            setIsLoading(false);
            return;
          }
        }
        
        // Continue with profile creation if validation is optional or in development
      }

      // Create profile
      // Log debug info to help diagnose RLS issues
      // Creating profile
      if (false) { // Debug only
        console.log('[OnboardingFlow] Creating profile with:', {
          auth_user_id: currentUserId,
          device_id: finalDeviceId,
          handle: normalizedHandle,
          deviceIdInStorage: localStorage.getItem('deviceId'),
        });
      }

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
          } else if (error.message?.includes("device_id") || error.message?.includes("profiles_device_id_key")) {
            // Profile already exists for this device - try to load it instead
            console.log('[OnboardingFlow] Profile already exists for this device, loading existing profile...');
            try {
              const { data: existingProfile, error: fetchError } = await supabase
                .from("profiles")
                .select("*")
                .eq("device_id", finalDeviceId)
                .maybeSingle();

              if (fetchError) {
                console.error('[OnboardingFlow] Error fetching existing profile:', fetchError);
                toast({
                  title: "Account exists",
                  description: "An account already exists for this device. Please refresh the page.",
                  variant: "destructive",
                });
                // Refresh to load existing profile
                setTimeout(() => window.location.reload(), 2000);
              } else if (existingProfile) {
                // Found existing profile - use it
                localStorage.setItem("profileId", existingProfile.id);
                window.dispatchEvent(new StorageEvent("storage", {
                  key: "profileId",
                  newValue: existingProfile.id,
                }));
                toast({
                  title: "Welcome back!",
                  description: "Your account has been loaded.",
                });
                // Complete onboarding with existing profile
                if (onComplete) {
                  onComplete();
                } else {
                  // Redirect to home
                  window.location.href = "/";
                }
                return;
              }
            } catch (lookupError) {
              console.error('[OnboardingFlow] Error during profile lookup:', lookupError);
              toast({
                title: "Account exists",
                description: "An account already exists for this device. Please refresh the page.",
                variant: "destructive",
              });
              setTimeout(() => window.location.reload(), 2000);
            }
          } else {
            toast({
              title: "Account creation failed",
              description: error.message || "Please try again",
              variant: "destructive",
            });
          }
        } else if (error.code === "42501" || error.code === "PGRST301" || error.message?.includes("permission denied") || error.message?.includes("403") || error.code === "403") {
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
        title: "Welcome to Vocalix!",
        description: "Your identity has been created. Before you enter, please review what you're agreeing to.",
      });
      
      // Store profile ID and show a confirmation dialog so users clearly understand
      // what this platform is about and what they are agreeing to.
      setCreatedProfileId(data.id);
      setShowPostOnboardingConfirmation(true);
    } catch (error: any) {
      console.error("Onboarding error:", error);
      
      // Prevent uncaught promise rejection
      const errorMessage = error?.message || error?.toString() || "Please try again";
      
      // Only show toast if it's a user-facing error
      if (errorMessage && !errorMessage.includes('Network error') && !errorMessage.includes('fetch')) {
        toast({
          title: "Something went wrong",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };


  // CRITICAL: Wrap entire render in try-catch to prevent crashes
  try {
    return (
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Post-onboarding confirmation dialog */}
      <Dialog open={showPostOnboardingConfirmation} onOpenChange={(open) => {
        // Prevent closing the dialog without an explicit acknowledgement button click
        if (!open) return;
      }}>
        <DialogContent className="max-w-lg bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-red-800/40">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">
              You’re entering the Vocalix underground
            </DialogTitle>
            <DialogDescription className="text-slate-300">
              A quick recap of what this space is, and what you’re agreeing to by continuing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-sm text-slate-200">
            <div className="rounded-lg bg-slate-900/70 border border-slate-700/60 p-3">
              <p className="font-semibold mb-1 text-slate-100">What Vocalix is</p>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>Voice-first, anonymous audio clips and conversations.</li>
                <li>No photos, no profile pictures, no public real names by default.</li>
                <li>Community-driven spaces built around topics, not identities.</li>
              </ul>
            </div>

            <div className="rounded-lg bg-slate-900/70 border border-red-800/60 p-3">
              <p className="font-semibold mb-1 text-red-200">What you’re agreeing to</p>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>Keep it real, respectful, and within community guidelines.</li>
                <li>No hate, harassment, sexual exploitation, or illegal content.</li>
                <li>Understand that AI-powered safety checks may review clips for abuse and policy violations.</li>
              </ul>
            </div>

            <div className="rounded-lg bg-slate-900/70 border border-amber-700/60 p-3">
              <p className="font-semibold mb-1 text-amber-200">What this platform can provide</p>
              <ul className="list-disc list-inside space-y-1 text-slate-300">
                <li>A low-pressure place to speak your mind and listen to others.</li>
                <li>Tools to discover trending clips, follow topics, and join communities.</li>
                <li>Future features like optional email-based recovery and digests if you choose to connect an email.</li>
              </ul>
            </div>

            <p className="text-xs text-slate-400">
              We don’t require an email for this account by default. If you later add an email in Settings, we’ll send a confirmation message summarizing these basics and how to manage your data.
            </p>
          </div>

          <DialogFooter className="mt-4 flex flex-col sm:flex-row sm:justify-end gap-3">
            <Button
              variant="outline"
              className="border-slate-700/70 text-slate-200 hover:bg-slate-800/80"
              onClick={() => {
                // Let users back out to tweak their identity before fully entering
                setShowPostOnboardingConfirmation(false);
              }}
            >
              Go back and edit profile
            </Button>
            <Button
              className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white"
              onClick={() => {
                if (createdProfileId) {
                  onComplete(createdProfileId);
                }
                setShowPostOnboardingConfirmation(false);
              }}
            >
              I understand – enter Vocalix
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


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

      <div className="relative mx-auto flex min-h-screen w-full flex-col justify-center px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        {/* Mobile Navigation Toggle Button - Fixed bottom left */}
        <Button
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          className="fixed bottom-20 left-4 z-50 lg:hidden h-12 w-12 rounded-full bg-gradient-to-br from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white shadow-2xl shadow-red-500/50 border-2 border-red-400/30"
          size="icon"
        >
          {isMobileNavOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>

        {/* Mobile Navigation Sidebar - Collapsible */}
        <div className={`fixed inset-y-0 left-0 z-50 lg:hidden transition-transform duration-300 ease-in-out ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          {/* Backdrop */}
          {isMobileNavOpen && (
            <div 
              className="fixed inset-0 bg-black/60 z-40"
              onClick={() => setIsMobileNavOpen(false)}
            />
          )}
          
          {/* Sidebar */}
          <Card className="h-full w-64 shadow-2xl bg-gradient-to-br from-red-950/95 via-amber-950/90 to-red-950/95 dark:from-red-950/90 dark:via-amber-950/85 dark:to-red-950/90 relative overflow-hidden flex flex-col z-50 pointer-events-auto">
            <div className="rounded-xl bg-gradient-to-br from-red-950/80 to-amber-950/80 dark:from-red-950/70 dark:to-amber-950/70 border border-red-900/30 dark:border-red-800/20 p-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] pointer-events-auto">
              <div className="space-y-2 select-text">
                <div className="mb-4 pb-4 border-b border-red-900/30 dark:border-red-800/20 flex items-center justify-between">
                  <div>
                  <h3 className="text-sm font-bold text-white dark:text-white mb-1 flex items-center gap-2">
                    <Compass className="h-4 w-4 text-red-400" />
                    Navigation
                  </h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Explore sections</p>
                  </div>
                  <Button
                    onClick={() => setIsMobileNavOpen(false)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-gray-400 hover:text-white"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                
                {[
                  { id: "overview", label: "Welcome", icon: Radio },
                  { id: "what-is", label: "What is Vocalix?", icon: Mic },
                  { id: "how-it-works", label: "How It Works", icon: Zap },
                  { id: "why", label: "Why Vocalix?", icon: HelpCircle },
                  { id: "features", label: "Key Features", icon: Sparkles },
                  { id: "examples", label: "Example Handles", icon: Users },
                  { id: "about", label: "About Us", icon: BookOpen },
                  { id: "faq", label: "FAQ", icon: MessageCircle },
                  { id: "get-started", label: "Get Started", icon: ArrowRight },
                ].map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                    <button
                      key={section.id}
                      onClick={() => {
                        setActiveSection(section.id);
                        setLoadedSections((prev: Set<string>) => new Set([...prev, section.id]));
                        setIsMobileNavOpen(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left group ${
                        isActive
                          ? "bg-gradient-to-r from-red-900/50 to-amber-900/50 dark:from-red-900/40 dark:to-amber-900/40 text-white shadow-lg shadow-red-500/20 border border-red-500/30"
                          : "text-gray-300 dark:text-gray-400 hover:bg-red-950/30 dark:hover:bg-red-950/20 hover:text-white dark:hover:text-white border border-transparent"
                      }`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
                        isActive ? "text-red-400 scale-110" : "text-gray-400 group-hover:text-red-400 group-hover:scale-110"
                      }`} />
                      <span className={`text-sm font-medium flex-1 ${
                        isActive ? "font-bold" : "font-semibold"
                      }`}>
                        {section.label}
                      </span>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </Card>
            </div>

        <div className="flex flex-col lg:flex-row justify-center items-start lg:items-start gap-4 lg:gap-6 w-full max-w-[1600px] mx-auto">
          {/* Desktop Navigation Card - Hidden on mobile */}
          <Card className="hidden lg:flex w-64 flex-shrink-0 shadow-2xl bg-gradient-to-br from-red-950/95 via-amber-950/90 to-red-950/95 dark:from-red-950/90 dark:via-amber-950/85 dark:to-red-950/90 backdrop-blur-xl relative overflow-hidden transition-all duration-300 flex-col sticky top-4 self-start max-h-[calc(100vh-40px)]">
            <div className="rounded-xl bg-gradient-to-br from-red-950/80 to-amber-950/80 dark:from-red-950/70 dark:to-amber-950/70 backdrop-blur-xl border border-red-900/30 dark:border-red-800/20 p-4 h-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              <div className="space-y-2">
                <div className="mb-4 pb-4 border-b border-red-900/30 dark:border-red-800/20">
                  <h3 className="text-sm font-bold text-white dark:text-white mb-1 flex items-center gap-2">
                    <Compass className="h-4 w-4 text-red-400" />
                    Navigation
                </h3>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Explore sections</p>
              </div>

                {[
                  { id: "overview", label: "Welcome", icon: Radio },
                  { id: "what-is", label: "What is Vocalix?", icon: Mic },
                  { id: "how-it-works", label: "How It Works", icon: Zap },
                  { id: "why", label: "Why Vocalix?", icon: HelpCircle },
                  { id: "features", label: "Key Features", icon: Sparkles },
                  { id: "examples", label: "Example Handles", icon: Users },
                  { id: "about", label: "About Us", icon: BookOpen },
                  { id: "faq", label: "FAQ", icon: MessageCircle },
                  { id: "get-started", label: "Get Started", icon: ArrowRight },
                ].map((section) => {
                  const Icon = section.icon;
                  const isActive = activeSection === section.id;
                  return (
                  <button
                      key={section.id}
                    onClick={() => {
                        setActiveSection(section.id);
                        setLoadedSections((prev: Set<string>) => new Set([...prev, section.id]));
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 text-left group ${
                        isActive
                          ? "bg-gradient-to-r from-red-900/50 to-amber-900/50 dark:from-red-900/40 dark:to-amber-900/40 text-white shadow-lg shadow-red-500/20 border border-red-500/30"
                          : "text-gray-300 dark:text-gray-400 hover:bg-red-950/30 dark:hover:bg-red-950/20 hover:text-white dark:hover:text-white border border-transparent"
                      }`}
                    >
                      <Icon className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${
                        isActive ? "text-red-400 scale-110" : "text-gray-400 group-hover:text-red-400 group-hover:scale-110"
                      }`} />
                      <span className={`text-sm font-medium flex-1 ${
                        isActive ? "font-bold" : "font-semibold"
                      }`}>
                        {section.label}
                    </span>
                      {isActive && (
                        <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                      )}
                  </button>
                  );
                })}
              </div>
            </div>
          </Card>

          {/* Main Content Area - Sections */}
          <div className="relative z-10 flex-1 w-full min-w-0 lg:max-h-[calc(100vh-120px)]">
            {/* Fade-out gradient overlay at top - when scrolling down */}
            <div className="hidden lg:block absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-slate-950/60 via-slate-950/20 to-transparent pointer-events-none z-20" />
            
            {/* Fade-out gradient overlay at bottom - when scrolling up */}
            <div className="hidden lg:block absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 via-slate-950/50 to-transparent pointer-events-none z-20" />
            
            {/* Scrollable content */}
            <div ref={scrollableContentRef} className="space-y-4 lg:space-y-6 text-center lg:text-left lg:overflow-y-auto lg:pr-4 lg:max-h-[calc(100vh-120px)] lg:pb-16 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] scroll-smooth">
            {/* Section-based navigation - Show only active section on all screen sizes */}
            <div className="w-full max-w-none">
            {/* Overview Section */}
            {activeSection === "overview" && loadedSections.has("overview") && (
              <div className="space-y-8 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                {/* Hero Section - Enhanced */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900/80 via-slate-800/60 to-slate-900/80 dark:from-slate-950/80 dark:via-slate-900/60 dark:to-slate-950/80 p-8 lg:p-12 border border-slate-700/50 dark:border-slate-800/50 shadow-2xl">
                  {/* Animated background orbs */}
                  <div className="absolute top-0 left-0 w-96 h-96 bg-red-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
                  <div className="absolute bottom-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }} />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-red-500/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }} />
                  
                  <div className="relative z-10">
                    {/* Badge */}
                    <div className="flex items-center gap-3 mb-6">
                      <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-red-500/20 via-amber-500/20 to-red-500/20 border border-red-500/30 shadow-lg shadow-red-500/20">
                        <Radio className="h-7 w-7 text-red-400" />
                      </div>
                      <Badge className="bg-gradient-to-r from-red-600/30 via-amber-600/30 to-red-600/30 border-red-500/40 text-red-200 font-bold px-4 py-2 text-sm shadow-lg">
                        Audio-First Social Platform
                      </Badge>
                    </div>
                    
                    {/* Main Heading */}
                    <h1 className="text-6xl lg:text-7xl font-black tracking-tight text-white dark:text-white leading-[1.05] mb-6">
                      <span className="block mb-2">Join</span>
                      <span className="block bg-gradient-to-r from-red-400 via-red-500 via-amber-500 to-amber-400 bg-clip-text text-transparent drop-shadow-2xl">
                        Vocalix
                      </span>
                    </h1>
                    
                    {/* Subtitle */}
                    <p className="text-xl lg:text-2xl text-slate-300 dark:text-slate-300 max-w-3xl leading-relaxed font-semibold mb-8">
                      The underground platform where <span className="text-red-400 font-bold">voice is everything</span>. Speak your mind, stay anonymous, build real connections—<span className="text-amber-400 font-bold">no BS, no filters</span>.
                    </p>
                    
                    {/* CTA Buttons */}
                    <div className="flex flex-col sm:flex-row gap-4">
                      <Button
                        onClick={() => {
                          setActiveSection("get-started");
                          setLoadedSections((prev: Set<string>) => new Set([...prev, "get-started"]));
                        }}
                        className="bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-bold px-8 py-6 text-lg shadow-xl hover:shadow-2xl hover:shadow-red-500/30 transition-all duration-300 hover:scale-105"
                      >
                        <span className="flex items-center gap-2">
                          Get Started
                          <ArrowRight className="h-5 w-5" />
                        </span>
                      </Button>
                      <Button
                        asChild
                        variant="outline"
                        className="border-slate-600/50 text-slate-300 hover:bg-slate-800/30 hover:text-white font-semibold px-8 py-6 text-lg transition-all duration-300"
                      >
                        <Link to="/link-pin">
                          <span className="flex items-center gap-2">
                            <Lock className="h-5 w-5" />
                            Login
                          </span>
                        </Link>
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Value Propositions - Enhanced Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/60 via-slate-700/40 to-slate-800/60 dark:from-slate-900/60 dark:via-slate-800/40 dark:to-slate-900/60 p-6 border border-slate-700/50 dark:border-slate-800/50 hover:border-red-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/20 hover:-translate-y-2">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-red-500/20 transition-colors" />
                    <div className="relative z-10">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/30 to-red-400/20 mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-red-500/20">
                        <Mic className="h-8 w-8 text-red-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">30-Second Clips</h3>
                      <p className="text-sm text-slate-300 leading-relaxed">Quick thoughts, instant reactions. Record in seconds, share immediately.</p>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/60 via-slate-700/40 to-slate-800/60 dark:from-slate-900/60 dark:via-slate-800/40 dark:to-slate-900/60 p-6 border border-slate-700/50 dark:border-slate-800/50 hover:border-amber-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/20 hover:-translate-y-2">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-amber-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-amber-500/20 transition-colors" />
                    <div className="relative z-10">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/30 to-amber-400/20 mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-amber-500/20">
                        <Shield className="h-8 w-8 text-amber-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">100% Anonymous</h3>
                      <p className="text-sm text-slate-300 leading-relaxed">No email, no phone, no real name, no photos. Just an emoji avatar, your voice, and handle.</p>
                    </div>
                  </div>
                  
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/60 via-slate-700/40 to-slate-800/60 dark:from-slate-900/60 dark:via-slate-800/40 dark:to-slate-900/60 p-6 border border-slate-700/50 dark:border-slate-800/50 hover:border-red-500/50 transition-all duration-300 hover:shadow-2xl hover:shadow-red-500/20 hover:-translate-y-2">
                    <div className="absolute top-0 right-0 w-40 h-40 bg-red-500/10 rounded-full blur-3xl -mr-20 -mt-20 group-hover:bg-red-500/20 transition-colors" />
                    <div className="relative z-10">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/30 via-amber-500/30 to-red-500/30 mb-4 group-hover:scale-110 transition-transform shadow-lg shadow-red-500/20">
                        <Users className="h-8 w-8 text-red-400" />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-3">Real Community</h3>
                      <p className="text-sm text-slate-300 leading-relaxed">Live rooms, voice reactions, remixes, chains. AI keeps it civil.</p>
                    </div>
                  </div>
                </div>

                {/* Privacy & Security Highlights - Enhanced */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800/60 via-slate-700/40 to-slate-800/60 dark:from-slate-900/60 dark:via-slate-800/40 dark:to-slate-900/60 p-8 border border-slate-700/50 dark:border-slate-800/50 shadow-xl">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -ml-32 -mb-32" />
                  <div className="relative z-10">
                    <h3 className="text-2xl font-bold text-white mb-6 flex items-center gap-3">
                      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-amber-500/20 border border-red-500/30">
                        <Shield className="h-6 w-6 text-red-400" />
                      </div>
                      Privacy & Security First
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-700/30 dark:bg-slate-800/30 border border-slate-600/30 dark:border-slate-700/30 hover:border-red-500/50 transition-colors">
                        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 to-red-400/10 flex items-center justify-center border border-red-500/30 shadow-lg">
                          <MailX className="h-6 w-6 text-red-400" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white mb-2">No Email Required</h4>
                          <p className="text-sm text-slate-300 leading-relaxed">Create your account instantly with just a handle. No verification needed.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-700/30 dark:bg-slate-800/30 border border-slate-600/30 dark:border-slate-700/30 hover:border-amber-500/50 transition-colors">
                        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500/20 to-amber-400/10 flex items-center justify-center border border-amber-500/30 shadow-lg">
                          <UserX className="h-6 w-6 text-amber-400" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white mb-2">Fully Anonymous</h4>
                          <p className="text-sm text-slate-300 leading-relaxed">No real names, no photos, no faces, no personal data collected. Just emoji avatars. Your identity stays hidden.</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-4 p-4 rounded-xl bg-slate-700/30 dark:bg-slate-800/30 border border-slate-600/30 dark:border-slate-700/30 hover:border-red-500/50 transition-colors">
                        <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-red-500/20 via-amber-500/20 to-red-500/20 flex items-center justify-center border border-red-500/30 shadow-lg">
                          <Smartphone className="h-6 w-6 text-red-400" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white mb-2">Device-Based Auth</h4>
                          <p className="text-sm text-slate-300 leading-relaxed">Your device is your key. Link multiple devices for seamless access.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Stats / Highlights - Enhanced */}
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-gradient-to-r from-slate-800/60 to-slate-700/40 dark:from-slate-900/60 dark:to-slate-800/40 border border-slate-700/50 dark:border-slate-800/50 hover:border-red-500/50 transition-all hover:scale-105 shadow-lg">
                    <Zap className="h-5 w-5 text-red-400" />
                    <span className="text-base font-bold text-white">Instant Setup</span>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-gradient-to-r from-slate-800/60 to-slate-700/40 dark:from-slate-900/60 dark:to-slate-800/40 border border-slate-700/50 dark:border-slate-800/50 hover:border-amber-500/50 transition-all hover:scale-105 shadow-lg">
                    <Headphones className="h-5 w-5 text-amber-400" />
                    <span className="text-base font-bold text-white">Voice-First</span>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-gradient-to-r from-slate-800/60 to-slate-700/40 dark:from-slate-900/60 dark:to-slate-800/40 border border-slate-700/50 dark:border-slate-800/50 hover:border-red-500/50 transition-all hover:scale-105 shadow-lg">
                    <Sparkles className="h-5 w-5 text-red-400" />
                    <span className="text-base font-bold text-white">AI Moderation</span>
                  </div>
                  <div className="flex items-center gap-3 px-5 py-3 rounded-xl bg-gradient-to-r from-slate-800/60 to-slate-700/40 dark:from-slate-900/60 dark:to-slate-800/40 border border-slate-700/50 dark:border-slate-800/50 hover:border-amber-500/50 transition-all hover:scale-105 shadow-lg">
                    <Globe className="h-5 w-5 text-amber-400" />
                    <span className="text-base font-bold text-white">Offline Mode</span>
                  </div>
                </div>
              </div>
            )}

            {/* What is Echo Chamber Section */}
            {activeSection === "what-is" && loadedSections.has("what-is") && (
              <div className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                {/* Hero Header */}
                <div className="relative">
                  <div className="absolute -top-2 -left-2 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                        <Mic className="h-7 w-7 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-3xl lg:text-4xl font-black text-white dark:text-white leading-tight">
                          What is <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Vocalix?</span>
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">The audio-first revolution</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Main Description Card */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-950/40 via-amber-950/30 to-red-950/40 dark:from-red-950/30 dark:via-amber-950/25 dark:to-red-950/30 p-8 border border-red-800/30 shadow-xl">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -ml-32 -mb-32" />
                  <div className="relative space-y-4">
                    <p className="text-lg lg:text-base text-gray-200 dark:text-gray-200 leading-relaxed font-semibold">
                      The <span className="text-red-400 font-bold">audio-first social platform</span> where voice is everything. Share 30-second clips or 10-minute podcast segments—thoughts, rants, stories, whatever moves you. Your identity stays anonymous. Only your emoji avatar, voice, and handle show—no photos, no faces.
                    </p>
                    <p className="text-lg lg:text-base text-gray-200 dark:text-gray-200 leading-relaxed font-semibold">
                      Speak your mind. React with voice clips. Reply, remix, or continue chains. Join audio communities. Drop into live rooms. Search by what people actually said. Build collections. Go offline. Listen anywhere. <span className="text-amber-400 font-bold">No BS, no filters</span>—just raw voice in an underground community built for authentic expression.
                    </p>
                    </div>
                  </div>

                {/* Key Differentiators */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-950/30 to-red-900/20 dark:from-red-950/25 dark:to-red-900/15 p-5 border border-red-800/30 hover:border-red-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-red-500/10 transition-colors" />
                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-red-600/30 to-red-500/20 mb-3">
                        <Radio className="h-5 w-5 text-red-400" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-2">Emoji Avatar Identity</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">No photos, no faces, no real pictures. Just an emoji avatar, your voice, and a handle. That's it.</p>
                </div>
              </div>

                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-950/30 to-amber-900/20 dark:from-amber-950/25 dark:to-amber-900/15 p-5 border border-amber-800/30 hover:border-amber-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-amber-500/10 transition-colors" />
                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-amber-600/30 to-amber-500/20 mb-3">
                        <Headphones className="h-5 w-5 text-amber-400" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-2">Audio-First Everything</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">Clips, reactions, replies, remixes—everything is voice. No typing required.</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* How It Works Section */}
            {activeSection === "how-it-works" && loadedSections.has("how-it-works") && (
              <div className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                {/* Hero Header */}
                <div className="relative">
                  <div className="absolute -top-2 -left-2 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                        <Zap className="h-7 w-7 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-3xl lg:text-4xl font-black text-white dark:text-white leading-tight">
                          How It <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Works</span>
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">Simple, powerful, voice-first</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Step-by-Step Process */}
                <div className="space-y-4">
                  {[
                    {
                      step: "1",
                      icon: Mic,
                      title: "Record Your Voice",
                      description: "Hit record and speak your mind. 30-second clips for quick thoughts, or 10-minute podcast segments for deeper dives. No editing needed—just raw, authentic voice.",
                      color: "red",
                      gradient: "from-red-600/30 to-red-500/20",
                      border: "border-red-800/30",
                      hoverBorder: "hover:border-red-600/50",
                      shadow: "hover:shadow-red-500/20"
                    },
                    {
                      step: "2",
                      icon: MessageCircle,
                      title: "React & Engage",
                      description: "React with emojis or 3-5 second voice reactions. Reply with your own voice clips. Create remixes. Continue conversation chains. Build on what others say.",
                      color: "amber",
                      gradient: "from-amber-600/30 to-amber-500/20",
                      border: "border-amber-800/30",
                      hoverBorder: "hover:border-amber-600/50",
                      shadow: "hover:shadow-amber-500/20"
                    },
                    {
                      step: "3",
                      icon: Users,
                      title: "Join Communities",
                      description: "Find or create audio communities around topics you care about. Drop into live rooms for real-time conversations. Follow voices that resonate with you.",
                      color: "red",
                      gradient: "from-red-600/30 to-amber-600/20",
                      border: "border-red-800/30",
                      hoverBorder: "hover:border-red-600/50",
                      shadow: "hover:shadow-red-500/20"
                    },
                    {
                      step: "4",
                      icon: Sparkles,
                      title: "AI Keeps It Real",
                      description: "Advanced AI moderation filters out trolls, spam, and toxic content automatically. Real voices, real conversations, real connections—without the noise.",
                      color: "amber",
                      gradient: "from-amber-600/30 to-red-600/20",
                      border: "border-amber-800/30",
                      hoverBorder: "hover:border-amber-600/50",
                      shadow: "hover:shadow-amber-500/20"
                    },
                    {
                      step: "5",
                      icon: Shield,
                      title: "Stay Anonymous",
                      description: "No personal info required, ever. Your device is your key. Link multiple devices if you want. Your identity stays hidden—only your emoji avatar, voice, and handle show. No photos, no faces.",
                      color: "red",
                      gradient: "from-red-600/30 to-red-500/20",
                      border: "border-red-800/30",
                      hoverBorder: "hover:border-red-600/50",
                      shadow: "hover:shadow-red-500/20"
                    }
                  ].map(({ step, icon: Icon, title, description, gradient, border, hoverBorder, shadow }, index) => (
                    <div
                      key={step}
                      className={`group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-950/30 to-amber-950/30 dark:from-red-950/25 dark:to-amber-950/25 p-6 border ${border} ${hoverBorder} transition-all duration-300 hover:shadow-lg ${shadow} hover:-translate-y-1`}
                    >
                      <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
                      <div className="relative flex items-start gap-4">
                        <div className="flex-shrink-0">
                          <div className={`flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} border border-red-500/20 group-hover:scale-110 transition-transform`}>
                            <div className="absolute -top-1 -left-1 w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center text-xs font-black text-red-400">
                              {step}
                            </div>
                            <Icon className="h-6 w-6 text-red-400 relative z-10" />
                          </div>
                        </div>
                        <div className="flex-1 pt-1">
                          <h4 className="text-lg font-bold text-white mb-2">{title}</h4>
                          <p className="text-sm text-gray-300 leading-relaxed">{description}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Why Echo Chamber Section */}
            {activeSection === "why" && loadedSections.has("why") && (
              <div className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                {/* Hero Header */}
                <div className="relative">
                  <div className="absolute -top-2 -left-2 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                        <HelpCircle className="h-7 w-7 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-3xl lg:text-4xl font-black text-white dark:text-white leading-tight">
                          Why <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Vocalix?</span>
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">The platform built for authentic voices</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="space-y-5">
                  {/* Privacy First - Enhanced */}
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-950/40 to-red-900/30 dark:from-red-950/30 dark:to-red-900/20 p-6 border border-red-800/30 hover:border-red-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-red-600/30 to-red-500/20 border border-red-500/20">
                          <Shield className="h-6 w-6 text-red-400" />
                        </div>
                        <h4 className="text-xl font-bold text-white">Privacy First</h4>
                      </div>
                      <div className="grid grid-cols-1 gap-3">
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-950/30 border border-red-800/20">
                          <CheckCircle2 className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-white mb-1">No email required</p>
                            <p className="text-xs text-gray-300">Create an account with just a handle. No verification, no spam.</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-950/30 border border-red-800/20">
                          <CheckCircle2 className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-white mb-1">Fully anonymous</p>
                            <p className="text-xs text-gray-300">No real names, no photos, no faces, no personal info collected. Just emoji avatars. Your identity stays hidden.</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3 p-3 rounded-lg bg-red-950/30 border border-red-800/20">
                          <CheckCircle2 className="h-5 w-5 text-red-400 mt-0.5 flex-shrink-0" />
                          <div>
                            <p className="text-sm font-bold text-white mb-1">Device-based authentication</p>
                            <p className="text-xs text-gray-300">Your device is your key. Link multiple devices for seamless access.</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Voice-First Benefits - Enhanced */}
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-950/40 to-amber-900/30 dark:from-amber-950/30 dark:to-amber-900/20 p-6 border border-amber-800/30 hover:border-amber-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-amber-600/30 to-amber-500/20 border border-amber-500/20">
                          <Mic className="h-6 w-6 text-amber-400" />
                        </div>
                        <h4 className="text-xl font-bold text-white">Voice-First Benefits</h4>
                      </div>
                      <p className="text-sm text-gray-200 mb-4 leading-relaxed">
                        Voice captures <span className="text-amber-400 font-bold">emotion, tone, and nuance</span> that text can't. Express yourself authentically without the limitations of typing.
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {[
                          { title: "Natural Expression", desc: "Emotion and tone come through" },
                          { title: "Faster Communication", desc: "Speak faster than typing" },
                          { title: "Authentic Connections", desc: "More genuine conversations" }
                        ].map((item, idx) => (
                          <div key={idx} className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/20">
                            <p className="text-xs font-bold text-white mb-1">{item.title}</p>
                            <p className="text-xs text-gray-300">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Community Values - Enhanced */}
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-950/40 via-amber-950/40 to-red-900/30 dark:from-red-950/30 dark:via-amber-950/30 dark:to-red-900/20 p-6 border border-red-800/30 hover:border-red-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-red-600/30 to-amber-600/20 border border-red-500/20">
                          <Users className="h-6 w-6 text-red-400" />
                        </div>
                        <h4 className="text-xl font-bold text-white">Community Values</h4>
                      </div>
                      <div className="space-y-3">
                        {[
                          { icon: "🎭", title: "Raw and Real", desc: "No filters, no polish required. Just authentic voice." },
                          { icon: "🤝", title: "Respectful Discourse", desc: "AI moderation keeps it civil while preserving authenticity." },
                          { icon: "🍸", title: "Underground Vibe", desc: "Like a speakeasy for voices—exclusive, authentic, real." }
                        ].map((item, idx) => (
                          <div key={idx} className="flex items-start gap-3 p-3 rounded-lg bg-red-950/30 border border-red-800/20">
                            <span className="text-2xl">{item.icon}</span>
                            <div>
                              <p className="text-sm font-bold text-white mb-1">{item.title}</p>
                              <p className="text-xs text-gray-300">{item.desc}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Why Not Text? - Enhanced */}
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-950/40 to-red-950/40 dark:from-amber-950/30 dark:to-red-950/30 p-6 border border-amber-800/30 hover:border-amber-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-amber-600/30 to-red-600/20 border border-amber-500/20">
                          <TrendingUp className="h-6 w-6 text-amber-400" />
                        </div>
                        <h4 className="text-xl font-bold text-white">Why Not Just Use Text?</h4>
                      </div>
                      <p className="text-sm text-gray-200 mb-4 leading-relaxed">
                        Text-based platforms miss the <span className="text-amber-400 font-bold">human connection</span>. Voice adds what text can't:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          { title: "Tone & Emotion", desc: "Hear the real meaning behind words" },
                          { title: "Authenticity", desc: "Less editing, more genuine expression" },
                          { title: "Speed", desc: "Speak faster than typing long posts" },
                          { title: "Accessibility", desc: "Easier for those who struggle with typing" }
                        ].map((item) => (
                          <div key={item.title} className="p-3 rounded-lg bg-amber-950/30 border border-amber-800/20">
                            <p className="text-xs font-bold text-white mb-1">{item.title}</p>
                            <p className="text-xs text-gray-300">{item.desc}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Key Features Section */}
            {activeSection === "features" && loadedSections.has("features") && (
              <div className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                {/* Hero Header */}
                <div className="relative">
                  <div className="absolute -top-2 -left-2 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                        <Sparkles className="h-7 w-7 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-3xl lg:text-4xl font-black text-white dark:text-white leading-tight">
                          Key <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Features</span>
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">Everything you need to express yourself</p>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Quick Feature Pills */}
              <div className="flex flex-wrap gap-2 pt-2">
                {[
                    { icon: MessageCircle, title: "Voice Replies", color: "red" },
                    { icon: Repeat2, title: "Remixes", color: "amber" },
                    { icon: Users, title: "Communities", color: "red" },
                    { icon: Radio, title: "Live Rooms", color: "amber" },
                    { icon: Bookmark, title: "Collections", color: "red" },
                    { icon: TrendingUp, title: "Trending", color: "amber" },
                    { icon: Search, title: "Voice Search", color: "red" },
                    { icon: Globe, title: "Offline Mode", color: "amber" },
                ].map((feature) => (
                  <div
                    key={feature.title}
                      className={`group inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-br ${
                        feature.color === "red" 
                          ? "from-red-950/40 to-red-900/30 border-red-800/30 hover:border-red-600/50" 
                          : "from-amber-950/40 to-amber-900/30 border-amber-800/30 hover:border-amber-600/50"
                      } border transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 cursor-default`}
                    >
                      <feature.icon className={`h-4 w-4 ${
                        feature.color === "red" ? "text-red-400" : "text-amber-400"
                      } group-hover:scale-110 transition-transform`} />
                      <span className="text-xs font-bold text-white">{feature.title}</span>
                  </div>
                ))}
              </div>

                {/* Main Feature Cards */}
                <div className="grid gap-5 sm:grid-cols-3 pt-2">
              {[
                { 
                  icon: Mic, 
                  title: "Anonymous & Raw",
                  description: "Speak freely—your identity stays hidden. No photos, no faces, no real names, no personal info. Just an emoji avatar and your voice.",
                  iconBg: "from-amber-900/50 to-amber-800/50 dark:from-amber-900/40 dark:to-amber-800/40",
                  iconColor: "text-amber-400 dark:text-amber-400",
                      borderColor: "border-amber-800/30",
                      hoverBorder: "hover:border-amber-600/50",
                      shadow: "hover:shadow-amber-500/20",
                      bgGradient: "from-amber-950/40 to-amber-900/30"
                },
                { 
                  icon: Headphones, 
                  title: "30-Second Clips",
                      description: "Quick hits. Record your thoughts in under 30 seconds. Podcast mode available for longer content up to 10 minutes.",
                  iconBg: "from-red-900/50 to-red-800/50 dark:from-red-900/40 dark:to-red-800/40",
                  iconColor: "text-red-400 dark:text-red-400",
                      borderColor: "border-red-800/30",
                      hoverBorder: "hover:border-red-600/50",
                      shadow: "hover:shadow-red-500/20",
                      bgGradient: "from-red-950/40 to-red-900/30"
                },
                { 
                  icon: Users, 
                  title: "Real Community",
                  description: "Communities, live rooms, series, collections. AI filters the noise. Real voices, real conversations, real connections.",
                  iconBg: "from-amber-800/50 to-red-800/50 dark:from-amber-800/40 dark:to-red-800/40",
                  iconColor: "text-amber-400 dark:text-amber-400",
                      borderColor: "border-red-800/30",
                      hoverBorder: "hover:border-red-600/50",
                      shadow: "hover:shadow-red-500/20",
                      bgGradient: "from-red-950/40 via-amber-950/40 to-red-900/30"
                },
                  ].map(({ icon: Icon, title, description, iconBg, iconColor, borderColor, hoverBorder, shadow, bgGradient }) => (
                <div
                  key={title}
                      className={`group relative overflow-hidden flex flex-col gap-4 rounded-xl bg-gradient-to-br ${bgGradient} dark:from-red-950/30 dark:to-amber-950/30 p-5 border ${borderColor} ${hoverBorder} transition-all duration-300 hover:shadow-lg ${shadow} hover:-translate-y-1`}
                >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-red-500/10 transition-colors" />
                      <div className="relative">
                        <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${iconBg} ${iconColor} shadow-lg mb-3 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                    <Icon className="h-7 w-7" />
                        </div>
                        <h4 className="font-black text-white dark:text-white mb-2 text-lg">{title}</h4>
                        <p className="text-sm text-gray-300 dark:text-gray-300 leading-relaxed font-medium">{description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Additional Feature Highlights */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                  {[
                    { icon: Radio, title: "Live Rooms", desc: "Real-time voice conversations" },
                    { icon: Bookmark, title: "Collections", desc: "Save and organize clips" },
                    { icon: Search, title: "Voice Search", desc: "Find by what people said" },
                    { icon: Globe, title: "Offline Mode", desc: "Listen anywhere, anytime" },
                  ].map((feature) => (
                    <div
                      key={feature.title}
                      className="group p-4 rounded-xl bg-gradient-to-br from-red-950/30 to-amber-950/30 border border-red-800/30 hover:border-red-600/50 transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                    >
                      <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-red-600/30 to-amber-600/20 mb-2 group-hover:scale-110 transition-transform">
                        <feature.icon className="h-5 w-5 text-red-400" />
                      </div>
                      <p className="text-xs font-bold text-white mb-1">{feature.title}</p>
                      <p className="text-xs text-gray-300 leading-tight">{feature.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Example Handles Section */}
            {activeSection === "examples" && loadedSections.has("examples") && (
              <div className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                {/* Hero Header */}
                <div className="relative">
                  <div className="absolute -top-2 -left-2 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                        <Users className="h-7 w-7 text-red-400" />
                  </div>
                  <div>
                        <h3 className="text-3xl lg:text-4xl font-black text-white dark:text-white leading-tight">
                          Get <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Inspired</span>
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">Popular handles from the community</p>
                  </div>
                </div>
                  </div>
                </div>

                {/* Description */}
                <div className="rounded-xl bg-gradient-to-br from-red-950/30 via-amber-950/30 to-red-950/30 dark:from-red-950/25 dark:via-amber-950/25 dark:to-red-950/25 p-4 border border-red-800/30">
                  <p className="text-sm text-gray-200 leading-relaxed">
                    <span className="text-red-400 font-bold">Click any handle</span> to use it as a template for your own. Mix and match adjectives and nouns to create something unique!
                  </p>
                </div>

                {/* Handle Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { handle: "DeepVoice42", avatar: 'avatar1' as AvatarType, tag: "Popular" },
                    { handle: "SmoothEcho89", avatar: 'avatar2' as AvatarType, tag: "Trending" },
                    { handle: "RawTone23", avatar: 'avatar3' as AvatarType, tag: "New" },
                    { handle: "CoolWave56", avatar: 'avatar4' as AvatarType, tag: "Popular" },
                    { handle: "CrispSignal12", avatar: 'avatar5' as AvatarType, tag: "Trending" },
                    { handle: "WarmBeat78", avatar: 'avatar6' as AvatarType, tag: "New" },
                  ].map((example) => (
                    <button
                      key={example.handle}
                      type="button"
                      onClick={() => {
                        setHandle(example.handle);
                        setSelectedAvatar(example.avatar);
                      }}
                      className="group relative overflow-hidden flex flex-col items-center gap-3 rounded-xl bg-gradient-to-br from-red-950/40 to-amber-950/40 dark:from-red-950/30 dark:to-amber-950/30 p-5 border border-red-800/30 hover:border-red-600/50 transition-all duration-300 hover:shadow-xl hover:shadow-red-500/30 hover:-translate-y-2"
                    >
                      <div className="absolute top-0 right-0 w-24 h-24 bg-red-500/5 rounded-full blur-2xl -mr-12 -mt-12 group-hover:bg-red-500/10 transition-colors" />
                      <div className="absolute top-2 right-2">
                        <Badge className={`text-[10px] px-2 py-0.5 ${
                          example.tag === "Popular" 
                            ? "bg-red-600/30 text-red-300 border-red-500/30" 
                            : example.tag === "Trending"
                            ? "bg-amber-600/30 text-amber-300 border-amber-500/30"
                            : "bg-gray-600/30 text-gray-300 border-gray-500/30"
                        } border font-bold`}>
                          {example.tag}
                        </Badge>
                      </div>
                      <div className="relative">
                        <div className="relative">
                          <AvatarIcon 
                            type={example.avatar}
                            className="w-16 h-16 group-hover:scale-110 transition-transform duration-300"
                          />
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-gradient-to-br from-red-500 to-amber-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-lg">
                            <ArrowRight className="h-3.5 w-3.5 text-white" />
                          </div>
                        </div>
                      </div>
                      <div className="text-center">
                        <span className="text-sm font-black text-white group-hover:text-red-400 transition-colors">
                          @{example.handle}
                        </span>
                        <p className="text-xs text-gray-400 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          Click to use
                        </p>
                      </div>
                    </button>
              ))}
            </div>

                {/* Tips */}
                <div className="rounded-xl bg-gradient-to-br from-amber-950/30 to-red-950/30 dark:from-amber-950/25 dark:to-red-950/25 p-5 border border-amber-800/30">
                  <h4 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-amber-400" />
                    Pro Tips
                  </h4>
                  <ul className="space-y-2 text-xs text-gray-300">
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 mt-1 font-bold">•</span>
                      <span>Combine adjectives (Deep, Smooth, Raw) with nouns (Voice, Echo, Tone)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 mt-1 font-bold">•</span>
                      <span>Add numbers for uniqueness (42, 89, 23)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-amber-400 mt-1 font-bold">•</span>
                      <span>Keep it under 20 characters and make it memorable</span>
                    </li>
                  </ul>
                </div>
              </div>
            )}

            {/* About Us Section */}
            {activeSection === "about" && loadedSections.has("about") && (
              <div className="space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                {/* Header */}
                <div className="relative">
                  <div className="absolute -top-2 -left-2 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                        <BookOpen className="h-7 w-7 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-3xl lg:text-4xl font-black text-white dark:text-white leading-tight">
                          About <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Vocalix</span>
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">Our mission and vision</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* About the Creator */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-950/40 via-amber-950/30 to-red-950/40 dark:from-red-950/30 dark:via-amber-950/25 dark:to-red-950/30 p-8 border border-red-800/30 shadow-xl hover:shadow-2xl hover:shadow-red-500/10 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -mr-32 -mt-32 animate-pulse" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -ml-32 -mb-32 animate-pulse" style={{ animationDelay: '1s' }} />
                  <div className="relative space-y-5">
                    <div className="flex items-start gap-4">
                      <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-600/30 to-amber-600/30 border-2 border-red-500/40 shadow-lg shadow-red-500/20">
                        <Users className="h-8 w-8 text-red-300" />
                      </div>
                      <div className="flex-1">
                        <h4 className="text-2xl font-black text-white mb-2 bg-gradient-to-r from-red-300 to-amber-300 bg-clip-text text-transparent">
                          👋 Hey, I'm Melvin
                        </h4>
                        <div className="flex flex-wrap items-center gap-2 mb-3">
                          <Badge className="bg-red-900/40 border-red-700/50 text-red-200 text-xs px-2 py-0.5">Full-Stack Developer</Badge>
                          <Badge className="bg-amber-900/40 border-amber-700/50 text-amber-200 text-xs px-2 py-0.5">AI Integrator</Badge>
                          <Badge className="bg-red-900/40 border-red-700/50 text-red-200 text-xs px-2 py-0.5">Builder</Badge>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-3 pl-20">
                      <p className="text-base text-gray-200 dark:text-gray-200 leading-relaxed">
                        I'm a solo developer who codes with <span className="text-red-400 font-bold">vision, vibes, and velocity</span>. Whether it's shipping SaaS tools, crafting AI-powered apps, or building platforms like Vocalix — I build fast, break limits, and learn even faster.
                      </p>
                      <div className="rounded-lg bg-gradient-to-r from-red-950/50 to-amber-950/50 p-4 border border-red-800/30">
                        <p className="text-sm text-gray-200 leading-relaxed">
                          <span className="text-amber-400 font-bold">🧠 Vibe Coding</span> — I architect apps using AI as my co-pilot. It's not just coding — it's orchestration. Vocalix embodies this philosophy: <span className="text-red-300 font-semibold">voice is the most authentic form of expression</span>, and anonymity empowers authenticity.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mission Statement */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-950/40 via-amber-950/30 to-red-950/40 dark:from-red-950/30 dark:via-amber-950/25 dark:to-red-950/30 p-8 border border-red-800/30 shadow-xl hover:shadow-2xl hover:shadow-red-500/10 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-red-500/5 rounded-full blur-3xl -mr-32 -mt-32" />
                  <div className="absolute bottom-0 left-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -ml-32 -mb-32" />
                  <div className="relative space-y-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-red-600/30 to-red-500/20 border border-red-500/40">
                        <Radio className="h-6 w-6 text-red-400" />
                      </div>
                      <h4 className="text-2xl font-black text-white">Our Mission</h4>
                    </div>
                    <div className="space-y-4 pl-16">
                      <p className="text-base text-gray-200 dark:text-gray-200 leading-relaxed">
                        Vocalix was born from a simple belief: <span className="text-red-400 font-bold text-lg">voice is the most authentic form of expression</span>. In a world saturated with filtered images and curated feeds, we're building a space where raw, unfiltered voice takes center stage.
                      </p>
                      <div className="rounded-lg bg-gradient-to-r from-amber-950/40 to-red-950/40 p-4 border border-amber-800/30">
                        <p className="text-sm text-gray-200 leading-relaxed">
                          We're creating an underground platform where <span className="text-amber-400 font-semibold">anonymity empowers authenticity</span>. No photos, no faces, no judgment—just your voice, your thoughts, and real connections built on what you say, not how you look.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Values */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-950/30 to-red-900/20 dark:from-red-950/25 dark:to-red-900/15 p-5 border border-red-800/30 hover:border-red-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-red-600/30 to-red-500/20 mb-3 group-hover:scale-110 transition-transform">
                        <Shield className="h-6 w-6 text-red-400" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-2">Privacy First</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">We believe privacy is a fundamental right. No email required, no personal data collected, no tracking. Your voice, your choice, your anonymity.</p>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-950/30 to-amber-900/20 dark:from-amber-950/25 dark:to-amber-900/15 p-5 border border-amber-800/30 hover:border-amber-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />
                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-amber-600/30 to-amber-500/20 mb-3 group-hover:scale-110 transition-transform">
                        <Mic className="h-6 w-6 text-amber-400" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-2">Voice-First</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">Audio is everything. We're building tools and features that celebrate voice—from 30-second clips to 10-minute podcasts, voice reactions to live rooms.</p>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-950/30 via-amber-950/30 to-red-900/20 dark:from-red-950/25 dark:via-amber-950/25 dark:to-red-900/15 p-5 border border-red-800/30 hover:border-red-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-red-600/30 to-amber-600/20 mb-3 group-hover:scale-110 transition-transform">
                        <Users className="h-6 w-6 text-red-400" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-2">Community Driven</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">This platform belongs to the community. We listen, we adapt, we build features that matter to you. Your voice shapes Vocalix.</p>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-950/30 to-red-950/30 dark:from-amber-950/25 dark:to-red-950/25 p-5 border border-amber-800/30 hover:border-amber-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />
                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-gradient-to-br from-amber-600/30 to-red-600/20 mb-3 group-hover:scale-110 transition-transform">
                        <Sparkles className="h-6 w-6 text-amber-400" />
                      </div>
                      <h4 className="text-base font-bold text-white mb-2">No BS, No Filters</h4>
                      <p className="text-xs text-gray-300 leading-relaxed">Authenticity over algorithms. Real conversations over engagement metrics. We use AI to keep it civil, not to manipulate what you see.</p>
                    </div>
                  </div>
                </div>

                {/* Vision */}
                <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-red-950/30 via-amber-950/30 to-red-950/30 dark:from-red-950/25 dark:via-amber-950/25 dark:to-red-950/25 p-8 border border-red-800/30 shadow-xl hover:shadow-2xl hover:shadow-amber-500/10 transition-all duration-300">
                  <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/5 rounded-full blur-3xl -mr-24 -mt-24" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600/30 to-amber-500/20 border border-amber-500/40">
                        <Globe className="h-6 w-6 text-amber-400" />
                      </div>
                      <h4 className="text-2xl font-black text-white">Our Vision</h4>
                    </div>
                    <div className="space-y-4 pl-16">
                      <p className="text-base text-gray-200 dark:text-gray-200 leading-relaxed">
                        We envision a future where <span className="text-amber-400 font-bold">voice-first platforms become the norm</span> for authentic online expression. Where people connect through what they say, not what they look like. Where anonymity enables honesty, and where communities form around shared ideas, not curated images.
                      </p>
                      <div className="rounded-lg bg-gradient-to-r from-red-950/50 to-amber-950/50 p-4 border border-red-800/30">
                        <p className="text-sm text-gray-200 leading-relaxed font-medium">
                          Vocalix is more than a platform—it's a movement toward <span className="text-red-300 font-bold">authentic, voice-driven communication</span> in a world that's forgotten how to listen.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tech Stack & Connect */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-red-950/30 to-red-900/20 dark:from-red-950/25 dark:to-red-900/15 p-6 border border-red-800/30 hover:border-red-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-red-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-red-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-red-500/10 transition-colors" />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-red-600/30 to-red-500/20 border border-red-500/40">
                          <Zap className="h-5 w-5 text-red-400" />
                        </div>
                        <h4 className="text-lg font-bold text-white">Built With</h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {['React', 'Vite', 'Supabase', 'TypeScript', 'Tailwind', 'Node.js', 'Firebase', 'AI'].map((tech) => (
                          <Badge key={tech} className="bg-red-900/40 border-red-700/50 text-red-200 text-xs px-2 py-1">
                            {tech}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-xl bg-gradient-to-br from-amber-950/30 to-amber-900/20 dark:from-amber-950/25 dark:to-amber-900/15 p-6 border border-amber-800/30 hover:border-amber-600/50 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/20 hover:-translate-y-1">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-amber-500/10 transition-colors" />
                    <div className="relative">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-amber-600/30 to-amber-500/20 border border-amber-500/40">
                          <Link2 className="h-5 w-5 text-amber-400" />
                        </div>
                        <h4 className="text-lg font-bold text-white">Let's Connect</h4>
                      </div>
                      <div className="space-y-3">
                        <a href="https://melvinworks.netlify.app" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200 transition-colors group/link">
                          <Globe className="h-4 w-4" />
                          <span className="underline group-hover/link:no-underline">Portfolio</span>
                          <ArrowRight className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        </a>
                        <a href="https://melhub.netlify.app" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-amber-300 hover:text-amber-200 transition-colors group/link">
                          <Link2 className="h-4 w-4" />
                          <span className="underline group-hover/link:no-underline">Socials Hub</span>
                          <ArrowRight className="h-3 w-3 opacity-0 group-hover/link:opacity-100 transition-opacity" />
                        </a>
                        <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-amber-800/30">
                          Always open to collabs, freelancing, or just a good dev chat.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* FAQ Section */}
            {activeSection === "faq" && loadedSections.has("faq") && (
              <div className="space-y-4 animate-in fade-in-0 slide-in-from-right-4 duration-300 relative z-10" style={{ pointerEvents: 'auto' }}>
                {/* Enhanced Header */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                    <MessageCircle className="h-5 w-5 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-white">
                      Frequently Asked Questions
                    </h3>
                    <p className="text-xs text-gray-400">Quick answers to common questions</p>
                  </div>
                </div>

                <div className="rounded-xl bg-gradient-to-br from-red-950/30 via-amber-950/30 to-red-950/30 dark:from-red-950/25 dark:via-amber-950/25 dark:to-red-950/25 border border-red-800/30 overflow-hidden shadow-xl relative z-10">
                  {/* Quick Questions Grid */}
                  <div className="p-4 relative z-10" style={{ pointerEvents: 'auto' }}>
                    <div className="grid grid-cols-2 gap-2.5 mb-3">
                      <div 
                        role="button"
                        tabIndex={0}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[FAQ] Clicked anonymous');
                          setFaqId("anonymous");
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[FAQ] Touched anonymous');
                          setFaqId("anonymous");
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-red-900/30 border border-red-700/30 hover:border-red-500/50 transition-all cursor-pointer group relative z-10"
                        style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
                      >
                        <Shield className="h-4 w-4 text-red-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        <div>
                          <p className="text-[10px] font-semibold text-white">Anonymous?</p>
                          <p className="text-[9px] text-gray-400">No email needed</p>
                        </div>
                      </div>
                      <div 
                        role="button"
                        tabIndex={0}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[FAQ] Clicked clip-length');
                          setFaqId("clip-length");
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[FAQ] Touched clip-length');
                          setFaqId("clip-length");
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-900/30 border border-amber-700/30 hover:border-amber-500/50 transition-all cursor-pointer group relative z-10"
                        style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
                      >
                        <Headphones className="h-4 w-4 text-amber-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        <div>
                          <p className="text-[10px] font-semibold text-white">Clip Length?</p>
                          <p className="text-[9px] text-gray-400">30s or 10min</p>
                        </div>
                      </div>
                      <div 
                        role="button"
                        tabIndex={0}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[FAQ] Clicked how-to-record');
                          setFaqId("how-to-record");
                        }}
                        onTouchStart={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          console.log('[FAQ] Touched how-to-record');
                          setFaqId("how-to-record");
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-red-900/30 border border-red-700/30 hover:border-red-500/50 transition-all cursor-pointer group relative z-10"
                        style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
                      >
                        <Mic className="h-4 w-4 text-red-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        <div>
                          <p className="text-[10px] font-semibold text-white">How to Record?</p>
                          <p className="text-[9px] text-gray-400">Tap & hold mic</p>
                        </div>
                      </div>
                      <div 
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setFaqId("live-rooms");
                        }}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-900/30 border border-amber-700/30 hover:border-amber-500/50 transition-all cursor-pointer group relative z-10"
                        style={{ pointerEvents: 'auto' }}
                      >
                        <Radio className="h-4 w-4 text-amber-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                        <div>
                          <p className="text-[10px] font-semibold text-white">Live Rooms?</p>
                          <p className="text-[9px] text-gray-400">Real-time audio</p>
                        </div>
                      </div>
                    </div>
                    
                    
                    {/* Popular Questions */}
                    <div className="space-y-2 mb-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Popular Questions</p>
                      <div className="space-y-1.5">
                        <div 
                          role="button"
                          tabIndex={0}
                          className="flex items-center gap-2 p-2 rounded-md bg-red-900/20 border border-red-700/20 hover:bg-red-900/30 transition-colors cursor-pointer group relative z-10" 
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[FAQ] Clicked account');
                            setFaqId("account");
                          }}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[FAQ] Touched account');
                            setFaqId("account");
                          }}
                          style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
                        >
                          <ChevronRight className="h-3 w-3 text-red-400 group-hover:translate-x-0.5 transition-transform" />
                          <span className="text-[10px] text-gray-300 group-hover:text-white">Can I delete my account?</span>
                        </div>
                        <div 
                          className="flex items-center gap-2 p-2 rounded-md bg-amber-900/20 border border-amber-700/20 hover:bg-amber-900/30 transition-colors cursor-pointer group relative z-10" 
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFaqId("privacy");
                          }}
                        >
                          <ChevronRight className="h-3 w-3 text-amber-400 group-hover:translate-x-0.5 transition-transform" />
                          <span className="text-[10px] text-gray-300 group-hover:text-white">Is it really anonymous?</span>
                        </div>
                        <div 
                          role="button"
                          tabIndex={0}
                          className="flex items-center gap-2 p-2 rounded-md bg-red-900/20 border border-red-700/20 hover:bg-red-900/30 transition-colors cursor-pointer group relative z-10" 
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[FAQ] Clicked clips');
                            setFaqId("clips");
                          }}
                          onTouchStart={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            console.log('[FAQ] Touched clips');
                            setFaqId("clips");
                          }}
                          style={{ pointerEvents: 'auto', touchAction: 'manipulation' }}
                        >
                          <ChevronRight className="h-3 w-3 text-red-400 group-hover:translate-x-0.5 transition-transform" />
                          <span className="text-[10px] text-gray-300 group-hover:text-white">How long are clips?</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-red-800/30">
                      <Button
                        onClick={() => navigate("/faq")}
                        className="w-full h-8 text-xs bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white font-semibold"
                      >
                        <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
                        View All 50+ Questions
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Get Started Section - Shows the form */}
            {activeSection === "get-started" && loadedSections.has("get-started") && (
              <div className="w-full max-w-md mx-auto space-y-6 animate-in fade-in-0 slide-in-from-right-4 duration-300">
                {/* Get Started Header */}
                <div className="relative">
                  <div className="absolute -top-2 -left-2 w-24 h-24 bg-red-500/10 rounded-full blur-2xl animate-pulse" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                        <ArrowRight className="h-7 w-7 text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-3xl lg:text-4xl font-black text-white dark:text-white leading-tight">
                          Get <span className="bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">Started</span>
                        </h3>
                        <p className="text-sm text-gray-400 mt-1">Create your identity</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </div>
            </div>
          </div>

          {/* Right side - Clean modern form - Only show on Get Started section */}
          {activeSection === "get-started" && (
            <Card className="w-full lg:w-96 lg:flex-shrink-0 mx-auto lg:mx-0 lg:sticky lg:top-4 shadow-2xl bg-gradient-to-br from-slate-900/95 via-slate-800/90 to-slate-900/95 dark:from-slate-950/95 dark:via-slate-900/90 dark:to-slate-950/95 border border-slate-700/50 dark:border-slate-800/50 relative overflow-hidden transition-all duration-300 flex flex-col lg:max-h-[calc(100vh-40px)]">

            <CardHeader className="text-center pb-4 relative z-10 px-6 pt-6 flex-shrink-0 border-b border-slate-700/30 dark:border-slate-800/30">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-red-500/20 via-amber-500/20 to-red-500/20 dark:from-red-500/10 dark:via-amber-500/10 dark:to-red-500/10 mb-4 ring-1 ring-slate-700/50 dark:ring-slate-800/50">
                <AvatarIcon 
                  type={selectedAvatar} 
                  className="w-16 h-16"
                  imageUrl={avatarImages.get(selectedAvatar)}
                />
              </div>
              <CardTitle className="text-2xl font-bold text-white dark:text-white mb-2">
                Create Your Identity
              </CardTitle>
              <p className="text-sm text-slate-400 dark:text-slate-500">
                Choose your avatar and handle
              </p>
            </CardHeader>

            <CardContent className="space-y-6 relative z-10 flex-1 overflow-y-auto min-h-0 px-6 py-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              {/* Avatar Selection */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-white dark:text-white">
                  Avatar
                </label>
                <div className="grid grid-cols-6 gap-2 p-3 rounded-xl bg-slate-800/50 dark:bg-slate-900/50 border border-slate-700/30 dark:border-slate-800/30 max-h-48 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {AVATAR_TYPES.map((avatarType, index) => {
                    const isActive = selectedAvatar === avatarType;
                    return (
                      <button
                        key={avatarType}
                        type="button"
                        onClick={() => setSelectedAvatar(avatarType)}
                        className={`flex h-12 w-full items-center justify-center rounded-lg transition-all duration-200 ${
                          isActive
                            ? "ring-2 ring-red-500/50 ring-offset-2 ring-offset-slate-800 dark:ring-offset-slate-900 scale-105"
                            : "hover:ring-1 hover:ring-slate-600/50 dark:hover:ring-slate-700/50 hover:scale-105 active:scale-95"
                        }`}
                        style={{ animationDelay: `${index * 30}ms` }}
                        title={`Avatar ${index + 1}`}
                      >
                        {avatarsLoading && index < 8 ? (
                          <div className="w-10 h-10 rounded-full bg-slate-700 animate-pulse" />
                        ) : (
                          <AvatarIcon 
                            type={avatarType} 
                            className={`w-10 h-10 transition-transform duration-200 ${isActive ? 'scale-110' : ''}`}
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
                <label className="text-sm font-semibold text-white dark:text-white">
                  Handle
                </label>
                <div className="relative flex gap-2">
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="DeepVoice42"
                    maxLength={20}
                    className="h-12 text-center text-base font-medium tracking-wide border border-slate-700/50 dark:border-slate-800/50 focus:border-red-500 dark:focus:border-red-500 focus:ring-2 focus:ring-red-500/20 bg-slate-800/50 dark:bg-slate-900/50 text-white dark:text-white transition-all duration-200"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setHandle(generateHandle());
                    }}
                    className="h-12 w-12 shrink-0 border border-slate-700/50 dark:border-slate-800/50 hover:bg-slate-700/50 dark:hover:bg-slate-800/50 hover:border-red-500 dark:hover:border-red-500 transition-all"
                    title="Generate random handle"
                  >
                    <Wand2 className="h-4 w-4 text-red-400 dark:text-red-400" />
                  </Button>
                </div>
                <div className="flex items-center justify-end">
                  <span className={`text-xs font-medium transition-colors duration-200 ${
                    handle.length > 18 
                      ? 'text-red-400 dark:text-red-400' 
                      : handle.length > 15 
                      ? 'text-amber-400 dark:text-amber-400'
                      : 'text-slate-400 dark:text-slate-500'
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

            <CardFooter className="flex flex-col gap-3 pt-4 px-6 pb-6 flex-shrink-0 border-t border-slate-700/30 dark:border-slate-800/30">
              {/* Ready indicator */}
              {handle.trim() && selectedAvatar && (recaptchaToken || !RECAPTCHA_SITE_KEY) && !isLoading && (
                <div className="flex items-center justify-center gap-2 text-xs text-amber-400 dark:text-amber-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="font-medium">Ready to create</span>
                </div>
              )}
              
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !handle.trim() || !deviceId}
                className={`w-full h-12 text-sm font-semibold bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-700 hover:to-amber-700 text-white shadow-lg hover:shadow-xl hover:shadow-red-500/20 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed group relative overflow-hidden ${
                  handle.trim() && selectedAvatar && (recaptchaToken || !RECAPTCHA_SITE_KEY) && !isLoading 
                    ? 'ring-2 ring-red-500/50 ring-offset-2 ring-offset-slate-800 dark:ring-offset-slate-900' 
                    : ''
                }`}
                size="lg"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2 relative z-10">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Creating...</span>
                  </span>
                ) : (
                  <span className="flex items-center gap-2 relative z-10">
                    <span>Enter The Chamber</span>
                    <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
                  </span>
                )}
              </Button>
              <p className="text-xs text-center text-slate-400 dark:text-slate-500 leading-relaxed">
                By continuing, you agree to keep it real and respectful
              </p>
            </CardFooter>
            </Card>
          )}
        </div>
      </div>
      {/* Mobile Footer - Small footer at bottom */}
      <footer className="md:hidden bg-gradient-to-b from-transparent via-slate-950/90 to-slate-950/95 backdrop-blur-sm border-t border-red-800/20">
        <div className="px-4 py-2">
          <div className="flex items-center justify-center gap-2 flex-wrap">
        <Link
          to="/privacy"
              className="text-[9px] text-gray-400/70 dark:text-gray-500/70 hover:text-red-400 dark:hover:text-red-400 transition-colors"
        >
              Privacy
        </Link>
            <span className="text-[9px] text-gray-500/40">•</span>
        <Link
          to="/terms"
              className="text-[9px] text-gray-400/70 dark:text-gray-500/70 hover:text-red-400 dark:hover:text-red-400 transition-colors"
        >
              Terms
        </Link>
            <span className="text-[9px] text-gray-500/40">•</span>
        <Link
          to="/cookies"
              className="text-[9px] text-gray-400/70 dark:text-gray-500/70 hover:text-red-400 dark:hover:text-red-400 transition-colors"
            >
              Cookies
            </Link>
            <span className="text-[9px] text-gray-500/40">•</span>
            <Link
              to="/faq"
              className="text-[9px] text-gray-400/70 dark:text-gray-500/70 hover:text-red-400 dark:hover:text-red-400 transition-colors"
            >
              FAQ
        </Link>
            <span className="text-[9px] text-gray-500/40">•</span>
            <Link
              to="/docs"
              className="text-[9px] text-gray-400/70 dark:text-gray-500/70 hover:text-red-400 dark:hover:text-red-400 transition-colors"
            >
              Docs
        </Link>
      </div>
        </div>
      </footer>

      {/* Desktop Footer - Small, Sleek */}
      <footer className="hidden md:flex fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-b from-transparent via-slate-950/80 to-slate-950/95 backdrop-blur-sm border-t border-red-800/20">
        <div className="max-w-7xl mx-auto w-full px-6 py-2.5">
          <div className="flex items-center justify-between">
            {/* Logo & Name */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-6 h-6 rounded-md bg-gradient-to-br from-red-600/20 to-amber-600/20 border border-red-500/30">
                <MessageCircle className="h-3.5 w-3.5 text-red-400" />
              </div>
              <span className="text-xs font-semibold bg-gradient-to-r from-red-400 to-amber-400 bg-clip-text text-transparent">
                Vocalix
              </span>
            </div>
            
            {/* Doc Links */}
            <div className="flex items-center gap-2 text-[10px] text-gray-400/70">
              <Link
                to="/faq"
                className="hover:text-red-400 transition-colors"
              >
                FAQ
              </Link>
              <span className="text-gray-500/40">•</span>
              <Link
                to="/privacy"
                className="hover:text-red-400 transition-colors"
              >
                Privacy
              </Link>
              <span className="text-gray-500/40">•</span>
              <Link
                to="/terms"
                className="hover:text-red-400 transition-colors"
              >
                Terms
              </Link>
              <span className="text-gray-500/40">•</span>
              <Link
                to="/cookies"
                className="hover:text-red-400 transition-colors"
              >
                Cookies
              </Link>
              <span className="text-gray-500/40">•</span>
              <Link
                to="/content-policy"
                className="hover:text-red-400 transition-colors"
              >
                Content
              </Link>
              <span className="text-gray-500/40">•</span>
              <Link
                to="/dmca"
                className="hover:text-red-400 transition-colors"
              >
                DMCA
              </Link>
            </div>
          </div>
        </div>
      </footer>

      <FAQAnswerDialog
        faqId={faqId}
        onClose={handleFAQClose}
      />
    </div>
    );
  } catch (error: any) {
    // CRITICAL: If anything crashes, show a simple fallback onboarding
    console.error("[OnboardingFlow] Render error, showing fallback:", error);
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <h1 className="text-3xl font-bold text-amber-400 dark:text-amber-400">Welcome to Vocalix</h1>
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
