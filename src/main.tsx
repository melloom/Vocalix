import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { updateSupabaseDeviceHeader, initializeRpcFunctionCheck } from "@/integrations/supabase/client";
import { UploadQueueProvider } from "@/context/UploadQueueContext";
import { initializeMonitoring, captureException } from "@/lib/monitoring";
import * as Sentry from "@sentry/react";

// Initialize monitoring (Sentry) first
initializeMonitoring();

// Intercept console.error to suppress known non-critical errors
// This must be done before any other code runs
const originalConsoleError = console.error;
console.error = (...args: any[]) => {
  // Check if any argument matches our known error patterns
  const errorString = args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      // Check for 403 errors in the exact format we're seeing
      if (arg.code === 403 && arg.httpStatus === 200 && arg.httpError === false && arg.name === 'i') {
        return 'SUPPRESS_403'; // Marker to suppress
      }
      // Check for extension connection errors
      if (arg.message && (
        arg.message.includes("Could not establish connection") ||
        arg.message.includes("Receiving end does not exist")
      )) {
        return 'SUPPRESS_EXTENSION'; // Marker to suppress
      }
      return JSON.stringify(arg);
    }
    return String(arg);
  }).join(' ');

  // Suppress known non-critical errors
  if (
    errorString.includes('SUPPRESS_403') ||
    errorString.includes('SUPPRESS_EXTENSION') ||
    errorString.includes('Could not establish connection') ||
    errorString.includes('Receiving end does not exist') ||
    (errorString.includes('code') && errorString.includes('403') && errorString.includes('httpStatus') && errorString.includes('200'))
  ) {
    // Silently suppress - these are expected errors from browser extensions or RLS policies
    return;
  }

  // Log all other errors normally
  originalConsoleError.apply(console, args);
};

// Set up error handler FIRST, before any other code runs
// Global error handler for unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  const error = event.reason;
  
  // Check for 403 errors in various formats - be very permissive
  const errorCode = error?.code;
  const httpStatus = error?.httpStatus;
  const errorName = error?.name;
  const httpStatusText = error?.httpStatusText;
  
  // Check if this is a 403 or 404 error in any format
  // 403 errors: {name: 'i', httpError: false, httpStatus: 200, httpStatusText: '', code: 403}
  // 404 errors: Expected when RPC functions don't exist (migrations not run)
  const is403Error = 
    errorCode === 403 || 
    errorCode === "403" ||
    errorCode === "PGRST301" ||
    String(errorCode) === "403" ||
    (httpStatus === 200 && errorCode === 403) || // Supabase format
    (httpStatus === 200 && String(errorCode) === "403") ||
    (errorName === 'i' && httpStatus === 200 && errorCode === 403) || // The exact format we're seeing
    (httpStatus === 200 && httpStatusText === '' && errorCode === 403) || // Another variant
    (error?.httpError === false && httpStatus === 200 && errorCode === 403) || // Match httpError: false
    (error?.code === 403) || // Direct code check
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 403) || // Additional safety check
    // More permissive checks for the exact format from content.js
    (typeof error === 'object' && error !== null && 
     error.name === 'i' && 
     error.httpError === false && 
     error.httpStatus === 200 && 
     (error.httpStatusText === '' || !error.httpStatusText) &&
     error.code === 403);
  
  const is404Error =
    errorCode === 404 ||
    errorCode === "404" ||
    String(errorCode) === "404" ||
    httpStatus === 404 ||
    error?.message?.includes("404") ||
    error?.message?.includes("Not Found");
  
  // Check for generic Object errors (often from browser extensions like content.js)
  // These are typically non-critical and can be safely ignored
  const isGenericObjectError = 
    (typeof error === 'object' && error !== null && !error.message && !error.stack && !errorCode && !httpStatus) ||
    (error?.constructor?.name === 'Object' && !error.message && !error.stack) ||
    (error?.constructor === Object && !error.message && !error.stack && !errorCode);
  
  // Check for browser extension messaging errors
  const isExtensionError = 
    error?.message?.includes("Could not establish connection") ||
    error?.message?.includes("Receiving end does not exist") ||
    error?.message?.includes("Extension context invalidated") ||
    error?.message?.includes("chrome-extension://") ||
    error?.message?.includes("moz-extension://") ||
    String(error).includes("Could not establish connection") ||
    String(error).includes("Receiving end does not exist") ||
    // Also check error stack/filename for extension-related paths
    (error?.stack && (
      error.stack.includes("content.js") ||
      error.stack.includes("polyfill.js") ||
      error.stack.includes("chrome-extension://") ||
      error.stack.includes("moz-extension://")
    ));
  
  if (is403Error || is404Error || isGenericObjectError || isExtensionError) {
    // Silently handle 403/404/generic Object/extension errors - they're expected in some cases
    // 404 errors are expected when RPC functions don't exist (migrations not run)
    // 403 errors can come from RLS policies or browser extensions (content.js)
    // Generic Object errors are often from browser extensions
    // Extension errors occur when extensions try to communicate with disconnected scripts
    // Don't log to avoid console spam, just prevent the uncaught error
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  
  // For other errors, capture to Sentry and log
  captureException(error, {
    additionalData: {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      httpStatus: error?.httpStatus,
      name: error?.name,
      type: "unhandledrejection",
    },
  });
  
  console.error("Unhandled promise rejection:", {
    error,
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    stack: error?.stack,
    httpStatus: error?.httpStatus,
    name: error?.name,
  });
});

// Global error handler for runtime errors (not promise rejections)
window.addEventListener("error", (event) => {
  const error = event.error;
  const errorMessage = event.message || error?.message || String(error) || '';
  const errorStack = error?.stack || event.error?.stack || '';
  
  // Check if this is a browser extension error
  const isExtensionError = 
    // Teflon Content Script or other extension-related errors
    errorMessage.includes("messenger") ||
    errorMessage.includes("Teflon") ||
    errorMessage.includes("Content Script") ||
    errorStack.includes("Teflon") ||
    errorStack.includes("Content Script") ||
    errorStack.includes("chrome-extension://") ||
    errorStack.includes("moz-extension://") ||
    // Common extension error patterns
    errorMessage.includes("Cannot read properties of undefined") && (
      errorMessage.includes("reading 'messenger'") ||
      errorStack.includes("messenger") ||
      errorStack.includes("handleMessage")
    ) ||
    // Extension context errors
    errorMessage.includes("Extension context invalidated") ||
    errorMessage.includes("Receiving end does not exist") ||
    errorMessage.includes("Could not establish connection") ||
    // Check if error originates from extension scripts
    (event.filename && (
      event.filename.includes("chrome-extension://") ||
      event.filename.includes("moz-extension://") ||
      event.filename.includes("extension://")
    ));
  
  if (isExtensionError) {
    // Silently suppress browser extension errors - they don't affect our app
    // These errors occur when extensions try to interact with the page
    event.preventDefault();
    event.stopPropagation();
    return false; // Prevent default error logging
  }
  
  // For legitimate errors from our app, let them bubble up normally
  // They will be caught by Sentry ErrorBoundary or other error handlers
  return true;
});

// Safely get device ID with error handling for mobile browsers
let existingDeviceId: string | null = null;
try {
  if (typeof Storage !== 'undefined' && localStorage) {
    existingDeviceId = localStorage.getItem("deviceId") ?? localStorage.getItem("voice-note-device-id");
  }
} catch (e) {
  // Handle localStorage errors (private browsing, quota exceeded, etc.)
  console.warn("Failed to access localStorage:", e);
}

if (existingDeviceId) {
  try {
    if (typeof Storage !== 'undefined' && localStorage) {
      if (!localStorage.getItem("deviceId")) {
        localStorage.setItem("deviceId", existingDeviceId);
        localStorage.removeItem("voice-note-device-id");
      }
    }
    updateSupabaseDeviceHeader(existingDeviceId);
  } catch (e) {
    console.warn("Failed to update device ID:", e);
  }
}

// Initialize RPC function availability check on app startup
// This checks if migrations have been run and caches the result to avoid repeated 404s
initializeRpcFunctionCheck().catch(() => {
  // Silently ignore initialization errors
});

// Service worker management
if ("serviceWorker" in navigator) {
  if (import.meta.env.PROD) {
    // Register service worker in production
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((registration) => {
          console.log("Service Worker registered:", registration.scope);
          
          // Check for updates periodically
          setInterval(() => {
            registration.update();
          }, 60 * 60 * 1000); // Check every hour
        })
        .catch((error) => {
          console.log("Service Worker registration failed:", error);
        });
    });
  } else {
    // Unregister service worker in development to avoid interfering with HMR
    window.addEventListener("load", async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const registration of registrations) {
          await registration.unregister();
          console.log("Service Worker unregistered for development");
        }
      } catch (error) {
        // Silently fail if unregistration fails
      }
    });
  }
}

// Wrap app with Sentry's ErrorBoundary for automatic error capture
createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={({ error, resetError }) => (
      <div 
        className="min-h-screen bg-background flex items-center justify-center p-4"
        style={{
          minHeight: '100vh',
          backgroundColor: 'hsl(30, 40%, 97%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          width: '100%'
        }}
      >
        <div 
          className="max-w-md w-full p-6 rounded-3xl space-y-4 border border-destructive"
          style={{
            maxWidth: '28rem',
            width: '100%',
            padding: '24px',
            borderRadius: '24px',
            border: '1px solid hsl(0, 72%, 51%)',
            backgroundColor: 'hsl(30, 50%, 99%)'
          }}
        >
          <h2 className="text-xl font-semibold text-destructive">Something went wrong</h2>
          <p className="text-sm text-muted-foreground">
            We've been notified about this error. Please try refreshing the page.
          </p>
          {import.meta.env.DEV && (
            <details className="mt-4 p-3 bg-muted rounded-lg text-xs font-mono overflow-auto max-h-48">
              <summary className="cursor-pointer font-semibold mb-2">Error Details (Dev Only)</summary>
              <pre className="whitespace-pre-wrap text-[10px] mt-1">{error?.toString()}</pre>
            </details>
          )}
          <div className="flex flex-col gap-3 pt-2">
            <button
              onClick={() => {
                // Check if we're online before reloading
                if (!navigator.onLine) {
                  alert('You appear to be offline. Please check your internet connection and try again.');
                  return;
                }
                window.location.reload();
              }}
              className="w-full px-4 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 font-medium"
            >
              Refresh Page
            </button>
            <button
              onClick={resetError}
              className="w-full px-4 py-2 border border-border rounded-lg hover:bg-muted"
            >
              Try Again
            </button>
            <button
              onClick={() => {
                try {
                  if (typeof Storage !== 'undefined' && localStorage) {
                    localStorage.removeItem('missing_rpc_functions');
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
              }}
              className="w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear Cache & Reload
            </button>
            
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
        </div>
      </div>
    )}
    showDialog={false}
  >
    <UploadQueueProvider>
      <App />
    </UploadQueueProvider>
  </Sentry.ErrorBoundary>,
);
