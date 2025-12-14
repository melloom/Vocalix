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
} from "@/lib/personalization";
import { 
  Sparkles, 
  Sliders, 
  TrendingUp,
  Users,
  Activity,
  Target,
  BarChart3,
  Info
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CheckCircle2, X } from "lucide-react";

export function FeedCustomizationSettings() {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [preferences, setPreferences] = useState({
    feed_algorithm_preferences: {
      trending_weight: 0.3,
      topic_follow_weight: 0.25,
      creator_follow_weight: 0.15,
      completion_weight: 0.15,
      velocity_weight: 0.1,
      reputation_weight: 0.05,
      topic_activity_weight: 0.05,
      diversity_weight: 0.05,
      time_aware: true,
      context_aware: true,
      skip_penalty: 0.3,
    },
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
      const prefs = await getUserPreferences(profile.id);

      if (prefs?.feed_algorithm_preferences) {
        setPreferences({
          feed_algorithm_preferences: {
            trending_weight: prefs.feed_algorithm_preferences?.trending_weight ?? 0.3,
            topic_follow_weight: prefs.feed_algorithm_preferences?.topic_follow_weight ?? 0.25,
            creator_follow_weight: prefs.feed_algorithm_preferences?.creator_follow_weight ?? 0.15,
            completion_weight: prefs.feed_algorithm_preferences?.completion_weight ?? 0.15,
            velocity_weight: prefs.feed_algorithm_preferences?.velocity_weight ?? 0.1,
            reputation_weight: prefs.feed_algorithm_preferences?.reputation_weight ?? 0.05,
            topic_activity_weight: prefs.feed_algorithm_preferences?.topic_activity_weight ?? 0.05,
            diversity_weight: prefs.feed_algorithm_preferences?.diversity_weight ?? 0.05,
            time_aware: prefs.feed_algorithm_preferences?.time_aware ?? true,
            context_aware: prefs.feed_algorithm_preferences?.context_aware ?? true,
            skip_penalty: prefs.feed_algorithm_preferences?.skip_penalty ?? 0.3,
          },
        });
      }
    } catch (error: any) {
      console.error("Error loading feed preferences:", error);
      toast({
        title: "Error",
        description: "Failed to load feed preferences",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!profile?.id) return;

    try {
      setIsSaving(true);
      const success = await updateUserPreferences(profile.id, {
        feed_algorithm_preferences: preferences.feed_algorithm_preferences,
      });

      if (success) {
        toast({
          title: "Success",
          description: "Feed preferences saved successfully",
        });
      } else {
        throw new Error("Failed to save preferences");
      }
    } catch (error: any) {
      console.error("Error saving feed preferences:", error);
      toast({
        title: "Error",
        description: "Failed to save feed preferences",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const updateWeight = (key: string, value: number[]) => {
    setPreferences((prev) => ({
      ...prev,
      feed_algorithm_preferences: {
        ...prev.feed_algorithm_preferences,
        [key]: value[0],
      },
    }));
  };

  // Calculate total weight to show user
  const totalWeight = Object.entries(preferences.feed_algorithm_preferences)
    .filter(([key]) => key.endsWith('_weight'))
    .reduce((sum, [, value]) => sum + (typeof value === 'number' ? value : 0), 0);

  if (isLoading) {
    return (
      <Card className="p-6 rounded-3xl">
        <div className="flex items-center gap-2 mb-4">
          <Sliders className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Feed Algorithm Weights</h3>
        </div>
        <p className="text-sm text-muted-foreground">Loading...</p>
      </Card>
    );
  }

  return (
    <Card className="p-6 rounded-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sliders className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Feed Algorithm Weights</h3>
        </div>
        <Button onClick={handleSave} disabled={isSaving} size="sm">
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <p className="text-sm text-muted-foreground">
        Adjust how much each factor influences your personalized feed. Higher weights mean more influence.
      </p>

      {totalWeight > 1.1 && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <p className="text-sm text-yellow-600 dark:text-yellow-400">
            Total weight is {totalWeight.toFixed(2)}. Consider reducing some weights for better balance.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* Trending Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="trending_weight">Trending Content</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>How much trending/popular content influences your feed</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.trending_weight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="trending_weight"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.trending_weight]}
            onValueChange={(value) => updateWeight("trending_weight", value)}
            className="w-full"
          />
        </div>

        {/* Topic Follow Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="topic_follow_weight">Followed Topics</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Boost for content from topics you follow</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.topic_follow_weight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="topic_follow_weight"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.topic_follow_weight]}
            onValueChange={(value) => updateWeight("topic_follow_weight", value)}
            className="w-full"
          />
        </div>

        {/* Creator Follow Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="creator_follow_weight">Followed Creators</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Boost for content from creators you follow</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.creator_follow_weight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="creator_follow_weight"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.creator_follow_weight]}
            onValueChange={(value) => updateWeight("creator_follow_weight", value)}
            className="w-full"
          />
        </div>

        {/* Completion Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="completion_weight">Completion Rate</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Boost for clips with high listen-through rates</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.completion_weight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="completion_weight"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.completion_weight]}
            onValueChange={(value) => updateWeight("completion_weight", value)}
            className="w-full"
          />
        </div>

        {/* Engagement Velocity Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="velocity_weight">Engagement Velocity</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Boost for clips gaining traction quickly (rising content)</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.velocity_weight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="velocity_weight"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.velocity_weight]}
            onValueChange={(value) => updateWeight("velocity_weight", value)}
            className="w-full"
          />
        </div>

        {/* Creator Reputation Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="reputation_weight">Creator Reputation</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Boost for content from creators with high reputation</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.reputation_weight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="reputation_weight"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.reputation_weight]}
            onValueChange={(value) => updateWeight("reputation_weight", value)}
            className="w-full"
          />
        </div>

        {/* Topic Activity Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="topic_activity_weight">Topic Activity</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Boost for content from active topics</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.topic_activity_weight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="topic_activity_weight"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.topic_activity_weight]}
            onValueChange={(value) => updateWeight("topic_activity_weight", value)}
            className="w-full"
          />
        </div>

        {/* Diversity Weight */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="diversity_weight">Content Diversity</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>Boost for diverse content to avoid echo chambers</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.diversity_weight * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="diversity_weight"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.diversity_weight]}
            onValueChange={(value) => updateWeight("diversity_weight", value)}
            className="w-full"
          />
        </div>

        {/* Skip Penalty */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <X className="h-4 w-4 text-muted-foreground" />
              <Label htmlFor="skip_penalty">Skip Penalty</Label>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>How much to penalize content you typically skip</p>
                </TooltipContent>
              </Tooltip>
            </div>
            <span className="text-sm font-medium">
              {(preferences.feed_algorithm_preferences.skip_penalty * 100).toFixed(0)}%
            </span>
          </div>
          <Slider
            id="skip_penalty"
            min={0}
            max={1}
            step={0.05}
            value={[preferences.feed_algorithm_preferences.skip_penalty]}
            onValueChange={(value) => updateWeight("skip_penalty", value)}
            className="w-full"
          />
        </div>

        {/* Time Aware */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            <Label htmlFor="time_aware">Time-Aware Personalization</Label>
            <p className="text-sm text-muted-foreground">
              Adjust feed based on when you typically listen
            </p>
          </div>
          <Switch
            id="time_aware"
            checked={preferences.feed_algorithm_preferences.time_aware}
            onCheckedChange={(checked) =>
              setPreferences((prev) => ({
                ...prev,
                feed_algorithm_preferences: {
                  ...prev.feed_algorithm_preferences,
                  time_aware: checked,
                },
              }))
            }
          />
        </div>

        {/* Context Aware */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="context_aware">Context-Aware Personalization</Label>
            <p className="text-sm text-muted-foreground">
              Adjust feed based on device and context
            </p>
          </div>
          <Switch
            id="context_aware"
            checked={preferences.feed_algorithm_preferences.context_aware}
            onCheckedChange={(checked) =>
              setPreferences((prev) => ({
                ...prev,
                feed_algorithm_preferences: {
                  ...prev.feed_algorithm_preferences,
                  context_aware: checked,
                },
              }))
            }
          />
        </div>
      </div>
    </Card>
  );
}

