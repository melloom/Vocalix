import { Link } from "react-router-dom";
import { memo } from "react";

/**
 * Footer component with legal links
 * Shows at bottom of page content on mobile (not fixed)
 * Hidden on desktop (desktop has footer in BottomNavigation)
 */
export const PageFooter = memo(() => {
  return (
    <footer className="md:hidden py-6 px-4 border-t border-border mt-auto">
      <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
        <Link
          to="/privacy"
          className="hover:text-foreground transition-colors"
        >
          Privacy Policy
        </Link>
        <span>•</span>
        <Link
          to="/terms"
          className="hover:text-foreground transition-colors"
        >
          Terms of Service
        </Link>
        <span>•</span>
        <Link
          to="/cookies"
          className="hover:text-foreground transition-colors"
        >
          Cookie Policy
        </Link>
      </div>
    </footer>
  );
});

PageFooter.displayName = "PageFooter";

