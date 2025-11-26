import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ClipCardSkeleton({ compact = false, animate = true }: { compact?: boolean; animate?: boolean }) {
  const skeletonClass = cn(
    "skeleton-shimmer",
    !animate && "animate-none"
  );

  if (compact) {
    return (
      <Card className="p-3 space-y-2 animate-fade-in">
        <div className="flex items-center gap-2">
          <Skeleton className={cn("h-8 w-8 rounded-full", skeletonClass)} />
          <div className="flex-1 space-y-1">
            <Skeleton className={cn("h-3 w-24", skeletonClass)} />
            <Skeleton className={cn("h-2 w-16", skeletonClass)} />
          </div>
          <Skeleton className={cn("h-6 w-6 rounded-full", skeletonClass)} />
        </div>
        <Skeleton className={cn("h-3 w-3/4", skeletonClass)} />
        <Skeleton className={cn("h-2 w-full", skeletonClass)} />
        <div className="flex items-center gap-2">
          <Skeleton className={cn("h-8 w-8 rounded-full", skeletonClass)} />
          <Skeleton className={cn("h-1 flex-1 rounded-full", skeletonClass)} />
        </div>
        <div className="flex items-center justify-between">
          <div className="flex gap-1">
            <Skeleton className={cn("h-6 w-10 rounded-full", skeletonClass)} />
            <Skeleton className={cn("h-6 w-10 rounded-full", skeletonClass)} />
          </div>
          <div className="flex gap-1">
            <Skeleton className={cn("h-6 w-6 rounded-full", skeletonClass)} />
            <Skeleton className={cn("h-6 w-6 rounded-full", skeletonClass)} />
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-6 space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <Skeleton className={cn("h-12 w-12 rounded-full", skeletonClass)} />
        <div className="flex-1 space-y-2">
          <Skeleton className={cn("h-4 w-32", skeletonClass)} />
          <Skeleton className={cn("h-3 w-24", skeletonClass)} />
        </div>
        <Skeleton className={cn("h-8 w-8 rounded-full", skeletonClass)} />
      </div>
      <Skeleton className={cn("h-5 w-3/4", skeletonClass)} />
      <div className="flex gap-2">
        <Skeleton className={cn("h-6 w-20 rounded-full", skeletonClass)} />
        <Skeleton className={cn("h-6 w-20 rounded-full", skeletonClass)} />
      </div>
      <Skeleton className={cn("h-4 w-full", skeletonClass)} />
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <Skeleton className={cn("h-14 w-14 rounded-full", skeletonClass)} />
          <div className="flex-1 space-y-1">
            <Skeleton className={cn("h-2 w-full rounded-full", skeletonClass)} />
            <div className="flex justify-between">
              <Skeleton className={cn("h-3 w-12", skeletonClass)} />
              <Skeleton className={cn("h-3 w-12", skeletonClass)} />
            </div>
          </div>
          <Skeleton className={cn("h-10 w-10 rounded-full", skeletonClass)} />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className={cn("h-9 w-12 rounded-full", skeletonClass)} />
        ))}
      </div>
      <div className="flex items-center justify-between pt-2">
        <Skeleton className={cn("h-8 w-20 rounded-full", skeletonClass)} />
        <div className="flex gap-2">
          <Skeleton className={cn("h-8 w-16 rounded-full", skeletonClass)} />
          <Skeleton className={cn("h-8 w-16 rounded-full", skeletonClass)} />
          <Skeleton className={cn("h-8 w-16 rounded-full", skeletonClass)} />
        </div>
      </div>
    </Card>
  );
}

export function ClipListSkeleton({ count = 3, compact = false, animate = true }: { count?: number; compact?: boolean; animate?: boolean }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-fade-in"
          style={{
            animationDelay: `${i * 50}ms`,
            animationFillMode: "both",
          }}
        >
          <ClipCardSkeleton compact={compact} animate={animate} />
        </div>
      ))}
    </div>
  );
}

