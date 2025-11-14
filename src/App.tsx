import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/context/AuthContext";
import { AuthenticatedLayout } from "@/components/AuthenticatedLayout";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { UploadQueueProvider } from "@/context/UploadQueueContext";
import { PageHeaderSkeleton } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy load routes for code splitting
const Index = lazy(() => import("./pages/Index"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Profile = lazy(() => import("./pages/Profile"));
const Admin = lazy(() => import("./pages/Admin"));
const Settings = lazy(() => import("./pages/Settings"));
const LoginLink = lazy(() => import("./pages/LoginLink"));
const MyRecordings = lazy(() => import("./pages/MyRecordings"));
const Topic = lazy(() => import("./pages/Topic"));
const SavedClips = lazy(() => import("./pages/SavedClips"));
const Playlists = lazy(() => import("./pages/Playlists"));
const PlaylistDetail = lazy(() => import("./pages/PlaylistDetail"));
const CollectionsDiscovery = lazy(() => import("./pages/CollectionsDiscovery"));
const Following = lazy(() => import("./pages/Following"));
const Activity = lazy(() => import("./pages/Activity"));
const Challenges = lazy(() => import("./pages/Challenges"));
const Hashtag = lazy(() => import("./pages/Hashtag"));
const ClipDetail = lazy(() => import("./pages/ClipDetail"));
const Communities = lazy(() => import("./pages/Communities"));
const CommunityDetail = lazy(() => import("./pages/CommunityDetail"));
const LiveRooms = lazy(() => import("./pages/LiveRooms"));
const LiveRoom = lazy(() => import("./pages/LiveRoom"));

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
      staleTime: 30000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false, // Prevent unnecessary refetches
    },
  },
});

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <AuthProvider>
          <UploadQueueProvider>
            <TooltipProvider>
              <Toaster />
              <Sonner />
              <OfflineIndicator />
              <BrowserRouter future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
              <ErrorBoundary>
                <Suspense fallback={<PageLoader />}>
                  <Routes>
                    <Route path="/login-link" element={<LoginLink />} />
                    <Route element={<AuthenticatedLayout />}>
                      <Route path="/" element={<Index />} />
                      <Route path="/profile/:handle" element={<Profile />} />
                      <Route path="/topic/:topicId" element={<Topic />} />
                      <Route path="/settings" element={<Settings />} />
                      <Route path="/my-recordings" element={<MyRecordings />} />
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
                      <Route path="/admin" element={<Admin />} />
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

export default App;
