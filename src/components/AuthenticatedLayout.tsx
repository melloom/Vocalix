import { Outlet, useLocation } from "react-router-dom";
import { AuthGuard } from "./AuthGuard";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { MiniPlayer } from "./MiniPlayer";
import { BottomNavigation } from "./BottomNavigation";
import { PageFooter } from "./PageFooter";
import { ErrorBoundary } from "./ErrorBoundary";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { useAuth } from "@/context/AuthContext";
import { useCallback } from "react";
import { InteractiveTutorial } from "./InteractiveTutorial";

/**
 * Layout component that ensures auth is initialized before rendering child routes
 * This prevents flickering when navigating between pages
 */
export const AuthenticatedLayout = () => {
  const location = useLocation();
  
  // CRITICAL: Wrap useAuth in try-catch to prevent crashes on mobile
  let profileId: string | null = null;
  try {
    const auth = useAuth();
    profileId = auth.profileId || null;
  } catch (e) {
    console.warn("[AuthenticatedLayout] useAuth failed, showing onboarding:", e);
    // If auth fails, show onboarding immediately
    profileId = null;
  }
  
  const handleOnboardingComplete = useCallback((newProfileId: string) => {
    console.log('[AuthenticatedLayout] Onboarding complete, reloading...');
    window.location.reload();
  }, []);
  
  // If no profileId OR auth failed, show onboarding immediately - bypass everything
  if (!profileId) {
    return (
      <ErrorBoundary
        fallback={
          <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <OnboardingFlow onComplete={handleOnboardingComplete} />
          </div>
        }
      >
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      </ErrorBoundary>
    );
  }
  
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <OnboardingFlow onComplete={handleOnboardingComplete} />
        </div>
      }
    >
      <AuthGuard>
        <AudioPlayerProvider>
          <div className="pb-20 md:pb-4 w-full max-w-full overflow-x-hidden flex flex-col min-h-screen">
            <div className="flex-1">
              <Outlet />
            </div>
            <PageFooter />
          </div>
          {/* Global interactive tutorial overlay - persists across routes */}
          {/* Global interactive tutorial overlay - persists across routes */}
          <InteractiveTutorial
            onComplete={() => {
              // No-op for now; tutorial completion is tracked in localStorage
            }}
          />
          <MiniPlayer />
          <BottomNavigation />
        </AudioPlayerProvider>
      </AuthGuard>
    </ErrorBoundary>
  );
};

