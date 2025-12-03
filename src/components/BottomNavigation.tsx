import { Link, useLocation } from "react-router-dom";
import { Home, Search, Mic, Bookmark, User, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProfile } from "@/hooks/useProfile";
import { Shield } from "lucide-react";

/**
 * Mobile-first bottom navigation bar
 * Only visible on mobile devices (hidden on desktop)
 */
export const BottomNavigation = () => {
  const location = useLocation();
  const { profile } = useProfile();

  const navItems: Array<{
    path: string;
    icon: typeof Home;
    label: string;
    exact?: boolean;
    isButton?: boolean;
    onClick?: () => void;
  }> = [
    {
      path: "/",
      icon: Home,
      label: "Home",
      exact: true,
    },
    {
      path: "/topics",
      icon: Search,
      label: "Discover",
    },
    {
      path: "#",
      icon: Mic,
      label: "Record",
      isButton: true,
      onClick: () => {
        // Dispatch custom event to trigger record modal
        window.dispatchEvent(new CustomEvent("openRecordModal"));
      },
    },
    {
      path: "/saved",
      icon: Bookmark,
      label: "Saved",
    },
    {
      path: "/diary",
      icon: BookOpen,
      label: "Diary",
    },
    {
      path: profile?.handle ? `/profile/${profile.handle}` : "/settings",
      icon: User,
      label: "Profile",
    },
  ];

  const isActive = (item: typeof navItems[0]) => {
    if (item.exact) {
      return location.pathname === item.path;
    }
    return location.pathname.startsWith(item.path);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border md:hidden pb-safe max-w-full overflow-hidden">
        <div className="flex items-center justify-between h-16 px-1 sm:px-2 max-w-full">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);

            if (item.isButton) {
              return (
                <button
                  key={item.path}
                  onClick={item.onClick}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 h-full rounded-lg transition-colors",
                    "hover:bg-muted active:bg-muted/80 touch-manipulation"
                  )}
                >
                  <div className={cn(
                    "h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center",
                    "shadow-lg hover:shadow-xl transition-shadow flex-shrink-0"
                  )}>
                    <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <span className="text-[9px] sm:text-[10px] font-medium text-muted-foreground truncate max-w-full px-0.5">
                    {item.label}
                  </span>
                </button>
              );
            }

            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 h-full rounded-lg transition-colors",
                  "hover:bg-muted active:bg-muted/80 touch-manipulation",
                  active && "text-primary"
                )}
              >
                <Icon className={cn(
                  "h-4 w-4 sm:h-5 sm:w-5 transition-colors flex-shrink-0",
                  active ? "text-primary" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "text-[9px] sm:text-[10px] font-medium transition-colors truncate max-w-full px-0.5",
                  active ? "text-primary" : "text-muted-foreground"
                )}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
      {/* Privacy Policy Link - Bottom Right Corner */}
      <Link
        to="/privacy"
        className="fixed bottom-2 right-2 z-50 md:hidden flex items-center gap-1 text-[9px] text-muted-foreground/50 hover:text-muted-foreground/70 transition-colors"
      >
        <Shield className="h-2.5 w-2.5" />
        <span>Privacy</span>
      </Link>
    </>
  );
};

