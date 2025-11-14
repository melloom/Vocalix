import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { updateSupabaseDeviceHeader, initializeRpcFunctionCheck } from "@/integrations/supabase/client";
import { UploadQueueProvider } from "@/context/UploadQueueContext";
import { initializeMonitoring, captureException } from "@/lib/monitoring";

// Initialize monitoring (Sentry) first
initializeMonitoring();

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
    (typeof error === 'object' && error !== null && 'code' in error && error.code === 403); // Additional safety check
  
  const is404Error =
    errorCode === 404 ||
    errorCode === "404" ||
    String(errorCode) === "404" ||
    httpStatus === 404 ||
    error?.message?.includes("404") ||
    error?.message?.includes("Not Found");
  
  if (is403Error || is404Error) {
    // Silently handle 403/404 errors - they're expected in some cases
    // 404 errors are expected when RPC functions don't exist (migrations not run)
    // 403 errors can come from RLS policies or browser extensions (content.js)
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

const existingDeviceId =
  localStorage.getItem("deviceId") ?? localStorage.getItem("voice-note-device-id");

if (existingDeviceId) {
  if (!localStorage.getItem("deviceId")) {
    localStorage.setItem("deviceId", existingDeviceId);
    localStorage.removeItem("voice-note-device-id");
  }
  updateSupabaseDeviceHeader(existingDeviceId);
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

createRoot(document.getElementById("root")!).render(
  <UploadQueueProvider>
    <App />
  </UploadQueueProvider>,
);
