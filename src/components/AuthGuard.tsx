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
  const { isLoading, isInitialized, userId } = useAuth();

  // Show loading state while auth is initializing
  // Don't require userId - anonymous auth might fail, but we can still show the app
  if (!isInitialized || isLoading) {
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

  // If auth is required but we don't have a user, show error
  if (requireAuth && !userId) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">Authentication required</p>
          <p className="text-muted-foreground text-sm">Please enable Anonymous Auth in Supabase Dashboard</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

