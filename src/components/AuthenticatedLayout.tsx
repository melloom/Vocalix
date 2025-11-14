import { Outlet } from "react-router-dom";
import { AuthGuard } from "./AuthGuard";
import { AudioPlayerProvider } from "@/context/AudioPlayerContext";
import { MiniPlayer } from "./MiniPlayer";

/**
 * Layout component that ensures auth is initialized before rendering child routes
 * This prevents flickering when navigating between pages
 */
export const AuthenticatedLayout = () => {
  return (
    <AuthGuard>
      <AudioPlayerProvider>
        <div className="pb-20">
          <Outlet />
        </div>
        <MiniPlayer />
      </AudioPlayerProvider>
    </AuthGuard>
  );
};

