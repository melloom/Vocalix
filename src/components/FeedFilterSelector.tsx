import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { 
  Sparkles, 
  TrendingUp, 
  Flame, 
  MessageSquare, 
  Clock,
  ChevronRight
} from "lucide-react";
import { FeedFilterType, TimePeriod } from "@/hooks/useFeedFilters";
import { cn } from "@/lib/utils";

interface FeedFilterSelectorProps {
  currentFilter: FeedFilterType;
  timePeriod?: TimePeriod;
  onFilterChange: (filter: FeedFilterType) => void;
  onTimePeriodChange?: (period: TimePeriod) => void;
  showTimePeriod?: boolean;
  className?: string;
}

const forYouSubOptions: Array<{
  value: FeedFilterType;
  label: string;
  description: string;
}> = [
  {
    value: "for_you",
    label: "For You",
    description: "Personalized feed based on your interests",
  },
  {
    value: "unheard",
    label: "Unheard",
    description: "Clips you haven't listened to",
  },
  {
    value: "from_followed",
    label: "Following",
    description: "Only from creators you follow",
  },
];

const otherFilterOptions: Array<{
  value: FeedFilterType;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    value: "best",
    label: "Best",
    icon: <TrendingUp className="h-4 w-4" />,
    description: "Top clips from a time period",
  },
  {
    value: "rising",
    label: "Rising",
    icon: <Flame className="h-4 w-4" />,
    description: "Clips gaining traction",
  },
  {
    value: "controversial",
    label: "Controversial",
    icon: <MessageSquare className="h-4 w-4" />,
    description: "High engagement with mixed reactions",
  },
];

const timePeriodOptions: Array<{
  value: TimePeriod;
  label: string;
}> = [
  { value: "hour", label: "Past Hour" },
  { value: "day", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

export function FeedFilterSelector({
  currentFilter,
  timePeriod = "day",
  onFilterChange,
  onTimePeriodChange,
  showTimePeriod = false,
  className,
}: FeedFilterSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showForYouOptions, setShowForYouOptions] = useState(false);

  const getCurrentLabel = () => {
    if (currentFilter === "for_you") return "For You";
    if (currentFilter === "unheard") return "Unheard";
    if (currentFilter === "from_followed") return "Following";
    const option = otherFilterOptions.find((f) => f.value === currentFilter);
    return option?.label || "For You";
  };

  const getCurrentIcon = () => {
    if (["for_you", "unheard", "from_followed"].includes(currentFilter)) {
      return <Sparkles className="h-4 w-4" />;
    }
    const option = otherFilterOptions.find((f) => f.value === currentFilter);
    return option?.icon || <Sparkles className="h-4 w-4" />;
  };

  const isForYouCategory = ["for_you", "unheard", "from_followed"].includes(currentFilter);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={isOpen} onOpenChange={(open) => {
        setIsOpen(open);
        if (!open) setShowForYouOptions(false);
      }}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {getCurrentIcon()}
            <span>{getCurrentLabel()}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <div className="space-y-1">
            {/* For You Section - Prominent at top */}
            <div className="border-b border-border pb-2 mb-2">
              <button
                onClick={() => {
                  if (showForYouOptions) {
                    // If sub-options are showing, select main "For You"
                    onFilterChange("for_you");
                    setIsOpen(false);
                  } else {
                    // Toggle sub-options
                    setShowForYouOptions(true);
                  }
                }}
                className={cn(
                  "w-full text-left p-3 rounded-lg transition-colors flex items-center justify-between group",
                  isForYouCategory
                    ? "bg-primary/10 border border-primary"
                    : "hover:bg-accent border border-transparent"
                )}
              >
                <div className="flex items-center gap-2 flex-1">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <div className="flex-1">
                    <div className="font-medium text-sm">For You</div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Personalized content for you
                    </p>
                  </div>
                  {isForYouCategory && (
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  )}
                  <ChevronRight 
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      showForYouOptions && "rotate-90"
                    )} 
                  />
                </div>
              </button>

              {/* Sub-options under For You */}
              {showForYouOptions && (
                <div className="ml-4 mt-1 space-y-1 border-l border-border/30 pl-3">
                  {forYouSubOptions.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        onFilterChange(option.value);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "w-full text-left p-2.5 rounded-md transition-colors",
                        currentFilter === option.value
                          ? "bg-primary/10 text-primary font-medium"
                          : "hover:bg-accent text-muted-foreground"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm">{option.label}</span>
                        {currentFilter === option.value && (
                          <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Other Filter Options */}
            <div className="space-y-1">
              {otherFilterOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onFilterChange(option.value);
                    setIsOpen(false);
                  }}
                  className={cn(
                    "w-full text-left p-3 rounded-lg transition-colors border",
                    currentFilter === option.value
                      ? "bg-primary/10 border-primary"
                      : "hover:bg-accent border-transparent"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    {option.icon}
                    <span className="font-medium text-sm">{option.label}</span>
                    {currentFilter === option.value && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        Active
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {showTimePeriod && currentFilter === "best" && onTimePeriodChange && (
        <Select
          value={timePeriod}
          onValueChange={(value) => onTimePeriodChange(value as TimePeriod)}
        >
          <SelectTrigger className="w-[140px]">
            <Clock className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {timePeriodOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

