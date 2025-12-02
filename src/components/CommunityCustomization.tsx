import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Palette, FileText, Tag, Calendar, Save } from "lucide-react";
import { CommunityRulesManager } from "./CommunityRulesManager";
import { CommunityFlairsManager } from "./CommunityFlairsManager";
import { CommunityEventsManager } from "./CommunityEventsManager";

interface CommunityCustomizationProps {
  communityId: string;
  isHost: boolean;
  canModerate: boolean;
}

export const CommunityCustomization = ({
  communityId,
  isHost,
  canModerate,
}: CommunityCustomizationProps) => {
  const [themeConfig, setThemeConfig] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadTheme();
  }, [communityId]);

  const loadTheme = async () => {
    try {
      const { data, error } = await supabase
        .from("communities")
        .select("theme_config")
        .eq("id", communityId)
        .single();

      if (error) throw error;
      setThemeConfig(data?.theme_config || {});
    } catch (error) {
      console.error("Error loading theme:", error);
    }
  };

  const handleSaveTheme = async () => {
    if (!canModerate) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("communities")
        .update({ theme_config: themeConfig })
        .eq("id", communityId);

      if (error) throw error;
      toast({
        title: "Theme saved",
        description: "Community theme has been updated.",
      });
    } catch (error) {
      console.error("Error saving theme:", error);
      toast({
        title: "Error",
        description: "Could not save theme. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!canModerate) {
    return (
      <Card className="p-6 rounded-3xl">
        <p className="text-muted-foreground">
          You don't have permission to customize this community.
        </p>
      </Card>
    );
  }

  return (
    <Card className="p-6 rounded-3xl">
      <Tabs defaultValue="theme" className="w-full">
        <TabsList className="grid w-full grid-cols-4 rounded-2xl">
          <TabsTrigger value="theme" className="rounded-xl">
            <Palette className="h-4 w-4 mr-2" />
            Theme
          </TabsTrigger>
          <TabsTrigger value="rules" className="rounded-xl">
            <FileText className="h-4 w-4 mr-2" />
            Rules
          </TabsTrigger>
          <TabsTrigger value="flairs" className="rounded-xl">
            <Tag className="h-4 w-4 mr-2" />
            Flairs
          </TabsTrigger>
          <TabsTrigger value="events" className="rounded-xl">
            <Calendar className="h-4 w-4 mr-2" />
            Events
          </TabsTrigger>
        </TabsList>

        <TabsContent value="theme" className="mt-4 space-y-4">
          <div>
            <h3 className="text-lg font-semibold mb-4">Community Theme</h3>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="primaryColor">Primary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="primaryColor"
                    type="color"
                    value={themeConfig.primaryColor || "#000000"}
                    onChange={(e) =>
                      setThemeConfig({
                        ...themeConfig,
                        primaryColor: e.target.value,
                      })
                    }
                    className="w-20 h-10 rounded-xl"
                  />
                  <Input
                    value={themeConfig.primaryColor || "#000000"}
                    onChange={(e) =>
                      setThemeConfig({
                        ...themeConfig,
                        primaryColor: e.target.value,
                      })
                    }
                    placeholder="#000000"
                    className="rounded-2xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="secondaryColor">Secondary Color</Label>
                <div className="flex gap-2">
                  <Input
                    id="secondaryColor"
                    type="color"
                    value={themeConfig.secondaryColor || "#ffffff"}
                    onChange={(e) =>
                      setThemeConfig({
                        ...themeConfig,
                        secondaryColor: e.target.value,
                      })
                    }
                    className="w-20 h-10 rounded-xl"
                  />
                  <Input
                    value={themeConfig.secondaryColor || "#ffffff"}
                    onChange={(e) =>
                      setThemeConfig({
                        ...themeConfig,
                        secondaryColor: e.target.value,
                      })
                    }
                    placeholder="#ffffff"
                    className="rounded-2xl"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="backgroundImage">Background Image URL (Optional)</Label>
                <Input
                  id="backgroundImage"
                  value={themeConfig.backgroundImage || ""}
                  onChange={(e) =>
                    setThemeConfig({
                      ...themeConfig,
                      backgroundImage: e.target.value,
                    })
                  }
                  placeholder="https://example.com/image.jpg"
                  className="rounded-2xl"
                />
              </div>

              <Button
                onClick={handleSaveTheme}
                disabled={isSaving}
                className="rounded-2xl"
              >
                <Save className="h-4 w-4 mr-2" />
                {isSaving ? "Saving..." : "Save Theme"}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="rules" className="mt-4">
          <CommunityRulesManager communityId={communityId} isHost={isHost} />
        </TabsContent>

        <TabsContent value="flairs" className="mt-4">
          <CommunityFlairsManager communityId={communityId} isHost={isHost} />
        </TabsContent>

        <TabsContent value="events" className="mt-4">
          <CommunityEventsManager communityId={communityId} isHost={isHost} />
        </TabsContent>
      </Tabs>
    </Card>
  );
};

