import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { X, ArrowRight, ArrowLeft, Sparkles, Mic, Heart, MessageCircle, UserPlus, Bookmark, Search, Users, Radio, Filter, List, Grid3x3, Upload, Bell, Settings, Hash, PlayCircle, BookOpen, Lock } from "lucide-react";
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
  },
  {
    id: "follow",
    title: "Follow Creators",
    description: "Click on any creator's handle or avatar to visit their profile. Click 'Follow' to see their clips in your Following feed! You can access your Following feed from the header. Build your personalized feed by following voices you love.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <UserPlus className="h-6 w-6" />,
  },
  {
    id: "communities",
    title: "Communities",
    description: "Join audio communities to connect with like-minded voices! Click the Communities icon in the header to discover themed groups. Join communities, follow them, and participate in community-specific conversations and events.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Users className="h-6 w-6" />,
  },
  {
    id: "live-rooms",
    title: "Live Audio Rooms",
    description: "Join real-time voice conversations in Live Rooms! Click the Live Rooms icon to see active rooms. Host your own room, join as a speaker or listener, and engage in live discussions with the community.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Radio className="h-6 w-6" />,
  },
  {
    id: "saved-clips",
    title: "Saved Clips & Bookmarks",
    description: "Save clips you love for later! Click the bookmark icon on any clip, then access all your saved clips from the Saved icon in the header. Create playlists and organize your favorite voices into collections.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Bookmark className="h-6 w-6" />,
  },
  {
    id: "encrypted-diary",
    title: "Encrypted Diary",
    description: "Keep your private thoughts secure with the encrypted diary! Click the diary icon in the header to access your personal journal. All entries are encrypted with your password or PIN, ensuring complete privacy. Write entries, add tags and moods, pin favorites, and export your memories.",
    targetSelector: '[data-tutorial="diary"]',
    position: "bottom",
    icon: <Lock className="h-6 w-6" />,
  },
  {
    id: "account-linking",
    title: "Link Your Account",
    description: "Use the lock icon in the header to link this device to your account using a PIN! Go to Settings → Account to generate a 4-digit PIN, then enter it on another device to link them. PINs expire after 10 minutes for security.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Lock className="h-6 w-6" />,
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Stay updated with the bell icon in the header! Get notified about new followers, replies to your clips, reactions, and more. Never miss important interactions with your content!",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Bell className="h-6 w-6" />,
  },
  {
    id: "my-recordings",
    title: "My Recordings",
    description: "Manage all your published clips from the My Recordings page! Access it via the microphone icon in the header. View your clips, see their stats, edit them, and track your voice journey.",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Mic className="h-6 w-6" />,
  },
  {
    id: "settings",
    title: "Settings & Customization",
    description: "Customize your Vocalix experience in Settings! Change your handle (with limits), update your avatar, set your city, adjust playback preferences, enable captions by default, and more. Make it yours!",
    targetSelector: '[data-tutorial="navigation"]',
    position: "bottom",
    icon: <Settings className="h-6 w-6" />,
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
  const step = TUTORIAL_STEPS[currentStep];

  // Check if tutorial should be shown
  const shouldShowTutorial = useCallback(() => {
    const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
    return !completed;
  }, []);

  // Safety: whenever the step changes, always clear any stale navigation locks
  useEffect(() => {
    isNavigatingRef.current = false;
    setIsTransitioning(false);
  }, [currentStep]);

  // Disable body scroll when tutorial is active
  useEffect(() => {
    const isShowing = shouldShowTutorial();
    if (!isShowing) {
      return;
    }

    // Store original overflow style
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalWidth = document.body.style.width;

    // Disable scrolling - prevent background from scrolling
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    // Save current scroll position
    const scrollY = window.scrollY;
    document.body.style.top = `-${scrollY}px`;

    // Prevent scroll events on the document
    const preventScroll = (e: WheelEvent | TouchEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Prevent wheel and touch scroll events
    document.addEventListener('wheel', preventScroll, { passive: false });
    document.addEventListener('touchmove', preventScroll, { passive: false });

    return () => {
      // Re-enable scrolling when tutorial is closed
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.width = originalWidth;
      // Restore scroll position
      window.scrollTo(0, scrollY);
      // Remove event listeners
      document.removeEventListener('wheel', preventScroll);
      document.removeEventListener('touchmove', preventScroll);
    };
  }, [shouldShowTutorial]);

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
      if (!step.targetSelector) {
        setTargetElement(null);
        setTooltipPosition(null);
        setHighlightRect(null);
        return;
      }

      // Use a more specific query to avoid matching wrong elements
      let element = document.querySelector(step.targetSelector) as HTMLElement;
      
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
        // Find the mood filters container (the one with emoji buttons)
        const allFilters = document.querySelectorAll('[data-tutorial="filters"]');
        for (const filter of Array.from(allFilters)) {
          // Check if this container has emoji buttons or "All moods" text
          const buttons = filter.querySelectorAll('button');
          let hasEmojiButtons = false;
          for (const btn of Array.from(buttons)) {
            if (btn.textContent?.includes("😊") || btn.textContent?.includes("All moods")) {
              hasEmojiButtons = true;
              break;
            }
          }
          if (hasEmojiButtons || filter.textContent?.includes("All moods")) {
            element = filter as HTMLElement;
            break;
          }
        }
        // If no mood filters found, use the first filters container
        if (!element && allFilters.length > 0) {
          element = allFilters[0] as HTMLElement;
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
          // Fallback: just use the main element’s rect
          setHighlightRect(rect);
        }
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
          // Anchor above the combined Chamber + bar area, shifted further to the right
          preferredPosition = "top";
          const desiredTop = rect.top - tooltipHeight - effectiveSpacing - extraSpacing;
          // Push more to the right so the card content remains fully visible
          const desiredLeft = rect.left + rect.width / 2 - tooltipWidth / 2 + (isMobile ? 24 : 72);
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
    // Lock body scroll
    const originalOverflow = document.body.style.overflow;
    const originalPosition = document.body.style.position;
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    
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
      // Restore body scroll
      document.body.style.overflow = originalOverflow;
      document.body.style.position = originalPosition;
      document.body.style.width = '';
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [markCompleted]);

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
      // Special behavior when going back from Feed Sorting (step 4) to Daily Topics (step 3)
      const currentStepConfig = TUTORIAL_STEPS[currentStep];
      const previousStepConfig = TUTORIAL_STEPS[currentStep - 1];
      if (currentStepConfig?.id === "feed-sorting" && previousStepConfig?.id === "today-topic") {
        // If the Chamber (formerly Welcome Garden) topic is active, deselect it
        const chamberButton = document.querySelector('[data-tutorial="welcome-garden"][data-active="true"]') as HTMLElement | null;
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

  const progress = ((currentStep + 1) / TUTORIAL_STEPS.length) * 100;

  // Check if tutorial is completed - use direct localStorage check for immediate response
  const isCompleted = typeof window !== 'undefined' && localStorage.getItem(TUTORIAL_STORAGE_KEY) === "true";
  
  // Sync parent state if completed
  useEffect(() => {
    if (isCompleted) {
      onComplete();
    }
  }, [isCompleted, onComplete]);

  // Track feed sorting state (which option user clicked) to adjust text on step 4
  useEffect(() => {
    if (step.id !== "feed-sorting") {
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

  // Don't show if already completed
  if (isCompleted || !shouldShowTutorial()) {
    return null;
  }

  // Dynamic description for steps that depend on UI state (e.g. Feed Sorting)
  const effectiveDescription = useMemo(() => {
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
    return step.description;
  }, [step, feedSortingState]);

  // Calculate spotlight position for overlay with smooth transitions
  const spotlightStyle = useMemo(() => {
    if (!highlightRect || !step.highlight) {
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
  }, [highlightRect, step.highlight]);

  const highlightStyle = useMemo(() => {
    if (!highlightRect || !step.highlight) return null;

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
  }, [highlightRect, step.highlight]);

  // Ensure target element is above blocking overlay
  useEffect(() => {
    if (targetElement && step.highlight) {
      // Make sure the target element can receive pointer events
      const originalStyle = targetElement.style.pointerEvents;
      const originalZIndex = targetElement.style.zIndex;
      targetElement.style.pointerEvents = 'auto';
      targetElement.style.zIndex = '100000'; // Above blocking overlay
      
      return () => {
        targetElement.style.pointerEvents = originalStyle;
        targetElement.style.zIndex = originalZIndex;
      };
    }
  }, [targetElement, step.highlight]);

  return (
    <div className="fixed inset-0 z-[100000] pointer-events-none">
      {/* Blocking overlay - blocks all interactions except tutorial elements */}
      <div
        className="absolute inset-0 bg-transparent pointer-events-auto"
        style={{
          // Create a cutout for the highlighted element so it can be clicked
          ...(highlightRect && step.highlight ? {
            clipPath: `polygon(
              0% 0%, 
              0% 100%, 
              ${Math.max(0, highlightRect.left - 12)}px 100%, 
              ${Math.max(0, highlightRect.left - 12)}px ${Math.max(0, highlightRect.top - 12)}px, 
              ${Math.min(window.innerWidth, highlightRect.right + 12)}px ${Math.max(0, highlightRect.top - 12)}px, 
              ${Math.min(window.innerWidth, highlightRect.right + 12)}px ${Math.min(window.innerHeight, highlightRect.bottom + 12)}px, 
              ${Math.max(0, highlightRect.left - 12)}px ${Math.min(window.innerHeight, highlightRect.bottom + 12)}px, 
              ${Math.max(0, highlightRect.left - 12)}px 100%, 
              100% 100%, 
              100% 0%
            )`,
          } : {}),
        }}
        onClick={(e) => {
          // Block all clicks outside tutorial elements
          e.stopPropagation();
          e.preventDefault();
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
        onTouchStart={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      />
      
      {/* Visual overlay with spotlight effect */}
      <div
        ref={overlayRef}
        className={cn(
          "absolute inset-0 bg-black/70 backdrop-blur-md transition-all duration-300 ease-in-out pointer-events-none"
        )}
        style={spotlightStyle}
      />

      {/* Highlight ring around target element with smooth animation */}
      {highlightRect && step.highlight && highlightStyle && (
        <div
          className="absolute pointer-events-none rounded-2xl z-[99998]"
          style={{
            ...highlightStyle,
            position: 'fixed',
          }}
        >
          <div className="absolute inset-0 border-4 border-primary rounded-2xl shadow-[0_0_30px_rgba(var(--primary),0.6)] animate-pulse" />
          <div className="absolute inset-0 border-4 border-primary/50 rounded-2xl animate-ping" style={{ animationDuration: "2s" }} />
          <div className="absolute -inset-1 bg-primary/20 rounded-2xl blur-xl" />
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
          tooltipPosition
            ? (() => {
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
            : (() => {
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
            <Progress value={progress} className="h-2 bg-muted" />
          </CardHeader>
          <CardContent className="space-y-4">
            <CardDescription className="text-base leading-relaxed text-foreground/80">
              {effectiveDescription}
            </CardDescription>

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

