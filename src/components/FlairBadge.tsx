import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface FlairBadgeProps {
  name: string;
  color?: string;
  background_color?: string;
  className?: string;
}

export function FlairBadge({ name, color = "#000000", background_color = "#f0f0f0", className }: FlairBadgeProps) {
  return (
    <Badge
      className={cn("rounded-full border-0", className)}
      style={{
        color,
        backgroundColor: background_color,
      }}
    >
      {name}
    </Badge>
  );
}

