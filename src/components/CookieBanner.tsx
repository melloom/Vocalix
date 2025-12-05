import { useState, useEffect } from "react";
import { Cookie, X, Settings, Check, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface CookiePreferences {
  essential: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

const COOKIE_CONSENT_KEY = "vocalix_cookie_consent";
const COOKIE_CONSENT_VERSION = "1.0";

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [showCustomizeDialog, setShowCustomizeDialog] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    essential: true, // Always true, cannot be disabled
    functional: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already given consent
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Show banner after a short delay for better UX
      const timer = setTimeout(() => setShowBanner(true), 1000);
      return () => clearTimeout(timer);
    }
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    const consentData = {
      version: COOKIE_CONSENT_VERSION,
      timestamp: new Date().toISOString(),
      preferences: prefs,
    };
    localStorage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(consentData));
    setShowBanner(false);
    setShowCustomizeDialog(false);
    
    // Apply preferences (e.g., disable analytics if rejected)
    if (!prefs.analytics) {
      // Disable Sentry if analytics is rejected
      // This would need to be implemented in your monitoring setup
      console.log("Analytics cookies disabled");
    }
  };

  const handleAcceptAll = () => {
    savePreferences({
      essential: true,
      functional: true,
      analytics: true,
      marketing: false, // We don't use marketing cookies currently
    });
  };

  const handleRejectAll = () => {
    savePreferences({
      essential: true, // Essential cookies cannot be disabled (required for platform to function)
      functional: false,
      analytics: false,
      marketing: false,
    });
    // Note: Essential cookies will still be used for:
    // - Authentication and session management
    // - Security features
    // - Basic platform functionality
    // Functional and analytics cookies will be disabled
  };

  const handleCustomize = () => {
    // Load current preferences if they exist
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (consent) {
      try {
        const data = JSON.parse(consent);
        if (data.preferences) {
          setPreferences(data.preferences);
        }
      } catch (e) {
        // Use defaults
      }
    }
    setShowCustomizeDialog(true);
  };

  const handleSaveCustomPreferences = () => {
    savePreferences(preferences);
  };

  if (!showBanner) return null;

  return (
    <>
      <Card
        className={cn(
          "fixed bottom-0 left-0 right-0 z-[100] rounded-t-2xl rounded-b-none border-b-0 shadow-2xl",
          "bg-background/95 backdrop-blur-sm border-2",
          "animate-slide-in-up"
        )}
        role="dialog"
        aria-labelledby="cookie-banner-title"
        aria-describedby="cookie-banner-description"
      >
        <div className="max-w-6xl mx-auto px-3 py-3 pb-16 md:px-6 md:py-6 md:pb-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-3 md:gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5 md:mb-2">
                <Cookie className="h-4 w-4 md:h-5 md:w-5 text-primary shrink-0" />
                <h3 id="cookie-banner-title" className="font-semibold text-sm md:text-lg">
                  We Value Your Privacy
                </h3>
              </div>
              <p id="cookie-banner-description" className="text-xs md:text-sm text-muted-foreground mb-2 md:mb-3 leading-relaxed">
                Vocalix uses cookies to provide and secure our platform. Essential cookies are required.{" "}
                <Link to="/cookies" className="text-primary hover:underline font-medium">
                  Learn more
                </Link>
                .
              </p>
              <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
                <Button
                  onClick={handleAcceptAll}
                  size="sm"
                  className="text-xs h-7 md:h-9 px-2 md:px-4"
                >
                  Accept All
                </Button>
                <Button
                  onClick={handleRejectAll}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 md:h-9 px-2 md:px-4"
                >
                  Reject All
                </Button>
                <Button
                  onClick={handleCustomize}
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7 md:h-9 px-2 md:px-4"
                >
                  <Settings className="h-3 w-3 mr-1" />
                  Customize
                </Button>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 md:h-8 md:w-8 shrink-0 absolute top-2 right-2 md:relative md:top-0 md:right-0"
              onClick={() => {
                // If user closes without choosing, treat as reject all (privacy-first)
                handleRejectAll();
              }}
              aria-label="Close cookie banner"
            >
              <X className="h-3.5 w-3.5 md:h-4 md:w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <Dialog open={showCustomizeDialog} onOpenChange={setShowCustomizeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Customize Cookie Preferences
            </DialogTitle>
            <DialogDescription>
              Choose which types of cookies you want to allow. Essential cookies are required for Vocalix to function and cannot be disabled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Essential Cookies */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="essential"
                  checked={preferences.essential}
                  disabled
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label htmlFor="essential" className="text-base font-semibold cursor-default">
                    Essential Cookies
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(Required)</span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    These cookies are necessary for Vocalix to function. They enable core features like authentication, 
                    session management, and security. Without these cookies, you cannot log in or use the platform.
                  </p>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <p>• Session authentication (echo_session)</p>
                    <p>• Device identification</p>
                    <p>• UI preferences (theme, sidebar state)</p>
                    <p>• Security and anti-abuse (reCAPTCHA)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Functional Cookies */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="functional"
                  checked={preferences.functional}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, functional: checked === true })
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label htmlFor="functional" className="text-base font-semibold cursor-pointer">
                    Functional Cookies
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    These cookies enable enhanced functionality and personalization, such as remembering your audio 
                    preferences, playback settings, and offline content caching.
                  </p>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <p>• User preferences (feed, audio quality, playback speed)</p>
                    <p>• Offline content caching</p>
                    <p>• Personalization data</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Analytics Cookies */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="analytics"
                  checked={preferences.analytics}
                  onCheckedChange={(checked) =>
                    setPreferences({ ...preferences, analytics: checked === true })
                  }
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label htmlFor="analytics" className="text-base font-semibold cursor-pointer">
                    Analytics & Performance Cookies
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    These cookies help us understand how you use Vocalix, identify errors, and improve performance. 
                    This includes error tracking (Sentry) and performance monitoring.
                  </p>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <p>• Error tracking and debugging (Sentry)</p>
                    <p>• Performance monitoring</p>
                    <p>• Usage analytics</p>
                    <p>• Session replay (for error debugging only)</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Marketing Cookies - Currently not used but included for future */}
            <div className="space-y-3 opacity-60">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="marketing"
                  checked={preferences.marketing}
                  disabled
                  className="mt-1"
                />
                <div className="flex-1">
                  <Label htmlFor="marketing" className="text-base font-semibold cursor-default">
                    Marketing Cookies
                    <span className="ml-2 text-xs font-normal text-muted-foreground">(Not Currently Used)</span>
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    We do not currently use marketing or advertising cookies. This option is reserved for future use.
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-4 border border-border">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">About Your Choices</p>
                  <p>
                    You can change your cookie preferences at any time by visiting our{" "}
                    <Link to="/cookies" className="text-primary hover:underline">
                      Cookie Policy
                    </Link>
                    {" "}or clearing your browser's cookie data. Note that disabling functional or analytics cookies 
                    may impact your experience on Vocalix.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCustomizeDialog(false)}
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSaveCustomPreferences}
              className="w-full sm:w-auto"
            >
              <Check className="h-4 w-4 mr-2" />
              Save Preferences
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

