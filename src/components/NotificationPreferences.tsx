import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Clock } from "lucide-react";
// Separator component inline since it might not exist
const Separator = ({ className }: { className?: string }) => (
  <div className={`h-px bg-border ${className || ""}`} />
);

interface NotificationPreferences {
  mentions: boolean;
  replies: boolean;
  reactions: boolean;
  follows: boolean;
  remixes: boolean;
  series_updates: boolean;
  challenges: boolean;
  polls: boolean;
  awards: boolean;
  crossposts: boolean;
  quiet_hours_enabled?: boolean;
  quiet_hours_start?: string; // HH:MM format (24-hour)
  quiet_hours_end?: string; // HH:MM format (24-hour)
}

export function NotificationPreferences() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    mentions: true,
    replies: true,
    reactions: true,
    follows: true,
    remixes: true,
    series_updates: true,
    challenges: true,
    polls: true,
    awards: true,
    crossposts: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadPreferences();
    }
  }, [profile?.id]);

  const loadPreferences = async () => {
    if (!profile?.id) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("profiles")
        .select("notification_preferences")
        .eq("id", profile.id)
        .single();

      if (error) throw error;

      if (data?.notification_preferences) {
        setPreferences({
          ...preferences,
          ...(data.notification_preferences as Partial<NotificationPreferences>),
        });
      }
    } catch (error: any) {
      console.error("Error loading notification preferences:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const updatePreference = async (key: keyof NotificationPreferences, value: boolean | string) => {
    if (!profile?.id) return;

    const newPreferences = { ...preferences, [key]: value };
    setPreferences(newPreferences);

    try {
      setIsSaving(true);
      const { error } = await supabase
        .from("profiles")
        .update({
          notification_preferences: newPreferences,
        })
        .eq("id", profile.id);

      if (error) throw error;

      toast({
        title: "Preferences updated",
        description: "Your notification preferences have been saved",
      });
    } catch (error: any) {
      console.error("Error updating preferences:", error);
      toast({
        title: "Error",
        description: "Failed to update preferences",
        variant: "destructive",
      });
      // Revert on error
      setPreferences(preferences);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-full" />
            <div className="h-4 bg-muted rounded w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const preferenceItems: Array<{
    key: keyof NotificationPreferences;
    label: string;
    description: string;
  }> = [
    {
      key: "mentions",
      label: "Mentions",
      description: "When someone mentions you in a clip or comment",
    },
    {
      key: "replies",
      label: "Replies",
      description: "When someone replies to your clip",
    },
    {
      key: "reactions",
      label: "Reactions",
      description: "When someone reacts to your clip",
    },
    {
      key: "follows",
      label: "New Followers",
      description: "When someone follows you",
    },
    {
      key: "remixes",
      label: "Remixes",
      description: "When someone remixes your clip",
    },
    {
      key: "series_updates",
      label: "Series Updates",
      description: "When a series you follow has a new episode",
    },
    {
      key: "challenges",
      label: "Challenges",
      description: "When a challenge you're participating in updates",
    },
    {
      key: "polls",
      label: "Polls",
      description: "When a poll you voted on closes or updates",
    },
    {
      key: "awards",
      label: "Awards",
      description: "When someone gives your clip an award",
    },
    {
      key: "crossposts",
      label: "Crossposts",
      description: "When someone crossposts your clip",
    },
  ];

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>Notification Preferences</CardTitle>
        <CardDescription>
          Choose what notifications you want to receive
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {preferenceItems.map((item, index) => (
          <div key={item.key}>
            <div className="flex items-center justify-between gap-6">
              <div className="flex-1">
                <Label className="font-medium">{item.label}</Label>
                <p className="text-sm text-muted-foreground">{item.description}</p>
              </div>
              <Switch
                checked={preferences[item.key]}
                onCheckedChange={(checked) => updatePreference(item.key, checked)}
                disabled={isSaving}
                aria-label={`Toggle ${item.label} notifications`}
              />
            </div>
            {index < preferenceItems.length - 1 && <Separator className="mt-4" />}
          </div>
        ))}
        
        <Separator className="my-4" />
        
        {/* Quiet Hours Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Label className="font-medium">Quiet Hours</Label>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Pause notifications during specific hours
              </p>
            </div>
            <Switch
              checked={preferences.quiet_hours_enabled ?? false}
              onCheckedChange={(checked) => updatePreference("quiet_hours_enabled", checked)}
              disabled={isSaving}
              aria-label="Toggle quiet hours"
            />
          </div>
          
          {preferences.quiet_hours_enabled && (
            <div className="pl-6 space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="quiet-start" className="text-xs">
                    Start Time
                  </Label>
                  <Input
                    id="quiet-start"
                    type="time"
                    value={preferences.quiet_hours_start || "22:00"}
                    onChange={(e) => {
                      const newPrefs = { ...preferences, quiet_hours_start: e.target.value };
                      setPreferences(newPrefs);
                      updatePreference("quiet_hours_start", e.target.value);
                    }}
                    className="rounded-xl h-9"
                    disabled={isSaving}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quiet-end" className="text-xs">
                    End Time
                  </Label>
                  <Input
                    id="quiet-end"
                    type="time"
                    value={preferences.quiet_hours_end || "08:00"}
                    onChange={(e) => {
                      const newPrefs = { ...preferences, quiet_hours_end: e.target.value };
                      setPreferences(newPrefs);
                      updatePreference("quiet_hours_end", e.target.value);
                    }}
                    className="rounded-xl h-9"
                    disabled={isSaving}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Notifications will be paused from {preferences.quiet_hours_start || "22:00"} to {preferences.quiet_hours_end || "08:00"}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

