import { useState, useRef, useEffect } from "react";
import { Wand2, CheckCircle2, Leaf, Flower2, Trees } from "lucide-react";
import ReCAPTCHA from "react-google-recaptcha";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { handleSchema, isReservedHandle } from "@/lib/validation";
import { useAuth } from "@/context/AuthContext";
import { useDeviceId } from "@/hooks/useDeviceId";

// Nature-themed SVG avatar types
type AvatarType = 'leaf' | 'flower' | 'tree' | 'mountain' | 'wave' | 'sun' | 'moon' | 'star' | 'butterfly' | 'bird' | 'fern' | 'cactus';

// Map avatar types to emojis for display
const AVATAR_TYPE_TO_EMOJI: Record<AvatarType, string> = {
  leaf: '🍃',
  flower: '🌸',
  tree: '🌳',
  mountain: '⛰️',
  wave: '🌊',
  sun: '☀️',
  moon: '🌙',
  star: '⭐',
  butterfly: '🦋',
  bird: '🐦',
  fern: '🌿',
  cactus: '🌵',
};

const AVATAR_TYPES: AvatarType[] = [
  'leaf', 'flower', 'tree', 'mountain', 'wave', 'sun', 
  'moon', 'star', 'butterfly', 'bird', 'fern', 'cactus'
];

const NATURE_ADJECTIVES = ["Sunny", "Misty", "Breezy", "Calm", "Bright", "Gentle", "Wild", "Quiet", "Warm", "Cool", "Fresh", "Golden"];
const NATURE_NOUNS = ["Meadow", "Grove", "Brook", "Valley", "Ridge", "Peak", "Forest", "Garden", "Field", "Glade", "Stream", "Hill"];

const generateHandle = () => {
  const adj = NATURE_ADJECTIVES[Math.floor(Math.random() * NATURE_ADJECTIVES.length)];
  const noun = NATURE_NOUNS[Math.floor(Math.random() * NATURE_NOUNS.length)];
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

// SVG Garden Components
const ButterflySVG = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="butterflyWing1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#f472b6" />
        <stop offset="50%" stopColor="#ec4899" />
        <stop offset="100%" stopColor="#db2777" />
      </linearGradient>
      <linearGradient id="butterflyWing2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a78bfa" />
        <stop offset="50%" stopColor="#8b5cf6" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
    <path d="M50 20 C45 25, 35 30, 30 35 C25 40, 20 50, 25 55 C30 60, 40 55, 45 50 C50 45, 55 50, 60 55 C65 60, 75 55, 80 50 C85 45, 80 35, 75 30 C70 25, 60 20, 50 20 Z" fill="url(#butterflyWing1)" opacity="0.9"/>
    <path d="M50 20 C55 25, 65 30, 70 35 C75 40, 80 50, 75 55 C70 60, 60 55, 55 50 C50 45, 45 50, 40 55 C35 60, 25 55, 20 50 C15 45, 20 35, 25 30 C30 25, 40 20, 50 20 Z" fill="url(#butterflyWing2)" opacity="0.9"/>
    <circle cx="50" cy="50" r="3" fill="#1e293b"/>
    <circle cx="50" cy="50" r="1.5" fill="#fef3c7"/>
    <path d="M50 20 L50 50" stroke="#1e293b" strokeWidth="1.5" opacity="0.6"/>
    <circle cx="35" cy="40" r="2" fill="#fef3c7" opacity="0.7"/>
    <circle cx="65" cy="40" r="2" fill="#fef3c7" opacity="0.7"/>
    <circle cx="30" cy="50" r="1.5" fill="#fef3c7" opacity="0.6"/>
    <circle cx="70" cy="50" r="1.5" fill="#fef3c7" opacity="0.6"/>
  </svg>
);

const FlowerSVG = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="8" fill="currentColor" opacity="0.9"/>
    <ellipse cx="50" cy="35" rx="6" ry="12" fill="currentColor" opacity="0.7"/>
    <ellipse cx="65" cy="50" rx="12" ry="6" fill="currentColor" opacity="0.7"/>
    <ellipse cx="50" cy="65" rx="6" ry="12" fill="currentColor" opacity="0.7"/>
    <ellipse cx="35" cy="50" rx="12" ry="6" fill="currentColor" opacity="0.7"/>
    <ellipse cx="60" cy="40" rx="6" ry="12" fill="currentColor" opacity="0.6" transform="rotate(45 60 40)"/>
    <ellipse cx="60" cy="60" rx="6" ry="12" fill="currentColor" opacity="0.6" transform="rotate(-45 60 60)"/>
    <ellipse cx="40" cy="60" rx="6" ry="12" fill="currentColor" opacity="0.6" transform="rotate(45 40 60)"/>
    <ellipse cx="40" cy="40" rx="6" ry="12" fill="currentColor" opacity="0.6" transform="rotate(-45 40 40)"/>
  </svg>
);

const LeafSVG = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 10 C30 20, 20 40, 25 60 C30 80, 50 90, 70 85 C90 80, 95 60, 85 40 C75 20, 60 10, 50 10 Z" fill="currentColor" opacity="0.7"/>
    <path d="M50 10 L50 90 M30 50 L70 50" stroke="currentColor" strokeWidth="1" opacity="0.3"/>
  </svg>
);

const BranchSVG = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 200 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M10 50 Q30 40, 50 45 T90 50 T130 55 T170 60" stroke="currentColor" strokeWidth="3" fill="none" opacity="0.6"/>
    <circle cx="50" cy="45" r="4" fill="currentColor" opacity="0.5"/>
    <circle cx="90" cy="50" r="4" fill="currentColor" opacity="0.5"/>
    <circle cx="130" cy="55" r="4" fill="currentColor" opacity="0.5"/>
  </svg>
);

const SunflowerSVG = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="12" fill="#8B4513" opacity="0.8"/>
    <ellipse cx="50" cy="30" rx="8" ry="20" fill="#FFD700" opacity="0.9"/>
    <ellipse cx="70" cy="50" rx="20" ry="8" fill="#FFD700" opacity="0.9"/>
    <ellipse cx="50" cy="70" rx="8" ry="20" fill="#FFD700" opacity="0.9"/>
    <ellipse cx="30" cy="50" rx="20" ry="8" fill="#FFD700" opacity="0.9"/>
    <ellipse cx="65" cy="35" rx="8" ry="20" fill="#FFA500" opacity="0.7" transform="rotate(45 65 35)"/>
    <ellipse cx="65" cy="65" rx="8" ry="20" fill="#FFA500" opacity="0.7" transform="rotate(-45 65 65)"/>
    <ellipse cx="35" cy="65" rx="8" ry="20" fill="#FFA500" opacity="0.7" transform="rotate(45 35 65)"/>
    <ellipse cx="35" cy="35" rx="8" ry="20" fill="#FFA500" opacity="0.7" transform="rotate(-45 35 35)"/>
  </svg>
);

// Avatar SVG Components with colors and enhanced details
const AvatarLeaf = ({ className = "" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="leafGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#22c55e" />
        <stop offset="50%" stopColor="#16a34a" />
        <stop offset="100%" stopColor="#15803d" />
      </linearGradient>
    </defs>
    <path d="M50 10 C30 20, 20 40, 25 60 C30 80, 50 90, 70 85 C90 80, 95 60, 85 40 C75 20, 60 10, 50 10 Z" fill="url(#leafGrad)"/>
    <path d="M50 10 C30 20, 20 40, 25 60 C30 80, 50 90, 70 85 C90 80, 95 60, 85 40 C75 20, 60 10, 50 10 Z" fill="#10b981" opacity="0.3"/>
    <path d="M50 10 L50 90" stroke="#15803d" strokeWidth="2" opacity="0.4"/>
    <path d="M30 50 L70 50" stroke="#15803d" strokeWidth="1.5" opacity="0.3"/>
    <circle cx="45" cy="35" r="2" fill="#86efac" opacity="0.6"/>
    <circle cx="55" cy="45" r="1.5" fill="#86efac" opacity="0.6"/>
    <circle cx="40" cy="60" r="1.5" fill="#86efac" opacity="0.6"/>
  </svg>
);

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

// Avatar component selector
const NatureAvatar = ({ type, className = "" }: { type: AvatarType; className?: string }) => {
  const components = {
    leaf: AvatarLeaf,
    flower: AvatarFlower,
    tree: AvatarTree,
    mountain: AvatarMountain,
    wave: AvatarWave,
    sun: AvatarSun,
    moon: AvatarMoon,
    star: AvatarStar,
    butterfly: ButterflySVG,
    bird: AvatarBird,
    fern: AvatarFern,
    cactus: AvatarCactus,
  };
  const Component = components[type];
  return <Component className={className} />;
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
        description: "Your garden identity has been created.",
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
      <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-green-50/60 via-emerald-50/40 via-teal-50/30 to-amber-50/20 dark:from-green-950/30 dark:via-emerald-950/20 dark:via-teal-950/15 dark:to-amber-950/10">
      {/* Enhanced Nature-themed background elements */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        {/* Animated gradient orbs */}
        <div className="absolute top-20 left-10 w-64 h-64 bg-green-200/15 dark:bg-green-800/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '4s' }} />
        <div className="absolute bottom-20 right-10 w-96 h-96 bg-emerald-200/15 dark:bg-emerald-800/8 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '5s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-100/8 dark:bg-teal-900/6 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '6s' }} />
        <div className="absolute top-1/3 right-1/4 w-80 h-80 bg-amber-100/10 dark:bg-amber-900/5 rounded-full blur-3xl animate-pulse" style={{ animationDuration: '7s' }} />
        
        {/* Floating SVG Garden Elements */}
        <div className="absolute top-0 left-0 w-full h-full">
          {/* Butterflies */}
          <div className="absolute top-20 left-16 text-green-400/20 dark:text-green-500/10 animate-bounce" style={{ animationDuration: '3s', animationDelay: '0s' }}>
            <ButterflySVG className="w-16 h-16" />
          </div>
          <div className="absolute top-40 right-24 text-emerald-400/20 dark:text-emerald-500/10 animate-bounce" style={{ animationDuration: '4s', animationDelay: '1s' }}>
            <ButterflySVG className="w-12 h-12" />
          </div>
          <div className="absolute bottom-40 left-1/3 text-teal-400/20 dark:text-teal-500/10 animate-bounce" style={{ animationDuration: '5s', animationDelay: '2s' }}>
            <ButterflySVG className="w-14 h-14" />
          </div>

          {/* Flowers */}
          <div className="absolute top-32 right-16 text-pink-300/25 dark:text-pink-600/15 animate-pulse" style={{ animationDuration: '4s' }}>
            <FlowerSVG className="w-20 h-20" />
          </div>
          <div className="absolute bottom-32 left-20 text-purple-300/25 dark:text-purple-600/15 animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }}>
            <FlowerSVG className="w-24 h-24" />
          </div>
          <div className="absolute top-1/2 right-1/3 text-rose-300/25 dark:text-rose-600/15 animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }}>
            <FlowerSVG className="w-18 h-18" />
          </div>

          {/* Sunflowers */}
          <div className="absolute top-16 right-1/4 opacity-30 dark:opacity-20 animate-pulse" style={{ animationDuration: '5s' }}>
            <SunflowerSVG className="w-28 h-28" />
          </div>
          <div className="absolute bottom-24 right-1/3 opacity-30 dark:opacity-20 animate-pulse" style={{ animationDuration: '6s', animationDelay: '1.5s' }}>
            <SunflowerSVG className="w-32 h-32" />
          </div>

          {/* Leaves */}
          <div className="absolute top-10 left-1/4 text-green-500/20 dark:text-green-600/10 animate-pulse" style={{ animationDuration: '3s' }}>
            <LeafSVG className="w-24 h-24 rotate-12" />
          </div>
          <div className="absolute bottom-20 right-1/4 text-emerald-500/20 dark:text-emerald-600/10 animate-pulse" style={{ animationDuration: '4s', animationDelay: '1s' }}>
            <LeafSVG className="w-28 h-28 -rotate-12" />
          </div>
          <div className="absolute top-1/3 left-10 text-teal-500/20 dark:text-teal-600/10 animate-pulse" style={{ animationDuration: '5s', animationDelay: '2s' }}>
            <LeafSVG className="w-20 h-20 rotate-45" />
          </div>

          {/* Branches */}
          <div className="absolute bottom-10 left-10 text-green-600/15 dark:text-green-700/8 opacity-60">
            <BranchSVG className="w-40 h-20 rotate-12" />
          </div>
          <div className="absolute top-1/4 right-10 text-emerald-600/15 dark:text-emerald-700/8 opacity-60">
            <BranchSVG className="w-48 h-24 -rotate-12" />
          </div>

          {/* Lucide Icons for additional depth */}
          <div className="absolute top-60 left-32 text-green-400/15 dark:text-green-600/8 animate-pulse" style={{ animationDuration: '4s' }}>
            <Leaf className="w-20 h-20 rotate-45" />
          </div>
          <div className="absolute bottom-60 right-32 text-emerald-400/15 dark:text-emerald-600/8 animate-pulse" style={{ animationDuration: '5s', animationDelay: '1s' }}>
            <Flower2 className="w-24 h-24 -rotate-12" />
          </div>
          <div className="absolute top-1/2 left-16 text-teal-400/15 dark:text-teal-600/8 animate-pulse" style={{ animationDuration: '6s', animationDelay: '2s' }}>
            <Trees className="w-32 h-32 rotate-12" />
          </div>
        </div>

        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.015] dark:opacity-[0.008]" style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: '40px 40px'
        }} />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full flex-col justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-20 lg:items-center">
          {/* Left side - Enhanced Nature-themed welcome */}
          <div className="space-y-8 text-center lg:text-left relative z-10">
            <div className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-green-100/90 to-emerald-100/90 dark:from-green-900/40 dark:to-emerald-900/40 px-5 py-2.5 text-sm font-semibold text-green-700 dark:text-green-300 border border-green-200/60 dark:border-green-800/50 shadow-sm backdrop-blur-md">
              <Leaf className="h-4 w-4 animate-pulse" style={{ animationDuration: '2s' }} />
              Welcome to Echo Garden
            </div>

            <div className="space-y-6">
              <div className="relative">
                <h1 className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl lg:text-7xl leading-tight">
                  Plant Your
                  <span className="block bg-gradient-to-r from-green-600 via-emerald-600 to-teal-600 dark:from-green-400 dark:via-emerald-400 dark:to-teal-400 bg-clip-text text-transparent">
                    Garden Identity
                  </span>
                </h1>
                {/* Decorative SVG elements around title */}
                <div className="absolute -top-4 -left-4 text-green-400/20 dark:text-green-600/10 animate-pulse pointer-events-none" style={{ animationDuration: '3s' }}>
                  <FlowerSVG className="w-12 h-12" />
                </div>
                <div className="absolute -bottom-2 -right-4 text-emerald-400/20 dark:text-emerald-600/10 animate-pulse pointer-events-none" style={{ animationDuration: '4s', animationDelay: '1s' }}>
                  <LeafSVG className="w-10 h-10 rotate-45" />
                </div>
              </div>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto lg:mx-0 leading-relaxed font-medium">
                Choose your nature avatar and a peaceful handle. Join the garden where voices grow like wildflowers—gentle, anonymous, and free.
              </p>
            </div>

            {/* Expanded content section */}
            <div className="space-y-6 pt-4">
              <div className="prose prose-green dark:prose-invert max-w-none">
                <h3 className="text-2xl font-bold text-foreground mb-3">What is Echo Garden?</h3>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  Echo Garden is a peaceful space for authentic voice expression. Share 30-second audio clips about your thoughts, experiences, and moments. Your identity remains anonymous—only your voice and chosen handle are visible to the community.
                </p>
                <p className="text-base text-muted-foreground leading-relaxed mb-4">
                  Every voice matters here. Whether you're sharing a quiet reflection, a moment of joy, or a thoughtful observation, the garden welcomes all perspectives with kindness and respect.
                </p>
              </div>

              <div className="rounded-2xl border border-green-200/60 dark:border-green-800/40 bg-gradient-to-br from-green-50/30 to-emerald-50/20 dark:from-green-950/20 dark:to-emerald-950/10 p-6">
                <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                  <Trees className="h-5 w-5 text-green-600 dark:text-green-400" />
                  How It Works
                </h4>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 mt-1">•</span>
                    <span>Record or upload 30-second audio clips about anything on your mind</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 mt-1">•</span>
                    <span>Connect with others through voice—listen, respond, and grow together</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 mt-1">•</span>
                    <span>AI moderation ensures a safe, welcoming environment for everyone</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-green-600 dark:text-green-400 mt-1">•</span>
                    <span>Your privacy is protected—no personal information required</span>
                  </li>
                </ul>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 pt-4">
              {[
                { 
                  icon: Leaf, 
                  title: "Natural & Safe",
                  description: "Anonymous by design, your voice blooms without revealing who you are",
                  iconBg: "from-green-100 to-green-200 dark:from-green-900/50 dark:to-green-800/50",
                  iconColor: "text-green-600 dark:text-green-400"
                },
                { 
                  icon: Flower2, 
                  title: "30-Second Stories",
                  description: "Short, mindful moments. Share when the mood strikes you",
                  iconBg: "from-emerald-100 to-emerald-200 dark:from-emerald-900/50 dark:to-emerald-800/50",
                  iconColor: "text-emerald-600 dark:text-emerald-400"
                },
                { 
                  icon: Trees, 
                  title: "Kind Community",
                  description: "AI moderation keeps the garden peaceful and welcoming",
                  iconBg: "from-teal-100 to-teal-200 dark:from-teal-900/50 dark:to-teal-800/50",
                  iconColor: "text-teal-600 dark:text-teal-400"
                },
              ].map(({ icon: Icon, title, description, iconBg, iconColor }) => (
                <div
                  key={title}
                  className="group flex flex-col gap-3 rounded-2xl border border-green-200/60 dark:border-green-800/40 bg-gradient-to-br from-green-50/40 to-emerald-50/30 dark:from-green-950/30 dark:to-emerald-950/20 p-6 backdrop-blur-sm hover:bg-gradient-to-br hover:from-green-50/60 hover:to-emerald-50/40 dark:hover:from-green-950/40 dark:hover:to-emerald-950/30 transition-all duration-300 hover:shadow-lg hover:shadow-green-500/10 hover:-translate-y-1"
                >
                  <div className={`inline-flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${iconBg} ${iconColor} shadow-sm group-hover:scale-110 transition-transform duration-300`}>
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
          <Card className="w-full max-w-md mx-auto lg:mx-0 border-2 border-green-200/60 dark:border-green-800/40 shadow-2xl bg-white/95 dark:bg-gray-900/95 backdrop-blur-xl relative overflow-hidden">
            {/* Decorative corner elements */}
            <div className="absolute top-0 right-0 text-green-300/10 dark:text-green-700/10 pointer-events-none">
              <FlowerSVG className="w-24 h-24 -translate-y-8 translate-x-8" />
            </div>
            <div className="absolute bottom-0 left-0 text-emerald-300/10 dark:text-emerald-700/10 pointer-events-none">
              <LeafSVG className="w-20 h-20 translate-y-8 -translate-x-8 rotate-45" />
            </div>

            <CardHeader className="space-y-3 text-center pb-6 relative z-10">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-green-100 via-emerald-100 to-teal-100 dark:from-green-900/50 dark:via-emerald-900/50 dark:to-teal-900/50 mb-3 shadow-lg ring-2 ring-green-200/50 dark:ring-green-800/30">
                <NatureAvatar type={selectedAvatar} className="w-14 h-14" />
              </div>
              <CardTitle className="text-3xl font-bold bg-gradient-to-r from-green-700 to-emerald-700 dark:from-green-400 dark:to-emerald-400 bg-clip-text text-transparent">
                Create Your Identity
              </CardTitle>
              <p className="text-sm text-muted-foreground font-medium">
                Pick an avatar and choose your handle
              </p>
            </CardHeader>

            <CardContent className="space-y-6 relative z-10">
              {/* Avatar Selection - Enhanced grid */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Flower2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                  Choose Your Avatar
                </label>
                <div className="grid grid-cols-4 gap-3 p-3 rounded-xl bg-green-50/30 dark:bg-green-950/20 border border-green-200/30 dark:border-green-800/20">
                  {AVATAR_TYPES.map((avatarType) => {
                    const isActive = selectedAvatar === avatarType;
                    return (
                      <button
                        key={avatarType}
                        type="button"
                        onClick={() => setSelectedAvatar(avatarType)}
                        className={`flex h-16 w-full items-center justify-center rounded-lg border-2 transition-all duration-200 ${
                          isActive
                            ? "border-green-500 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950/60 dark:to-emerald-950/40 scale-110 shadow-lg shadow-green-500/30 ring-2 ring-green-400/20"
                            : "border-gray-200 dark:border-gray-700 hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50/50 dark:hover:bg-green-950/20 hover:scale-105"
                        }`}
                        title={avatarType.charAt(0).toUpperCase() + avatarType.slice(1)}
                      >
                        <NatureAvatar 
                          type={avatarType} 
                          className="w-10 h-10"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Handle Input */}
              <div className="space-y-3">
                <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Leaf className="h-4 w-4 text-green-600 dark:text-green-400" />
                  Your Handle
                </label>
                <div className="flex gap-2">
                  <Input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="SunnyMeadow42"
                    maxLength={20}
                    className="h-12 text-center text-lg font-medium tracking-wide border-2 border-green-200 dark:border-green-800 focus:border-green-500 dark:focus:border-green-500 focus:ring-2 focus:ring-green-500/20 bg-white/80 dark:bg-gray-900/80"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setHandle(generateHandle())}
                    className="h-12 w-12 shrink-0 border-2 border-green-200 dark:border-green-800 hover:bg-gradient-to-br hover:from-green-50 hover:to-emerald-50 dark:hover:from-green-950/40 dark:hover:to-emerald-950/40 hover:border-green-400 dark:hover:border-green-600 transition-all hover:scale-105"
                    title="Generate random handle"
                  >
                    <Wand2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground text-center font-medium">
                  Keep it peaceful and kind, 20 characters max
                </p>
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

            <CardFooter className="flex flex-col gap-3 pt-6">
              <Button
                onClick={handleSubmit}
                disabled={isLoading || !handle.trim() || !deviceId}
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg hover:shadow-xl transition-all"
                size="lg"
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin">🌱</span>
                    Planting your identity...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Enter the Garden
                  </span>
                )}
              </Button>
              <p className="text-xs text-center text-muted-foreground leading-relaxed">
                By continuing, you help keep Echo Garden a peaceful, welcoming space
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
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full space-y-6 text-center">
          <h1 className="text-3xl font-bold text-green-700 dark:text-green-300">Welcome to Echo Garden</h1>
          <p className="text-muted-foreground">Something went wrong loading the full onboarding. Please refresh the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }
};
