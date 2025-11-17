import { Outlet, useLocation } from "react-router-dom";
import { AuthGuard } from "./AuthGuard";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { MiniPlayer } from "./MiniPlayer";

/**
 * Layout component that ensures auth is initialized before rendering child routes
 * This prevents flickering when navigating between pages
 */
export const AuthenticatedLayout = () => {
  const location = useLocation();
  
  return (
    <AuthGuard>
      <AudioPlayerProvider>
        <div className="pb-20" key={location.pathname}>
          <Outlet />
        </div>
        <MiniPlayer />
      </AudioPlayerProvider>
    </AuthGuard>
  );
};

