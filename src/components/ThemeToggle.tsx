import { Moon, Sun, Palette, Check } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState, startTransition, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const THEMES = [
  { id: "light", name: "Light", icon: "☀️", colors: ["#F5F5F5", "#FF6B6B", "#4ECDC4"] },
  { id: "dark", name: "Dark", icon: "🌙", colors: ["#1A1A1A", "#FF6B6B", "#4ECDC4"] },
  { id: "ocean", name: "Ocean", icon: "🌊", colors: ["#E0F2FE", "#0EA5E9", "#06B6D4"] },
  { id: "sunset", name: "Sunset", icon: "🌅", colors: ["#FFF5E6", "#FF6B6B", "#FF8E53"] },
  { id: "forest", name: "Forest", icon: "🌲", colors: ["#F0FDF4", "#22C55E", "#10B981"] },
  { id: "neon", name: "Neon", icon: "💜", colors: ["#FAF5FF", "#A855F7", "#EC4899"] },
  { id: "midnight", name: "Midnight", icon: "🌃", colors: ["#1E1B4B", "#6366F1", "#8B5CF6"] },
  { id: "aurora", name: "Aurora", icon: "✨", colors: ["#ECFEFF", "#06B6D4", "#8B5CF6"] },
  { id: "rose", name: "Rose", icon: "🌹", colors: ["#FFF1F2", "#F43F5E", "#EC4899"] },
] as const;

export const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<string>("light");

  // Theme color definitions - Enhanced vibrant colors
  const themeColors: Record<string, Record<string, string>> = {
    ocean: {
      "--background": "200 60% 96%",
      "--foreground": "210 40% 12%",
      "--card": "200 55% 98%",
      "--card-foreground": "210 35% 12%",
      "--popover": "200 55% 98%",
      "--popover-foreground": "210 35% 12%",
      "--primary": "195 95% 50%",
      "--primary-foreground": "0 0% 100%",
      "--secondary": "180 50% 80%",
      "--secondary-foreground": "210 40% 12%",
      "--muted": "200 40% 90%",
      "--muted-foreground": "210 30% 40%",
      "--accent": "190 95% 45%",
      "--accent-foreground": "0 0% 100%",
      "--destructive": "0 72% 51%",
      "--destructive-foreground": "0 0% 100%",
      "--border": "200 40% 85%",
      "--input": "200 40% 85%",
      "--ring": "195 95% 50%",
      "--record-pulse": "195 95% 50%",
      "--waveform": "190 85% 45%",
      "--emoji-glow": "195 100% 55%",
    },
    neon: {
      "--background": "280 60% 96%",
      "--foreground": "270 40% 12%",
      "--card": "280 55% 98%",
      "--card-foreground": "270 40% 12%",
      "--popover": "280 55% 98%",
      "--popover-foreground": "270 40% 12%",
      "--primary": "280 95% 60%",
      "--primary-foreground": "0 0% 100%",
      "--secondary": "300 60% 85%",
      "--secondary-foreground": "270 40% 12%",
      "--muted": "280 45% 90%",
      "--muted-foreground": "270 30% 40%",
      "--accent": "320 90% 65%",
      "--accent-foreground": "0 0% 100%",
      "--destructive": "0 72% 51%",
      "--destructive-foreground": "0 0% 100%",
      "--border": "280 40% 85%",
      "--input": "280 40% 85%",
      "--ring": "280 95% 60%",
      "--record-pulse": "280 95% 60%",
      "--waveform": "290 85% 55%",
      "--emoji-glow": "285 100% 65%",
    },
    forest: {
      "--background": "150 50% 96%",
      "--foreground": "160 40% 12%",
      "--card": "150 45% 98%",
      "--card-foreground": "160 40% 12%",
      "--popover": "150 45% 98%",
      "--popover-foreground": "160 40% 12%",
      "--primary": "145 80% 40%",
      "--primary-foreground": "0 0% 100%",
      "--secondary": "160 50% 80%",
      "--secondary-foreground": "160 40% 12%",
      "--muted": "150 40% 90%",
      "--muted-foreground": "160 30% 40%",
      "--accent": "170 80% 45%",
      "--accent-foreground": "0 0% 100%",
      "--destructive": "0 72% 51%",
      "--destructive-foreground": "0 0% 100%",
      "--border": "150 40% 85%",
      "--input": "150 40% 85%",
      "--ring": "145 80% 40%",
      "--record-pulse": "145 80% 40%",
      "--waveform": "150 70% 35%",
      "--emoji-glow": "155 100% 45%",
    },
    sunset: {
      "--background": "25 60% 96%",
      "--foreground": "20 35% 12%",
      "--card": "25 55% 98%",
      "--card-foreground": "20 35% 12%",
      "--popover": "25 55% 98%",
      "--popover-foreground": "20 35% 12%",
      "--primary": "15 95% 55%",
      "--primary-foreground": "0 0% 100%",
      "--secondary": "30 70% 85%",
      "--secondary-foreground": "20 35% 12%",
      "--muted": "25 45% 90%",
      "--muted-foreground": "20 30% 40%",
      "--accent": "350 90% 60%",
      "--accent-foreground": "0 0% 100%",
      "--destructive": "0 72% 51%",
      "--destructive-foreground": "0 0% 100%",
      "--border": "25 40% 85%",
      "--input": "25 40% 85%",
      "--ring": "15 95% 55%",
      "--record-pulse": "15 95% 55%",
      "--waveform": "10 85% 50%",
      "--emoji-glow": "20 100% 60%",
    },
    aurora: {
      "--background": "200 60% 96%",
      "--foreground": "220 40% 12%",
      "--card": "200 55% 98%",
      "--card-foreground": "220 40% 12%",
      "--popover": "200 55% 98%",
      "--popover-foreground": "220 40% 12%",
      "--primary": "195 95% 50%",
      "--primary-foreground": "0 0% 100%",
      "--secondary": "280 50% 85%",
      "--secondary-foreground": "220 40% 12%",
      "--muted": "200 45% 90%",
      "--muted-foreground": "220 30% 40%",
      "--accent": "270 80% 55%",
      "--accent-foreground": "0 0% 100%",
      "--destructive": "0 72% 51%",
      "--destructive-foreground": "0 0% 100%",
      "--border": "200 40% 85%",
      "--input": "200 40% 85%",
      "--ring": "195 95% 50%",
      "--record-pulse": "195 95% 50%",
      "--waveform": "200 80% 45%",
      "--emoji-glow": "195 100% 55%",
    },
    rose: {
      "--background": "340 60% 96%",
      "--foreground": "330 40% 12%",
      "--card": "340 55% 98%",
      "--card-foreground": "330 40% 12%",
      "--popover": "340 55% 98%",
      "--popover-foreground": "330 40% 12%",
      "--primary": "330 80% 55%",
      "--primary-foreground": "0 0% 100%",
      "--secondary": "350 60% 85%",
      "--secondary-foreground": "330 40% 12%",
      "--muted": "340 45% 90%",
      "--muted-foreground": "330 30% 40%",
      "--accent": "320 85% 60%",
      "--accent-foreground": "0 0% 100%",
      "--destructive": "0 72% 51%",
      "--destructive-foreground": "0 0% 100%",
      "--border": "340 40% 85%",
      "--input": "340 40% 85%",
      "--ring": "330 80% 55%",
      "--record-pulse": "330 80% 55%",
      "--waveform": "335 75% 50%",
      "--emoji-glow": "330 100% 60%",
    },
    midnight: {
      "--background": "240 40% 8%",
      "--foreground": "230 30% 95%",
      "--card": "240 35% 12%",
      "--card-foreground": "230 30% 95%",
      "--popover": "240 35% 12%",
      "--popover-foreground": "230 30% 95%",
      "--primary": "230 75% 55%",
      "--primary-foreground": "0 0% 100%",
      "--secondary": "240 25% 20%",
      "--secondary-foreground": "230 30% 95%",
      "--muted": "240 25% 18%",
      "--muted-foreground": "230 20% 60%",
      "--accent": "260 80% 60%",
      "--accent-foreground": "0 0% 100%",
      "--destructive": "0 62% 45%",
      "--destructive-foreground": "230 30% 95%",
      "--border": "240 25% 18%",
      "--input": "240 25% 18%",
      "--ring": "230 75% 55%",
    },
  };

  // Function to apply theme classes to the document root
  const applyTheme = useCallback((themeId: string) => {
    const root = document.documentElement;
    const body = document.body;
    
    // Remove all existing theme classes from both html and body
    const themeClasses = THEMES.map(t => `theme-${t.id}`);
    themeClasses.forEach(themeClass => {
      root.classList.remove(themeClass);
      body.classList.remove(themeClass);
    });
    
    // Remove light/dark classes
    root.classList.remove("dark", "light");
    
    // Handle base themes (light/dark)
    if (themeId === "dark") {
      root.classList.add("dark");
      // Remove all custom theme inline styles
      Object.keys(themeColors).forEach(() => {
        Object.keys(themeColors[Object.keys(themeColors)[0]]).forEach(key => {
          root.style.removeProperty(key);
        });
      });
    } else if (themeId === "light") {
      root.classList.add("light");
      // Remove all custom theme inline styles
      Object.keys(themeColors).forEach(() => {
        Object.keys(themeColors[Object.keys(themeColors)[0]]).forEach(key => {
          root.style.removeProperty(key);
        });
      });
    } else {
      // Apply custom theme class to both html and body
      root.classList.add(`theme-${themeId}`);
      body.classList.add(`theme-${themeId}`);
      
      // ALSO apply colors directly as inline styles for maximum priority
      const colors = themeColors[themeId];
      if (colors) {
        Object.entries(colors).forEach(([key, value]) => {
          root.style.setProperty(key, value);
        });
      }
      
      // Midnight theme uses dark mode variant
      if (themeId === "midnight") {
        root.classList.add("dark");
      } else {
        root.classList.add("light");
      }
    }
    
    // Force a reflow to ensure styles are applied
    void root.offsetHeight;
    void body.offsetHeight;
    
    // Apply again multiple times to ensure it sticks
    const reapplyTheme = () => {
      const root = document.documentElement;
      const body = document.body;
      
      // Remove all theme classes first
      themeClasses.forEach(themeClass => {
        root.classList.remove(themeClass);
        body.classList.remove(themeClass);
      });
      root.classList.remove("dark", "light");
      
      if (themeId === "dark") {
        root.classList.add("dark");
        Object.keys(themeColors).forEach(() => {
          Object.keys(themeColors[Object.keys(themeColors)[0]]).forEach(key => {
            root.style.removeProperty(key);
          });
        });
      } else if (themeId === "light") {
        root.classList.add("light");
        Object.keys(themeColors).forEach(() => {
          Object.keys(themeColors[Object.keys(themeColors)[0]]).forEach(key => {
            root.style.removeProperty(key);
          });
        });
      } else {
        root.classList.add(`theme-${themeId}`);
        body.classList.add(`theme-${themeId}`);
        
        // Reapply inline styles
        const colors = themeColors[themeId];
        if (colors) {
          Object.entries(colors).forEach(([key, value]) => {
            root.style.setProperty(key, value);
          });
        }
        
        if (themeId === "midnight") {
          root.classList.add("dark");
        } else {
          root.classList.add("light");
        }
      }
      
      void root.offsetHeight;
      void body.offsetHeight;
    };
    
    // Reapply multiple times to override any next-themes interference
    setTimeout(reapplyTheme, 10);
    setTimeout(reapplyTheme, 50);
    setTimeout(reapplyTheme, 100);
    setTimeout(reapplyTheme, 200);
  }, []);

  // Initialize on mount
  useEffect(() => {
    setMounted(true);
    // Get theme from localStorage
    const storedTheme = localStorage.getItem("echo-garden-theme") || "light";
    
    // Initialize theme with next-themes
    if (!theme && storedTheme) {
      setTheme(storedTheme);
    }
    
    const themeToApply = theme || storedTheme;
    setCurrentTheme(themeToApply);
    applyTheme(themeToApply);
  }, []); // Only run once on mount

  // Apply theme whenever it changes - but prioritize localStorage
  useEffect(() => {
    if (mounted) {
      // Always check localStorage first for the actual theme
      const storedTheme = localStorage.getItem("echo-garden-theme") || "light";
      const themeToApply = storedTheme;
      
      setCurrentTheme(themeToApply);
      applyTheme(themeToApply);
      
      // Set up MutationObserver to ensure theme classes persist
      const observer = new MutationObserver(() => {
        const root = document.documentElement;
        const body = document.body;
        const storedTheme = localStorage.getItem("echo-garden-theme") || "light";
        const hasThemeClass = THEMES.some(t => 
          root.classList.contains(`theme-${t.id}`) || 
          body.classList.contains(`theme-${t.id}`)
        );
        const isCustomTheme = storedTheme && !["light", "dark"].includes(storedTheme);
        
        // If we have a custom theme but the class was removed, reapply it
        if (isCustomTheme && !hasThemeClass) {
          applyTheme(storedTheme);
        }
      });
      
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["class"],
      });
      
      observer.observe(document.body, {
        attributes: true,
        attributeFilter: ["class"],
      });
      
      // Continuously reapply theme to prevent next-themes from removing it
      const interval = setInterval(() => {
        const storedTheme = localStorage.getItem("echo-garden-theme") || "light";
        if (storedTheme && !["light", "dark"].includes(storedTheme)) {
          applyTheme(storedTheme);
        }
      }, 1000);
      
      return () => {
        observer.disconnect();
        clearInterval(interval);
      };
    }
  }, [mounted, applyTheme]);

  if (!mounted) {
    return (
      <Button variant="ghost" size="icon" className="rounded-full" disabled>
        <Sun className="h-5 w-5" />
      </Button>
    );
  }

  const handleThemeChange = (themeId: string) => {
    // Immediately apply the theme
    applyTheme(themeId);
    setCurrentTheme(themeId);
    localStorage.setItem("echo-garden-theme", themeId);
    
    // Remove any inline style overrides that might interfere
    if (themeId !== "light" && themeId !== "dark") {
      // For custom themes, remove inline style overrides
      document.documentElement.style.removeProperty("--primary");
      document.documentElement.style.removeProperty("--secondary");
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--background");
      document.documentElement.style.removeProperty("--card");
    }
    
    // For next-themes, only set light/dark, but store custom theme in localStorage
    if (themeId === "light" || themeId === "dark") {
      setTheme(themeId);
    } else {
      // For custom themes, set next-themes to light (except midnight which is dark)
      // but we'll apply our custom theme classes directly
      if (themeId === "midnight") {
        setTheme("dark");
      } else {
        setTheme("light");
      }
    }
    
    // Trigger color scheme update to respect theme
    window.dispatchEvent(new CustomEvent("colorSchemeUpdated"));
    
    // Keep reapplying to ensure it sticks
    setTimeout(() => {
      applyTheme(themeId);
      if (themeId !== "light" && themeId !== "dark") {
        document.documentElement.style.removeProperty("--primary");
        document.documentElement.style.removeProperty("--secondary");
        document.documentElement.style.removeProperty("--accent");
        document.documentElement.style.removeProperty("--background");
        document.documentElement.style.removeProperty("--card");
      }
    }, 100);
    setTimeout(() => {
      applyTheme(themeId);
      if (themeId !== "light" && themeId !== "dark") {
        document.documentElement.style.removeProperty("--primary");
        document.documentElement.style.removeProperty("--secondary");
        document.documentElement.style.removeProperty("--accent");
        document.documentElement.style.removeProperty("--background");
        document.documentElement.style.removeProperty("--card");
      }
    }, 300);
    setTimeout(() => {
      applyTheme(themeId);
      if (themeId !== "light" && themeId !== "dark") {
        document.documentElement.style.removeProperty("--primary");
        document.documentElement.style.removeProperty("--secondary");
        document.documentElement.style.removeProperty("--accent");
        document.documentElement.style.removeProperty("--background");
        document.documentElement.style.removeProperty("--card");
      }
    }, 500);
  };

  const currentThemeData = THEMES.find(t => t.id === currentTheme) || THEMES[0];

  return (
    <TooltipProvider>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                aria-label="Select theme"
              >
                <Palette className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Change theme</p>
          </TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-56 rounded-2xl">
          <DropdownMenuLabel className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Color Themes
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {THEMES.map((themeOption) => (
            <DropdownMenuItem
              key={themeOption.id}
              onClick={() => handleThemeChange(themeOption.id)}
              className="flex items-center gap-3 rounded-xl cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-1">
                <span className="text-lg">{themeOption.icon}</span>
                <span className="flex-1">{themeOption.name}</span>
                {currentTheme === themeOption.id && (
                  <Check className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="flex gap-1">
                {themeOption.colors.map((color, idx) => (
                  <div
                    key={idx}
                    className="w-3 h-3 rounded-full border border-border"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </TooltipProvider>
  );
};

