import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { X, ArrowRight, ArrowLeft, Sparkles, Mic, Heart, MessageCircle, UserPlus, Bookmark, Search, Users, Radio, Filter, List, Grid3x3, Upload, Bell, Settings, Hash, PlayCircle, BookOpen, Lock, Trophy, Compass, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface TutorialStep {
  id: string;
  title: string;
  description: string;
  targetSelector?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
  action?: () => void;
  icon: React.ReactNode;
  highlight?: boolean;
}

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: "welcome",
    title: "Welcome to Vocalix",
    description: "The audio-first social platform where voice is everything. Let's take a quick tour to show you how to speak your mind, stay anonymous, and engage with the community. Search by voice, join communities, drop into live rooms, and build your audio world. No BS, just raw voice.",
    position: "center",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "record-button",
    title: "Record Your Voice",
    description: "Click the + button in the bottom-right corner (or press 'n' on your keyboard) to record your first voice clip. You can share thoughts, stories, or reactions in 30 seconds or less! The upload button above it lets you bulk upload multiple audio files.",
    targetSelector: '[data-tutorial="record-button"]',
    position: "top",
    icon: <Mic className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "today-topic",
    title: "Daily Topics",
    description: "Every day, there's a new topic to inspire conversations. Click 'Focus this topic' to see only clips about today's topic, or explore past topics below. Topics help organize conversations around shared themes!",
    targetSelector: '[data-tutorial="today-topic"]',
    position: "right",
    icon: <Sparkles className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "feed-sorting",
    title: "Feed Sorting",
    description: "Switch between different feed views: Hot (trending now), Top (all-time favorites with time period selector), Controversial (mixed reactions), Rising (gaining traction), or Trending (algorithm picks). Each mode shows clips in a different way!",
    // Default: highlight the whole feed-sorting area (For You, Chamber, and legacy sort buttons)
    targetSelector: '[data-tutorial="feed-sorting"]',
    position: "bottom",
    icon: <Filter className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "view-modes",
    title: "View Modes",
    description: "Toggle between List view (detailed cards) and Compact view (condensed cards) using the view mode buttons. Choose what works best for your browsing style!",
    targetSelector: '[data-tutorial="view-mode"]',
    position: "bottom",
    icon: <Grid3x3 className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "filters",
    title: "Filters & Discovery",
    description: "Use filters to find exactly what you want: City filter (Everyone/Near you), Mood filters (😊 🔥 ❤️ 🙏 😔 😂 😮 🧘 💡), and more. These help you discover content that matches your interests!",
    targetSelector: '[data-tutorial="filters"]',
    position: "bottom",
    icon: <Filter className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "clip-interactions",
    title: "Interact with Clips",
    description: "Listen to clips by clicking play. React with emojis (😊 🔥 ❤️ 🙏), reply with your voice, remix clips, continue chains, save clips you love, or share them with others! Each clip is a conversation starter.",
    targetSelector: '[data-tutorial="clip-card"]',
    position: "top",
    icon: <Heart className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "search",
    title: "Search & Discover",
    description: "Press '/' or click the search bar to find clips, creators, topics, or hashtags. Use advanced filters (duration, date range, mood, city, topic) to find exactly what you're looking for! You can also save your favorite searches.",
    targetSelector: '[data-tutorial="search"]',
    position: "bottom",
    icon: <Search className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "follow",
    title: "Follow Creators",
    description: "Click on any creator's handle or avatar to visit their profile. Click 'Follow' to see their clips in your Following feed! You can access your Following feed from the header. Build your personalized feed by following voices you love.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <UserPlus className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "voice-amas",
    title: "Voice AMAs",
    description:
      "Click the Voice AMAs icon in the header to explore Ask Me Anything sessions. Join live Q&As, listen to past sessions, and discover hosts answering community questions in real time.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <MessageCircle className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "communities",
    title: "Communities",
    description: "Join audio communities to connect with like-minded voices! Click the Communities icon in the header to discover themed groups. Join communities, follow them, and participate in community-specific conversations and events.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Users className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "live-rooms",
    title: "Live Audio Rooms",
    description: "Join real-time voice conversations in Live Rooms! Click the Live Rooms icon to see active rooms. Host your own room, join as a speaker or listener, and engage in live discussions with the community.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Radio className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "leaderboards",
    title: "Leaderboards",
    description:
      "Use the Leaderboards icon in the header to see top creators, listeners, and more. It’s the fastest way to find who’s trending and discover standout voices on the platform.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Trophy className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "discovery",
    title: "Discovery Feed",
    description:
      "Click the Discovery icon in the header to open your personalized discovery feed. This surface mixes topics, clips, and creators the system thinks you'll love based on your listening.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Compass className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "saved-clips",
    title: "Saved Clips & Bookmarks",
    description: "Save clips you love for later! Click the bookmark icon on any clip, then access all your saved clips from the Saved icon in the header. Create playlists and organize your favorite voices into collections.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Bookmark className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "eighteen-plus",
    title: "18+ Content",
    description:
      "If enabled, the 18+ icon in the header lets you access NSFW content. Use it to browse adult-only clips in a separate space, while keeping the rest of your experience safe by default.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Sparkles className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "encrypted-diary",
    title: "Encrypted Diary",
    description: "Keep your private thoughts secure with the encrypted diary! Click the diary icon in the header to access your personal journal. All entries are encrypted with your password or PIN, ensuring complete privacy. Write entries, add tags and moods, pin favorites, and export your memories.",
    targetSelector: '[data-tutorial="diary"]',
    position: "bottom",
    icon: <Lock className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "account-linking",
    title: "Link Your Account",
    description:
      "Step 1: Click the Settings icon in the header.\n" +
      "Step 2: In Settings, open the Account section.\n" +
      "Step 3: Generate a 4-digit PIN and leave this page open.\n" +
      "Step 4: On another device, enter that PIN to link the device to your account.\n" +
      "PINs expire after 10 minutes for security.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Lock className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "account-pin",
    title: "Generate Your PIN",
    description:
      "Step 3: In the Account section, use the PIN Account Linking controls to generate a 4-digit PIN. Step 4: On another device, enter that PIN to link this device to your account. PINs expire after 10 minutes for security.",
    targetSelector: '[data-tutorial="settings-account-linking"]',
    position: "bottom",
    icon: <Lock className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Stay updated with the bell icon in the header! Get notified about new followers, replies to your clips, reactions, and more. Never miss important interactions with your content!",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Bell className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "my-recordings",
    title: "My Recordings",
    description: "Manage all your published clips from the My Recordings page! Access it via the microphone icon in the header. View your clips, see their stats, edit them, and track your voice journey.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Mic className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "settings",
    title: "Settings & Customization",
    description:
      "Step 1: Click the Settings icon in the header.\n" +
      "Step 2: Explore profile options (handle, avatar, and city) to make your account feel like you.\n" +
      "Step 3: Adjust playback preferences and captions so listening works the way you like.\n" +
      "Step 4: When you’re done, come back here and hit Next to continue the tour.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Settings className="h-6 w-6" />,
    highlight: true,
  },
  {
    id: "keyboard-shortcuts",
    title: "Keyboard Shortcuts",
    description: "Speed up your workflow with keyboard shortcuts! Click the keyboard icon in the header to see all available shortcuts. Press '/' to search, 'n' to record, 'd' to toggle dark mode, and more!",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Sparkles className="h-6 w-6" />,
  },
  {
    id: "advanced-features",
    title: "Advanced Features",
    description: "Explore more: Reply to clips with voice replies, remix clips with your own voice overlay, continue audio story chains, browse by hashtags, filter by city, and discover trending content. There's always something new to explore!",
    position: "center",
    icon: <PlayCircle className="h-6 w-6" />,
  },
  {
    id: "complete",
    title: "You're All Set! 🎉",
    description: "You now know all the amazing features Vocalix has to offer! Start recording your first clip, explore communities, join live rooms, and share your voice with the world. Welcome to Vocalix - let your voice bloom! You can always access this tutorial again from Settings.",
    position: "center",
    icon: <Sparkles className="h-6 w-6" />,
  },
];

const TUTORIAL_STORAGE_KEY = "echo_garden_tutorial_completed";

interface InteractiveTutorialProps {
  onComplete: () => void;
}

export const InteractiveTutorial = ({ onComplete }: InteractiveTutorialProps) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [highlightRect, setHighlightRect] = useState<DOMRect | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [feedSortingState, setFeedSortingState] = useState<
    | "default"
    | "for_you"
    | "unheard"
    | "following"
    | "hot"
    | "top"
    | "controversial"
    | "rising"
    | "trending"
    | "chamber"
    | "other"
  >("default");
  const overlayRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const positionUpdateRef = useRef<number | null>(null);
  const isNavigatingRef = useRef(false); // Guard against rapid clicks
  // Safely get step with bounds checking
  const step = currentStep >= 0 && currentStep < TUTORIAL_STEPS.length 
    ? TUTORIAL_STEPS[currentStep] 
    : undefined;
  const location = useLocation();
  const navigate = useNavigate();

  // Progress and completion state
  const progress = ((currentStep + 1) / TUTORIAL_STEPS.length) * 100;

  // Check if tutorial is completed - use direct localStorage check for immediate response
  const isCompleted = typeof window !== "undefined" && localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";

  // Check if tutorial should be shown at all (based on completion flag)
  const shouldShowTutorial = useCallback(() => {
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return !completed;
  }, []);

  // Safety: whenever the step changes, always clear any stale navigation locks
  useEffect(() => {
    isNavigatingRef.current = false;
    setIsTransitioning(false);
    // Only reset collapsed state when step changes if we're not on the "follow" step
    // This allows the collapsed state to persist when navigating on the Follow Creators step
    const currentStepConfig = TUTORIAL_STEPS[currentStep];
    if (currentStepConfig?.id !== "follow") {
      setIsCollapsed(false);
    }
    // Track current step in localStorage for RecordModal to check
    if (typeof window !== "undefined") {
      localStorage.setItem("echo_garden_tutorial_current_step", String(currentStep));
      window.dispatchEvent(new CustomEvent("tutorial-step-changed"));
    }
  }, [currentStep]);

  // Track when a new route has settled before showing the overlay, to avoid janky first paint
  const [isRouteReady, setIsRouteReady] = useState(true);
  // Track when we're intentionally navigating (e.g. via "Go to Settings")
  // so we can hide the overlay during the transition.
  const [isManualRouteChange, setIsManualRouteChange] = useState(false);

  useEffect(() => {
    // Briefly hide overlay on route change, then re-enable it to avoid flicker
    setIsRouteReady(false);
    // For Settings page, give it a bit more time to render the sidebar
    const delay = location.pathname.startsWith("/settings") ? 350 : 220;
    const timeout = setTimeout(() => {
      setIsRouteReady(true);
      setIsManualRouteChange(false);
      // Trigger immediate position recalculation when route is ready for Settings
      if (location.pathname.startsWith("/settings") && step?.id === "account-linking") {
        // Try multiple times to catch the Account tab as it renders
        // Start immediately, don't wait
        calculatePosition();
        setTimeout(() => calculatePosition(), 50);
        setTimeout(() => calculatePosition(), 100);
        setTimeout(() => calculatePosition(), 150);
        setTimeout(() => calculatePosition(), 250);
        setTimeout(() => calculatePosition(), 400);
        setTimeout(() => calculatePosition(), 600);
        setTimeout(() => calculatePosition(), 800);
      }
    }, delay);
    
    // Also try calculating immediately if we're navigating to Settings for account-linking
    if (location.pathname.startsWith("/settings") && step?.id === "account-linking") {
      // Try immediately, even before route is "ready"
      setTimeout(() => calculatePosition(), 50);
      setTimeout(() => calculatePosition(), 150);
    }
    
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, step?.id]);

  // When on Settings for the Link Your Account step, advance the tutorial
  // automatically to the next step when the user clicks the Account tab OR when account tab is active
  useEffect(() => {
    if (!step || step.id !== "account-linking" || !location.pathname.startsWith("/settings")) {
      return;
    }

    const accountTab = document.querySelector(
      '[data-tutorial="settings-account-tab"]'
    ) as HTMLButtonElement | null;
    
    // Check if account tab is already active via URL
    const checkAccountTabActive = () => {
      const searchParams = new URLSearchParams(window.location.search);
      const activeTab = searchParams.get("tab");
      return activeTab === "account";
    };
    
    // If account tab is already active, advance immediately
    if (checkAccountTabActive()) {
      setTimeout(() => {
        setCurrentStep((prev) =>
          Math.min(prev + 1, TUTORIAL_STEPS.length - 1)
        );
        setTimeout(() => calculatePosition(), 100);
        setTimeout(() => calculatePosition(), 300);
        setTimeout(() => calculatePosition(), 600);
      }, 300);
      return;
    }

    // Watch for URL changes to detect when account tab becomes active
    const handleUrlChange = () => {
      if (checkAccountTabActive()) {
        setTimeout(() => {
          setCurrentStep((prev) =>
            Math.min(prev + 1, TUTORIAL_STEPS.length - 1)
          );
          setTimeout(() => calculatePosition(), 100);
          setTimeout(() => calculatePosition(), 300);
          setTimeout(() => calculatePosition(), 600);
        }, 200);
      }
    };

    // Listen for popstate (back/forward) and hashchange
    window.addEventListener('popstate', handleUrlChange);
    
    // Also check periodically in case URL changes via other means
    const urlCheckInterval = setInterval(() => {
      if (checkAccountTabActive() && step.id === "account-linking") {
        handleUrlChange();
        clearInterval(urlCheckInterval);
      }
    }, 200);

    if (!accountTab) {
      return () => {
        window.removeEventListener('popstate', handleUrlChange);
        clearInterval(urlCheckInterval);
      };
    }

    const handleAccountClick = () => {
      // Wait for tab to actually switch
      setTimeout(() => {
        if (checkAccountTabActive()) {
          setCurrentStep((prev) =>
            Math.min(prev + 1, TUTORIAL_STEPS.length - 1)
          );
          setTimeout(() => calculatePosition(), 100);
          setTimeout(() => calculatePosition(), 300);
          setTimeout(() => calculatePosition(), 600);
        }
      }, 300);
    };

    accountTab.addEventListener("click", handleAccountClick);
    return () => {
      accountTab.removeEventListener("click", handleAccountClick);
      window.removeEventListener('popstate', handleUrlChange);
      clearInterval(urlCheckInterval);
    };
  }, [step?.id, location.pathname, location.search]);

  // Route-aware gating:
  // - Most steps are meant for the main feed ('/').
  // - Account linking / settings steps also make sense on the Settings page.
  // - Follow step should show on the Following page.
  // - Voice AMAs step should show on the Voice AMAs page.
  const isOnMainFeed = location.pathname === "/";
  const isOnSettingsPage = location.pathname.startsWith("/settings");
  const isOnFollowingPage = location.pathname === "/following";
  const isOnVoiceAmasPage = location.pathname === "/voice-amas";
  const settingsStepIds = new Set(["account-linking", "account-pin", "settings"]);

  // Check if record modal is open during tutorial (should hide overlay)
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  
  useEffect(() => {
    const checkRecordModalState = () => {
      const recordModalOpen = localStorage.getItem("echo_garden_record_modal_tutorial_open");
      setIsRecordModalOpen(recordModalOpen === "true");
    };
    
    // Check immediately
    checkRecordModalState();
    
    // Listen for changes
    const handleRecordModalStateChange = () => {
      checkRecordModalState();
    };
    
    window.addEventListener("record-modal-tutorial-state-changed", handleRecordModalStateChange);
    
    // Also check periodically in case localStorage changes from another tab/window
    const interval = setInterval(checkRecordModalState, 100);
    
    return () => {
      window.removeEventListener("record-modal-tutorial-state-changed", handleRecordModalStateChange);
      clearInterval(interval);
    };
  }, []);

  // Compute whether the tutorial overlay should actually be visible on this route/step
  const isVisible =
    shouldShowTutorial() &&
    !isCompleted &&
    isRouteReady &&
    !isManualRouteChange &&
    !isRecordModalOpen && // Hide overlay when record modal is open during tutorial
    (isOnMainFeed || (isOnSettingsPage && settingsStepIds.has(step.id)) || (isOnFollowingPage && step.id === "follow") || (isOnVoiceAmasPage && step.id === "voice-amas"));

  // NOTE: We intentionally do NOT lock body scroll here anymore.
  // Global scroll locking caused issues when navigating between pages
  // (e.g. getting "stuck" on Settings without a visible modal).
  // The overlay itself is non-interactive outside the highlighted cutout,
  // so it's safe to let the page scroll normally underneath.

  // Mark tutorial as completed
  const markCompleted = useCallback(() => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
    // Dispatch custom event so parent component can react immediately
    window.dispatchEvent(new Event("tutorial-completed"));
    onComplete();
  }, [onComplete]);

  // Calculate tooltip position with smooth updates and proper viewport handling
  const calculatePosition = useCallback(() => {
    if (positionUpdateRef.current) {
      cancelAnimationFrame(positionUpdateRef.current);
    }

    positionUpdateRef.current = requestAnimationFrame(() => {
      // Safety check: ensure step exists
      if (!step || !step.targetSelector) {
        setTargetElement(null);
        setTooltipPosition(null);
        setHighlightRect(null);
        return;
      }

      // Use a more specific query to avoid matching wrong elements
      let element: HTMLElement | null = null;
      try {
        element = document.querySelector(step.targetSelector) as HTMLElement;
      } catch (error) {
        console.warn("Error querying element for tutorial:", error);
        setTargetElement(null);
        setTooltipPosition(null);
        setHighlightRect(null);
        return;
      }
      
      // Special handling for specific steps to ensure correct targeting
      if (step.id === "record-button") {
        // Find the fixed bottom-right container specifically
        const allRecordButtons = document.querySelectorAll('[data-tutorial="record-button"]');
        let container: HTMLElement | null = null;
        for (const btn of Array.from(allRecordButtons)) {
          if (btn.classList.contains("fixed")) {
            container = btn as HTMLElement;
            break;
          }
        }
        // Now find the actual record button (Plus icon) within the container, not the post button
        if (container) {
          // Find the button with Plus icon - it's the larger one (h-16 w-16) with the Plus icon
          const buttons = Array.from(container.querySelectorAll('button'));
          
          // Sort buttons by size - record button is larger (64px vs 56px)
          const buttonsWithSize = buttons.map(btn => ({
            element: btn as HTMLElement,
            rect: btn.getBoundingClientRect(),
            hasPlus: !!btn.querySelector('svg') // Check if it has an SVG (both have icons, but Plus is in record button)
          }));
          
          // Find the button that:
          // 1. Is larger (record button is h-16 w-16 = 64px, post button is h-14 w-14 = 56px)
          // 2. Has a Plus icon (h-8 w-8 SVG)
          let recordButton = buttonsWithSize.find(btn => {
            const rect = btn.rect;
            const isLarge = rect.height >= 60 && rect.width >= 60; // Record button is 64px
            const hasPlusIcon = btn.element.querySelector('svg.h-8.w-8') || 
                              btn.element.querySelector('svg[class*="h-8"][class*="w-8"]');
            return isLarge && hasPlusIcon;
          });
          
          // Fallback: if no exact match, use the largest button
          if (!recordButton) {
            recordButton = buttonsWithSize.reduce((largest, current) => 
              (current.rect.height * current.rect.width) > (largest.rect.height * largest.rect.width) 
                ? current 
                : largest
            );
          }
          
          if (recordButton) {
            element = recordButton.element;
          } else {
            // Final fallback to container
            element = container;
          }
        }
      } else if (step.id === "filters") {
        // Prefer highlighting the category filter row (with the dropdown),
        // so the highlight clearly covers the category selector + its info.
        const allFilters = document.querySelectorAll('[data-tutorial="filters"]');
        let preferred: HTMLElement | null = null;

        for (const filter of Array.from(allFilters)) {
          const el = filter as HTMLElement;
          // Heuristic: the category row contains the "Filter by category" select/label
          const hasCategoryText = el.textContent?.includes("Filter by category");
          const hasSelectTrigger = !!el.querySelector('[role="combobox"], [data-radix-select-trigger]');

          if (hasCategoryText || hasSelectTrigger) {
            preferred = el;
            break;
          }
        }

        if (preferred) {
          element = preferred;
        } else if (allFilters.length > 0) {
          // Fallback: at least highlight the first filters container
          element = allFilters[0] as HTMLElement;
        }
      } else if (step.id === "follow") {
        // For "Follow Creators", when on Following page, highlight all mock creator cards
        // Otherwise, highlight the Following tab in the header nav.
        if (location.pathname === "/following") {
          // On Following page, find all mock creator cards to highlight them all
          const allCreatorCards = document.querySelectorAll('[data-tutorial="mock-creator-card"]') as NodeListOf<HTMLElement>;
          
          if (allCreatorCards.length > 0) {
            // Use the first card as the base element for positioning
            element = allCreatorCards[0];
          } else {
            // Fallback: try to find any creator-related element
            const creatorGrid = document.querySelector('[data-tutorial="creator-profile"]')?.closest('[data-tutorial="mock-creator-card"]') as HTMLElement | null;
            const followButton = document.querySelector('[data-tutorial="follow-button"]') as HTMLElement | null;
            
            if (creatorGrid) {
              element = creatorGrid;
            } else if (followButton) {
              element = followButton;
            } else {
              // Last resort: show center tooltip
              element = null;
            }
          }
        } else {
          const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
          if (nav) {
            const followingLink = nav.querySelector('a[aria-label="Following"]') as HTMLElement | null;
            if (followingLink) {
              // Prefer the button wrapper if present so the whole icon button is highlighted
              const buttonWrapper = followingLink.closest("button") as HTMLElement | null;
              element = buttonWrapper || followingLink;
            } else {
              // Fallback to the whole navigation strip
              element = nav;
            }
          }
        }
      } else if (step.id === "communities") {
        // For "Communities", highlight the Communities tab/icon in the header nav.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        if (nav) {
          const communitiesLink = nav.querySelector('a[aria-label="Communities"]') as HTMLElement | null;
          if (communitiesLink) {
            const buttonWrapper = communitiesLink.closest("button") as HTMLElement | null;
            element = buttonWrapper || communitiesLink;
          } else {
            element = nav;
          }
        }
      } else if (step.id === "live-rooms") {
        // For "Live Audio Rooms", highlight the Live Rooms tab/icon in the header nav.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        if (nav) {
          const liveRoomsLink = nav.querySelector('a[aria-label="Live Rooms"]') as HTMLElement | null;
          if (liveRoomsLink) {
            const buttonWrapper = liveRoomsLink.closest("button") as HTMLElement | null;
            element = buttonWrapper || liveRoomsLink;
          } else {
            element = nav;
          }
        }
      } else if (step.id === "voice-amas") {
        // For "Voice AMAs", when on Voice AMAs page, show center tooltip
        // Otherwise, highlight the Voice AMAs icon in the header nav.
        if (location.pathname === "/voice-amas") {
          // On Voice AMAs page, don't highlight a specific element - show center tooltip
          element = null;
        } else {
          const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
          if (nav) {
            const amasLink = nav.querySelector('a[aria-label="Voice AMAs"]') as HTMLElement | null;
            if (amasLink) {
              const buttonWrapper = amasLink.closest("button") as HTMLElement | null;
              element = buttonWrapper || amasLink;
            } else {
              element = nav;
            }
          }
        }
      } else if (step.id === "saved-clips") {
        // For "Saved Clips & Bookmarks", highlight the Saved Clips icon/tab.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        if (nav) {
          const savedLink = nav.querySelector('a[aria-label="Saved Clips"]') as HTMLElement | null;
          if (savedLink) {
            const buttonWrapper = savedLink.closest("button") as HTMLElement | null;
            element = buttonWrapper || savedLink;
          } else {
            element = nav;
          }
        }
      } else if (step.id === "leaderboards") {
        // For "Leaderboards", highlight the Leaderboards icon in the header nav.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        if (nav) {
          const leaderboardsLink = nav.querySelector('a[aria-label="Leaderboards"]') as HTMLElement | null;
          if (leaderboardsLink) {
            const buttonWrapper = leaderboardsLink.closest("button") as HTMLElement | null;
            element = buttonWrapper || leaderboardsLink;
          } else {
            element = nav;
          }
        }
      } else if (step.id === "discovery") {
        // For "Discovery Feed", highlight the Discovery icon in the header nav.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        if (nav) {
          const discoveryLink = nav.querySelector('a[aria-label="Discovery"]') as HTMLElement | null;
          if (discoveryLink) {
            const buttonWrapper = discoveryLink.closest("button") as HTMLElement | null;
            element = buttonWrapper || discoveryLink;
          } else {
            element = nav;
          }
        }
      } else if (step.id === "eighteen-plus") {
        // For 18+ Content, highlight the 18+ icon (if visible) in the header nav.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        if (nav) {
          const eighteenPlusLink = nav.querySelector('a[aria-label="18+ Content"]') as HTMLElement | null;
          if (eighteenPlusLink) {
            const buttonWrapper = eighteenPlusLink.closest("button") as HTMLElement | null;
            element = buttonWrapper || eighteenPlusLink;
          } else {
            element = nav;
          }
        }
      } else if (step.id === "encrypted-diary") {
        // For "Encrypted Diary", rely on [data-tutorial="diary"] but ensure we target the button if present.
        const diaryLink = document.querySelector('[data-tutorial="diary"]') as HTMLElement | null;
        if (diaryLink) {
          const buttonWrapper = diaryLink.closest("button") as HTMLElement | null;
          element = buttonWrapper || diaryLink;
        }
      } else if (step.id === "account-linking") {
        // For "Link Your Account":
        // - On main feed, highlight the Settings icon in the header nav (Step 1).
        // - On Settings page, highlight the Account tab in the sidebar (Step 2).
        if (location.pathname.startsWith("/settings")) {
          const accountTab = document.querySelector(
            '[data-tutorial="settings-account-tab"]'
          ) as HTMLElement | null;
          if (accountTab) {
            element = accountTab;
          } else {
            // Fallback: if Account tab isn't yet rendered, highlight Settings icon
            const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
            if (nav) {
              const settingsLink = nav.querySelector('a[aria-label="Settings"]') as HTMLElement | null;
              if (settingsLink) {
                const buttonWrapper = settingsLink.closest("button") as HTMLElement | null;
                element = buttonWrapper || settingsLink;
              } else {
                element = nav;
              }
            }
          }
        } else {
          const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
          if (nav) {
            const settingsLink = nav.querySelector('a[aria-label="Settings"]') as HTMLElement | null;
            if (settingsLink) {
              const buttonWrapper = settingsLink.closest("button") as HTMLElement | null;
              element = buttonWrapper || settingsLink;
            } else {
              // Fallback to whole nav so at least something is highlighted
              element = nav;
            }
          }
        }
      } else if (step.id === "account-pin") {
        // For PIN step, highlight the Account Linking section in Account tab.
        if (location.pathname.startsWith("/settings")) {
          // First, ensure we're on the account tab by checking URL
          const searchParams = new URLSearchParams(window.location.search);
          const activeTab = searchParams.get("tab");
          
          // Try to find the linking section
          const linkingSection = document.querySelector(
            '[data-tutorial="settings-account-linking"]'
          ) as HTMLElement | null;
          
          if (linkingSection) {
            element = linkingSection;
          } else if (activeTab === "account") {
            // If on account tab but section not found, try broader search
            const accountContent = document.querySelector('[role="tabpanel"]') as HTMLElement | null;
            if (accountContent) {
              // Look for any element with "PIN" or "linking" in it
              const pinSection = Array.from(accountContent.querySelectorAll('*')).find(el => {
                const text = el.textContent?.toLowerCase() || '';
                return text.includes('pin') || text.includes('linking') || el.hasAttribute('data-tutorial');
              }) as HTMLElement | null;
              if (pinSection) {
                element = pinSection;
              } else {
                element = accountContent;
              }
            }
          }
        }
      } else if (step.id === "notifications") {
        // For "Notifications", highlight the bell icon button from NotificationCenter.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        // NotificationCenter renders its own button with aria-label="Notifications"
        const notifButton = document.querySelector('button[aria-label="Notifications"]') as HTMLElement | null;
        if (notifButton) {
          element = notifButton;
        } else if (nav) {
          element = nav;
        }
      } else if (step.id === "keyboard-shortcuts") {
        // For "Keyboard Shortcuts", highlight the keyboard icon button in the header.
        const shortcutsButton = document.querySelector(
          'button[aria-label="Keyboard shortcuts"]'
        ) as HTMLElement | null;
        if (shortcutsButton) {
          element = shortcutsButton;
        }
      } else if (step.id === "settings") {
        // For "Settings & Customization", highlight the Settings icon in the header.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        if (nav) {
          const settingsLink = nav.querySelector('a[aria-label="Settings"]') as HTMLElement | null;
          if (settingsLink) {
            const buttonWrapper = settingsLink.closest("button") as HTMLElement | null;
            element = buttonWrapper || settingsLink;
          } else {
            element = nav;
          }
        }
      } else if (step.id === "my-recordings") {
        // For "My Recordings", prefer a dedicated header entry point if one exists.
        const nav = document.querySelector('[data-tutorial="navigation"]') as HTMLElement | null;
        if (nav) {
          const recordingsLink =
            (nav.querySelector('a[href="/my-recordings"]') as HTMLElement | null) ||
            (nav.querySelector('a[aria-label*="My Recordings" i]') as HTMLElement | null) ||
            (nav.querySelector('button[aria-label*="My Recordings" i]') as HTMLElement | null);

          if (recordingsLink) {
            const buttonWrapper = recordingsLink.closest("button") as HTMLElement | null;
            element = buttonWrapper || recordingsLink;
          }
        }
      } else if (step.id === "today-topic") {
        // Find the today topic element
        const todayTopic = document.querySelector('[data-tutorial="today-topic"]') as HTMLElement;
        if (todayTopic) {
          element = todayTopic;
        } else {
          // Fallback: if Daily Topics card is not rendered (e.g. no data from Supabase),
          // highlight the feed-sorting bar instead so step 3 still has a visible indicator.
          const fallback = document.querySelector('[data-tutorial="feed-sorting"]') as HTMLElement;
          if (fallback) {
            element = fallback;
          }
        }
      } else if (step.id === "feed-sorting") {
        // Step 4 behavior:
        // - By default, target the feed-sorting bar so For You, Chamber,
        //   and Hot/Top/Trending are all inside the same spotlight.
        // - When Chamber is the active mode, target the Chamber / Welcome Garden
        //   card but still visually highlight both the bar and the card.
        const chamberCard = document.querySelector('[data-tutorial="chamber-card"]') as HTMLElement | null;
        if (feedSortingState === "chamber" && chamberCard) {
          element = chamberCard;
        } else {
          const feedBar = document.querySelector('[data-tutorial="feed-sorting"]') as HTMLElement | null;
          if (feedBar) {
            element = feedBar;
          }
        }
      } else if (step.id === "clip-interactions") {
        // Find the first visible clip card
        const clipCard = document.querySelector('[data-tutorial="clip-card"]') as HTMLElement;
        if (clipCard) {
          element = clipCard;
        }
      } else if (step.targetSelector) {
        // For all other steps, ensure we get the correct element
        const found = document.querySelector(step.targetSelector) as HTMLElement;
        if (found) {
          element = found;
        }
      }
      
      if (!element) {
        // For Feed Sorting (step 4), keep the existing highlight/tooltip even if
        // the underlying DOM reshuffles (e.g. user toggles Hot/Top/For You).
        // This prevents the tutorial from disappearing when filters are changed.
        if (step.id !== "feed-sorting") {
          setTargetElement(null);
          setTooltipPosition(null);
          setHighlightRect(null);
        }
        return;
      }

      setTargetElement(element);

      // Compute base rect for positioning (this is the primary target element)
      const rect = element.getBoundingClientRect();
      
      // For Feed Sorting step:
      // - Always highlight the feed-sorting bar.
      // - If Chamber is active, also include the Chamber card in the union.
      // - If the For You dropdown is open, also include the dropdown panel.
      if (step.id === "feed-sorting") {
        const feedBar = document.querySelector('[data-tutorial="feed-sorting"]') as HTMLElement | null;
        const popover = document.querySelector('[data-tutorial="feed-sorting-popover"]') as HTMLElement | null;
        const chamberCard = document.querySelector('[data-tutorial="chamber-card"]') as HTMLElement | null;

        if (feedBar) {
          // Start with the bar rect
          const barRect = feedBar.getBoundingClientRect();
          let top = barRect.top;
          let left = barRect.left;
          let right = barRect.right;
          let bottom = barRect.bottom;

          // If For You dropdown is visible, expand union to include it
          if (popover) {
            const popRect = popover.getBoundingClientRect();
            const popoverVisible =
              popover.getAttribute("data-state") === "open" &&
              popRect.width > 0 &&
              popRect.height > 0 &&
              getComputedStyle(popover).display !== "none" &&
              popover.offsetParent !== null;
            if (popoverVisible) {
              top = Math.min(top, popRect.top);
              left = Math.min(left, popRect.left);
              right = Math.max(right, popRect.right);
              bottom = Math.max(bottom, popRect.bottom);
            }
          }

          // If Chamber is active and the card is present, union that as well
          if (feedSortingState === "chamber" && chamberCard) {
            const chamberRect = chamberCard.getBoundingClientRect();
            top = Math.min(top, chamberRect.top);
            left = Math.min(left, chamberRect.left);
            right = Math.max(right, chamberRect.right);
            bottom = Math.max(bottom, chamberRect.bottom);
          }

          const combinedRect = {
            top,
            left,
            right,
            bottom,
            width: 0,
            height: 0,
          } as DOMRect;
          (combinedRect as any).width = combinedRect.right - combinedRect.left;
          (combinedRect as any).height = combinedRect.bottom - combinedRect.top;
          setHighlightRect(combinedRect);
        } else {
          // Fallback: just use the main element's rect
          setHighlightRect(rect);
        }
      } else if (step.id === "follow" && location.pathname === "/following") {
        // For "Follow Creators" on Following page: highlight all creator cards
        const allCreatorCards = document.querySelectorAll('[data-tutorial="mock-creator-card"]') as NodeListOf<HTMLElement>;
        
        if (allCreatorCards.length > 0) {
          // Start with the first card's rect
          const firstRect = allCreatorCards[0].getBoundingClientRect();
          let top = firstRect.top;
          let left = firstRect.left;
          let right = firstRect.right;
          let bottom = firstRect.bottom;
          
          // Expand to include all other cards
          allCreatorCards.forEach((card) => {
            const cardRect = card.getBoundingClientRect();
            top = Math.min(top, cardRect.top);
            left = Math.min(left, cardRect.left);
            right = Math.max(right, cardRect.right);
            bottom = Math.max(bottom, cardRect.bottom);
          });
          
          const combinedRect = {
            top,
            left,
            right,
            bottom,
            width: 0,
            height: 0,
          } as DOMRect;
          (combinedRect as any).width = combinedRect.right - combinedRect.left;
          (combinedRect as any).height = combinedRect.bottom - combinedRect.top;
          setHighlightRect(combinedRect);
        } else {
          // Fallback: just use the main element's rect
          setHighlightRect(rect);
        }
      } else if (step.id === "filters") {
        // For Filters & Discovery:
        // - Highlight the filters row (category selector).
        // - If the category dropdown is open, expand highlight to include the dropdown panel.
        let top = rect.top;
        let left = rect.left;
        let right = rect.right;
        let bottom = rect.bottom;

        // Try to find an open Radix Select dropdown (used by the category filter)
        const selectContent =
          (document.querySelector('[data-radix-select-content]') as HTMLElement | null) ||
          (document.querySelector('[role="listbox"]') as HTMLElement | null);

        if (selectContent) {
          const popRect = selectContent.getBoundingClientRect();
          const popoverVisible =
            (selectContent.getAttribute("data-state") === "open" || selectContent.getAttribute("data-state") === "visible" || !selectContent.getAttribute("data-state")) &&
            popRect.width > 0 &&
            popRect.height > 0 &&
            getComputedStyle(selectContent).display !== "none" &&
            selectContent.offsetParent !== null;

          if (popoverVisible) {
            top = Math.min(top, popRect.top);
            left = Math.min(left, popRect.left);
            right = Math.max(right, popRect.right);
            bottom = Math.max(bottom, popRect.bottom);
          }
        }

        const combinedRect = {
          top,
          left,
          right,
          bottom,
          width: 0,
          height: 0,
        } as DOMRect;
        (combinedRect as any).width = combinedRect.right - combinedRect.left;
        (combinedRect as any).height = combinedRect.bottom - combinedRect.top;
        setHighlightRect(combinedRect);
      } else {
        setHighlightRect(rect);
      }

      // Responsive tooltip dimensions
      const isMobile = window.innerWidth < 768;
      const tooltipWidth = isMobile ? Math.min(340, window.innerWidth - 32) : Math.min(400, window.innerWidth - 40);
      const tooltipHeight = isMobile ? 320 : 280;
      const spacing = isMobile ? 32 : 48;
      const highlightPadding = 12;
      const viewportPadding = isMobile ? 16 : 20;
      const safeAreaPadding = 8; // Extra padding for safe areas

      let top = 0;
      let left = 0;
      let preferredPosition = step.position || "bottom";

      // Calculate spacing that accounts for highlight ring
      const effectiveSpacing = spacing + (step.highlight ? highlightPadding : 0);

      // Smart positioning based on available space
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const spaceAbove = rect.top;
      const spaceBelow = viewportHeight - rect.bottom;
      const spaceLeft = rect.left;
      const spaceRight = viewportWidth - rect.right;

      // Define viewport bounds early so they can be used in all positioning blocks
      const minLeft = viewportPadding;
      const maxLeft = viewportWidth - tooltipWidth - viewportPadding;
      const minTop = viewportPadding;
      const maxTop = viewportHeight - tooltipHeight - viewportPadding;

      // Determine best position based on available space
      if (step.position === "top" && spaceAbove < tooltipHeight + effectiveSpacing) {
        preferredPosition = "bottom";
      } else if (step.position === "bottom" && spaceBelow < tooltipHeight + effectiveSpacing) {
        preferredPosition = "top";
      } else if (step.position === "left" && spaceLeft < tooltipWidth + effectiveSpacing) {
        preferredPosition = "right";
      } else if (step.position === "right" && spaceRight < tooltipWidth + effectiveSpacing) {
        preferredPosition = "left";
      }

      // Special handling for record button at bottom-right
      if (step.id === "record-button") {
        // Always position to the left on desktop, above on mobile
        // Use minimal spacing to keep tooltip close but not overlapping
        const extraSpacing = isMobile ? 12 : 16;
        
        if (isMobile) {
          preferredPosition = "top";
          // Calculate position above button with minimal spacing
          const desiredTop = rect.top - tooltipHeight - effectiveSpacing - extraSpacing;
          // If not enough space above, position below instead
          if (desiredTop < minTop) {
            top = Math.min(rect.bottom + effectiveSpacing + extraSpacing, maxTop);
            preferredPosition = "bottom";
          } else {
            top = Math.max(minTop, desiredTop);
          }
          // Center horizontally relative to button, but ensure it's not off-screen
          const desiredLeft = rect.left + rect.width / 2 - tooltipWidth / 2;
          left = Math.max(minLeft, Math.min(desiredLeft, maxLeft));
        } else {
          preferredPosition = "left";
          // Calculate position to the left of button with minimal spacing
          const desiredLeft = rect.left - tooltipWidth - effectiveSpacing - extraSpacing;
          // If not enough space on left, position to the right instead
          if (desiredLeft < minLeft) {
            left = Math.min(rect.right + effectiveSpacing + extraSpacing, maxLeft);
            preferredPosition = "right";
          } else {
            left = Math.max(minLeft, desiredLeft);
          }
          // Position tooltip much higher - well above the button
          // Since button is at bottom-right corner, position tooltip in upper portion of screen
          // Calculate position to be above the button with good spacing
          const spaceAboveButton = rect.top;
          const tooltipWithSpacing = tooltipHeight + effectiveSpacing + extraSpacing;
          
          if (spaceAboveButton >= tooltipWithSpacing) {
            // Enough space above button - position it above
            top = rect.top - tooltipHeight - effectiveSpacing - extraSpacing;
          } else {
            // Not enough space above - position it in the middle-upper portion of screen
            // Place it at about 30% from top of viewport
            top = Math.max(minTop, viewportHeight * 0.3);
          }
          
          // Final clamp to ensure it's on screen
          top = Math.max(minTop, Math.min(top, maxTop));
        }
        
        // Final clamp to ensure tooltip is always within viewport
        left = Math.max(minLeft, Math.min(left, maxLeft));
        top = Math.max(minTop, Math.min(top, maxTop));
      } else if (step.id === "today-topic") {
        // Special handling for today-topic - position well to the right and higher up
        preferredPosition = "right";
        const extraSpacing = 48; // Much more space to move it off the indicator
        const verticalOffset = -60; // Move it higher up, not centered
        
        // Position to the right with generous spacing
        left = rect.right + effectiveSpacing + extraSpacing;
        // Position higher up (above the element, not centered)
        top = rect.top + verticalOffset;
        
        // If tooltip goes off screen to the right, position it to the left instead
        if (left + tooltipWidth > viewportWidth - viewportPadding) {
          left = rect.left - tooltipWidth - effectiveSpacing - extraSpacing;
          preferredPosition = "left";
          // Keep it higher when on left side too
          top = rect.top + verticalOffset;
        }
        
        // If positioned too high, adjust to stay in viewport
        if (top < minTop) {
          top = minTop;
        }
        
        // Ensure it stays within viewport bounds (but preserve our intentional positioning)
        left = Math.max(minLeft, Math.min(left, maxLeft));
        top = Math.max(minTop, Math.min(top, maxTop));
      } else if (step.id === "feed-sorting") {
        // Special handling for feed-sorting
        const extraSpacing = isMobile ? 10 : 14;

        if (feedSortingState === "chamber") {
          // Anchor above the combined Chamber + bar area, shifted extremely far to the right
          preferredPosition = "top";
          const desiredTop = rect.top - tooltipHeight - effectiveSpacing - extraSpacing;
          // Push even further to the right; viewport clamping will keep it on-screen
          const desiredLeft = rect.left + rect.width / 2 - tooltipWidth / 2 + (isMobile ? 140 : 320);
          top = Math.max(minTop, Math.min(desiredTop, maxTop));
          left = Math.max(minLeft, Math.min(desiredLeft, maxLeft));
        } else {
          // Always anchor the tooltip to the right of the feed-sorting bar (or For You trigger when active)
          const forYouTrigger = document.querySelector('[data-tutorial="feed-sorting-trigger"]') as HTMLElement | null;
          const anchorRect =
            feedSortingState === "for_you" && forYouTrigger
              ? forYouTrigger.getBoundingClientRect()
              : rect;

          preferredPosition = "right";
          const desiredTop = anchorRect.top + anchorRect.height / 2 - tooltipHeight / 2;
          const desiredLeft = anchorRect.right + effectiveSpacing + extraSpacing;

          top = Math.max(minTop, Math.min(desiredTop, maxTop));
          left = Math.max(minLeft, Math.min(desiredLeft, maxLeft));
        }
      } else if (step.id === "follow") {
        // Special handling for "Follow Creators" step
        if (location.pathname === "/following") {
          // On Following page: position tooltip to the right of all cards, not overlapping
          preferredPosition = "right";
          // Position it to the right of the cards with more spacing to avoid overlap
          const rightSpacing = 400; // More space between cards and tooltip to prevent overlap
          top = rect.top + rect.height / 2 - tooltipHeight / 2;
          left = rect.right + rightSpacing; // Position to the right of the cards
          
          // Auto-scroll to show the creator cards when this step is active
          if (element) {
            setTimeout(() => {
              element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
            }, 100);
          }
        } else {
          // On other pages: move tooltip to the right of the navigation
          preferredPosition = step.position || "bottom";
          const extraRightOffset = 40; // Move it to the right by 40px
          
          if (preferredPosition === "bottom") {
            top = rect.bottom + effectiveSpacing;
            left = rect.left + rect.width / 2 - tooltipWidth / 2 + extraRightOffset;
          } else if (preferredPosition === "top") {
            top = rect.top - tooltipHeight - effectiveSpacing;
            left = rect.left + rect.width / 2 - tooltipWidth / 2 + extraRightOffset;
          } else if (preferredPosition === "right") {
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
            left = rect.right + effectiveSpacing + extraRightOffset;
          } else {
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
            left = rect.left - tooltipWidth - effectiveSpacing - extraRightOffset;
          }
        }
        
        // Ensure it stays within viewport bounds
        left = Math.max(minLeft, Math.min(left, maxLeft));
        top = Math.max(minTop, Math.min(top, maxTop));
      } else {
        // Calculate position based on preferred position
        switch (preferredPosition) {
          case "top":
            top = rect.top - tooltipHeight - effectiveSpacing;
            left = rect.left + rect.width / 2 - tooltipWidth / 2;
            break;
          case "bottom":
            top = rect.bottom + effectiveSpacing;
            left = rect.left + rect.width / 2 - tooltipWidth / 2;
            break;
          case "left":
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
            left = rect.left - tooltipWidth - effectiveSpacing;
            break;
          case "right":
            top = rect.top + rect.height / 2 - tooltipHeight / 2;
            left = rect.right + effectiveSpacing;
            break;
          default:
            top = viewportHeight / 2 - tooltipHeight / 2;
            left = viewportWidth / 2 - tooltipWidth / 2;
        }
      }

      // Clamp horizontal position (viewport bounds already defined above)
      if (left < minLeft) {
        left = minLeft;
      } else if (left > maxLeft) {
        left = maxLeft;
      }

      // Clamp vertical position
      if (top < minTop) {
        top = minTop;
      } else if (top > maxTop) {
        top = maxTop;
      }

      // Adjust if tooltip would overlap with highlighted element
      if (step.highlight && rect) {
        const tooltipBottom = top + tooltipHeight;
        const tooltipRight = left + tooltipWidth;
        const elementTop = rect.top - highlightPadding;
        const elementBottom = rect.bottom + highlightPadding;
        const elementLeft = rect.left - highlightPadding;
        const elementRight = rect.right + highlightPadding;

        // Check for overlap
        const overlaps = (
          top < elementBottom + effectiveSpacing &&
          tooltipBottom > elementTop - effectiveSpacing &&
          left < elementRight + effectiveSpacing &&
          tooltipRight > elementLeft - effectiveSpacing
        );

        if (overlaps) {
          // Try alternative positions in order of preference
          const alternatives = [
            // Try right side
            () => {
              const newLeft = elementRight + effectiveSpacing;
              const newTop = elementTop + (elementBottom - elementTop) / 2 - tooltipHeight / 2;
              if (newLeft + tooltipWidth <= viewportWidth - viewportPadding && 
                  newTop >= minTop && newTop + tooltipHeight <= maxTop) {
                return { left: newLeft, top: newTop };
              }
              return null;
            },
            // Try left side
            () => {
              const newLeft = elementLeft - tooltipWidth - effectiveSpacing;
              const newTop = elementTop + (elementBottom - elementTop) / 2 - tooltipHeight / 2;
              if (newLeft >= viewportPadding && 
                  newTop >= minTop && newTop + tooltipHeight <= maxTop) {
                return { left: newLeft, top: newTop };
              }
              return null;
            },
            // Try above
            () => {
              const newTop = elementTop - tooltipHeight - effectiveSpacing * 1.5;
              const elementWidth = rect.width;
              const newLeft = Math.max(minLeft, Math.min(elementLeft + elementWidth / 2 - tooltipWidth / 2, maxLeft));
              if (newTop >= minTop) {
                return { left: newLeft, top: newTop };
              }
              return null;
            },
            // Try below
            () => {
              const newTop = elementBottom + effectiveSpacing * 1.5;
              const elementWidth = rect.width;
              const newLeft = Math.max(minLeft, Math.min(elementLeft + elementWidth / 2 - tooltipWidth / 2, maxLeft));
              if (newTop + tooltipHeight <= maxTop) {
                return { left: newLeft, top: newTop };
              }
              return null;
            },
          ];

          // Try each alternative until one works
          for (const alt of alternatives) {
            const result = alt();
            if (result) {
              left = result.left;
              top = result.top;
              break;
            }
          }

          // Final clamp to ensure it's still in bounds
          left = Math.max(minLeft, Math.min(left, maxLeft));
          top = Math.max(minTop, Math.min(top, maxTop));
        }
      }

      // Final safety check - ensure tooltip is fully visible
      left = Math.max(safeAreaPadding, Math.min(left, viewportWidth - tooltipWidth - safeAreaPadding));
      top = Math.max(safeAreaPadding, Math.min(top, viewportHeight - tooltipHeight - safeAreaPadding));

      setTooltipPosition({ top, left });
    });
  }, [step, feedSortingState]);

  // Update position on scroll/resize with debouncing
  useEffect(() => {
    if (step.targetSelector) {
      // Don't set transitioning on step change - let it be smooth
      // Initial calculation with minimal delay
      const initialTimeout = setTimeout(() => {
        calculatePosition();
      }, 50);

      let resizeTimeout: NodeJS.Timeout;
      const handleResize = () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
          calculatePosition();
          // Force a re-render to update tooltip size
          if (tooltipRef.current) {
            const event = new Event('resize');
            window.dispatchEvent(event);
          }
        }, 150); // Increased debounce to reduce lag
      };

      let scrollTimeout: NodeJS.Timeout;
      const handleScroll = () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          calculatePosition();
        }, 100); // Increased debounce to reduce lag
      };

      // Throttle theme changes to prevent lag
      let themeChangeTimeout: NodeJS.Timeout;
      const handleThemeChange = () => {
        clearTimeout(themeChangeTimeout);
        themeChangeTimeout = setTimeout(() => {
          calculatePosition();
        }, 200); // Delay position recalculation on theme change
      };

      window.addEventListener("resize", handleResize, { passive: true });
      window.addEventListener("scroll", handleScroll, { passive: true, capture: true });
      // Listen for theme changes (class changes on html/body)
      const observer = new MutationObserver(handleThemeChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class']
      });

      // Smooth scroll to element if needed with better visibility check
      let element = document.querySelector(step.targetSelector) as HTMLElement;
      
      // Special handling for account-linking step on Settings page
      if (step.id === "account-linking" && location.pathname.startsWith("/settings")) {
        // Try to find Account tab immediately
        const accountTab = document.querySelector('[data-tutorial="settings-account-tab"]') as HTMLElement | null;
        if (accountTab) {
          element = accountTab;
        }
        // Also set up a MutationObserver to watch for Account tab appearing
        const observer = new MutationObserver(() => {
          const accountTab = document.querySelector('[data-tutorial="settings-account-tab"]') as HTMLElement | null;
          if (accountTab) {
            calculatePosition();
            observer.disconnect();
          }
        });
        const settingsContainer = document.querySelector('[data-tutorial="navigation"]')?.closest('div') || 
                                  document.querySelector('main') || 
                                  document.body;
        observer.observe(settingsContainer, {
          childList: true,
          subtree: true,
        });
        // Disconnect after 5 seconds to avoid memory leaks
        setTimeout(() => observer.disconnect(), 5000);
      }
      
      // Special handling for record button to ensure we get the right container
      if (step.id === "record-button") {
        const recordContainer = document.querySelector('[data-tutorial="record-button"]') as HTMLElement;
        if (recordContainer && recordContainer.classList.contains("fixed")) {
          // Make sure we got the fixed bottom-right container, not something else
          element = recordContainer;
        }
      }
      
      if (element && step.highlight) {
        // Wait a bit for layout to settle
        setTimeout(() => {
          const rect = element.getBoundingClientRect();
          const viewportPadding = 100; // Padding to ensure element is well within viewport
          const isVisible = 
            rect.top >= viewportPadding &&
            rect.left >= viewportPadding &&
            rect.bottom <= window.innerHeight - viewportPadding &&
            rect.right <= window.innerWidth - viewportPadding;

          if (!isVisible) {
            // Use scrollIntoView with better options
            element.scrollIntoView({ 
              behavior: "smooth", 
              block: "center", 
              inline: "center",
              scrollMode: "if-needed"
            });
            
            // Recalculate position after scroll
            setTimeout(() => {
              calculatePosition();
            }, 500);
          }
        }, 100);
      }

      return () => {
        clearTimeout(initialTimeout);
        clearTimeout(resizeTimeout);
        clearTimeout(scrollTimeout);
        clearTimeout(themeChangeTimeout);
        window.removeEventListener("resize", handleResize);
        window.removeEventListener("scroll", handleScroll, true);
        observer.disconnect();
        if (positionUpdateRef.current) {
          cancelAnimationFrame(positionUpdateRef.current);
        }
      };
    } else {
      setTargetElement(null);
      setTooltipPosition(null);
      setHighlightRect(null);
      setIsTransitioning(false);
    }
  }, [step, calculatePosition]);

  // Prevent body scroll and interactions during tutorial
  useEffect(() => {
    if (!isVisible) {
      return;
    }

    // Lock body scroll aggressively
    const originalOverflow = document.body.style.overflow || '';
    const originalPosition = document.body.style.position || '';
    const originalWidth = document.body.style.width || '';
    const originalHeight = document.body.style.height || '';
    const originalTop = document.body.style.top || '';
    
    // For account-linking step on Settings page, allow scrolling within Settings content
    const isAccountLinkingOnSettings = step?.id === "account-linking" && location.pathname.startsWith("/settings");
    
    const lockScroll = () => {
      // Get current scroll position before locking
      const scrollY = window.scrollY || window.pageYOffset;
      
      // Lock body/html scroll
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.body.style.top = `-${scrollY}px`;
      
      // Also lock html element
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.position = 'fixed';
      document.documentElement.style.height = '100%';
      
      // For account-linking on Settings, ensure Settings content can scroll
      if (isAccountLinkingOnSettings) {
        // Find Settings content containers and ensure they can scroll
        const settingsContainer = document.querySelector('[class*="max-w-7xl"]');
        const sidebar = document.querySelector('aside[class*="lg:overflow-y-auto"]');
        const tabsContent = document.querySelector('[role="tabpanel"]');
        
        // Ensure Settings main content area can scroll
        if (settingsContainer) {
          const container = settingsContainer as HTMLElement;
          container.style.overflowY = 'auto';
          container.style.maxHeight = `${window.innerHeight - 200}px`; // Leave space for header
        }
        
        // Ensure sidebar can scroll (it already has overflow-y-auto, but ensure it works)
        if (sidebar) {
          (sidebar as HTMLElement).style.overflowY = 'auto';
        }
        
        // Ensure tab content can scroll
        if (tabsContent) {
          const tabContent = tabsContent as HTMLElement;
          tabContent.style.overflowY = 'auto';
          tabContent.style.maxHeight = `${window.innerHeight - 250}px`;
        }
      }
    };
    
    // Lock immediately
    lockScroll();
    
    // Continuously enforce scroll lock (Settings page tries to re-enable it)
    const lockInterval = setInterval(lockScroll, 100);
    
    // Prevent scroll events
    const preventScroll = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    
    // Prevent scroll via wheel, touch, and keyboard
    const preventWheel = (e: WheelEvent) => {
      // Allow scrolling within Settings page content during account-linking step
      if (isAccountLinkingOnSettings) {
        const target = e.target as HTMLElement;
        // Check if the scroll is happening within Settings page content area
        const settingsContent = target.closest('main') || 
                                target.closest('[class*="max-w-7xl"]') ||
                                target.closest('aside') ||
                                target.closest('[class*="TabsContent"]');
        
        // If scrolling within Settings content, allow it
        if (settingsContent) {
          return true; // Allow the scroll
        }
      }
      
      // Otherwise, prevent scroll
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    
    const preventTouchMove = (e: TouchEvent) => {
      // Allow scrolling within Settings page content during account-linking step
      if (isAccountLinkingOnSettings) {
        const target = e.target as HTMLElement;
        const settingsContent = target.closest('main') || 
                                target.closest('[class*="max-w-7xl"]') ||
                                target.closest('aside') ||
                                target.closest('[class*="TabsContent"]');
        
        if (settingsContent) {
          return true; // Allow the scroll
        }
      }
      
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    
    // Add event listeners with capture phase to catch all scroll attempts
    window.addEventListener('scroll', preventScroll, { passive: false, capture: true });
    window.addEventListener('wheel', preventWheel, { passive: false, capture: true });
    window.addEventListener('touchmove', preventTouchMove, { passive: false, capture: true });
    document.addEventListener('scroll', preventScroll, { passive: false, capture: true });
    
    // Prevent keyboard shortcuts that might interfere
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow only Escape key to skip tutorial
      if (e.key === 'Escape') {
        markCompleted();
      } else if (e.key !== 'Tab' && !e.ctrlKey && !e.metaKey) {
        // Block most keyboard interactions except Tab navigation
        e.preventDefault();
        e.stopPropagation();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown, true);
    
    return () => {
      // Clear the lock interval
      clearInterval(lockInterval);
      
      // Restore scroll position
      const scrollY = document.body.style.top ? parseInt(document.body.style.top) * -1 : 0;
      
      // Restore body scroll
      document.body.style.overflow = originalOverflow || 'auto';
      document.body.style.position = originalPosition || 'relative';
      document.body.style.width = originalWidth || '';
      document.body.style.height = originalHeight || '';
      document.body.style.top = originalTop || '';
      
      // Restore html element
      document.documentElement.style.overflow = '';
      document.documentElement.style.position = '';
      document.documentElement.style.height = '';
      
      // Restore scroll position
      if (scrollY) {
        window.scrollTo(0, scrollY);
      }
      
      // Remove event listeners
      window.removeEventListener('scroll', preventScroll, true);
      window.removeEventListener('wheel', preventWheel, true);
      window.removeEventListener('touchmove', preventTouchMove, true);
      document.removeEventListener('scroll', preventScroll, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isVisible, markCompleted]);

  // Add data attributes to elements for targeting
  useEffect(() => {
    // The record button container should already have the data attribute from Index.tsx
    // Just ensure it exists and is properly set
    const recordButtonContainer = document.querySelector('[data-tutorial="record-button"]') as HTMLElement;
    if (recordButtonContainer) {
      // Ensure it's visible and has proper z-index
      recordButtonContainer.style.zIndex = "10000";
    }

    // Mark search input
    const searchInput = document.querySelector('input[placeholder*="Search"], input[type="search"]') as HTMLElement;
    if (searchInput && !searchInput.hasAttribute("data-tutorial")) {
      searchInput.setAttribute("data-tutorial", "search");
    }

    return () => {
      // Cleanup if needed
    };
  }, [currentStep]);

  const handleNext = () => {
    // Prevent rapid clicks
    if (isNavigatingRef.current || isTransitioning) {
      return;
    }
    
    if (currentStep < TUTORIAL_STEPS.length - 1) {
      const currentStepConfig = TUTORIAL_STEPS[currentStep];
      const nextStepConfig = TUTORIAL_STEPS[currentStep + 1];

      // If we're on the "Follow Creators" step (follow) and on the Following page,
      // navigate back to the main feed so the next step highlights the header properly
      if (currentStepConfig?.id === "follow" && location.pathname === "/following") {
        isNavigatingRef.current = true;
        setIsTransitioning(true);
        navigate("/");
        // Wait for navigation to complete before advancing step
        setTimeout(() => {
          setCurrentStep(currentStep + 1);
          setTimeout(() => {
            setIsTransitioning(false);
            isNavigatingRef.current = false;
          }, 50);
        }, 300);
        return;
      }

      // Skip Settings-only PIN step when we're not on Settings
      if (nextStepConfig?.id === "account-pin" && !location.pathname.startsWith("/settings")) {
        setCurrentStep(currentStep + 2);
        return;
      }

      isNavigatingRef.current = true;
      setIsTransitioning(true);
      // Shorter transition time to reduce flashing
      setTimeout(() => {
        setCurrentStep(currentStep + 1);
        // Small delay before re-enabling to ensure smooth transition
        setTimeout(() => {
          setIsTransitioning(false);
          isNavigatingRef.current = false;
        }, 50);
      }, 200);
    } else {
      isNavigatingRef.current = true;
      markCompleted();
      setTimeout(() => {
        isNavigatingRef.current = false;
      }, 200);
    }
  };

  const handlePrevious = () => {
    // Prevent rapid clicks
    if (isNavigatingRef.current || isTransitioning) {
      return;
    }
    
    if (currentStep > 0) {
      const currentStepConfig = TUTORIAL_STEPS[currentStep];
      const previousStepConfig = TUTORIAL_STEPS[currentStep - 1];

      // If we're on Settings for the Link Your Account step and user presses Previous,
      // navigate back to the main feed so the previous step has its proper context.
      if (currentStepConfig?.id === "account-linking" && location.pathname.startsWith("/settings")) {
        try {
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("tutorial_navigated_to_settings");
          }
        } catch {
          // ignore storage errors
        }
        navigate("/");
        setCurrentStep(currentStep - 1);
        return;
      }

      // Special behavior when going back from Feed Sorting (step 4) to Daily Topics (step 3)
      if (currentStepConfig?.id === "feed-sorting" && previousStepConfig?.id === "today-topic") {
        // If the Chamber (formerly Welcome Garden) topic is active, deselect it
        const chamberButton = document.querySelector(
          '[data-tutorial="welcome-garden"][data-active="true"]'
        ) as HTMLElement | null;
        if (chamberButton) {
          (chamberButton as HTMLButtonElement).click();
        }
      }

      isNavigatingRef.current = true;
      setIsTransitioning(true);
      // Shorter transition time to reduce flashing
      setTimeout(() => {
        setCurrentStep(currentStep - 1);
        // Small delay before re-enabling to ensure smooth transition
        setTimeout(() => {
          setIsTransitioning(false);
          isNavigatingRef.current = false;
        }, 50);
      }, 200);
    }
  };

  const handleSkip = () => {
    // Prevent rapid clicks
    if (isNavigatingRef.current) {
      return;
    }
    isNavigatingRef.current = true;
    markCompleted();
    setTimeout(() => {
      isNavigatingRef.current = false;
    }, 300);
  };

  // Sync parent state if completed
  useEffect(() => {
    if (isCompleted) {
      onComplete();
    }
  }, [isCompleted, onComplete]);

  // Track feed sorting state (which option user clicked) to adjust text on step 4
  useEffect(() => {
    if (!step || step.id !== "feed-sorting") {
      if (feedSortingState !== "default") {
        setFeedSortingState("default");
      }
      return;
    }

    const handleClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      // Only react to clicks inside the feed-sorting area or its dropdown
      const container = target.closest('[data-tutorial="feed-sorting"], [data-tutorial="feed-sorting-popover"]') as HTMLElement | null;
      if (!container) return;

      const button = target.closest("button");
      const label = (button?.textContent || "").toLowerCase();

      let state: typeof feedSortingState = "default";
      if (label.includes("for you")) state = "for_you";
      else if (label.includes("unheard")) state = "unheard";
      else if (label.includes("following")) state = "following";
      else if (label.includes("hot")) state = "hot";
      else if (label.includes("top")) state = "top";
      else if (label.includes("controversial")) state = "controversial";
      else if (label.includes("rising")) state = "rising";
      else if (label.includes("trending")) state = "trending";
      else if (label.includes("chamber")) state = "chamber";
      else if (label.trim().length > 0) state = "other";
      else state = "default";

      // Update tutorial explanation state
      setFeedSortingState(state);

      // Recalculate tooltip/highlight position after any interaction with feed sorting
      // so that when the dropdown closes (e.g. clicking For You again), the highlight
      // snaps back to just the bar.
      setTimeout(() => {
        calculatePosition();
      }, 0);

      // If user is interacting with items INSIDE the For You dropdown (popover),
      // keep the dropdown visible during the tutorial by reopening it after selection.
      const isInPopover = container.getAttribute("data-tutorial") === "feed-sorting-popover";
      if (isInPopover && state !== "default") {
        setTimeout(() => {
          const popover = document.querySelector('[data-tutorial="feed-sorting-popover"]') as HTMLElement | null;
          if (!popover) {
            const trigger = document.querySelector('[data-tutorial="feed-sorting-trigger"]') as HTMLButtonElement | null;
            if (trigger) {
              trigger.click();
            }
          }
        }, 50);
      }
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [step, feedSortingState, calculatePosition]);

  // When on Filters & Discovery step, recalc position on any click so the
  // highlight can expand when the dropdown opens and shrink back when it closes.
  useEffect(() => {
    if (!step || step.id !== "filters") return;

    const handleClick = (event: MouseEvent) => {
      // Defer to let the UI (dropdown open/close) update first, then recalc
      setTimeout(() => {
        calculatePosition();
      }, 0);
    };

    document.addEventListener("click", handleClick, true);

    return () => {
      document.removeEventListener("click", handleClick, true);
    };
  }, [step, calculatePosition]);

  // Dynamic description for steps that depend on UI state (e.g. Feed Sorting)
  const effectiveDescription = useMemo(() => {
    if (!step) return "";
    if (step.id === "feed-sorting") {
      switch (feedSortingState) {
        case "for_you":
          return "You're in the For You feed. This surface uses your listening behavior to recommend clips tailored to you. Use the dropdown to switch between main For You, Unheard, and Following views.";
        case "unheard":
          return "Unheard shows you clips you’ve never played before. It’s the best way to discover fresh voices and topics you haven’t listened to yet.";
        case "following":
          return "Following shows clips only from creators you follow. Use this when you want to catch up with your favorite voices without the rest of the noise.";
        case "hot":
          return "Hot surfaces clips that are getting attention right now. It combines recency and engagement so you can see what’s heating up in the moment.";
        case "top":
          return "Top shows all-time or time-windowed favorites. Use it to find the highest-engagement clips over a chosen period like today, this week, or this month.";
        case "controversial":
          return "Controversial highlights clips with mixed reactions and strong opinions. It’s where debates, disagreements, and spicy takes tend to live.";
        case "rising":
          return "Rising focuses on clips that are starting to gain traction. It’s ideal for catching promising content early before it fully blows up.";
        case "trending":
          return "Trending uses a pre-calculated trending score to surface clips the algorithm thinks are taking off. It’s a more curated, momentum-based view of the feed.";
        case "chamber":
          return "Chamber is a gentle starting lane for beginners. It’s a calmer space where new users can post, listen, and experiment with the feed before diving into the full firehose.";
        case "other":
          return "You’ve selected a specific filter in the sorting bar. Each option tweaks how clips are ordered so you can tune the feed to what you’re in the mood for.";
        case "default":
        default:
          return step.description;
      }
    }

    if (step.id === "account-linking") {
      // Show different copy depending on whether the user is still on the main feed
      // or has already opened Settings.
      const path = location.pathname;
      if (path.startsWith("/settings")) {
        // Settings view: focus this step only on getting to the Account tab,
        // with brief extra info about what happens next.
        return [
          "Step 2: In Settings, click the Account tab in the left sidebar.",
          "Once you're on the Account tab, you'll be able to generate a 4-digit PIN and use it on another device to link your account.",
        ].join(" ");
      }

      // On the main feed / anywhere else: focus on step 1 (getting to Settings)
      return [
        "Step 1: Click the Settings icon in the header to open Settings.",
        "After Settings opens, this step will guide you through generating a PIN and linking another device.",
      ].join(" ");
    }

    if (step.id === "follow") {
      // Show different copy when on the Following page
      if (location.pathname === "/following") {
        return [
          "Click on any creator's handle or avatar to visit their profile.",
          "Click 'Follow' to see their clips in your Following feed!",
          "You can access your Following feed from the header anytime.",
          "Build your personalized feed by following voices you love.",
        ].join(" ");
      }
      // Default description when not on Following page
      return step.description;
    }

    return step.description;
  }, [step, feedSortingState, location.pathname]);

  // Calculate spotlight position for overlay with smooth transitions
  const spotlightStyle = useMemo(() => {
    if (!highlightRect || !step || !step.highlight) {
      return {};
    }

    const padding = 12;
    const left = Math.max(0, highlightRect.left - padding);
    const top = Math.max(0, highlightRect.top - padding);
    const right = Math.min(window.innerWidth, highlightRect.right + padding);
    const bottom = Math.min(window.innerHeight, highlightRect.bottom + padding);

    // Ensure valid clip-path values
    const safeLeft = Math.max(0, Math.min(left, window.innerWidth));
    const safeTop = Math.max(0, Math.min(top, window.innerHeight));
    const safeRight = Math.max(safeLeft, Math.min(right, window.innerWidth));
    const safeBottom = Math.max(safeTop, Math.min(bottom, window.innerHeight));

    return {
      clipPath: `polygon(
        0% 0%, 
        0% 100%, 
        ${safeLeft}px 100%, 
        ${safeLeft}px ${safeTop}px, 
        ${safeRight}px ${safeTop}px, 
        ${safeRight}px ${safeBottom}px, 
        ${safeLeft}px ${safeBottom}px, 
        ${safeLeft}px 100%, 
        100% 100%, 
        100% 0%
      )`,
      transition: "clip-path 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    };
  }, [highlightRect, step]);

  const highlightStyle = useMemo(() => {
    if (!highlightRect || !step || !step.highlight) return null;

    const padding = 12;
    const top = Math.max(0, highlightRect.top - padding);
    const left = Math.max(0, highlightRect.left - padding);
    const width = highlightRect.width + (padding * 2);
    const height = highlightRect.height + (padding * 2);

    return {
      top: `${top}px`,
      left: `${left}px`,
      width: `${width}px`,
      height: `${height}px`,
      transition: "all 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
    };
  }, [highlightRect, step]);

  // Disable all buttons except the target element during tutorial
  useEffect(() => {
    if (!isVisible || !step || !step.highlight) {
      return;
    }

    // Find all buttons, links, and interactive elements on the page
    const allButtons = Array.from(document.querySelectorAll('button, a, [role="button"], [tabindex="0"]')) as HTMLElement[];
    const allInputs = Array.from(document.querySelectorAll('input, select, textarea')) as HTMLElement[];
    const allInteractive = [...allButtons, ...allInputs];

    // Store original states
    const originalStates = new Map<HTMLElement, {
      pointerEvents: string;
      opacity: string;
      cursor: string;
      disabled?: boolean;
      tabIndex?: number;
    }>();

    // Disable all interactive elements except the target element and its children
    allInteractive.forEach((element) => {
      // Skip if this is the target element or a child of the target element
      if (targetElement && (element === targetElement || targetElement.contains(element))) {
        return;
      }

      // Skip if this is part of the tutorial tooltip
      if (tooltipRef.current && (element === tooltipRef.current || tooltipRef.current.contains(element))) {
        return;
      }

      // Store original state
      const computedStyle = window.getComputedStyle(element);
      originalStates.set(element, {
        pointerEvents: element.style.pointerEvents || computedStyle.pointerEvents,
        opacity: element.style.opacity || computedStyle.opacity,
        cursor: element.style.cursor || computedStyle.cursor,
        disabled: (element as HTMLButtonElement | HTMLInputElement).disabled,
        tabIndex: element.tabIndex,
      });

      // Disable the element
      element.style.pointerEvents = 'none';
      element.style.opacity = '0.5';
      element.style.cursor = 'not-allowed';
      
      // Disable form elements
      if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
        (element as HTMLButtonElement | HTMLInputElement).disabled = true;
      }
      
      // Remove from tab order
      if (element.tabIndex >= 0) {
        element.tabIndex = -1;
      }
    });

    // Cleanup: restore original states
    return () => {
      originalStates.forEach((original, element) => {
        element.style.pointerEvents = original.pointerEvents;
        element.style.opacity = original.opacity;
        element.style.cursor = original.cursor;
        
        if (element instanceof HTMLButtonElement || element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) {
          (element as HTMLButtonElement | HTMLInputElement).disabled = original.disabled ?? false;
        }
        
        if (original.tabIndex !== undefined) {
          element.tabIndex = original.tabIndex;
        }
      });
    };
  }, [isVisible, step, targetElement]);

  // Ensure target element is above blocking overlay and can receive clicks
  useEffect(() => {
    if (targetElement && step && step.highlight) {
      // Make sure the target element can receive pointer events
      const originalStyle = targetElement.style.pointerEvents;
      const originalZIndex = targetElement.style.zIndex;
      const originalOpacity = targetElement.style.opacity;
      const originalCursor = targetElement.style.cursor;
      
      targetElement.style.pointerEvents = 'auto';
      targetElement.style.zIndex = '100001'; // Above blocking overlay
      targetElement.style.opacity = '1';
      targetElement.style.cursor = 'pointer';
      
      return () => {
        targetElement.style.pointerEvents = originalStyle;
        targetElement.style.zIndex = originalZIndex;
        targetElement.style.opacity = originalOpacity;
        targetElement.style.cursor = originalCursor;
      };
    }
  }, [targetElement, step]);

  // For the Account PIN step, gently scroll the page so the highlighted
  // section and the modal below it are comfortably in view.
  useEffect(() => {
    if (
      !step ||
      step.id !== "account-pin" ||
      !highlightRect ||
      !location.pathname.startsWith("/settings")
    ) {
      return;
    }

    // Always nudge the page down a bit more from wherever we are so the
    // Account section and PIN controls move further into view.
    const currentTop = window.scrollY || 0;
    const desiredTop = currentTop + 220;

    window.scrollTo({
      top: desiredTop,
      behavior: "smooth",
    });
  }, [step?.id, highlightRect, location.pathname]);

  // When we land on Settings for the "Link Your Account" step, aggressively
  // recalculate the highlight a few times so the Account tab is reliably
  // found even if the layout is still mounting.
  useEffect(() => {
    if (!step || step.id !== "account-linking" || !location.pathname.startsWith("/settings")) {
      return;
    }

    // Calculate position immediately, even if route isn't ready yet
    calculatePosition();
    
    // Also try immediately after a tiny delay
    setTimeout(() => calculatePosition(), 10);
    setTimeout(() => calculatePosition(), 30);

    // Wait for route to be ready before starting aggressive search
    if (!isRouteReady) {
      // Set up a check for when route becomes ready
      const checkRouteReady = setInterval(() => {
        if (isRouteReady) {
          clearInterval(checkRouteReady);
          calculatePosition();
          setTimeout(() => calculatePosition(), 50);
          setTimeout(() => calculatePosition(), 150);
        }
      }, 50);
      return () => clearInterval(checkRouteReady);
    }

    let attempts = 0;
    const maxAttempts = 60; // Increased to 60 attempts (9 seconds total)
    let foundAccountTab = false;
    let interval: NodeJS.Timeout | null = null;

    // Use MutationObserver to watch for Account tab appearing
    const observer = new MutationObserver(() => {
      const accountTab = document.querySelector(
        '[data-tutorial="settings-account-tab"]'
      ) as HTMLElement | null;
      
      if (accountTab && !foundAccountTab) {
        foundAccountTab = true;
        // Found it! Calculate position immediately
        calculatePosition();
        // Give it a few more calculations to ensure it's properly positioned
        setTimeout(() => calculatePosition(), 10);
        setTimeout(() => calculatePosition(), 50);
        setTimeout(() => calculatePosition(), 150);
        setTimeout(() => calculatePosition(), 300);
        observer.disconnect();
        if (interval) clearInterval(interval);
      }
    });

    // Start observing the Settings page container - use multiple targets
    const settingsContainer = document.querySelector('[data-tutorial="navigation"]')?.closest('div') || 
                              document.querySelector('main') || 
                              document.querySelector('aside') ||
                              document.body;
    
    if (settingsContainer) {
      observer.observe(settingsContainer, {
        childList: true,
        subtree: true,
        attributes: true, // Also watch for attribute changes
        attributeFilter: ['class', 'data-tutorial'], // Watch for class and data-tutorial changes
      });
    }

    interval = setInterval(() => {
      attempts += 1;
      
      // Check if Account tab exists
      const accountTab = document.querySelector(
        '[data-tutorial="settings-account-tab"]'
      ) as HTMLElement | null;
      
      if (accountTab && !foundAccountTab) {
        foundAccountTab = true;
        // Found it! Calculate position to highlight it
        calculatePosition();
        // Give it multiple calculations to ensure it's visible
        setTimeout(() => calculatePosition(), 10);
        setTimeout(() => calculatePosition(), 50);
        setTimeout(() => calculatePosition(), 150);
        setTimeout(() => calculatePosition(), 300);
        observer.disconnect();
        if (interval) clearInterval(interval);
      } else if (!accountTab) {
        // Not found yet, keep trying and recalculate
        calculatePosition();
        if (attempts >= maxAttempts) {
          // Last attempt - try one more time after a longer delay
          setTimeout(() => {
            calculatePosition();
          }, 500);
          observer.disconnect();
          if (interval) clearInterval(interval);
        }
      }
    }, 150); // Check every 150ms

    return () => {
      observer.disconnect();
      if (interval) clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id, location.pathname, isRouteReady]);

  // NOTE: We no longer auto-click the Account tab here.
  // The tutorial will highlight the Account tab, and the user
  // must click it themselves to proceed.

  // Aggressively recalculate highlight position for the Account PIN step as well,
  // so the linking section is properly highlighted even if the layout is still mounting.
  useEffect(() => {
    if (!step || step.id !== "account-pin" || !location.pathname.startsWith("/settings")) {
      return;
    }

    // Ensure we're on the account tab first
    const searchParams = new URLSearchParams(window.location.search);
    const activeTab = searchParams.get("tab");
    if (activeTab !== "account") {
      // Navigate to account tab if not already there
      navigate("/settings?tab=account", { replace: true });
    }

    // Calculate immediately and repeatedly
    const calculateMultiple = () => {
      calculatePosition();
      setTimeout(() => calculatePosition(), 10);
      setTimeout(() => calculatePosition(), 50);
      setTimeout(() => calculatePosition(), 100);
      setTimeout(() => calculatePosition(), 200);
      setTimeout(() => calculatePosition(), 400);
    };

    calculateMultiple();

    let attempts = 0;
    const maxAttempts = 50; // Increased to 50 attempts (7.5 seconds)
    let foundSection = false;
    let interval: NodeJS.Timeout | null = null;

    // Use MutationObserver to watch for the linking section
    const observer = new MutationObserver(() => {
      const linkingSection = document.querySelector(
        '[data-tutorial="settings-account-linking"]'
      ) as HTMLElement | null;
      
      if (linkingSection && !foundSection) {
        foundSection = true;
        calculateMultiple();
        observer.disconnect();
        if (interval) clearInterval(interval);
      }
    });

    // Observe multiple containers to catch the section wherever it appears
    const containers = [
      document.querySelector('main'),
      document.querySelector('[class*="max-w-7xl"]'),
      document.querySelector('[role="tabpanel"]'),
      document.querySelector('[data-tutorial="settings-account-linking"]')?.parentElement,
      document.body
    ].filter(Boolean) as HTMLElement[];
    
    containers.forEach(container => {
      if (container) {
        observer.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class', 'data-tutorial', 'style'],
        });
      }
    });

    interval = setInterval(() => {
      attempts += 1;
      calculatePosition();

      const linkingSection = document.querySelector(
        '[data-tutorial="settings-account-linking"]'
      ) as HTMLElement | null;
      
      if (linkingSection && !foundSection) {
        foundSection = true;
        calculateMultiple();
        observer.disconnect();
        if (interval) clearInterval(interval);
      } else if (attempts >= maxAttempts) {
        // Even if not found, keep trying periodically
        if (attempts % 10 === 0) {
          calculatePosition();
        }
        if (attempts >= maxAttempts * 2) {
          observer.disconnect();
          if (interval) clearInterval(interval);
        }
      }
    }, 150);

    return () => {
      observer.disconnect();
      if (interval) clearInterval(interval);
    };
  }, [step?.id, location.pathname, location.search, calculatePosition, navigate]);

  // Intercept clicks on background elements during tutorial
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    
    // Allow clicks on the tooltip
    if (tooltipRef.current && tooltipRef.current.contains(target)) {
      return;
    }

    // Allow clicks on the target element and its children
    if (targetElement && (targetElement.contains(target) || targetElement === target)) {
      return;
    }

    // Block all other clicks
    e.preventDefault();
    e.stopPropagation();
  }, [targetElement]);

  // Create click-blocking overlay that covers everything except the target
  const clickBlockingStyle = useMemo(() => {
    if (!highlightRect || !step || !step.highlight) {
      return { display: 'none' };
    }

    const padding = 12;
    const left = Math.max(0, highlightRect.left - padding);
    const top = Math.max(0, highlightRect.top - padding);
    const right = Math.min(window.innerWidth, highlightRect.right + padding);
    const bottom = Math.min(window.innerHeight, highlightRect.bottom + padding);

    // Create clip-path that covers the viewport except the target area
    return {
      clipPath: `polygon(
        0% 0%, 
        0% 100%, 
        ${left}px 100%, 
        ${left}px ${top}px, 
        ${right}px ${top}px, 
        ${right}px ${bottom}px, 
        ${left}px ${bottom}px, 
        ${left}px 100%, 
        100% 100%, 
        100% 0%
      )`,
    };
  }, [highlightRect, step]);

  // Check if collapsed FIRST - this takes priority over visibility checks
  // When collapsed on Follow Creators step, show only floating button (no overlays)
  const currentStepConfig = step || TUTORIAL_STEPS[currentStep];
  if (isCollapsed && currentStepConfig?.id === "follow") {
    return (
      <>
        {/* Floating button to reopen tutorial - always visible and clickable */}
        <div 
          className="fixed bottom-6 right-6 z-[999999] pointer-events-auto" 
          data-tutorial-active="true"
          style={{ isolation: 'isolate' }}
        >
          <div className="flex flex-col items-end gap-2">
            <Button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setIsCollapsed(false);
              }}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              size="lg"
              className="h-16 w-16 rounded-full shadow-2xl bg-primary hover:bg-primary/90 transition-all animate-pulse-glow border-4 border-primary/80 hover:border-primary ring-4 ring-primary/30 hover:ring-primary/50 cursor-pointer"
              aria-label="Expand tutorial"
              title="Click to expand tutorial"
              type="button"
            >
              <ChevronUp className="h-7 w-7" />
            </Button>
            <div className="bg-primary/90 text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm border border-primary/50 whitespace-nowrap pointer-events-none">
              Tutorial
            </div>
          </div>
        </div>
        {/* Show step info badge when collapsed - more prominent */}
        <div 
          className="fixed top-6 right-6 z-[999999] pointer-events-none" 
          data-tutorial-active="true"
        >
          <Badge variant="secondary" className="text-sm font-medium px-4 py-2 shadow-lg bg-background/95 backdrop-blur-sm border-2 border-primary/30">
            {currentStep + 1} of {TUTORIAL_STEPS.length} - {currentStepConfig?.title || "Follow Creators"}
          </Badge>
        </div>
      </>
    );
  }

  // If the tutorial isn't supposed to be visible for this route/step, but we're collapsed, still show button
  if ((!isVisible || !step) && isCollapsed) {
    const currentStepConfig = TUTORIAL_STEPS[currentStep];
    if (currentStepConfig?.id === "follow") {
      return (
        <>
          {/* Floating button to reopen tutorial - always visible and clickable */}
          <div 
            className="fixed bottom-6 right-6 z-[999999] pointer-events-auto" 
            data-tutorial-active="true"
            style={{ isolation: 'isolate' }}
          >
            <div className="flex flex-col items-end gap-2">
              <Button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsCollapsed(false);
                }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                size="lg"
                className="h-16 w-16 rounded-full shadow-2xl bg-primary hover:bg-primary/90 transition-all animate-pulse-glow border-4 border-primary/80 hover:border-primary ring-4 ring-primary/30 hover:ring-primary/50 cursor-pointer"
                aria-label="Expand tutorial"
                title="Click to expand tutorial"
                type="button"
              >
                <ChevronUp className="h-7 w-7" />
              </Button>
              <div className="bg-primary/90 text-primary-foreground text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm border border-primary/50 whitespace-nowrap pointer-events-none">
                Tutorial
              </div>
            </div>
          </div>
          {/* Show step info badge when collapsed */}
          <div 
            className="fixed top-6 right-6 z-[999999] pointer-events-none" 
            data-tutorial-active="true"
          >
            <Badge variant="secondary" className="text-sm font-medium px-4 py-2 shadow-lg bg-background/95 backdrop-blur-sm border-2 border-primary/30">
              {currentStep + 1} of {TUTORIAL_STEPS.length} - {currentStepConfig?.title || "Follow Creators"}
            </Badge>
          </div>
        </>
      );
    }
    return null;
  }

  // If the tutorial isn't supposed to be visible for this route/step, render nothing
  if (!isVisible || !step) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[100000] pointer-events-none" data-tutorial-active="true">
      {/* Click-blocking overlay - covers everything except the target element */}
      {step && step.highlight && (
        <div
          className="absolute inset-0 pointer-events-auto z-[99999]"
          style={clickBlockingStyle}
          onClick={handleOverlayClick}
        />
      )}
      
      {/* Visual dimming layer only; we no longer intercept scroll so the page can move freely */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={spotlightStyle}
      />
      
      {/* Visual overlay with spotlight effect (kept lightweight to avoid lag on route changes) */}
      <div
        ref={overlayRef}
        className={cn(
          "absolute inset-0 transition-all duration-200 ease-in-out pointer-events-none",
          // Slightly dim background on both main feed and Settings so the tutorial feels focused
          location.pathname.startsWith("/settings") ? "bg-black/40" : "bg-black/50"
        )}
        style={spotlightStyle}
      />

      {/* Highlight ring around target element with smooth animation */}
      {highlightRect && step.highlight && highlightStyle && (
        <div
          className="absolute pointer-events-none z-[99998]"
          style={{
            ...highlightStyle,
            position: "fixed",
          }}
        >
          {/* Vivid double-ring highlight with soft glow */}
          <div className="absolute inset-0 rounded-2xl border-4 border-primary shadow-[0_0_32px_rgba(var(--primary-rgb,59,130,246),0.9)] animate-pulse" />
          <div
            className="absolute inset-1 rounded-2xl border-2 border-primary/60 animate-ping"
            style={{ animationDuration: "1.6s" }}
          />
          <div className="absolute -inset-2 bg-primary/25 rounded-3xl blur-2xl" />
        </div>
      )}

      {/* Tooltip Card with smooth animations */}
      <div
        ref={tooltipRef}
        className={cn(
          "absolute pointer-events-auto transition-all duration-300 ease-in-out z-[100001]",
          "max-w-[calc(100vw-32px)]"
        )}
        style={
          // Special positioning for Account PIN step: place modal just below the highlighted section
          (step.id === "account-pin" && location.pathname.startsWith("/settings") && highlightRect)
            ? (() => {
                const isMobile = window.innerWidth < 768;
                const safePadding = 16;
                const tooltipWidth = isMobile ? 340 : 400;
                const tooltipHeight = isMobile ? 260 : 240;

                const rawTop = highlightRect.bottom + 16;
                const rawLeft = highlightRect.left + highlightRect.width / 2 - tooltipWidth / 2;

                const maxTop = window.innerHeight - tooltipHeight - safePadding;
                const maxLeft = window.innerWidth - tooltipWidth - safePadding;
                const minTop = safePadding;
                const minLeft = safePadding;

                return {
                  top: `${Math.max(minTop, Math.min(rawTop, maxTop))}px`,
                  left: `${Math.max(minLeft, Math.min(rawLeft, maxLeft))}px`,
                  width: isMobile ? "calc(100vw - 32px)" : "min(400px, calc(100vw - 40px))",
                  maxWidth: isMobile ? "340px" : "400px",
                  transform: "scale(1) translateY(0)",
                  transition: "top 300ms ease-in-out, left 300ms ease-in-out, opacity 300ms ease-in-out, width 300ms ease-in-out",
                  opacity: isTransitioning ? 0.9 : 1,
                };
              })()
            : ((step.id === "account-linking" && location.pathname.startsWith("/settings")) || !tooltipPosition)
            ? (() => {
                const isMobile = window.innerWidth < 768;
                return {
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%) scale(1)",
                  width: isMobile ? "calc(100vw - 32px)" : "min(400px, calc(100vw - 40px))",
                  maxWidth: isMobile ? "340px" : "400px",
                  transition: "opacity 300ms ease-in-out",
                  opacity: isTransitioning ? 0.9 : 1,
                };
              })()
            : (() => {
                const isMobile = window.innerWidth < 768;
                const tooltipWidth = isMobile ? 340 : 400;
                const tooltipHeight = isMobile ? 320 : 280;
                const safePadding = 16;
                
                // Ensure tooltip stays within viewport with proper constraints
                const maxTop = window.innerHeight - tooltipHeight - safePadding;
                const maxLeft = window.innerWidth - tooltipWidth - safePadding;
                const minTop = safePadding;
                const minLeft = safePadding;
                
                return {
                  top: `${Math.max(minTop, Math.min(tooltipPosition.top, maxTop))}px`,
                  left: `${Math.max(minLeft, Math.min(tooltipPosition.left, maxLeft))}px`,
                  width: isMobile ? "calc(100vw - 32px)" : "min(400px, calc(100vw - 40px))",
                  maxWidth: isMobile ? "340px" : "400px",
                  transform: "scale(1) translateY(0)",
                  transition: "top 300ms ease-in-out, left 300ms ease-in-out, opacity 300ms ease-in-out, width 300ms ease-in-out",
                  opacity: isTransitioning ? 0.9 : 1,
                };
              })()
        }
      >
        <Card className="shadow-2xl border border-primary/20 bg-background backdrop-blur-xl">
          <CardHeader className="space-y-3 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary shadow-sm transition-transform hover:scale-110">
                  {step.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <CardTitle className="text-xl font-semibold">{step.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className="text-xs font-medium">
                      {currentStep + 1} of {TUTORIAL_STEPS.length}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* Only show collapse button on "Follow Creators" step */}
                {step.id === "follow" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-full hover:bg-muted transition-colors"
                    onClick={() => setIsCollapsed(true)}
                    aria-label="Collapse tutorial"
                    title="Collapse tutorial"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
                  onClick={handleSkip}
                  aria-label="Skip tutorial"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <Progress value={progress} className="h-2 bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription className="text-base leading-relaxed text-foreground/80">
              {effectiveDescription}
            </CardDescription>

            {/* Contextual helper actions for specific steps */}
            {step.id === "account-linking" && !location.pathname.startsWith("/settings") && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    try {
                      if (typeof window !== "undefined") {
                        sessionStorage.setItem("tutorial_navigated_to_settings", "true");
                      }
                    } catch {
                      // ignore storage errors
                    }
                    // Immediately hide overlay & highlight while we navigate so the transition feels smooth
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/settings?tab=general");
                    // Force immediate recalculation after a brief delay to catch the Account tab
                    setTimeout(() => {
                      calculatePosition();
                    }, 100);
                    setTimeout(() => {
                      calculatePosition();
                    }, 300);
                    setTimeout(() => {
                      calculatePosition();
                    }, 600);
                  }}
                >
                  Go to Settings
                </Button>
                <p className="text-xs text-muted-foreground">
                  This will open the Settings page so you can follow Steps 2–4 to generate your PIN and link another
                  device.
                </p>
              </div>
            )}

            {step.id === "account-linking" && location.pathname.startsWith("/settings") && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  className="w-full rounded-xl font-medium"
                  onClick={() => {
                    // Navigate to Account tab
                    navigate("/settings?tab=account");
                    // Wait a moment for tab to switch, then advance to PIN step
                    setTimeout(() => {
                      setCurrentStep((prev) =>
                        Math.min(prev + 1, TUTORIAL_STEPS.length - 1)
                      );
                      // Force position calculation after advancing
                      setTimeout(() => {
                        calculatePosition();
                      }, 100);
                      setTimeout(() => {
                        calculatePosition();
                      }, 300);
                    }, 200);
                  }}
                >
                  Go to Account
                </Button>
                <p className="text-xs text-muted-foreground">
                  This will switch to the Account tab and show you the PIN generation controls.
                </p>
              </div>
            )}

            {/* Header tab helper actions (navigate or trigger the highlighted item) */}
            {step.id === "voice-amas" && location.pathname !== "/voice-amas" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/voice-amas");
                  }}
                >
                  Open Voice AMAs
                </Button>
                <p className="text-xs text-muted-foreground">
                  This takes you straight to the Voice AMAs page the header icon is pointing to.
                </p>
              </div>
            )}

            {step.id === "live-rooms" && location.pathname !== "/live-rooms" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/live-rooms");
                  }}
                >
                  Open Live Rooms
                </Button>
                <p className="text-xs text-muted-foreground">
                  Jump into the Live Rooms experience that the highlighted tab represents.
                </p>
              </div>
            )}

            {step.id === "communities" && location.pathname !== "/communities" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/communities");
                  }}
                >
                  Open Communities
                </Button>
                <p className="text-xs text-muted-foreground">
                  Go directly to the Communities page shown in the header.
                </p>
              </div>
            )}

            {step.id === "leaderboards" && location.pathname !== "/leaderboards" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/leaderboards");
                  }}
                >
                  Open Leaderboards
                </Button>
                <p className="text-xs text-muted-foreground">
                  See the full leaderboards view that the header trophy icon links to.
                </p>
              </div>
            )}

            {step.id === "follow" && location.pathname !== "/following" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/following");
                  }}
                >
                  Open Following feed
                </Button>
                <p className="text-xs text-muted-foreground">
                  Switch into the Following feed that matches the highlighted header tab.
                </p>
              </div>
            )}

            {step.id === "discovery" && location.pathname !== "/discovery" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/discovery");
                  }}
                >
                  Open Discovery feed
                </Button>
                <p className="text-xs text-muted-foreground">
                  Open the Discovery feed that the compass icon in the header takes you to.
                </p>
              </div>
            )}

            {step.id === "encrypted-diary" && location.pathname !== "/diary" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/diary");
                  }}
                >
                  Open Diary
                </Button>
                <p className="text-xs text-muted-foreground">
                  Go right into your encrypted diary from this tutorial step.
                </p>
              </div>
            )}

            {step.id === "eighteen-plus" && location.pathname !== "/18-plus" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/18-plus");
                  }}
                >
                  Open 18+ section
                </Button>
                <p className="text-xs text-muted-foreground">
                  Navigate to the dedicated 18+ area linked from the header when it&apos;s enabled.
                </p>
              </div>
            )}

            {step.id === "saved-clips" && location.pathname !== "/saved" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/saved");
                  }}
                >
                  Open Saved clips
                </Button>
                <p className="text-xs text-muted-foreground">
                  Jump straight to your Saved clips page from here.
                </p>
              </div>
            )}

            {step.id === "my-recordings" && location.pathname !== "/my-recordings" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/my-recordings");
                  }}
                >
                  Open My Recordings
                </Button>
                <p className="text-xs text-muted-foreground">
                  Go directly to the My Recordings page that the mic header icon represents.
                </p>
              </div>
            )}

            {step.id === "settings" && !location.pathname.startsWith("/settings") && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    setHighlightRect(null);
                    setTargetElement(null);
                    setTooltipPosition(null);
                    setIsManualRouteChange(true);
                    navigate("/settings?tab=general");
                  }}
                >
                  Open Settings
                </Button>
                <p className="text-xs text-muted-foreground">
                  Follow the highlighted Settings icon to customize your profile and preferences.
                </p>
              </div>
            )}

            {step.id === "notifications" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    // Trigger the existing Notifications button so its own logic runs
                    const notifButton = document.querySelector(
                      'button[aria-label="Notifications"]'
                    ) as HTMLButtonElement | null;
                    if (notifButton) {
                      notifButton.click();
                    }
                  }}
                >
                  Open Notifications
                </Button>
                <p className="text-xs text-muted-foreground">
                  This clicks the bell icon for you so you can see how notifications appear.
                </p>
              </div>
            )}

            {step.id === "keyboard-shortcuts" && (
              <div className="flex flex-col gap-2">
                <Button
                  variant="default"
                  className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
                  onClick={() => {
                    // Trigger the Keyboard Shortcuts button in the header
                    const shortcutsButton = document.querySelector(
                      'button[aria-label="Keyboard shortcuts"]'
                    ) as HTMLButtonElement | null;
                    if (shortcutsButton) {
                      shortcutsButton.click();
                    }
                  }}
                >
                  Open keyboard shortcuts
                </Button>
                <p className="text-xs text-muted-foreground">
                  This opens the Keyboard Shortcuts dialog so you can see all the keys in action.
                </p>
              </div>
            )}

            {step.id === "feed-sorting" && feedSortingState === "for_you" && (
              <div className="mt-1 p-3 rounded-xl border border-primary/40 bg-primary/5 text-sm text-foreground/90">
                <p className="font-medium mb-1">For You feed</p>
                <p>
                  This feed is personalized based on what you listen to, finish, and react to. Use the dropdown
                  to switch between main For You, <span className="font-semibold">Unheard</span> (clips you&apos;ve never played),
                  and <span className="font-semibold">Following</span> (creators you follow) – all are still part of your For You surface.
                </p>
              </div>
            )}
            {step.action && (
              <Button 
                onClick={step.action} 
                className="w-full rounded-xl font-medium shadow-sm hover:shadow-md transition-all"
              >
                Try it now
              </Button>
            )}
            <div className="flex items-center justify-between gap-2 pt-2">
              <Button
                variant="outline"
                onClick={handlePrevious}
                disabled={currentStep === 0 || isTransitioning || isNavigatingRef.current}
                className="flex-1 rounded-xl font-medium transition-all disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>
              {/* On Link Your Account step inside Settings, hide the Next button
                  so users use "Go to Account" + subsequent steps instead. */}
              {!(step.id === "account-linking" && location.pathname.startsWith("/settings")) && (
                <Button
                  onClick={handleNext}
                  disabled={isTransitioning || isNavigatingRef.current}
                  className="flex-1 rounded-xl font-medium shadow-sm hover:shadow-md transition-all disabled:opacity-50"
                >
                  {currentStep === TUTORIAL_STEPS.length - 1 ? "Get Started" : "Next"}
                  {currentStep < TUTORIAL_STEPS.length - 1 && (
                    <ArrowRight className="h-4 w-4 ml-2" />
                  )}
                </Button>
              )}
            </div>
            <Button
              variant="ghost"
              onClick={handleSkip}
              className="w-full text-sm text-muted-foreground hover:text-foreground rounded-xl transition-colors"
            >
              Skip tutorial
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

// Hook to check if tutorial should be shown
export const useTutorial = () => {
  const shouldShow = () => {
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return !completed;
  };

  const markCompleted = () => {
    localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
  };

  const reset = () => {
    localStorage.removeItem(TUTORIAL_STORAGE_KEY);
  };

  return { shouldShow: shouldShow(), markCompleted, reset };
};

