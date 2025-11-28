import { useState, useRef, useEffect } from "react";
import { Wand2, CheckCircle2, Mic, Radio, Headphones, Speaker, Volume2, RadioIcon, Zap, Music, Sparkles, ArrowRight, Loader2 } from "lucide-react";
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

// Audio/speakeasy-themed SVG avatar types
type AvatarType = 'mic' | 'speaker' | 'headphones' | 'radio' | 'vinyl' | 'amp' | 'reverb' | 'echo' | 'static' | 'waveform' | 'mixer' | 'booth';

// Map avatar types to emojis for display
const AVATAR_TYPE_TO_EMOJI: Record<AvatarType, string> = {
  mic: '🎤',
  speaker: '🔊',
  headphones: '🎧',
  radio: '📻',
  vinyl: '💿',
  amp: '🎸',
  reverb: '🌊',
  echo: '📡',
  static: '📺',
  waveform: '〰️',
  mixer: '🎛️',
  booth: '🎪',
};

const AVATAR_TYPES: AvatarType[] = [
  'mic', 'speaker', 'headphones', 'radio', 'vinyl', 'amp', 
  'reverb', 'echo', 'static', 'waveform', 'mixer', 'booth'
];

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

// Sophisticated gradient-based avatar system with icons
// Each avatar has a unique color gradient and icon combination
type AvatarConfig = {
  icon: React.ComponentType<{ className?: string }>;
  gradientClasses: string;
  emoji: string;
};

const AVATAR_CONFIGS: Record<AvatarType, AvatarConfig> = {
  mic: {
    icon: Mic,
    gradientClasses: 'bg-gradient-to-br from-amber-600 to-red-600 dark:from-amber-500 dark:to-red-500',
    emoji: '🎤',
  },
  speaker: {
    icon: Speaker,
    gradientClasses: 'bg-gradient-to-br from-slate-600 to-slate-800 dark:from-slate-500 dark:to-slate-700',
    emoji: '🔊',
  },
  headphones: {
    icon: Headphones,
    gradientClasses: 'bg-gradient-to-br from-purple-600 to-indigo-600 dark:from-purple-500 dark:to-indigo-500',
    emoji: '🎧',
  },
  radio: {
    icon: Radio,
    gradientClasses: 'bg-gradient-to-br from-amber-700 to-orange-700 dark:from-amber-600 dark:to-orange-600',
    emoji: '📻',
  },
  vinyl: {
    icon: Music,
    gradientClasses: 'bg-gradient-to-br from-gray-700 to-gray-900 dark:from-gray-600 dark:to-gray-800',
    emoji: '💿',
  },
  amp: {
    icon: Zap,
    gradientClasses: 'bg-gradient-to-br from-yellow-600 to-amber-600 dark:from-yellow-500 dark:to-amber-500',
    emoji: '🎸',
  },
  reverb: {
    icon: Volume2,
    gradientClasses: 'bg-gradient-to-br from-blue-600 to-cyan-600 dark:from-blue-500 dark:to-cyan-500',
    emoji: '🌊',
  },
  echo: {
    icon: RadioIcon,
    gradientClasses: 'bg-gradient-to-br from-red-600 to-pink-600 dark:from-red-500 dark:to-pink-500',
    emoji: '📡',
  },
  static: {
    icon: RadioIcon,
    gradientClasses: 'bg-gradient-to-br from-gray-600 to-slate-700 dark:from-gray-500 dark:to-slate-600',
    emoji: '📺',
  },
  waveform: {
    icon: Music,
    gradientClasses: 'bg-gradient-to-br from-emerald-600 to-teal-600 dark:from-emerald-500 dark:to-teal-500',
    emoji: '〰️',
  },
  mixer: {
    icon: Radio,
    gradientClasses: 'bg-gradient-to-br from-violet-600 to-purple-600 dark:from-violet-500 dark:to-purple-500',
    emoji: '🎛️',
  },
  booth: {
    icon: Mic,
    gradientClasses: 'bg-gradient-to-br from-rose-600 to-red-600 dark:from-rose-500 dark:to-red-500',
    emoji: '🎪',
  },
};

const AvatarFlower = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="flowerCenter" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <linearGradient id="petalGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f472b6" />
        <stop offset="100%" stopColor="#ec4899" />
      </linearGradient>
    </defs>
    <circle cx="50" cy="50" r="10" fill="url(#flowerCenter)"/>
    <circle cx="50" cy="50" r="8" fill="#fbbf24" opacity="0.8"/>
    <ellipse cx="50" cy="30" rx="8" ry="15" fill="url(#petalGrad)"/>
    <ellipse cx="70" cy="50" rx="15" ry="8" fill="url(#petalGrad)"/>
    <ellipse cx="50" cy="70" rx="8" ry="15" fill="url(#petalGrad)"/>
    <ellipse cx="30" cy="50" rx="15" ry="8" fill="url(#petalGrad)"/>
    <ellipse cx="65" cy="38" rx="8" ry="15" fill="#f472b6" opacity="0.85" transform="rotate(45 65 38)"/>
    <ellipse cx="65" cy="62" rx="8" ry="15" fill="#f472b6" opacity="0.85" transform="rotate(-45 65 62)"/>
    <ellipse cx="35" cy="62" rx="8" ry="15" fill="#f472b6" opacity="0.85" transform="rotate(45 35 62)"/>
    <ellipse cx="35" cy="38" rx="8" ry="15" fill="#f472b6" opacity="0.85" transform="rotate(-45 35 38)"/>
    <circle cx="50" cy="50" r="3" fill="#78350f" opacity="0.6"/>
  </svg>
);

const AvatarTree = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="trunkGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#92400e" />
        <stop offset="100%" stopColor="#78350f" />
      </linearGradient>
      <linearGradient id="foliageGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#16a34a" />
        <stop offset="100%" stopColor="#15803d" />
      </linearGradient>
    </defs>
    <rect x="45" y="60" width="10" height="30" fill="url(#trunkGrad)" rx="1"/>
    <rect x="46" y="60" width="8" height="5" fill="#a16207" opacity="0.5"/>
    <circle cx="50" cy="40" r="25" fill="url(#foliageGrad)"/>
    <circle cx="40" cy="35" r="18" fill="#16a34a" opacity="0.95"/>
    <circle cx="60" cy="35" r="18" fill="#16a34a" opacity="0.95"/>
    <circle cx="50" cy="30" r="12" fill="#22c55e" opacity="0.8"/>
    <circle cx="35" cy="40" r="3" fill="#86efac" opacity="0.5"/>
    <circle cx="65" cy="40" r="3" fill="#86efac" opacity="0.5"/>
    <circle cx="50" cy="25" r="2" fill="#86efac" opacity="0.5"/>
  </svg>
);

const AvatarMountain = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="mountainGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#64748b" />
        <stop offset="100%" stopColor="#475569" />
      </linearGradient>
      <linearGradient id="mountainGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#94a3b8" />
        <stop offset="100%" stopColor="#64748b" />
      </linearGradient>
    </defs>
    <path d="M20 80 L50 20 L80 80 Z" fill="url(#mountainGrad1)"/>
    <path d="M30 80 L50 40 L70 80 Z" fill="url(#mountainGrad2)"/>
    <path d="M20 80 L50 20 L80 80" stroke="#334155" strokeWidth="1" opacity="0.3"/>
    <circle cx="50" cy="25" r="3" fill="#e2e8f0" opacity="0.8"/>
    <path d="M45 30 L50 25 L55 30" stroke="#e2e8f0" strokeWidth="1.5" opacity="0.6"/>
  </svg>
);

const AvatarWave = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="waveGrad1" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#06b6d4" />
        <stop offset="100%" stopColor="#0891b2" />
      </linearGradient>
      <linearGradient id="waveGrad2" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#22d3ee" />
        <stop offset="100%" stopColor="#06b6d4" />
      </linearGradient>
    </defs>
    <path d="M0 50 Q25 30, 50 50 T100 50 L100 80 L0 80 Z" fill="url(#waveGrad1)"/>
    <path d="M0 60 Q25 40, 50 60 T100 60 L100 80 L0 80 Z" fill="url(#waveGrad2)"/>
    <path d="M0 50 Q25 30, 50 50 T100 50" stroke="#0e7490" strokeWidth="1" opacity="0.4"/>
    <circle cx="25" cy="45" r="2" fill="#a5f3fc" opacity="0.6"/>
    <circle cx="75" cy="55" r="2" fill="#a5f3fc" opacity="0.6"/>
    <circle cx="50" cy="48" r="1.5" fill="#a5f3fc" opacity="0.6"/>
  </svg>
);

const AvatarSun = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="sunGrad" cx="50%" cy="50%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="70%" stopColor="#f59e0b" />
        <stop offset="100%" stopColor="#d97706" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="20" fill="url(#sunGrad)"/>
    <circle cx="50" cy="50" r="18" fill="#fbbf24" opacity="0.9"/>
    <rect x="48" y="10" width="4" height="15" fill="#fbbf24" rx="2"/>
    <rect x="48" y="75" width="4" height="15" fill="#fbbf24" rx="2"/>
    <rect x="10" y="48" width="15" height="4" fill="#fbbf24" rx="2"/>
    <rect x="75" y="48" width="15" height="4" fill="#fbbf24" rx="2"/>
    <rect x="65" y="20" width="4" height="12" fill="#fbbf24" rx="2" transform="rotate(45 67 26)"/>
    <rect x="31" y="20" width="4" height="12" fill="#fbbf24" rx="2" transform="rotate(-45 33 26)"/>
    <rect x="65" y="68" width="4" height="12" fill="#fbbf24" rx="2" transform="rotate(-45 67 74)"/>
    <rect x="31" y="68" width="4" height="12" fill="#fbbf24" rx="2" transform="rotate(45 33 74)"/>
    <circle cx="50" cy="50" r="8" fill="#fef3c7" opacity="0.6"/>
  </svg>
);

const AvatarMoon = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="moonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e0e7ff" />
        <stop offset="50%" stopColor="#c7d2fe" />
        <stop offset="100%" stopColor="#a5b4fc" />
      </linearGradient>
    </defs>
    <path d="M50 20 C30 20, 20 35, 20 50 C20 65, 30 80, 50 80 C45 75, 42 65, 42 50 C42 35, 45 25, 50 20 Z" fill="url(#moonGrad)"/>
    <path d="M50 20 C30 20, 20 35, 20 50 C20 65, 30 80, 50 80 C45 75, 42 65, 42 50 C42 35, 45 25, 50 20 Z" fill="#c7d2fe" opacity="0.5"/>
    <circle cx="40" cy="40" r="4" fill="#6366f1" opacity="0.3"/>
    <circle cx="45" cy="50" r="3" fill="#6366f1" opacity="0.3"/>
    <circle cx="38" cy="58" r="2.5" fill="#6366f1" opacity="0.3"/>
    <circle cx="48" cy="60" r="2" fill="#6366f1" opacity="0.3"/>
  </svg>
);

const AvatarStar = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="starGrad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#fef3c7" />
        <stop offset="50%" stopColor="#fde047" />
        <stop offset="100%" stopColor="#facc15" />
      </linearGradient>
    </defs>
    <path d="M50 10 L55 35 L80 35 L60 50 L65 75 L50 60 L35 75 L40 50 L20 35 L45 35 Z" fill="url(#starGrad)"/>
    <path d="M50 10 L55 35 L80 35 L60 50 L65 75 L50 60 L35 75 L40 50 L20 35 L45 35 Z" fill="#fde047" opacity="0.7"/>
    <circle cx="50" cy="50" r="4" fill="#fef3c7" opacity="0.8"/>
    <path d="M50 10 L50 60 M20 35 L80 35 M40 50 L60 50 M35 75 L65 75" stroke="#fbbf24" strokeWidth="0.5" opacity="0.3"/>
  </svg>
);

const AvatarBird = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="birdBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3b82f6" />
        <stop offset="100%" stopColor="#2563eb" />
      </linearGradient>
      <linearGradient id="birdHeadGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#60a5fa" />
        <stop offset="100%" stopColor="#3b82f6" />
      </linearGradient>
    </defs>
    <ellipse cx="50" cy="50" rx="25" ry="15" fill="url(#birdBodyGrad)"/>
    <ellipse cx="50" cy="50" rx="23" ry="13" fill="#3b82f6" opacity="0.8"/>
    <ellipse cx="35" cy="45" rx="8" ry="12" fill="url(#birdHeadGrad)"/>
    <circle cx="30" cy="40" r="4" fill="#1e40af"/>
    <circle cx="28" cy="38" r="1.5" fill="#fef3c7"/>
    <path d="M70 50 L85 45 L85 55 Z" fill="#1e40af"/>
    <path d="M70 50 L85 45 L85 55" stroke="#1e3a8a" strokeWidth="1" opacity="0.5"/>
    <path d="M45 45 Q50 40, 55 45" stroke="#1e40af" strokeWidth="1.5" fill="none" opacity="0.4"/>
  </svg>
);

const AvatarFern = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="fernGrad" x1="50%" y1="0%" x2="50%" y2="100%">
        <stop offset="0%" stopColor="#65a30d" />
        <stop offset="50%" stopColor="#4d7c0f" />
        <stop offset="100%" stopColor="#365314" />
      </linearGradient>
    </defs>
    <path d="M50 10 L45 30 L40 25 L35 45 L30 40 L25 60 L30 55 L35 75 L40 70 L45 90 L50 85 L55 90 L60 70 L65 75 L70 55 L75 60 L70 40 L65 45 L60 25 L55 30 Z" fill="url(#fernGrad)"/>
    <path d="M50 10 L45 30 L40 25 L35 45 L30 40 L25 60 L30 55 L35 75 L40 70 L45 90 L50 85" stroke="#84cc16" strokeWidth="0.5" opacity="0.3"/>
    <path d="M50 10 L55 30 L60 25 L65 45 L70 40 L75 60 L70 55 L65 75 L60 70 L55 90 L50 85" stroke="#84cc16" strokeWidth="0.5" opacity="0.3"/>
    <circle cx="50" cy="50" r="2" fill="#84cc16" opacity="0.4"/>
    <circle cx="40" cy="60" r="1.5" fill="#84cc16" opacity="0.4"/>
    <circle cx="60" cy="60" r="1.5" fill="#84cc16" opacity="0.4"/>
  </svg>
);

const AvatarCactus = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="cactusGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#16a34a" />
      </linearGradient>
    </defs>
    <rect x="45" y="30" width="10" height="50" fill="url(#cactusGrad)" rx="5"/>
    <rect x="35" y="50" width="8" height="30" fill="url(#cactusGrad)" rx="4"/>
    <rect x="57" y="40" width="8" height="40" fill="url(#cactusGrad)" rx="4"/>
    <circle cx="50" cy="25" r="8" fill="url(#cactusGrad)"/>
    <rect x="45" y="30" width="10" height="5" fill="#15803d" opacity="0.3" rx="2"/>
    <rect x="35" y="50" width="8" height="4" fill="#15803d" opacity="0.3" rx="2"/>
    <rect x="57" y="40" width="8" height="4" fill="#15803d" opacity="0.3" rx="2"/>
    <circle cx="48" cy="35" r="1.5" fill="#86efac" opacity="0.6"/>
    <circle cx="52" cy="45" r="1.5" fill="#86efac" opacity="0.6"/>
    <circle cx="38" cy="60" r="1" fill="#86efac" opacity="0.6"/>
    <circle cx="60" cy="55" r="1" fill="#86efac" opacity="0.6"/>
    <circle cx="50" cy="20" r="2" fill="#fbbf24" opacity="0.8"/>
  </svg>
);

// Sophisticated gradient avatar system - gradient circles with icons
const AudioAvatar = ({ type, className = "" }: { type: AvatarType; className?: string }) => {
  const config = AVATAR_CONFIGS[type] || AVATAR_CONFIGS.mic;
  const IconComponent = config.icon;
  
  return (
    <div 
      className={`rounded-full ${config.gradientClasses} flex items-center justify-center shadow-lg ring-1 ring-black/10 dark:ring-white/10 ${className}`}
      style={{ minWidth: '100%', minHeight: '100%', aspectRatio: '1' }}
    >
      <IconComponent className="text-white opacity-95" style={{ width: '60%', height: '60%', strokeWidth: 2 }} />
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
  const recaptchaRef = useRef<ReCAPTCHA>(null);
  
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
      setRecaptchaLoading(false);
      return;
    }

    // Check if reCAPTCHA script is already loaded
    const checkRecaptchaLoaded = () => {
      if (typeof window !== 'undefined' && (window as any).grecaptcha) {
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
    let attempts = 0;
    const maxAttempts = 20; // 10 seconds max
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
          } else {
            console.debug('[OnboardingFlow] reCAPTCHA not configured for development (this is normal)');
          }
          setRecaptchaLoading(false);
          setRecaptchaError(true);
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
        title: "Welcome to Echo Garden!",
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
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 lg:items-center">
          {/* Left side - Speakeasy Reddit-themed welcome */}
          <div className="space-y-8 text-center lg:text-left relative z-10 animate-in fade-in-0 slide-in-from-left-5 duration-700">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-amber-950/40 to-red-950/40 dark:from-amber-900/30 dark:to-red-900/30 px-5 py-2.5 text-sm font-semibold text-amber-300 dark:text-amber-400 border border-amber-800/40 dark:border-amber-800/30 shadow-sm backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-500">
              <Mic className="h-4 w-4" />
              Welcome to Echo Garden
            </div>

            <div className="space-y-6">
              <div className="relative">
                <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl leading-tight animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-150">
                  Find Your
                  <span className="block bg-gradient-to-r from-amber-500 via-amber-400 to-red-500 dark:from-amber-400 dark:via-amber-300 dark:to-red-400 bg-clip-text text-transparent animate-in fade-in-0 duration-1000 delay-300">
                    Voice
                  </span>
                </h1>
              </div>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0 leading-relaxed font-medium animate-in fade-in-0 slide-in-from-bottom-3 duration-700 delay-300">
                Choose your avatar and handle. Join the underground where voices echo—raw, anonymous, real.
              </p>
            </div>

            {/* Expanded content section */}
            <div className="space-y-6 pt-4 animate-in fade-in-0 slide-in-from-bottom-4 duration-700 delay-450">
              <div className="prose dark:prose-invert max-w-none">
                <h3 className="text-2xl font-bold text-foreground mb-3 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-amber-400 dark:text-amber-400" />
                  What is Echo Garden?
                </h3>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  Echo Garden is Reddit for your voice. Share 30-second audio clips—thoughts, rants, stories, whatever. Your identity stays anonymous. Only your voice and handle show.
                </p>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  Speak your mind. Listen to others. Upvote what hits. No BS, no filters—just raw voice in an underground community.
                </p>
              </div>

              <div className="rounded-2xl border border-amber-900/40 dark:border-amber-800/30 bg-gradient-to-br from-amber-950/20 to-red-950/20 dark:from-amber-950/15 dark:to-red-950/15 p-6 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10 hover:border-amber-800/50">
                <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Radio className="h-5 w-5 text-amber-400 dark:text-amber-400 animate-pulse" />
                  How It Works
                </h4>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  {[
                    "Record or upload 30-second audio clips about anything",
                    "Listen to voices, react, reply—engage with the community",
                    "AI moderation keeps it real—trolls get filtered out",
                    "Stay anonymous—no personal info required, ever"
                  ].map((item, index) => (
                    <li key={index} className="flex items-start gap-2 animate-in fade-in-0 slide-in-from-left-2" style={{ animationDelay: `${index * 100}ms` }}>
                      <span className="text-amber-400 dark:text-amber-400 mt-1 font-bold">•</span>
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
                  className="group flex flex-col gap-3 rounded-2xl border border-amber-900/40 dark:border-amber-800/30 bg-gradient-to-br from-amber-950/20 to-red-950/20 dark:from-amber-950/15 dark:to-red-950/15 p-6 backdrop-blur-sm hover:bg-gradient-to-br hover:from-amber-950/30 hover:to-red-950/30 dark:hover:from-amber-950/25 dark:hover:to-red-950/25 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/10 hover:-translate-y-1 animate-in fade-in-0 slide-in-from-bottom-3"
                  style={{ animationDelay: `${delay}ms` }}
                >
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${iconBg} ${iconColor} shadow-sm group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                    <Icon className="h-7 w-7" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground mb-1.5 text-base">{title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right side - Enhanced form with decorative elements */}
          <Card className="w-full max-w-md mx-auto lg:mx-0 border-2 border-amber-900/40 dark:border-amber-800/30 shadow-2xl bg-slate-900/95 dark:bg-slate-950/95 backdrop-blur-xl relative overflow-hidden animate-in fade-in-0 slide-in-from-right-5 duration-700 transition-all duration-300">
            
            {/* Decorative corner accents */}
            <div className="absolute top-0 left-0 w-20 h-20 border-t-2 border-l-2 border-amber-800/20 dark:border-amber-700/20 rounded-tl-2xl"></div>
            <div className="absolute bottom-0 right-0 w-20 h-20 border-b-2 border-r-2 border-amber-800/20 dark:border-amber-700/20 rounded-br-2xl"></div>

            {/* Progress Indicator */}
            <div className="px-6 pt-6 pb-2">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-muted-foreground">Setup Progress</span>
                <span className="text-xs font-semibold text-amber-400">
                  {Math.round((((selectedAvatar ? 1 : 0) + (handle.trim() ? 1 : 0) + (recaptchaToken || !RECAPTCHA_SITE_KEY ? 1 : 0)) / 3) * 100)}%
                </span>
              </div>
              <Progress 
                value={((selectedAvatar ? 1 : 0) + (handle.trim() ? 1 : 0) + (recaptchaToken || !RECAPTCHA_SITE_KEY ? 1 : 0)) / 3 * 100} 
                className="h-2 bg-amber-950/30 dark:bg-amber-950/20"
              />
            </div>

            <CardHeader className="space-y-3 text-center pb-6 relative z-10 px-6">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-900/50 via-amber-800/50 to-red-900/50 dark:from-amber-900/40 dark:via-amber-800/40 dark:to-red-900/40 mb-3 shadow-lg ring-2 ring-amber-800/30 dark:ring-amber-800/20 animate-in zoom-in-50 duration-500 hover:scale-105 transition-transform duration-300">
                <AudioAvatar type={selectedAvatar} className="w-14 h-14" />
              </div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-amber-400 to-amber-300 dark:from-amber-400 dark:to-amber-300 bg-clip-text text-transparent animate-in fade-in-0 slide-in-from-bottom-2 duration-700">
                Create Your Identity
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium animate-in fade-in-0 slide-in-from-bottom-3 duration-700 delay-150">
                Pick an avatar and choose your handle
              </p>
            </CardHeader>

            <CardContent className="space-y-6 relative z-10">
              {/* Avatar Selection */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Mic className="h-4 w-4 text-amber-400 dark:text-amber-400" />
                  Choose Your Avatar
                </label>
                <div className="grid grid-cols-4 gap-3 p-3 rounded-xl bg-amber-950/20 dark:bg-amber-950/10 border border-amber-900/30 dark:border-amber-800/20">
                  {AVATAR_TYPES.map((avatarType, index) => {
                    const isActive = selectedAvatar === avatarType;
                    return (
                      <button
                        key={avatarType}
                        type="button"
                        onClick={() => setSelectedAvatar(avatarType)}
                        className={`flex h-16 w-full items-center justify-center rounded-lg border-2 transition-all duration-300 animate-in fade-in-0 zoom-in-95 ${
                          isActive
                            ? "border-amber-500 bg-gradient-to-br from-amber-950/60 to-red-950/40 dark:from-amber-950/50 dark:to-red-950/40 scale-110 shadow-lg shadow-amber-500/30 ring-2 ring-amber-400/20 z-10"
                            : "border-slate-700 dark:border-slate-600 hover:border-amber-500 dark:hover:border-amber-600 hover:bg-amber-950/30 dark:hover:bg-amber-950/20 hover:scale-105 active:scale-95"
                        }`}
                        style={{ animationDelay: `${index * 30}ms` }}
                        title={avatarType.charAt(0).toUpperCase() + avatarType.slice(1)}
                      >
                        <AudioAvatar 
                          type={avatarType} 
                          className={`w-10 h-10 transition-transform duration-300 ${isActive ? 'scale-110' : ''}`}
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Handle Input */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Radio className="h-4 w-4 text-amber-400 dark:text-amber-400" />
                  Your Handle
                </label>
                <div className="relative flex gap-2">
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="DeepVoice42"
                    maxLength={20}
                    className="h-12 text-center text-lg font-medium tracking-wide border-2 border-amber-900/40 dark:border-amber-800/30 focus:border-amber-500 dark:focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-slate-900/80 dark:bg-slate-950/80 text-foreground transition-all duration-200"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => {
                      setHandle(generateHandle());
                    }}
                    className="h-12 w-12 shrink-0 border-2 border-amber-900/40 dark:border-amber-800/30 hover:bg-gradient-to-br hover:from-amber-950/40 hover:to-red-950/40 dark:hover:from-amber-950/30 dark:hover:to-red-950/30 hover:border-amber-500 dark:hover:border-amber-500 transition-all hover:scale-105 active:scale-95"
                    title="Generate random handle"
                  >
                    <Wand2 className="h-5 w-5 text-amber-400 dark:text-amber-400" />
                  </Button>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground font-medium">
                    Keep it clean, 20 characters max
                  </p>
                  <span className={`text-xs font-semibold transition-colors duration-200 ${
                    handle.length > 18 
                      ? 'text-red-400 dark:text-red-400' 
                      : handle.length > 15 
                      ? 'text-amber-400 dark:text-amber-400'
                      : 'text-muted-foreground'
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
                    <div className="text-xs text-muted-foreground text-center">
                      <p>Loading verification...</p>
                    </div>
                  )}
                  {!recaptchaError && !recaptchaLoading && (
                    <div className="flex justify-center">
                      <ReCAPTCHA
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
                          
                          if (isDevelopment) {
                            // In development, log as warning
                            console.warn('[OnboardingFlow] reCAPTCHA script failed to load (development mode)');
                            console.warn('[OnboardingFlow] This is normal if reCAPTCHA is not configured for localhost');
                            console.warn('[OnboardingFlow] The app will work without reCAPTCHA - it\'s optional in development');
                            console.warn('[OnboardingFlow] To enable: Add localhost to your reCAPTCHA site at https://www.google.com/recaptcha/admin');
                          } else {
                            // In production, log as error
                            console.error('[OnboardingFlow] reCAPTCHA script failed to load');
                            console.error('[OnboardingFlow] reCAPTCHA site key:', RECAPTCHA_SITE_KEY ? 'Set' : 'Missing');
                            console.error('[OnboardingFlow] Current domain:', typeof window !== 'undefined' ? window.location.hostname : 'unknown');
                            console.error('[OnboardingFlow] Possible causes:');
                            console.error('  1. Domain not registered in reCAPTCHA console');
                            console.error('  2. Network/CSP blocking Google scripts');
                            console.error('  3. Invalid site key');
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
                    <div className="text-xs text-muted-foreground text-center space-y-2">
                      <p>reCAPTCHA unavailable - you can still create your account</p>
                      <button
                        type="button"
                        onClick={() => {
                          setRecaptchaError(false);
                          setRecaptchaLoading(true);
                          setRecaptchaAvailable(false);
                          setRecaptchaToken(null);
                          // Force reload by resetting the component
                          if (recaptchaRef.current) {
                            recaptchaRef.current.reset();
                          }
                          // Re-check if script loaded
                          setTimeout(() => {
                            if (typeof window !== 'undefined' && (window as any).grecaptcha) {
                              setRecaptchaLoading(false);
                              setRecaptchaAvailable(true);
                              setRecaptchaError(false);
                            } else {
                              setRecaptchaLoading(false);
                              setRecaptchaError(true);
                            }
                          }, 1000);
                        }}
                        className="text-xs text-primary hover:underline"
                      >
                        Retry reCAPTCHA
                      </button>
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
                    ? 'ring-2 ring-amber-500/50 ring-offset-2 ring-offset-slate-900 dark:ring-offset-slate-950' 
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
                    Enter Echo Garden
                    <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200" />
                  </span>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground leading-relaxed">
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
