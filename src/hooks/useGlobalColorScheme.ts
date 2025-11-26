import { useEffect, useCallback } from "react";
import { useProfile } from "@/hooks/useProfile";

/**
 * Hook to apply profile color scheme globally across all pages
 */
export function useGlobalColorScheme() {
  const { profile } = useProfile();

  const applyColorScheme = useCallback(() => {
    // Check if a custom theme is active - if so, don't override theme variables
    const root = document.documentElement;
    const body = document.body;
    const hasCustomTheme = Array.from(root.classList).some(cls => cls.startsWith('theme-')) ||
                           Array.from(body.classList).some(cls => cls.startsWith('theme-'));
    
    // If a custom theme is active, only apply profile-specific variables, not theme overrides
    if (hasCustomTheme) {
      if (profile?.color_scheme) {
        const colorScheme = profile.color_scheme as {
          primary: string | null;
          secondary: string | null;
          accent: string | null;
          background: string | null;
        };
        
        // Only set profile-specific variables, not theme overrides
        if (colorScheme.primary) {
          document.documentElement.style.setProperty("--profile-primary", colorScheme.primary);
        } else {
          document.documentElement.style.removeProperty("--profile-primary");
        }
        
        if (colorScheme.secondary) {
          document.documentElement.style.setProperty("--profile-secondary", colorScheme.secondary);
        } else {
          document.documentElement.style.removeProperty("--profile-secondary");
        }
        
        if (colorScheme.accent) {
          document.documentElement.style.setProperty("--profile-accent", colorScheme.accent);
        } else {
          document.documentElement.style.removeProperty("--profile-accent");
        }
        
        if (colorScheme.background) {
          document.documentElement.style.setProperty("--profile-background", colorScheme.background);
        } else {
          document.documentElement.style.removeProperty("--profile-background");
        }
      } else {
        // Reset profile variables only
        document.documentElement.style.removeProperty("--profile-primary");
        document.documentElement.style.removeProperty("--profile-secondary");
        document.documentElement.style.removeProperty("--profile-accent");
        document.documentElement.style.removeProperty("--profile-background");
      }
      return; // Don't override theme variables when custom theme is active
    }

    // No custom theme active - apply profile color scheme normally
    if (!profile?.color_scheme) {
      // Reset to default if no color scheme
      document.documentElement.style.removeProperty("--profile-primary");
      document.documentElement.style.removeProperty("--profile-secondary");
      document.documentElement.style.removeProperty("--profile-accent");
      document.documentElement.style.removeProperty("--profile-background");
      // Also remove theme variable overrides
      document.documentElement.style.removeProperty("--primary");
      document.documentElement.style.removeProperty("--secondary");
      document.documentElement.style.removeProperty("--accent");
      document.documentElement.style.removeProperty("--background");
      document.documentElement.style.removeProperty("--card");
      return;
    }

    const colorScheme = profile.color_scheme as {
      primary: string | null;
      secondary: string | null;
      accent: string | null;
      background: string | null;
    };

    // Apply color scheme as CSS variables globally
    if (colorScheme.primary) {
      document.documentElement.style.setProperty("--profile-primary", colorScheme.primary);
      // Also override primary color if enabled
      if (colorScheme.primary) {
        const rgb = hexToRgb(colorScheme.primary);
        if (rgb) {
          const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
          document.documentElement.style.setProperty("--primary", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
        }
      }
    } else {
      document.documentElement.style.removeProperty("--profile-primary");
    }

    if (colorScheme.secondary) {
      document.documentElement.style.setProperty("--profile-secondary", colorScheme.secondary);
      const rgb = hexToRgb(colorScheme.secondary);
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        document.documentElement.style.setProperty("--secondary", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
      }
    } else {
      document.documentElement.style.removeProperty("--profile-secondary");
    }

    if (colorScheme.accent) {
      document.documentElement.style.setProperty("--profile-accent", colorScheme.accent);
      const rgb = hexToRgb(colorScheme.accent);
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        document.documentElement.style.setProperty("--accent", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
      }
    } else {
      document.documentElement.style.removeProperty("--profile-accent");
    }

    if (colorScheme.background) {
      document.documentElement.style.setProperty("--profile-background", colorScheme.background);
      const rgb = hexToRgb(colorScheme.background);
      if (rgb) {
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
        document.documentElement.style.setProperty("--background", `${hsl.h} ${hsl.s}% ${hsl.l}%`);
        document.documentElement.style.setProperty("--card", `${hsl.h} ${hsl.s}% ${Math.min(hsl.l + 2, 100)}%`);
      }
    } else {
      document.documentElement.style.removeProperty("--profile-background");
    }
  }, [profile?.color_scheme]);

  useEffect(() => {
    applyColorScheme();
    
    // Listen for color scheme updates
    const handleColorSchemeUpdate = () => {
      applyColorScheme();
    };
    window.addEventListener("colorSchemeUpdated", handleColorSchemeUpdate);
    
    return () => {
      window.removeEventListener("colorSchemeUpdated", handleColorSchemeUpdate);
    };
  }, [applyColorScheme]);
}

// Helper functions to convert hex to HSL
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

