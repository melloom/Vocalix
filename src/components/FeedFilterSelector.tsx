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
  MapPin, 
  Users, 
  Eye,
  Clock,
  X
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

const filterOptions: Array<{
  value: FeedFilterType;
  label: string;
  icon: React.ReactNode;
  description: string;
}> = [
  {
    value: "for_you",
    label: "For You",
    icon: <Sparkles className="h-4 w-4" />,
    description: "Personalized feed based on your interests",
  },
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
  {
    value: "from_followed",
    label: "Following",
    icon: <Users className="h-4 w-4" />,
    description: "Only from creators you follow",
  },
  {
    value: "unheard",
    label: "Unheard",
    icon: <Eye className="h-4 w-4" />,
    description: "Clips you haven't listened to",
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

  const currentFilterOption = filterOptions.find((f) => f.value === currentFilter);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
          >
            {currentFilterOption?.icon}
            <span>{currentFilterOption?.label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-2">
            <div className="font-semibold text-sm mb-3">Feed Filters</div>
            {filterOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  onFilterChange(option.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "w-full text-left p-3 rounded-lg border transition-colors",
                  currentFilter === option.value
                    ? "bg-primary/10 border-primary"
                    : "hover:bg-accent border-transparent"
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {option.icon}
                  <span className="font-medium">{option.label}</span>
                  {currentFilter === option.value && (
                    <Badge variant="secondary" className="ml-auto text-xs">
                      Active
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {option.description}
                </p>
              </button>
            ))}
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

