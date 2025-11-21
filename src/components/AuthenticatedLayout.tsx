import { Outlet, useLocation } from "react-router-dom";
import { AuthGuard } from "./AuthGuard";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { MiniPlayer } from "./MiniPlayer";
import { BottomNavigation } from "./BottomNavigation";

/**
 * Layout component that ensures auth is initialized before rendering child routes
 * This prevents flickering when navigating between pages
 */
export const AuthenticatedLayout = () => {
  const location = useLocation();
  
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

