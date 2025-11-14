import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";

/**
 * Activity Feed Skeleton
 * Used for activity feed pages showing user interactions
 */
export function ActivityFeedSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, index) => (
        <Card
          key={`activity-skeleton-${index}`}
          className="rounded-3xl border border-border/60 bg-card/80 p-6 space-y-4"
        >
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
          </div>
          <Skeleton className="h-16 w-full rounded-2xl" />
        </Card>
      ))}
    </div>
  );
}

/**
 * Profile Skeleton
 * Used for profile pages showing user information
 */
export function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <Skeleton className="h-24 w-24 rounded-full" />
        <div className="flex-1 space-y-3">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
          <div className="flex gap-4">
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-20" />
          </div>
        </div>
      </div>
      
      {/* Bio section */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
      
      {/* Stats section */}
      <div className="flex gap-6">
        <Skeleton className="h-16 w-24 rounded-2xl" />
        <Skeleton className="h-16 w-24 rounded-2xl" />
        <Skeleton className="h-16 w-24 rounded-2xl" />
      </div>
    </div>
  );
}

/**
 * Playlist Skeleton
 * Used for playlist detail pages
 */
export function PlaylistSkeleton() {
  return (
    <div className="space-y-6">
      {/* Playlist header */}
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <div className="space-y-2">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
        </div>
      </div>
      
      {/* Playlist items */}
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Card
            key={`playlist-item-${index}`}
            className="p-4 rounded-2xl space-y-3"
          >
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

/**
 * Page Header Skeleton
 * Used for page headers with back button and title
 */
export function PageHeaderSkeleton() {
  return (
    <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
      <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <Skeleton className="h-8 w-32" />
      </div>
    </header>
  );
}

/**
 * Generic Card Skeleton
 * A flexible card skeleton for various content types
 */
export function CardSkeleton({ 
  showAvatar = true, 
  showActions = false,
  lines = 2 
}: { 
  showAvatar?: boolean;
  showActions?: boolean;
  lines?: number;
}) {
  return (
    <Card className="p-6 rounded-3xl space-y-4">
      <div className="flex items-center gap-3">
        {showAvatar && <Skeleton className="h-10 w-10 rounded-full" />}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        {showActions && <Skeleton className="h-8 w-8 rounded-full" />}
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'}`} />
        ))}
      </div>
    </Card>
  );
}

/**
 * List Skeleton
 * A simple list skeleton for tabular or list content
 */
export function ListSkeleton({ count = 5, showAvatar = true }: { count?: number; showAvatar?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`list-item-${index}`}
          className="flex items-center gap-3 p-4 rounded-2xl border border-border/60 bg-card/80"
        >
          {showAvatar && <Skeleton className="h-10 w-10 rounded-full" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/**
 * Grid Skeleton
 * For grid layouts (e.g., image grids, card grids)
 */
export function GridSkeleton({ 
  columns = 3, 
  rows = 2,
  showTitle = false 
}: { 
  columns?: number;
  rows?: number;
  showTitle?: boolean;
}) {
  return (
    <div className="space-y-4">
      {showTitle && <Skeleton className="h-6 w-48" />}
      <div 
        className="grid gap-4"
        style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
      >
        {Array.from({ length: columns * rows }).map((_, index) => (
          <Card key={`grid-item-${index}`} className="p-4 rounded-2xl space-y-3">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </Card>
        ))}
      </div>
    </div>
  );
}

