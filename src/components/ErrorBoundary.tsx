import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Link } from 'react-router-dom';
import { logError } from '@/lib/logger';
import { captureException } from '@/lib/monitoring';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isOnline: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
    };
  }

  componentDidMount() {
    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', this.handleOnline);
      window.addEventListener('offline', this.handleOffline);
    }
  }

  componentWillUnmount() {
    // Clean up event listeners
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', this.handleOnline);
      window.removeEventListener('offline', this.handleOffline);
    }
  }

  handleOnline = () => {
    this.setState({ isOnline: true });
  };

  handleOffline = () => {
    this.setState({ isOnline: false });
  };

  static getDerivedStateFromError(error: Error, prevState: State): Partial<State> {
    return {
      hasError: true,
      error,
      errorInfo: null,
      isOnline: prevState?.isOnline ?? (typeof navigator !== 'undefined' ? navigator.onLine : true),
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logError('ErrorBoundary caught an error', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });

    // Capture error to Sentry with additional mobile context
    captureException(error, {
      additionalData: {
        componentStack: errorInfo.componentStack,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
        isOnline: this.state.isOnline,
        platform: typeof navigator !== 'undefined' && 'platform' in navigator ? navigator.platform : 'unknown',
        language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
        screenSize: typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'unknown',
        deviceId: typeof localStorage !== 'undefined' ? localStorage.getItem('deviceId') : null,
      },
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  handleReload = () => {
    // Check if we're online before reloading
    if (!navigator.onLine) {
      alert('You appear to be offline. Please check your internet connection and try again.');
      return;
    }
    window.location.reload();
  };

  handleClearCacheAndReload = () => {
    // Clear common cache items that might cause issues
    try {
      if (typeof Storage !== 'undefined' && localStorage) {
        localStorage.removeItem('missing_rpc_functions');
        // Don't clear deviceId as it's needed for auth
      }
    } catch (e) {
      // Ignore localStorage errors (e.g., private browsing mode, quota exceeded)
      console.warn('Failed to clear localStorage:', e);
    }
    
    // Check if we're online before reloading
    if (!navigator.onLine) {
      alert('You appear to be offline. Please check your internet connection and try again.');
      return;
    }
    
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 rounded-3xl space-y-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-6 w-6 text-destructive flex-shrink-0" />
              <h2 className="text-xl font-semibold">Something went wrong</h2>
            </div>
            
            <p className="text-sm text-muted-foreground">
              We're sorry, but something unexpected happened. Please try refreshing the page or going back home.
            </p>

            {!this.state.isOnline && (
              <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-700 dark:text-yellow-400">
                <WifiOff className="h-4 w-4 flex-shrink-0" />
                <span className="text-xs font-medium">You appear to be offline. Please check your internet connection.</span>
              </div>
            )}

            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mt-4 p-3 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-48">
                <summary className="cursor-pointer font-semibold mb-2">Error Details (Dev Only)</summary>
                <div className="space-y-2">
                  <div>
                    <strong>Error:</strong> {this.state.error.toString()}
                  </div>
                  {this.state.errorInfo && (
                    <div>
                      <strong>Stack:</strong>
                      <pre className="whitespace-pre-wrap text-[10px] mt-1">
                        {this.state.errorInfo.componentStack}
                      </pre>
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-col gap-3 pt-2">
              <Button
                onClick={this.handleReload}
                variant="default"
                className="w-full"
                size="lg"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Page
              </Button>
              <div className="flex gap-3">
                <Button
                  onClick={this.handleReset}
                  variant="outline"
                  className="flex-1"
                >
                  Try Again
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="flex-1"
                >
                  <Link to="/">
                    <Home className="h-4 w-4 mr-2" />
                    Go Home
                  </Link>
                </Button>
              </div>
              <Button
                onClick={this.handleClearCacheAndReload}
                variant="ghost"
                className="w-full text-xs text-muted-foreground"
                size="sm"
              >
                Clear Cache & Reload
              </Button>
              
              {/* Mobile-specific help text */}
              <div className="text-xs text-muted-foreground pt-2 border-t space-y-1">
                <p className="font-medium">Still having issues?</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Make sure you have a stable internet connection</li>
                  <li>Try closing and reopening the app</li>
                  <li>Check if your browser is up to date</li>
                  <li>If on mobile, try switching between WiFi and mobile data</li>
                </ul>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

