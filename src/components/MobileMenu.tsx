import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Menu, Home, Search, MessageCircle, Radio, Users, Trophy, UserCheck, Compass, BookOpen, Bookmark, Settings } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface MobileMenuProps {
  profile?: {
    handle?: string | null;
    show_18_plus_content?: boolean;
  } | null;
  savedClipsCount?: number | null;
}

export const MobileMenu = ({ profile, savedClipsCount }: MobileMenuProps) => {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  const navItems = [
    {
      path: "/",
      icon: Home,
      label: "Home",
      exact: true,
    },
    {
      path: "/topics",
      icon: Search,
      label: "Discover Topics",
    },
    {
      path: "/voice-amas",
      icon: MessageCircle,
      label: "Voice AMAs",
    },
    {
      path: "/live-rooms",
      icon: Radio,
      label: "Live Rooms",
    },
    {
      path: "/communities",
      icon: Users,
      label: "Communities",
    },
    {
      path: "/leaderboards",
      icon: Trophy,
      label: "Leaderboards",
    },
    {
      path: "/following",
      icon: UserCheck,
      label: "Following",
    },
    {
      path: "/discovery",
      icon: Compass,
      label: "Discovery",
    },
    {
      path: "/diary",
      icon: BookOpen,
      label: "Diary",
    },
    {
      path: "/saved",
      icon: Bookmark,
      label: "Saved Clips",
      badge: savedClipsCount !== null && savedClipsCount > 0 ? savedClipsCount : undefined,
    },
    {
      path: profile?.handle ? `/profile/${profile.handle}` : "/settings",
      icon: Settings,
      label: profile?.handle ? "My Profile" : "Settings",
    },
    ...(profile?.show_18_plus_content ? [{
      path: "/18-plus",
      icon: BookOpen,
      label: "18+ Content",
    }] : []),
  ];

  const isActive = (item: typeof navItems[0]) => {
    if (item.exact) {
      return location.pathname === item.path;
    }
    return location.pathname.startsWith(item.path);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden rounded-full flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[280px] sm:w-[300px] p-0">
        <SheetHeader className="px-4 py-6 border-b">
          <SheetTitle className="text-2xl font-bold">Echo Garden</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item);

            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 text-base transition-colors",
                  "hover:bg-muted active:bg-muted/80",
                  active && "bg-muted/50 border-l-2 border-primary"
                )}
              >
                <Icon className={cn(
                  "h-5 w-5 flex-shrink-0",
                  active ? "text-primary" : "text-muted-foreground"
                )} />
                <span className={cn(
                  "flex-1",
                  active ? "text-primary font-medium" : "text-foreground"
                )}>
                  {item.label}
                </span>
                {item.badge && (
                  <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
                    {item.badge > 99 ? '99+' : item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
};

