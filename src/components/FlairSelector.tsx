import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FlairBadge } from "./FlairBadge";
import { Label } from "@/components/ui/label";

interface Flair {
  id: string;
  name: string;
  color: string;
  background_color: string;
}

interface FlairSelectorProps {
  communityId: string | null;
  selectedFlairId: string | null;
  onFlairChange: (flairId: string | null) => void;
}

export function FlairSelector({ communityId, selectedFlairId, onFlairChange }: FlairSelectorProps) {
  const { toast } = useToast();
  const [flairs, setFlairs] = useState<Flair[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (communityId) {
      loadFlairs();
    } else {
      setFlairs([]);
    }
  }, [communityId]);

  const loadFlairs = async () => {
    if (!communityId) return;

    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("clip_flairs")
        .select("*")
        .eq("community_id", communityId)
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setFlairs(data || []);
    } catch (error: any) {
      console.error("Error loading flairs:", error);
      toast({
        title: "Error",
        description: "Failed to load flairs",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (!communityId || flairs.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <Label>Flair (optional)</Label>
      <Select
        value={selectedFlairId || "none"}
        onValueChange={(value) => onFlairChange(value === "none" ? null : value)}
      >
        <SelectTrigger className="rounded-2xl">
          <SelectValue placeholder="Select a flair">
            {selectedFlairId ? (
              flairs.find((f) => f.id === selectedFlairId) ? (
                <FlairBadge
                  name={flairs.find((f) => f.id === selectedFlairId)!.name}
                  color={flairs.find((f) => f.id === selectedFlairId)!.color}
                  background_color={flairs.find((f) => f.id === selectedFlairId)!.background_color}
                />
              ) : (
                "Select a flair"
              )
            ) : (
              "No flair"
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No flair</SelectItem>
          {flairs.map((flair) => (
            <SelectItem key={flair.id} value={flair.id}>
              <FlairBadge
                name={flair.name}
                color={flair.color}
                background_color={flair.background_color}
              />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

