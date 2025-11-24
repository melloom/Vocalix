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
  
  // Wrap everything in error boundary that redirects to onboarding on error
  return (
    <ErrorBoundary
      fallback={
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-semibold">Error Loading App</h2>
            <p className="text-sm text-muted-foreground">
              Redirecting to onboarding...
            </p>
            <script dangerouslySetInnerHTML={{__html: `setTimeout(() => window.location.href = '/onboarding', 1000)`}} />
          </div>
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

