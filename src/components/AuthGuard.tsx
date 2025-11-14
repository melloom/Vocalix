import { ReactNode } from "react";
import { useAuth } from "@/context/AuthContext";

interface AuthGuardProps {
  children: ReactNode;
  requireAuth?: boolean;
  fallback?: ReactNode;
}

/**
 * AuthGuard ensures auth is initialized before rendering children
 * This prevents flickering when navigating between pages
 */
export const AuthGuard = ({ 
  children, 
  requireAuth = false,
  fallback 
}: AuthGuardProps) => {
  const { isLoading, isInitialized, deviceId } = useAuth();

  // Show loading state while auth is initializing
  if (!isInitialized || !deviceId || isLoading) {
    return (
      fallback || (
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="text-center space-y-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      )
    );
  }

  return <>{children}</>;
};

