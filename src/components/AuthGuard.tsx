import { ReactNode, useState, useEffect } from "react";
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
  // Use inline styles as fallback in case CSS doesn't load on mobile
  // Add timeout fallback - if auth takes too long, show app anyway
  const [forceShow, setForceShow] = useState(false);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isInitialized) {
        console.log('[AuthGuard] Force showing app after 2 seconds');
        setForceShow(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [isInitialized]);
  
  if ((!isInitialized || isLoading) && !forceShow) {
    return (
      fallback || (
        <div 
          className="min-h-screen bg-background flex items-center justify-center"
          style={{
            minHeight: '100vh',
            backgroundColor: 'hsl(30, 40%, 97%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            padding: '20px'
          }}
        >
          <div className="text-center space-y-4" style={{ textAlign: 'center' }}>
            <div 
              className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"
              style={{
                width: '32px',
                height: '32px',
                border: '2px solid hsl(15, 85%, 62%)',
                borderTop: '2px solid transparent',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
                margin: '0 auto'
              }}
            ></div>
            <p 
              className="text-muted-foreground"
              style={{
                color: 'hsl(20, 10%, 45%)',
                marginTop: '16px'
              }}
            >
              Loading...
            </p>
          </div>
          <style>{`
            @keyframes spin {
              to { transform: rotate(360deg); }
            }
          `}</style>
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

