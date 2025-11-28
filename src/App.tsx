import { lazy, Suspense, useState } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { useGlobalColorScheme } from "@/hooks/useGlobalColorScheme";
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineBanner } from "@/components/OfflineBanner";
import { InstallPrompt } from "@/components/InstallPrompt";
import { UploadQueueProvider } from "@/context/UploadQueueContext";
import { PageHeaderSkeleton } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { FirstClipGuidance } from "@/components/FirstClipGuidance";
import { FeatureDiscovery } from "@/components/FeatureDiscovery";

// Helper function to retry lazy imports on failure
const retryLazyImport = (importFn: () => Promise<any>, retries = 2) => {
  return lazy(() => {
    return new Promise((resolve, reject) => {
      let attempt = 0;
      
      const tryImport = async () => {
        try {
          const module = await importFn();
          resolve(module);
        } catch (error: any) {
          attempt++;
          if (attempt < retries) {
            console.warn(`Retrying module load (attempt ${attempt}/${retries})...`);
            setTimeout(tryImport, 300 * attempt);
          } else {
            console.error("Failed to load module after retries:", error);
            // Convert to a proper Error object if it's not already
            const err = error instanceof Error 
              ? error 
              : new Error(error?.message || String(error) || "Failed to load module");
            // Ensure the error is properly formatted for React error boundaries
            reject(err);
          }
        }
      };
      
      // Wrap in try-catch to handle any synchronous errors
      try {
        tryImport().catch((error) => {
          // This should not happen, but ensure errors are properly formatted
          const err = error instanceof Error 
            ? error 
            : new Error(error?.message || String(error) || "Failed to load module");
          reject(err);
        });
      } catch (error: any) {
        const err = error instanceof Error 
          ? error 
          : new Error(error?.message || String(error) || "Failed to load module");
        reject(err);
      }
    });
  });
};

// Lazy load routes for code splitting with retry mechanism
const Index = retryLazyImport(() => import("./pages/Index"));
const NotFound = retryLazyImport(() => import("./pages/NotFound"));
const Profile = retryLazyImport(() => import("./pages/Profile"));
const Admin = retryLazyImport(() => import("./pages/Admin"));
const Settings = retryLazyImport(() => import("./pages/Settings"));
const LoginLink = retryLazyImport(() => import("./pages/LoginLink"));
const LinkPin = retryLazyImport(() => import("./pages/LinkPin"));
const MyRecordings = retryLazyImport(() => import("./pages/MyRecordings"));
const Topic = retryLazyImport(() => import("./pages/Topic"));
const SavedClips = retryLazyImport(() => import("./pages/SavedClips"));
const Playlists = retryLazyImport(() => import("./pages/Playlists"));
const PlaylistDetail = retryLazyImport(() => import("./pages/PlaylistDetail"));
const CollectionsDiscovery = retryLazyImport(() => import("./pages/CollectionsDiscovery"));
const Following = retryLazyImport(() => import("./pages/Following"));
const Activity = retryLazyImport(() => import("./pages/Activity"));
const Challenges = retryLazyImport(() => import("./pages/Challenges"));
const Hashtag = retryLazyImport(() => import("./pages/Hashtag"));
const ClipDetail = retryLazyImport(() => import("./pages/ClipDetail"));
const Communities = retryLazyImport(() => import("./pages/Communities"));
const CommunityDetail = retryLazyImport(() => import("./pages/CommunityDetail"));
const LiveRooms = retryLazyImport(() => import("./pages/LiveRooms"));
const LiveRoom = retryLazyImport(() => import("./pages/LiveRoom"));
const Embed = retryLazyImport(() => import("./pages/Embed"));
const DirectMessages = retryLazyImport(() => import("./pages/DirectMessages"));
const PrivateChats = retryLazyImport(() => import("./pages/PrivateChats"));
const Analytics = retryLazyImport(() => import("./pages/Analytics"));
const Leaderboards = retryLazyImport(() => import("./pages/Leaderboards"));
const SeriesList = retryLazyImport(() => import("./pages/SeriesList"));
const SeriesDetail = retryLazyImport(() => import("./pages/SeriesDetail"));
const RemixChallenges = retryLazyImport(() => import("./pages/RemixChallenges"));
const AllTopics = retryLazyImport(() => import("./pages/AllTopics"));
const RemixFeed = retryLazyImport(() => import("./pages/RemixFeed"));
const VoiceAMAs = retryLazyImport(() => import("./pages/VoiceAMAs"));
const Discovery = retryLazyImport(() => import("./pages/Discovery"));
const AIContentCreation = retryLazyImport(() => import("./pages/AIContentCreation"));
const EighteenPlus = retryLazyImport(() => import("./pages/18Plus"));
const Diary = retryLazyImport(() => import("./pages/Diary"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen bg-background pb-24">
    <PageHeaderSkeleton />
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Skeleton className="h-64 w-full rounded-3xl" />
      <Skeleton className="h-64 w-full rounded-3xl" />
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - increased for better caching
      gcTime: 30 * 60 * 1000, // 30 minutes - keep cached data longer
      retry: 1,
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
      refetchOnMount: false, // Use cached data when component mounts
      refetchOnReconnect: true, // Only refetch on reconnect
    },
    mutations: {
      retry: 1,
    },
  },
});

// Redirect component for /my-recordings
const MyRecordingsRedirect = () => {
  const { profile } = useAuth();
  if (profile?.handle) {
    return <Navigate to={`/profile/${profile.handle}`} replace />;
  }
  return <Navigate to="/settings" replace />;
};

// Component to apply global color scheme
const GlobalColorScheme = () => {
  useGlobalColorScheme();
  return null;
};

const App = () => {
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider 
          attribute="class" 
          defaultTheme="light" 
          enableSystem={false}
          storageKey="echo-garden-theme"
          enableColorScheme={false}
        >
          <AuthProvider>
            <GlobalColorScheme />
            <UploadQueueProvider>
              <TooltipProvider>
                <Toaster />
                <Sonner />
                <OfflineBanner />
                <InstallPrompt />
                {/* First Clip Guidance */}
                <FirstClipGuidance
                  onStartRecording={() => setIsRecordModalOpen(true)}
                  onComplete={() => console.log("First clip guidance completed")}
                />
                {/* Feature Discovery */}
                <FeatureDiscovery
                  position="top-right"
                  maxVisible={1}
                />
                <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: false }}>
                <ErrorBoundary>
                  <Suspense fallback={<PageLoader />}>
                    <Routes>
                      <Route path="/login-link" element={<LoginLink />} />
                      <Route path="/link-pin" element={<LinkPin />} />
                      <Route path="/embed/:clipId" element={<Embed />} />
                      <Route element={<AuthenticatedLayout />}>
                        <Route path="/" element={<Index />} />
                        <Route path="/profile/:handle" element={<Profile />} />
                        <Route path="/topic/:topicId" element={<Topic />} />
                        <Route path="/topics" element={<AllTopics />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="/diary" element={<Diary />} />
                        <Route path="/my-recordings" element={<MyRecordingsRedirect />} />
                        <Route path="/saved" element={<SavedClips />} />
                        <Route path="/playlists" element={<Playlists />} />
                        <Route path="/playlist/:playlistId" element={<PlaylistDetail />} />
                        <Route path="/collections" element={<CollectionsDiscovery />} />
                        <Route path="/following" element={<Following />} />
                        <Route path="/activity" element={<Activity />} />
                        <Route path="/challenges" element={<Challenges />} />
                        <Route path="/tag/:tagName" element={<Hashtag />} />
                        <Route path="/clip/:id" element={<ClipDetail />} />
                        <Route path="/communities" element={<Communities />} />
                        <Route path="/community/:slug" element={<CommunityDetail />} />
                        <Route path="/live-rooms" element={<LiveRooms />} />
                        <Route path="/live-room/:id" element={<LiveRoom />} />
                        <Route path="/messages" element={<DirectMessages />} />
                        <Route path="/messages/:userId" element={<DirectMessages />} />
                        <Route path="/private-chats" element={<PrivateChats />} />
                        <Route path="/private-chats/:chatId" element={<PrivateChats />} />
                        <Route path="/analytics" element={<Analytics />} />
                        <Route path="/leaderboards" element={<Leaderboards />} />
                        <Route path="/series" element={<SeriesList />} />
                        <Route path="/series/:seriesId" element={<SeriesDetail />} />
                        <Route path="/remixes" element={<RemixFeed />} />
                        <Route path="/remix-challenges" element={<RemixChallenges />} />
                        <Route path="/voice-amas" element={<VoiceAMAs />} />
                        <Route path="/discovery" element={<Discovery />} />
                        <Route path="/admin" element={<Admin />} />
                        <Route path="/ai-content" element={<AIContentCreation />} />
                        <Route path="/18-plus" element={<EighteenPlus />} />
                        {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                        <Route path="*" element={<NotFound />} />
                      </Route>
                    </Routes>
                  </Suspense>
                </ErrorBoundary>
              </BrowserRouter>
            </TooltipProvider>
            </UploadQueueProvider>
          </AuthProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
