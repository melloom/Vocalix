import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Award, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface Award {
  id: string;
  name: string;
  description: string | null;
  icon_emoji: string;
  color: string;
  community_id: string;
}

interface AwardDisplayProps {
  clipId: string;
  communityId?: string | null;
}

export function AwardDisplay({ clipId, communityId }: AwardDisplayProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [awards, setAwards] = useState<Award[]>([]);
  const [clipAwards, setClipAwards] = useState<Array<{ award: Award; message: string | null }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAwardDialogOpen, setIsAwardDialogOpen] = useState(false);
  const [selectedAwardId, setSelectedAwardId] = useState<string>("");
  const [awardMessage, setAwardMessage] = useState("");
  const [isAwarding, setIsAwarding] = useState(false);

  useEffect(() => {
    if (communityId) {
      loadAwards();
    }
    loadClipAwards();
  }, [communityId, clipId]);

  const loadAwards = async () => {
    if (!communityId) return;

    try {
      const { data, error } = await supabase
        .from("community_awards")
        .select("*")
        .eq("community_id", communityId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setAwards(data || []);
    } catch (error: any) {
      console.error("Error loading awards:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadClipAwards = async () => {
    try {
      const { data, error } = await supabase
        .from("clip_awards")
        .select(
          `
          *,
          community_awards (
            id,
            name,
            description,
            icon_emoji,
            color
          )
        `
        )
        .eq("clip_id", clipId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const formatted = (data || []).map((item: any) => ({
        award: item.community_awards,
        message: item.message,
      })).filter((item: any) => item.award);

      setClipAwards(formatted);
    } catch (error: any) {
      console.error("Error loading clip awards:", error);
    }
  };

  const handleAward = async () => {
    if (!selectedAwardId) {
      toast({
        title: "Select an award",
        description: "Please select an award to give",
        variant: "destructive",
      });
      return;
    }

    if (!profile?.id) {
      toast({
        title: "Please log in",
        description: "You need to be logged in to give awards",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsAwarding(true);
      const { error } = await supabase.from("clip_awards").insert({
        clip_id: clipId,
        award_id: selectedAwardId,
        awarded_by_profile_id: profile.id,
        message: awardMessage.trim() || null,
      });

      if (error) throw error;

      toast({
        title: "Award given!",
        description: "Thank you for recognizing this clip",
      });

      setSelectedAwardId("");
      setAwardMessage("");
      setIsAwardDialogOpen(false);
      loadClipAwards();
    } catch (error: any) {
      console.error("Error awarding:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to give award",
        variant: "destructive",
      });
    } finally {
      setIsAwarding(false);
    }
  };

  if (!communityId) {
    return null;
  }

  return (
    <div className="space-y-2">
      {clipAwards.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clipAwards.map((item, index) => (
            <Badge
              key={index}
              variant="outline"
              className="rounded-full"
              style={{
                borderColor: item.award.color,
                color: item.award.color,
              }}
            >
              <span className="mr-1">{item.award.icon_emoji}</span>
              {item.award.name}
            </Badge>
          ))}
        </div>
      )}

      {awards.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsAwardDialogOpen(true)}
          className="rounded-2xl"
        >
          <Award className="mr-2 h-4 w-4" />
          Give Award
        </Button>
      )}

      <Dialog open={isAwardDialogOpen} onOpenChange={setIsAwardDialogOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle>Give Award</DialogTitle>
            <DialogDescription>
              Recognize this clip with a community award
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Award</Label>
              <div className="grid grid-cols-2 gap-2">
                {awards.map((award) => (
                  <Button
                    key={award.id}
                    variant={selectedAwardId === award.id ? "default" : "outline"}
                    onClick={() => setSelectedAwardId(award.id)}
                    className="rounded-2xl h-auto py-3 flex flex-col items-center gap-1"
                    style={
                      selectedAwardId === award.id
                        ? {
                            backgroundColor: award.color,
                            borderColor: award.color,
                          }
                        : {}
                    }
                  >
                    <span className="text-2xl">{award.icon_emoji}</span>
                    <span className="text-xs">{award.name}</span>
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Message (optional)</Label>
              <Textarea
                placeholder="Add a message with your award..."
                value={awardMessage}
                onChange={(e) => setAwardMessage(e.target.value)}
                className="rounded-2xl min-h-[80px]"
                maxLength={200}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsAwardDialogOpen(false)}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAward}
              disabled={isAwarding || !selectedAwardId}
              className="rounded-2xl"
            >
              {isAwarding ? "Awarding..." : "Give Award"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

