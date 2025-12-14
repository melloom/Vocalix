import { AlertCircle, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface ErrorDisplayProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  variant?: "default" | "card" | "inline";
  className?: string;
}

export function ErrorDisplay({
  title = "Something went wrong",
  message,
  onRetry,
  retryLabel = "Try again",
  variant = "default",
  className = "",
}: ErrorDisplayProps) {
  const content = (
    <div className="flex flex-col items-center gap-4 text-center">
      <AlertCircle className="h-8 w-8 text-destructive" />
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          {retryLabel}
        </Button>
      )}
    </div>
  );

  if (variant === "card") {
    return (
      <Card className={`p-8 rounded-3xl ${className}`}>
        {content}
      </Card>
    );
  }

  if (variant === "inline") {
    return (
      <Alert variant="destructive" className={className}>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="flex items-center justify-between">
          <span>{message}</span>
          {onRetry && (
            <Button onClick={onRetry} variant="ghost" size="sm" className="ml-4 gap-2">
              <RefreshCw className="h-3 w-3" />
              {retryLabel}
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={`flex items-center justify-center min-h-[200px] p-8 ${className}`}>
      {content}
    </div>
  );
}

