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
 * Wrapped in error boundary to show onboarding on any error (especially mobile)
 */
export const AuthenticatedLayout = () => {
  const location = useLocation();
  
  const handleOnboardingComplete = useCallback((newProfileId: string) => {
    console.log('[AuthenticatedLayout] Onboarding complete, reloading...');
    window.location.reload();
  }, []);
  
  // Wrap everything in error boundary that shows onboarding
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <OnboardingFlow onComplete={handleOnboardingComplete} />
        </div>
      }
    >
      <AuthenticatedLayoutContent 
        location={location} 
        onOnboardingComplete={handleOnboardingComplete}
      />
    </ErrorBoundary>
  );
};

/**
 * Inner content that can safely use hooks
 * If useAuth throws, the error boundary above will catch it and show onboarding
 */
const AuthenticatedLayoutContent = ({ 
  location, 
  onOnboardingComplete 
}: { 
  location: ReturnType<typeof useLocation>;
  onOnboardingComplete: (profileId: string) => void;
}) => {
  // This will throw if AuthContext is broken - error boundary will catch it
  const { profileId } = useAuth();
  
  // If no profileId, show onboarding immediately - bypass everything
  if (!profileId) {
    return <OnboardingFlow onComplete={onOnboardingComplete} />;
  }
  
  return (
    <AuthGuard>
      <AudioPlayerProvider>
        <div className="pb-20 md:pb-4" key={location.pathname}>
          <Outlet />
        </div>
        <MiniPlayer />
        <BottomNavigation />
      </AudioPlayerProvider>
    </AuthGuard>
  );
};

