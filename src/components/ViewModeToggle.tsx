import { List, Grid3x3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ViewModeToggleProps {
  viewMode: "list" | "compact";
  onViewModeChange: (mode: "list" | "compact") => void;
}

export const ViewModeToggle = ({ viewMode, onViewModeChange }: ViewModeToggleProps) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex bg-muted/60 rounded-full p-1">
            <Button
              size="sm"
              className="rounded-full px-3"
              variant={viewMode === "list" ? "default" : "ghost"}
              onClick={() => onViewModeChange("list")}
              aria-label="List view"
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              className="rounded-full px-3"
              variant={viewMode === "compact" ? "default" : "ghost"}
              onClick={() => onViewModeChange("compact")}
              aria-label="Compact view"
            >
              <Grid3x3 className="h-4 w-4" />
            </Button>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          <p>Switch to {viewMode === "list" ? "compact" : "list"} view</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

