import { Outlet, useLocation } from "react-router-dom";
import { AuthGuard } from "./AuthGuard";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { MiniPlayer } from "./MiniPlayer";
import { BottomNavigation } from "./BottomNavigation";
import { ErrorBoundary } from "./ErrorBoundary";
import { OnboardingFlow } from "@/components/OnboardingFlow";
import { useAuth } from "@/context/AuthContext";
import { useCallback } from "react";

/**
 * Layout component that ensures auth is initialized before rendering child routes
 * This prevents flickering when navigating between pages
 */
export const AuthenticatedLayout = () => {
  const location = useLocation();
  const { profileId } = useAuth();
  
  const handleOnboardingComplete = useCallback((newProfileId: string) => {
    console.log('[AuthenticatedLayout] Onboarding complete, reloading...');
    window.location.reload();
  }, []);
  
  // If no profileId, show onboarding immediately - bypass everything
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
          <div className="pb-20 md:pb-4" key={location.pathname}>
            <Outlet />
          </div>
          <MiniPlayer />
          <BottomNavigation />
        </AudioPlayerProvider>
      </AuthGuard>
    </ErrorBoundary>
  );
};

