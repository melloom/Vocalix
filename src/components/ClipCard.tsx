import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, AlertTriangle, Trash2, Bookmark, BookmarkCheck, MessageCircle, Repeat2, Link2, Share2, Mic, Download, CheckCircle2, WifiOff, Lock, Users, Globe, Eye, Volume2, ArrowUpRight } from "lucide-react";
import { VoteButtons } from "@/components/VoteButtons";
import { CrosspostDialog } from "@/components/CrosspostDialog";
import { FlairBadge } from "@/components/FlairBadge";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ReportClipDialog } from "@/components/ReportClipDialog";
import { Badge } from "@/components/ui/badge";
import { useAudioEnhancements } from "@/hooks/useAudioEnhancements";
import { AudioEnhancementControls } from "@/components/AudioEnhancementControls";
import { ShareClipDialog } from "@/components/ShareClipDialog";
import { Comments } from "@/components/Comments";
import { VoiceReactionRecorder } from "@/components/VoiceReactionRecorder";
import { VoiceReactionPlayer } from "@/components/VoiceReactionPlayer";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { logError, logWarn } from "@/lib/logger";
import { useOfflineDownloads } from "@/hooks/useOfflineDownloads";
import { MentionText } from "@/components/MentionText";
import { LiveReactionsDisplay } from "@/components/LiveReactionsDisplay";

interface VoiceReaction {
  id: string;
  clip_id: string;
  profile_id: string | null;
  audio_path: string;
  duration_seconds: number;
  created_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface Clip {
  id: string;
  profile_id: string | null;
  audio_path: string;
  mood_emoji: string;
  duration_seconds: number;
  captions: string | null;
  summary: string | null;
  status: string;
  reactions: Record<string, number>;
  created_at: string;
  listens_count?: number;
  city?: string | null;
  content_rating?: "general" | "sensitive";
  title?: string | null;
  tags?: string[] | null;
  parent_clip_id?: string | null;
  reply_count?: number;
  remix_of_clip_id?: string | null;
  remix_count?: number;
  chain_id?: string | null;
  challenge_id?: string | null;
  is_podcast?: boolean;
  trending_score?: number | null;
  quality_score?: number | null;
  quality_badge?: "excellent" | "good" | "fair" | null;
  vote_score?: number | null;
  upvote_count?: number | null;
  downvote_count?: number | null;
  flair_id?: string | null;
  crosspost_count?: number | null;
  detected_language?: string | null;
  translations?: Record<string, string> | null;
  quality_metrics?: {
    volume: number;
    clarity: number;
    noise_level: number;
  } | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface ClipCardProps {
  clip: Clip;
  captionsDefault?: boolean;
  highlightQuery?: string;
  onReply?: (clipId: string) => void;
  onRemix?: (clipId: string) => void;
  onContinueChain?: (clipId: string) => void;
  showReplyButton?: boolean;
  isReply?: boolean;
  depth?: number;
  viewMode?: "list" | "compact";
}

const REACTION_EMOJIS = ["😊", "🔥", "❤️", "🙏", "😔", "😂", "😮", "🧘", "💡"];

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const highlightText = (text: string, query: string) => {
  if (!query) return text;
  const escapedQuery = escapeRegExp(query);
  const regex = new RegExp(`(${escapedQuery})`, "gi");
  const parts = text.split(regex);

  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={`${part}-${index}`} className="rounded-sm bg-primary/20 px-1">
        {part}
      </mark>
    ) : (
      <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>
    ),
  );
};

export const ClipCard = ({
  clip,
  captionsDefault = true,
  highlightQuery = "",
  onReply,
  onRemix,
  onContinueChain,
  showReplyButton = true,
  isReply = false,
  depth = 0,
  viewMode = "list",
}: ClipCardProps) => {
  const [showCaptions, setShowCaptions] = useState(captionsDefault);
  const [reactions, setReactions] = useState<Record<string, number>>(clip.reactions || {});
  const [burstEmoji, setBurstEmoji] = useState<string | null>(null);
  const [isSensitiveHidden, setIsSensitiveHidden] = useState(
    clip.content_rating === "sensitive",
  );
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [voiceReactions, setVoiceReactions] = useState<VoiceReaction[]>([]);
  const [isVoiceReactionRecorderOpen, setIsVoiceReactionRecorderOpen] = useState(false);
  const [isLoadingVoiceReactions, setIsLoadingVoiceReactions] = useState(false);
  const [voiceReactionsError, setVoiceReactionsError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCrosspostDialogOpen, setIsCrosspostDialogOpen] = useState(false);
  const [clipFlair, setClipFlair] = useState<{ name: string; color: string; background_color: string } | null>(null);
  const highlightNeedle = highlightQuery.trim();
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const burstTimeoutRef = useRef<number | null>(null);
  const { toast } = useToast();
  const profileId = localStorage.getItem("profileId");
  const isOwner = clip.profile_id === profileId;
  
  // Offline downloads
  const { isClipDownloaded, downloadClip, deleteDownloadedClip, isLoading: isOfflineLoading } = useOfflineDownloads();
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [userPreferredLanguage, setUserPreferredLanguage] = useState<string>("en");
  const [autoTranslateEnabled, setAutoTranslateEnabled] = useState(true);
  
  // Global audio player
  const { currentClip, isPlaying: globalIsPlaying, progress: globalProgress, duration: globalDuration, playClip, togglePlayPause, seek: globalSeek } = useAudioPlayer();
  
  // Check if this clip is currently playing
  const isPlaying = globalIsPlaying && currentClip?.id === clip.id;
  const progress = currentClip?.id === clip.id ? globalProgress : 0;
  
  // Audio enhancements - keep audioRef for compatibility but it won't be used for playback
  const { enhancements, updateEnhancement } = useAudioEnhancements(audioRef);
  const clipTags =
    Array.isArray(clip.tags) && clip.tags.length > 0
      ? clip.tags.filter((tag) => typeof tag === "string" && tag.trim().length > 0)
      : [];

  const clipRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      if (burstTimeoutRef.current) {
        window.clearTimeout(burstTimeoutRef.current);
        burstTimeoutRef.current = null;
      }
    },
    [],
  );
  useEffect(() => {
    setReactions(clip.reactions || {});
  }, [clip.id, clip.reactions]);

  useEffect(() => {
    setShowCaptions(captionsDefault);
  }, [captionsDefault]);

  useEffect(() => {
    setIsSensitiveHidden(clip.content_rating === "sensitive");
  }, [clip.content_rating, clip.id]);

  useEffect(() => {
    const checkSavedStatus = async () => {
      if (!profileId || !clip.id) return;
      try {
        const { data, error } = await supabase
          .from("saved_clips")
          .select("id")
          .eq("clip_id", clip.id)
          .eq("profile_id", profileId)
          .maybeSingle();
        
        if (!error && data) {
          setIsSaved(true);
        }
      } catch (error) {
        logError("Error checking saved status", error);
      }
    };
    
    checkSavedStatus();
  }, [clip.id, profileId]);

  // Check if clip is downloaded for offline
  useEffect(() => {
    setIsDownloaded(isClipDownloaded(clip.id));
  }, [clip.id, isClipDownloaded]);

  // Fetch user's language preferences
  useEffect(() => {
    const fetchUserPreferences = async () => {
      if (!profileId) return;
      try {
        const { data, error } = await supabase
          .from("profiles")
          .select("preferred_language, auto_translate_enabled")
          .eq("id", profileId)
          .single();
        
        if (!error && data) {
          // @ts-ignore - fields exist but not in generated types
          setUserPreferredLanguage(data.preferred_language || "en");
          // @ts-ignore
          setAutoTranslateEnabled(data.auto_translate_enabled ?? true);
        }
      } catch (error) {
        logError("Error fetching user preferences", error);
      }
    };
    
    fetchUserPreferences();
  }, [profileId]);

  // Get translated caption text
  const getDisplayCaption = (): string | null => {
    if (!clip.captions) return null;
    
    // If auto-translate is disabled, show original
    if (!autoTranslateEnabled) {
      return clip.captions;
    }
    
    // If user's language matches detected language, show original
    if (clip.detected_language === userPreferredLanguage) {
      return clip.captions;
    }
    
    // If translation exists for user's language, show translation
    if (clip.translations && clip.translations[userPreferredLanguage]) {
      return clip.translations[userPreferredLanguage];
    }
    
    // Fallback to original
    return clip.captions;
  };

  // Load clip flair if it has one
  useEffect(() => {
    if (clip.flair_id) {
      loadFlair();
    }
  }, [clip.flair_id]);

  const loadFlair = async () => {
    if (!clip.flair_id) return;

    try {
      const { data, error } = await supabase
        .from("clip_flairs")
        .select("name, color, background_color")
        .eq("id", clip.flair_id)
        .single();

      if (error) throw error;
      if (data) {
        setClipFlair(data);
      }
    } catch (error) {
      console.error("Error loading flair:", error);
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel(`clip-reactions-${clip.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "clip_reactions", filter: `clip_id=eq.${clip.id}` },
        (payload) => {
          const emoji = payload.new.emoji as string;
          setReactions((prev) => ({
            ...prev,
            [emoji]: (prev[emoji] || 0) + 1,
          }));
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "voice_reactions", filter: `clip_id=eq.${clip.id}` },
        async (payload) => {
          const newReaction = payload.new as VoiceReaction;
          // Fetch profile info for the new voice reaction
          if (newReaction.profile_id) {
            const { data: profile } = await supabase
              .from("profiles")
              .select("handle, emoji_avatar")
              .eq("id", newReaction.profile_id)
              .single();
            
            setVoiceReactions((prev) => [
              ...prev,
              {
                ...newReaction,
                profiles: profile || null,
              },
            ]);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clip.id]);

  // Fetch voice reactions when clip loads
  const fetchVoiceReactions = useCallback(async () => {
    if (isSensitiveHidden) {
      setVoiceReactions([]);
      return;
    }

    setIsLoadingVoiceReactions(true);
    setVoiceReactionsError(null);

    try {
      const { data, error } = await supabase
        .from("voice_reactions")
        .select(
          `
          id,
          clip_id,
          profile_id,
          audio_path,
          duration_seconds,
          created_at,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("clip_id", clip.id)
        .order("created_at", { ascending: false })
        .limit(20); // Limit to 20 most recent

      if (error) throw error;

      setVoiceReactions((data as VoiceReaction[]) || []);
    } catch (error) {
      logError("Error fetching voice reactions", error);
      setVoiceReactionsError("Failed to load voice reactions");
      setVoiceReactions([]);
    } finally {
      setIsLoadingVoiceReactions(false);
    }
  }, [clip.id, isSensitiveHidden]);

  useEffect(() => {
    fetchVoiceReactions();
  }, [fetchVoiceReactions]);

  const togglePlay = async () => {
    if (isSensitiveHidden) {
      toast({
        title: "Sensitive clip hidden",
        description: "Reveal the clip before playing.",
      });
      return;
    }

    if (clip.status === "processing") {
      toast({
        title: "Still processing",
        description: "Your clip is being processed. Playback will be available soon.",
        variant: "destructive",
      });
      return;
    }

    // If this clip is currently playing, just toggle play/pause
    if (currentClip?.id === clip.id) {
      togglePlayPause();
    } else {
      // Otherwise, load and play this clip
      await playClip({
        id: clip.id,
        title: clip.title || undefined,
        summary: clip.summary || undefined,
        audio_path: clip.audio_path,
        profiles: clip.profiles || undefined,
      });
      logListen();
    }
  };

  const handleDelete = async () => {
    if (!isOwner) return;
    setIsDeleteDialogOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    setIsDeleteDialogOpen(false);
    try {
      // Delete the audio file from storage
      const { error: storageError } = await supabase.storage
        .from("audio")
        .remove([clip.audio_path]);

      if (storageError) {
        logWarn("Failed to delete audio file", storageError);
        // Continue anyway - the database delete will still work
      }

      // Delete the clip from database
      const { error: deleteError } = await supabase
        .from("clips")
        .delete()
        .eq("id", clip.id);

      if (deleteError) {
        throw deleteError;
      }

      toast({
        title: "Clip deleted",
        description: "Your clip has been removed.",
      });
    } catch (error) {
      logError("Error deleting clip", error);
      toast({
        title: "Delete failed",
        description: "Could not delete clip. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const logListen = async () => {
    const deviceId = localStorage.getItem("deviceId");
    try {
      // Get current time from global player if this clip is playing
      const currentTime = currentClip?.id === clip.id 
        ? (globalProgress / 100) * globalDuration
        : 0;
      await supabase.functions.invoke("increment-listen", {
        body: { clipId: clip.id, seconds: Math.min(Math.round(currentTime), 30) },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });
    } catch (error) {
      logWarn("Failed to log listen", error);
    }
  };

  const handleReaction = async (emoji: string) => {
    if (isSensitiveHidden) {
      toast({
        title: "Reveal clip first",
        description: "Unhide this clip before reacting.",
        variant: "destructive",
      });
      return;
    }
    const profileId = localStorage.getItem("profileId");
    if (!profileId) {
      toast({
        title: "Sign in required",
        description: "Please complete onboarding to react.",
        variant: "destructive",
      });
      return;
    }

    const deviceId = localStorage.getItem("deviceId");
    const previousReactions = reactions;
    const optimistic = { ...previousReactions, [emoji]: (previousReactions[emoji] || 0) + 1 };
    setReactions(optimistic);
    setBurstEmoji(emoji);
    if (burstTimeoutRef.current) {
      window.clearTimeout(burstTimeoutRef.current);
    }
    burstTimeoutRef.current = window.setTimeout(() => {
      setBurstEmoji(null);
      burstTimeoutRef.current = null;
    }, 500);

    try {
      const { data, error } = await supabase.functions.invoke("react-to-clip", {
        body: { clipId: clip.id, emoji },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      if (data?.reactions) {
        setReactions(data.reactions as Record<string, number>);
      }
    } catch (err) {
      logError("Error updating reactions", err);
      toast({
        title: "Couldn't add reaction",
        description: "Please try again",
        variant: "destructive",
      });
      if (burstTimeoutRef.current) {
        window.clearTimeout(burstTimeoutRef.current);
        burstTimeoutRef.current = null;
      }
      setBurstEmoji(null);
      setReactions(previousReactions);
    }
  };

  const handleSave = async () => {
    if (!profileId) {
      toast({
        title: "Sign in required",
        description: "Please complete onboarding to save clips.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    const wasSaved = isSaved;

    try {
      if (wasSaved) {
        // Remove from saved
        const { error } = await supabase
          .from("saved_clips")
          .delete()
          .eq("clip_id", clip.id)
          .eq("profile_id", profileId);

        if (error) throw error;
        setIsSaved(false);
        toast({
          title: "Removed from saved",
          description: "Clip removed from your collection.",
        });
      } else {
        // Add to saved
        const { error } = await supabase
          .from("saved_clips")
          .insert({
            clip_id: clip.id,
            profile_id: profileId,
          });

        if (error) throw error;
        setIsSaved(true);
        toast({
          title: "Saved for later",
          description: "Clip added to your collection.",
        });
      }
    } catch (err) {
      logError("Error saving clip", err);
      toast({
        title: "Couldn't save clip",
        description: "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = async () => {
    if (!clip.audio_path) {
      toast({
        title: "Audio not available",
        description: "This clip's audio file is not available for download.",
        variant: "destructive",
      });
      return;
    }

    // If already downloaded, delete it
    if (isDownloaded) {
      setIsDownloading(true);
      try {
        const success = await deleteDownloadedClip(clip.id);
        if (success) {
          setIsDownloaded(false);
          toast({
            title: "Removed from offline",
            description: "This clip has been removed from your offline downloads.",
          });
        } else {
          throw new Error("Failed to delete downloaded clip");
        }
      } catch (err) {
        logError("Error removing downloaded clip", err);
        toast({
          title: "Couldn't remove clip",
          description: "Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsDownloading(false);
      }
      return;
    }

    // Download for offline
    setIsDownloading(true);
    try {
      const success = await downloadClip(
        clip.id,
        clip.audio_path,
        {
          title: clip.title || null,
          summary: clip.summary || null,
          duration: clip.duration_seconds,
          profiles: clip.profiles || null,
        }
      );

      if (success) {
        setIsDownloaded(true);
        toast({
          title: "Downloaded for offline",
          description: "This clip is now available offline.",
        });
      } else {
        throw new Error("Failed to download clip");
      }
    } catch (err) {
      logError("Error downloading clip", err);
      toast({
        title: "Couldn't download clip",
        description: "Please try again. If the problem persists, the audio file may not be available.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isSensitiveHidden) {
      toast({
        title: "Clip hidden",
        description: "Reveal the clip before seeking.",
      });
      return;
    }
    if (currentClip?.id !== clip.id || !globalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    const percentage = x / width;
    const seekTime = globalDuration * percentage;
    globalSeek(seekTime);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const timeAgo = (date: string) => {
    const seconds = Math.floor((new Date().getTime() - new Date(date).getTime()) / 1000);
    if (seconds < 60) return "just now";
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (viewMode === "compact") {
    return (
      <Card ref={clipRef} data-clip-id={clip.id} className={`p-3 space-y-2 card-hover ${isReply ? "ml-4 border-l-2 border-l-primary/30" : ""}`}>
        <div className="flex items-center gap-2">
          <div className="text-xl">{clip.profiles?.emoji_avatar || "🎧"}</div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm truncate">{clip.profiles?.handle || "Anonymous"}</p>
            <p className="text-xs text-muted-foreground truncate">
              {timeAgo(clip.created_at)}
              {clip.city && (
                <span className="ml-1">• {clip.city}</span>
              )}
            </p>
          </div>
          <div className="text-lg">{clip.mood_emoji}</div>
        </div>

        {clip.title && (
          <h3 className="text-sm font-semibold line-clamp-1">
            <MentionText text={clip.title} highlightQuery={highlightNeedle} />
          </h3>
        )}

        {!isSensitiveHidden && clip.summary && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            <MentionText text={clip.summary} highlightQuery={highlightNeedle} />
          </p>
        )}

        {isSensitiveHidden ? (
          <Button
            onClick={() => setIsSensitiveHidden(false)}
            variant="outline"
            size="sm"
            className="w-full rounded-xl text-xs"
          >
            Reveal clip
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              onClick={togglePlay}
              disabled={clip.status === "processing"}
              size="sm"
              className="h-8 w-8 rounded-full p-0"
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </Button>
            <div className="flex-1 space-y-0.5">
              <div
                className="h-1 bg-muted rounded-full cursor-pointer overflow-hidden"
                onClick={handleSeek}
              >
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>
                  {isPlaying && currentClip?.id === clip.id
                    ? formatTime((globalProgress / 100) * globalDuration)
                    : "0:00"}
                </span>
                <span>{formatTime(clip.duration_seconds)}</span>
              </div>
            </div>
            <AudioEnhancementControls
              enhancements={enhancements}
              onUpdate={updateEnhancement}
              compact={true}
            />
          </div>
        )}

        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-1 flex-wrap">
            {REACTION_EMOJIS.slice(0, 4).map((emoji) => {
              const count = reactions[emoji] || 0;
              if (count === 0 && viewMode === "compact") return null;
              return (
                <button
                  key={emoji}
                  onClick={() => handleReaction(emoji)}
                  className="flex items-center gap-0.5 px-2 py-1 rounded-full bg-card hover:bg-muted transition-all text-xs"
                  title={emoji}
                >
                  <span>{emoji}</span>
                  {count > 0 && <span className="text-[10px] font-medium">{count}</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-1">
            {showReplyButton && onReply && !isReply && clip.reply_count && clip.reply_count > 0 && (
              <span className="text-xs text-muted-foreground">{clip.reply_count} replies</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsShareDialogOpen(true)}
              className="h-6 w-6 rounded-full p-0"
              aria-label="Share"
            >
              <Share2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsCrosspostDialogOpen(true)}
              className="h-6 w-6 rounded-full p-0"
              aria-label="Crosspost"
            >
              <ArrowUpRight className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSave}
              disabled={isSaving}
              className="h-6 w-6 rounded-full p-0"
              aria-label={isSaved ? "Unsave" : "Save"}
            >
              {isSaved ? (
                <BookmarkCheck className="h-3 w-3 text-primary" />
              ) : (
                <Bookmark className="h-3 w-3" />
              )}
            </Button>
          </div>
        </div>

      </Card>
    );
  }

  return (
    <Card ref={clipRef} data-clip-id={clip.id} className={`p-6 space-y-4 card-hover ${isReply ? "ml-8 border-l-2 border-l-primary/30" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="text-3xl">{clip.profiles?.emoji_avatar || "🎧"}</div>
        <div className="flex-1">
          <p className="font-semibold">{clip.profiles?.handle || "Anonymous"}</p>
          <p className="text-xs text-muted-foreground">
            {timeAgo(clip.created_at)}
            {clip.city && (
              <span className="ml-1 inline-block text-muted-foreground/80">• {clip.city}</span>
            )}
            {isReply && (
              <span className="ml-1 inline-block text-primary/80">• Reply</span>
            )}
            {clip.remix_of_clip_id && (
              <span className="ml-1 inline-block text-primary/80">• Remix</span>
            )}
            {clip.chain_id && (
              <span className="ml-1 inline-block text-primary/80">• Chain</span>
            )}
            {clip.challenge_id && (
              <span className="ml-1 inline-block text-primary/80">• Challenge</span>
            )}
            {clip.visibility === "private" && (
              <span className="ml-1 inline-block text-muted-foreground" title="Private clip">
                <Lock className="h-3 w-3 inline" />
              </span>
            )}
            {clip.visibility === "followers" && (
              <span className="ml-1 inline-block text-muted-foreground" title="Followers only">
                <Users className="h-3 w-3 inline" />
              </span>
            )}
            {clip.sign_language_video_url && (
              <span className="ml-1 inline-block text-primary/80" title="Sign language available">
                👋
              </span>
            )}
            {clip.audio_description_url && (
              <span className="ml-1 inline-block text-primary/80" title="Audio description available">
                <Volume2 className="h-3 w-3 inline" />
              </span>
            )}
          </p>
        </div>
        <div className="text-2xl">{clip.mood_emoji}</div>
      </div>

      {clip.title && (
        <h3 className="text-lg font-semibold">
          {highlightText(clip.title, highlightNeedle)}
        </h3>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {clip.is_podcast && (
          <Badge variant="secondary" className="w-fit">
            🎙️ Podcast
          </Badge>
        )}
        {clip.content_rating === "sensitive" && (
          <Badge variant="destructive" className="w-fit uppercase tracking-wide">
            Sensitive / NSFW
          </Badge>
        )}
        {clip.trending_score && clip.trending_score > 100 && (
          <Badge variant="default" className="w-fit bg-orange-500 hover:bg-orange-600">
            🔥 Trending
          </Badge>
        )}
        {clip.quality_badge && (
          <Badge 
            variant="outline" 
            className={`w-fit ${
              clip.quality_badge === "excellent" 
                ? "border-green-500 text-green-600 bg-green-50 dark:bg-green-950" 
                : clip.quality_badge === "good"
                ? "border-blue-500 text-blue-600 bg-blue-50 dark:bg-blue-950"
                : "border-yellow-500 text-yellow-600 bg-yellow-50 dark:bg-yellow-950"
            }`}
            title={`Audio quality: ${clip.quality_score?.toFixed(1)}/10`}
          >
            {clip.quality_badge === "excellent" && "⭐"}
            {clip.quality_badge === "good" && "✨"}
            {clip.quality_badge === "fair" && "🎤"}
            {" "}
            {clip.quality_badge.charAt(0).toUpperCase() + clip.quality_badge.slice(1)} Quality
          </Badge>
        )}
        {isDownloaded && (
          <Badge variant="outline" className="w-fit border-primary/50 text-primary">
            <WifiOff className="h-3 w-3 mr-1" />
            Offline
          </Badge>
        )}
        {clipFlair && (
          <FlairBadge
            name={clipFlair.name}
            color={clipFlair.color}
            background_color={clipFlair.background_color}
          />
        )}
        {clip.crosspost_count && clip.crosspost_count > 0 && (
          <Badge variant="outline" className="w-fit">
            <ArrowUpRight className="h-3 w-3 mr-1" />
            {clip.crosspost_count} crosspost{clip.crosspost_count !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {clipTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {clipTags.map((tag) => (
            <Link key={tag} to={`/tag/${encodeURIComponent(tag)}`}>
              <Badge variant="outline" className="rounded-full hover:bg-primary/10 hover:border-primary cursor-pointer transition-colors">
                #{tag}
              </Badge>
            </Link>
          ))}
        </div>
      )}

      {!isSensitiveHidden && clip.summary && (
        <p className="text-sm text-muted-foreground italic">
          "<MentionText text={clip.summary} highlightQuery={highlightNeedle} />"
        </p>
      )}

      {isSensitiveHidden ? (
        <div className="space-y-4 rounded-2xl border border-border bg-muted/50 p-5 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-destructive" />
          <div className="space-y-2">
            <p className="text-sm font-medium">Sensitive clip ahead</p>
            <p className="text-xs text-muted-foreground">
              The creator marked this audio as explicit or potentially triggering. Continue only if
              you want to hear it.
            </p>
          </div>
          <Button
            onClick={() => setIsSensitiveHidden(false)}
            variant="outline"
            className="rounded-2xl"
          >
            Reveal clip
          </Button>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            <div className="flex items-center gap-4">
              <Button
                onClick={togglePlay}
                disabled={clip.status === "processing"}
                size="lg"
                className="h-14 w-14 rounded-full"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}
              </Button>
              <div className="flex-1 space-y-1">
                <div
                  className="h-2 bg-muted rounded-full cursor-pointer overflow-hidden"
                  onClick={handleSeek}
                >
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    {isPlaying && currentClip?.id === clip.id
                      ? formatTime((globalProgress / 100) * globalDuration)
                      : "0:00"}
                  </span>
                  <span>{formatTime(clip.duration_seconds)}</span>
                </div>
              </div>
              <AudioEnhancementControls
                enhancements={enhancements}
                onUpdate={updateEnhancement}
                compact={true}
              />
            </div>

            {clip.status === "processing" && (
              <p className="text-xs text-muted-foreground text-center">
                Polishing your voice note...
              </p>
            )}

            {showCaptions && getDisplayCaption() && (
              <div className="p-3 bg-muted rounded-2xl">
                <p className="text-sm">
                  <MentionText text={getDisplayCaption() || ""} highlightQuery={highlightNeedle} />
                </p>
                {clip.detected_language && clip.detected_language !== userPreferredLanguage && clip.translations && clip.translations[userPreferredLanguage] && (
                  <p className="text-xs text-muted-foreground mt-2 italic">
                    Translated from {clip.detected_language.toUpperCase()}
                  </p>
                )}
              </div>
            )}

            {clip.captions && (
              <button
                onClick={() => setShowCaptions(!showCaptions)}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                {showCaptions ? "Hide" : "Show"} captions
              </button>
            )}

            {/* Accessibility Options */}
            {(clip.sign_language_video_url || clip.audio_description_url) && (
              <div className="space-y-2 pt-2 border-t border-border">
                <p className="text-xs font-medium text-muted-foreground">Accessibility</p>
                {clip.sign_language_video_url && (
                  <a
                    href={clip.sign_language_video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    👋 Sign Language Video
                  </a>
                )}
                {clip.audio_description_url && (
                  <a
                    href={clip.audio_description_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline flex items-center gap-1"
                  >
                    <Volume2 className="h-3 w-3" /> Audio Description
                  </a>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4 pt-2">
            <VoteButtons
              clipId={clip.id}
              initialVoteScore={clip.vote_score || 0}
              initialUpvotes={clip.upvote_count || 0}
              initialDownvotes={clip.downvote_count || 0}
            />
            <div className="flex flex-wrap gap-2 flex-1">
              {REACTION_EMOJIS.map((emoji) => {
                const count = reactions[emoji] || 0;
                return (
                  <button
                    key={emoji}
                    onClick={() => handleReaction(emoji)}
                    className={`flex items-center gap-1 px-3 py-2 rounded-full bg-card hover:bg-muted transition-all hover:scale-105 active:scale-95 ${
                      burstEmoji === emoji ? "animate-bounce-in" : ""
                    }`}
                  >
                    <span className="text-lg">{emoji}</span>
                    {count > 0 && <span className="text-xs font-medium">{count}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Voice Reactions Section */}
          <div className="pt-4 space-y-2 border-t border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold">Voice Reactions</h4>
              <div className="flex items-center gap-2">
                {voiceReactionsError && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchVoiceReactions}
                    className="h-7 px-2 text-xs rounded-full"
                  >
                    Retry
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsVoiceReactionRecorderOpen(true)}
                  className="h-7 px-2 text-xs rounded-full"
                  disabled={isSensitiveHidden}
                >
                  <Mic className="h-3 w-3 mr-1" />
                  Add Voice
                </Button>
              </div>
            </div>
            {isLoadingVoiceReactions ? (
              <div className="space-y-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl bg-muted/50 p-2 animate-pulse">
                    <div className="h-8 w-8 rounded-full bg-muted" />
                    <div className="flex-1 space-y-1">
                      <div className="h-3 w-24 rounded bg-muted" />
                      <div className="h-2 w-32 rounded bg-muted" />
                    </div>
                  </div>
                ))}
              </div>
            ) : voiceReactionsError ? (
              <div className="rounded-xl bg-destructive/10 p-3 text-center space-y-2">
                <AlertTriangle className="h-4 w-4 mx-auto text-destructive" />
                <p className="text-xs text-destructive">{voiceReactionsError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchVoiceReactions}
                  className="h-6 px-3 text-xs"
                >
                  Try Again
                </Button>
              </div>
            ) : voiceReactions.length > 0 ? (
              <div className="space-y-2">
                {voiceReactions.map((reaction) => (
                  <VoiceReactionPlayer key={reaction.id} voiceReaction={reaction} />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-2">
                No voice reactions yet. Be the first to react with your voice!
              </p>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        {isOwner && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
            className="h-auto px-3 py-1 rounded-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            {isDeleting ? "Deleting..." : "Delete"}
          </Button>
        )}
        <div className={`flex items-center gap-2 ${isOwner ? "" : "ml-auto"}`}>
          {showReplyButton && onReply && !isReply && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onReply(clip.id)}
              className="h-auto px-3 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground"
            >
              <MessageCircle className="mr-1 h-3 w-3" />
              Reply
              {clip.reply_count && clip.reply_count > 0 && (
                <span className="ml-1">({clip.reply_count})</span>
              )}
            </Button>
          )}
          {onRemix && !isReply && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemix(clip.id)}
              className="h-auto px-3 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground"
            >
              <Repeat2 className="mr-1 h-3 w-3" />
              Remix
              {clip.remix_count && clip.remix_count > 0 && (
                <span className="ml-1">({clip.remix_count})</span>
              )}
            </Button>
          )}
          {onContinueChain && !isReply && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onContinueChain(clip.id)}
              className="h-auto px-3 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground"
            >
              <Link2 className="mr-1 h-3 w-3" />
              Continue
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsShareDialogOpen(true)}
            className="h-auto px-3 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground"
          >
            <Share2 className="mr-1 h-3 w-3" />
            Share
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={isDownloading || isOfflineLoading || clip.status === "processing"}
            className={`h-auto px-3 py-1 rounded-full text-xs ${
              isDownloaded
                ? "text-primary hover:text-primary hover:bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
            title={isDownloaded ? "Remove from offline downloads" : "Download for offline"}
          >
            {isDownloaded ? (
              <>
                <CheckCircle2 className="mr-1 h-3 w-3" />
                {isDownloading ? "Removing..." : "Offline"}
              </>
            ) : (
              <>
                <Download className="mr-1 h-3 w-3" />
                {isDownloading ? "Downloading..." : "Download"}
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSave}
            disabled={isSaving}
            className={`h-auto px-3 py-1 rounded-full text-xs ${
              isSaved
                ? "text-primary hover:text-primary hover:bg-primary/10"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {isSaved ? (
              <>
                <BookmarkCheck className="mr-1 h-3 w-3" />
                Saved
              </>
            ) : (
              <>
                <Bookmark className="mr-1 h-3 w-3" />
                Save
              </>
            )}
          </Button>
          <ReportClipDialog
            clipId={clip.id}
            trigger={
              <Button variant="ghost" size="sm" className="h-auto px-3 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground">
                Report
              </Button>
            }
          />
        </div>
      </div>

      <Comments clipId={clip.id} profileId={profileId} clipCreatorId={clip.profile_id} />

      {/* Live Reactions Display during Playback */}
      <LiveReactionsDisplay
        clipId={clip.id}
        currentTimeSeconds={progress}
        isPlaying={isPlaying}
        timeWindowSeconds={5}
      />

      <ShareClipDialog
        clipId={clip.id}
        clipTitle={clip.title}
        clipSummary={clip.summary}
        profileHandle={clip.profiles?.handle}
        open={isShareDialogOpen}
        onOpenChange={setIsShareDialogOpen}
      />
      <CrosspostDialog
        clipId={clip.id}
        clipTitle={clip.title || undefined}
        open={isCrosspostDialogOpen}
        onOpenChange={setIsCrosspostDialogOpen}
      />

      <VoiceReactionRecorder
        clipId={clip.id}
        isOpen={isVoiceReactionRecorderOpen}
        onClose={() => setIsVoiceReactionRecorderOpen(false)}
        onSuccess={() => {
          // Refresh voice reactions list (real-time subscription handles updates, but refresh ensures consistency)
          fetchVoiceReactions();
        }}
      />

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this clip?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this clip? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </Card>
  );
};
