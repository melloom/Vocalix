import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { 
  getUserPreferences, 
  updateUserPreferences, 
  resetPersonalization,
  getUserListeningHours 
} from "@/lib/personalization";
import { supabase } from "@/integrations/supabase/client";
import { 
  Sparkles, 
  Clock, 
  Sliders, 
  Shield, 
  RotateCcw,
  TrendingUp,
  Users,
  CheckCircle2,
  BarChart3
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function PersonalizationPreferences() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState({
    preferred_duration_min: 15,
    preferred_duration_max: 30,
    feed_algorithm_preferences: {
      trending_weight: 0.4,
      topic_follow_weight: 0.3,
      creator_follow_weight: 0.2,
      completion_weight: 0.2,
      time_aware: true,
      context_aware: true,
      skip_penalty: 0.3,
    },
    privacy_preferences: {
      use_listening_patterns: true,
      use_location: false,
      use_device_type: true,
      use_skip_data: true,
    },
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [listeningHours, setListeningHours] = useState<Array<{ hour: number; listen_count: number }>>([]);
  const [showResetDialog, setShowResetDialog] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadPreferences();
      loadListeningHours();
    }
  }, [profile?.id]);

  const loadPreferences = async () => {
    if (!profile?.id) return;

    try {
      setIsLoading(true);
      const prefs = await getUserPreferences(profile.id);

      if (prefs) {
        setPreferences({
          preferred_duration_min: prefs.preferred_duration_min || 15,
          preferred_duration_max: prefs.preferred_duration_max || 30,
          feed_algorithm_preferences: {
            trending_weight: prefs.feed_algorithm_preferences?.trending_weight ?? 0.4,
            topic_follow_weight: prefs.feed_algorithm_preferences?.topic_follow_weight ?? 0.3,
            creator_follow_weight: prefs.feed_algorithm_preferences?.creator_follow_weight ?? 0.2,
            completion_weight: prefs.feed_algorithm_preferences?.completion_weight ?? 0.2,
            time_aware: prefs.feed_algorithm_preferences?.time_aware ?? true,
            context_aware: prefs.feed_algorithm_preferences?.context_aware ?? true,
            skip_penalty: prefs.feed_algorithm_preferences?.skip_penalty ?? 0.3,
          },
          privacy_preferences: {
            use_listening_patterns: prefs.privacy_preferences?.use_listening_patterns ?? true,
            use_location: prefs.privacy_preferences?.use_location ?? false,
            use_device_type: prefs.privacy_preferences?.use_device_type ?? true,
            use_skip_data: prefs.privacy_preferences?.use_skip_data ?? true,
          },
        });
      }
    } catch (error: any) {
      console.error("Error loading personalization preferences:", error);
      toast({
        title: "Error",
        description: "Failed to load preferences",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadListeningHours = async () => {
    if (!profile?.id) return;

    try {
      const hours = await getUserListeningHours(profile.id, 30);
      setListeningHours(hours);
    } catch (error) {
      console.error("Error loading listening hours:", error);
    }
  };

  const updatePreference = async (key: string, value: any) => {
    if (!profile?.id) return;

    try {
      setIsSaving(true);
      const updated = {
        ...preferences,
        [key]: value,
      };
      
      const success = await updateUserPreferences(profile.id, updated);
      
      if (success) {
        setPreferences(updated);
        toast({
          title: "Preferences updated",
          description: "Your personalization preferences have been saved.",
        });
      } else {
        throw new Error("Failed to update preferences");
      }
    } catch (error: any) {
      console.error("Error updating preference:", error);
      toast({
        title: "Error",
        description: "Failed to update preferences",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateNestedPreference = async (section: string, key: string, value: any) => {
    if (!profile?.id) return;

    try {
      setIsSaving(true);
      const updated = {
        ...preferences,
        [section]: {
          ...preferences[section as keyof typeof preferences],
          [key]: value,
        },
      };
      
      const success = await updateUserPreferences(profile.id, updated);
      
      if (success) {
        setPreferences(updated);
        toast({
          title: "Preferences updated",
          description: "Your personalization preferences have been saved.",
        });
      } else {
        throw new Error("Failed to update preferences");
      }
    } catch (error: any) {
      console.error("Error updating preference:", error);
      toast({
        title: "Error",
        description: "Failed to update preferences",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!profile?.id) return;

    try {
      setIsSaving(true);
      const success = await resetPersonalization(profile.id);
      
      if (success) {
        await loadPreferences();
        await loadListeningHours();
        toast({
          title: "Personalization reset",
          description: "Your personalization data has been reset. The feed will learn your preferences again.",
        });
        setShowResetDialog(false);
      } else {
        throw new Error("Failed to reset personalization");
      }
    } catch (error: any) {
      console.error("Error resetting personalization:", error);
      toast({
        title: "Error",
        description: "Failed to reset personalization",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 rounded-3xl">
        <p className="text-muted-foreground">Loading preferences...</p>
      </Card>
    );
  }

  const topListeningHours = listeningHours
    .sort((a, b) => b.listen_count - a.listen_count)
    .slice(0, 3)
    .map(h => h.hour);

  return (
    <div className="space-y-6">
      <Card className="p-6 rounded-3xl space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Personalization Engine</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Customize how your feed learns and adapts to your preferences.
        </p>

        {/* Listening Patterns */}
        {listeningHours.length > 0 && (
          <div className="space-y-3 pt-4 border-t">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="font-medium">Your Listening Patterns</Label>
            </div>
            <p className="text-sm text-muted-foreground">
              You listen most at {topListeningHours.map(h => `${h}:00`).join(", ")}. 
              Your feed adjusts content based on these patterns.
            </p>
          </div>
        )}

        {/* Duration Preferences */}
        <div className="space-y-3 pt-4 border-t">
          <Label className="font-medium">Preferred Clip Duration</Label>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span className="text-sm text-muted-foreground">Min: {preferences.preferred_duration_min}s</span>
                <span className="text-sm text-muted-foreground">Max: {preferences.preferred_duration_max}s</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs mb-2 block">Minimum (seconds)</Label>
                  <Slider
                    value={[preferences.preferred_duration_min]}
                    onValueChange={([value]) => updatePreference('preferred_duration_min', value)}
                    min={5}
                    max={30}
                    step={1}
                    disabled={isSaving}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-2 block">Maximum (seconds)</Label>
                  <Slider
                    value={[preferences.preferred_duration_max]}
                    onValueChange={([value]) => updatePreference('preferred_duration_max', value)}
                    min={15}
                    max={60}
                    step={1}
                    disabled={isSaving}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feed Algorithm Preferences */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-muted-foreground" />
            <Label className="font-medium">Feed Algorithm</Label>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Time-aware feed</Label>
                <p className="text-xs text-muted-foreground">
                  Adjust content based on when you typically listen
                </p>
              </div>
              <Switch
                checked={preferences.feed_algorithm_preferences.time_aware}
                onCheckedChange={(checked) => 
                  updateNestedPreference('feed_algorithm_preferences', 'time_aware', checked)
                }
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Context-aware feed</Label>
                <p className="text-xs text-muted-foreground">
                  Adjust content based on your device and activity
                </p>
              </div>
              <Switch
                checked={preferences.feed_algorithm_preferences.context_aware}
                onCheckedChange={(checked) => 
                  updateNestedPreference('feed_algorithm_preferences', 'context_aware', checked)
                }
                disabled={isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label>Skip learning penalty</Label>
              <p className="text-xs text-muted-foreground mb-2">
                How much to reduce recommendations for content you skip (0 = ignore skips, 1 = strong penalty)
              </p>
              <Slider
                value={[preferences.feed_algorithm_preferences.skip_penalty * 100]}
                onValueChange={([value]) => 
                  updateNestedPreference('feed_algorithm_preferences', 'skip_penalty', value / 100)
                }
                min={0}
                max={100}
                step={5}
                disabled={isSaving}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Ignore skips</span>
                <span>Strong penalty</span>
              </div>
            </div>
          </div>
        </div>

        {/* Privacy Controls */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-muted-foreground" />
            <Label className="font-medium">Privacy Controls</Label>
          </div>
          <p className="text-sm text-muted-foreground">
            Control what data is used for personalization
          </p>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label>Use listening patterns</Label>
                <p className="text-xs text-muted-foreground">
                  Learn from when you listen to improve recommendations
                </p>
              </div>
              <Switch
                checked={preferences.privacy_preferences.use_listening_patterns}
                onCheckedChange={(checked) => 
                  updateNestedPreference('privacy_preferences', 'use_listening_patterns', checked)
                }
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Use device type</Label>
                <p className="text-xs text-muted-foreground">
                  Adjust recommendations based on mobile/desktop usage
                </p>
              </div>
              <Switch
                checked={preferences.privacy_preferences.use_device_type}
                onCheckedChange={(checked) => 
                  updateNestedPreference('privacy_preferences', 'use_device_type', checked)
                }
                disabled={isSaving}
              />
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Learn from skips</Label>
                <p className="text-xs text-muted-foreground">
                  Use skip data to avoid showing content you don't like
                </p>
              </div>
              <Switch
                checked={preferences.privacy_preferences.use_skip_data}
                onCheckedChange={(checked) => 
                  updateNestedPreference('privacy_preferences', 'use_skip_data', checked)
                }
                disabled={isSaving}
              />
            </div>
          </div>
        </div>

        {/* Reset Personalization */}
        <div className="pt-4 border-t">
          <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="w-full" disabled={isSaving}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Personalization
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset Personalization?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete all your personalization data including:
                  <ul className="list-disc list-inside mt-2 space-y-1">
                    <li>Skip history</li>
                    <li>Listening patterns</li>
                    <li>Learned preferences</li>
                  </ul>
                  Your feed will start learning your preferences from scratch. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleReset} disabled={isSaving}>
                  {isSaving ? "Resetting..." : "Reset"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Card>
    </div>
  );
}

