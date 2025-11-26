import { useState, useEffect } from "react";
import { Search, X, Play, Pause, FileAudio } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";
import { formatDuration } from "@/lib/utils";

interface Clip {
  id: string;
  audio_path: string;
  title?: string | null;
  summary?: string | null;
  duration_seconds: number;
  mood_emoji: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  created_at: string;
}

interface ClipSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (clip: Clip) => void;
  excludeClipIds?: string[]; // Clips to exclude (e.g., original clip, already selected)
  maxClips?: number; // Maximum number of clips that can be selected
}

export const ClipSelectorModal = ({
  isOpen,
  onClose,
  onSelect,
  excludeClipIds = [],
  maxClips = 3,
}: ClipSelectorModalProps) => {
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [playingClipId, setPlayingClipId] = useState<string | null>(null);
  const [audioRefs, setAudioRefs] = useState<Map<string, HTMLAudioElement>>(new Map());
  const { toast } = useToast();

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setPlayingClipId(null);
      // Stop all audio
      audioRefs.forEach((audio) => {
        audio.pause();
        audio.currentTime = 0;
      });
      return;
    }

    loadClips();
  }, [isOpen]);

  const loadClips = async () => {
    setIsLoading(true);
    try {
      let query = supabase
        .from("clips")
        .select(
          `
          id,
          audio_path,
          title,
          summary,
          duration_seconds,
          mood_emoji,
          created_at,
          profiles:profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("status", "live")
        .order("created_at", { ascending: false })
        .limit(50);

      // Exclude specific clips
      if (excludeClipIds.length > 0) {
        query = query.not("id", "in", `(${excludeClipIds.join(",")})`);
      }

      const { data, error } = await query;

      if (error) throw error;
      if (data) {
        setClips(data as Clip[]);
      }
    } catch (error) {
      logError("Failed to load clips", error);
      toast({
        title: "Failed to load clips",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadClips();
      return;
    }

    setIsLoading(true);
    try {
      let query = supabase
        .from("clips")
        .select(
          `
          id,
          audio_path,
          title,
          summary,
          duration_seconds,
          mood_emoji,
          created_at,
          profiles:profile_id (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("status", "live")
        .or(`title.ilike.%${searchQuery}%,summary.ilike.%${searchQuery}%`)
        .order("created_at", { ascending: false })
        .limit(50);

      if (excludeClipIds.length > 0) {
        query = query.not("id", "in", `(${excludeClipIds.join(",")})`);
      }

      const { data, error } = await query;

      if (error) throw error;
      if (data) {
        setClips(data as Clip[]);
      }
    } catch (error) {
      logError("Failed to search clips", error);
      toast({
        title: "Search failed",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlay = async (clip: Clip) => {
    // Stop all other audio
    audioRefs.forEach((audio, clipId) => {
      if (clipId !== clip.id) {
        audio.pause();
        audio.currentTime = 0;
      }
    });

    if (playingClipId === clip.id) {
      // Pause if already playing
      const audio = audioRefs.get(clip.id);
      if (audio) {
        audio.pause();
        setPlayingClipId(null);
      }
      return;
    }

    try {
      // Download and play audio
      const { data, error } = await supabase.storage
        .from("clips")
        .download(clip.audio_path);

      if (error) throw error;
      if (!data) return;

      const audioUrl = URL.createObjectURL(data);
      const audio = new Audio(audioUrl);
      
      audio.addEventListener("ended", () => {
        setPlayingClipId(null);
        URL.revokeObjectURL(audioUrl);
      });

      audioRefs.set(clip.id, audio);
      await audio.play();
      setPlayingClipId(clip.id);
    } catch (error) {
      logError("Failed to play clip", error);
      toast({
        title: "Failed to play clip",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleSelect = (clip: Clip) => {
    onSelect(clip);
    onClose();
  };

  const filteredClips = clips.filter((clip) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      clip.title?.toLowerCase().includes(query) ||
      clip.summary?.toLowerCase().includes(query) ||
      clip.profiles?.handle?.toLowerCase().includes(query)
    );
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Select Clip to Add</DialogTitle>
          <DialogDescription>
            Choose a clip to add to your remix. You can add up to {maxClips} clips.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search */}
          <div className="flex gap-2">
            <Input
              placeholder="Search clips by title, summary, or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleSearch();
                }
              }}
              className="flex-1"
            />
            <Button onClick={handleSearch} variant="outline">
              <Search className="h-4 w-4" />
            </Button>
          </div>

          {/* Clips List */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading clips...
            </div>
          ) : filteredClips.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No clips found
            </div>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto">
              {filteredClips.map((clip) => (
                <Card
                  key={clip.id}
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleSelect(clip)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlay(clip);
                        }}
                        aria-label={playingClipId === clip.id ? "Pause clip" : "Play clip"}
                      >
                        {playingClipId === clip.id ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{clip.mood_emoji}</span>
                          <span className="text-sm font-medium truncate">
                            {clip.title || "Untitled"}
                          </span>
                          {clip.profiles && (
                            <Badge variant="outline" className="text-xs">
                              @{clip.profiles.handle}
                            </Badge>
                          )}
                        </div>
                        {clip.summary && (
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {clip.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <FileAudio className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">
                            {formatDuration(clip.duration_seconds)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

