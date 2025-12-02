import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, MoreVertical, Edit2, Trash2, Reply, Mic, Play, Pause, Smile, ArrowUpDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatDistanceToNow } from "date-fns";
import { VoiceReactionRecorder } from "./VoiceReactionRecorder";
import { VoiceReactionPlayer } from "./VoiceReactionPlayer";
import { VoiceCommentRecorder } from "./VoiceCommentRecorder";
import { useProfile } from "@/hooks/useProfile";
import { MentionAutocomplete } from "./MentionAutocomplete";
import { MentionText } from "./MentionText";

interface Comment {
  id: string;
  clip_id: string;
  profile_id: string | null;
  parent_comment_id: string | null;
  content: string | null;
  audio_path: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  summary: string | null;
  reactions: Record<string, number>;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
  reply_count?: number;
}

interface CommentVoiceReaction {
  id: string;
  comment_id: string;
  profile_id: string | null;
  audio_path: string;
  duration_seconds: number;
  created_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

type SortOption = "time" | "relevance" | "reactions" | "voice_quality";

interface CommentsProps {
  clipId: string;
  profileId?: string | null;
  clipCreatorId?: string | null;
}

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥", "👏", "🎉", "💯", "✨"];

export const Comments = ({ clipId, profileId, clipCreatorId }: CommentsProps) => {
  const [comments, setComments] = useState<Comment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>("time");
  const [isVoiceCommentOpen, setIsVoiceCommentOpen] = useState(false);
  const [voiceCommentParentId, setVoiceCommentParentId] = useState<string | null>(null);
  const [commentReactions, setCommentReactions] = useState<Record<string, Record<string, number>>>({});
  const [commentVoiceReactions, setCommentVoiceReactions] = useState<Record<string, CommentVoiceReaction[]>>({});
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const [newCommentCursorPos, setNewCommentCursorPos] = useState(0);
  const [replyCursorPos, setReplyCursorPos] = useState(0);
  const [editCursorPos, setEditCursorPos] = useState(0);
  const commentAutocompleteRef = useRef<HTMLDivElement>(null);
  const replyAutocompleteRef = useRef<HTMLDivElement>(null);

  // Fetch comments with sorting
  const fetchComments = async () => {
    try {
      let query = supabase
        .from("comments")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `,
        )
        .eq("clip_id", clipId)
        .is("parent_comment_id", null)
        .is("deleted_at", null);

      // Apply sorting
      switch (sortBy) {
        case "time":
          query = query.order("created_at", { ascending: true });
          break;
        case "relevance":
          // For relevance, we'll sort by reactions count + reply count
          query = query.order("created_at", { ascending: false });
          break;
        case "reactions":
          // Sort by reactions JSONB (will need to handle in JS)
          query = query.order("created_at", { ascending: false });
          break;
        case "voice_quality":
          // Sort by duration (longer voice comments might indicate more thought)
          query = query.order("duration_seconds", { ascending: false, nullsLast: true });
          break;
      }

      const { data, error } = await query;

      if (error) throw error;

      // Fetch reply counts and reactions for each comment
      const commentsWithData = await Promise.all(
        (data || []).map(async (comment: any) => {
          const { data: replyData } = await supabase
            .from("comments")
            .select("id", { count: "exact", head: true })
            .eq("parent_comment_id", comment.id)
            .is("deleted_at", null);

          const profileData = Array.isArray(comment.profiles)
            ? comment.profiles[0]
            : comment.profiles;

          // Fetch reactions
          const { data: reactionData } = await supabase
            .from("comment_reactions")
            .select("emoji")
            .eq("comment_id", comment.id);

          const reactions: Record<string, number> = {};
          if (reactionData) {
            for (const row of reactionData) {
              reactions[row.emoji] = (reactions[row.emoji] || 0) + 1;
            }
          }

          // Fetch voice reactions
          const { data: voiceReactionData } = await supabase
            .from("comment_voice_reactions")
            .select(
              `
              *,
              profiles (
                handle,
                emoji_avatar
              )
            `
            )
            .eq("comment_id", comment.id)
            .order("created_at", { ascending: false });

          const voiceReactions: CommentVoiceReaction[] = (voiceReactionData || []).map((vr: any) => ({
            id: vr.id,
            comment_id: vr.comment_id,
            profile_id: vr.profile_id,
            audio_path: vr.audio_path,
            duration_seconds: vr.duration_seconds,
            created_at: vr.created_at,
            profiles: Array.isArray(vr.profiles) ? vr.profiles[0] : vr.profiles,
          }));

          return {
            ...comment,
            profiles: profileData || null,
            reply_count: replyData?.length || 0,
            reactions: comment.reactions || reactions,
          };
        }),
      );

      // Sort by reactions if needed
      if (sortBy === "reactions") {
        commentsWithData.sort((a, b) => {
          const aCount = Object.values(a.reactions || {}).reduce((sum, count) => sum + count, 0);
          const bCount = Object.values(b.reactions || {}).reduce((sum, count) => sum + count, 0);
          return bCount - aCount;
        });
      } else if (sortBy === "relevance") {
        commentsWithData.sort((a, b) => {
          const aScore = (Object.values(a.reactions || {}).reduce((sum, count) => sum + count, 0) * 1) +
            (a.reply_count || 0) * 1.5;
          const bScore = (Object.values(b.reactions || {}).reduce((sum, count) => sum + count, 0) * 1) +
            (b.reply_count || 0) * 1.5;
          return bScore - aScore;
        });
      }

      setComments(commentsWithData);

      // Store reactions and voice reactions separately
      const reactionsMap: Record<string, Record<string, number>> = {};
      const voiceReactionsMap: Record<string, CommentVoiceReaction[]> = {};
      for (const comment of commentsWithData) {
        reactionsMap[comment.id] = comment.reactions || {};
        // Voice reactions will be loaded per comment when needed
      }
      setCommentReactions(reactionsMap);
    } catch (error) {
      console.error("Error fetching comments:", error);
      toast({
        title: "Error",
        description: "Failed to load comments",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch voice reactions for a comment
  const fetchCommentVoiceReactions = async (commentId: string) => {
    try {
      const { data, error } = await supabase
        .from("comment_voice_reactions")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("comment_id", commentId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      const voiceReactions: CommentVoiceReaction[] = (data || []).map((vr: any) => ({
        id: vr.id,
        comment_id: vr.comment_id,
        profile_id: vr.profile_id,
        audio_path: vr.audio_path,
        duration_seconds: vr.duration_seconds,
        created_at: vr.created_at,
        profiles: Array.isArray(vr.profiles) ? vr.profiles[0] : vr.profiles,
      }));

      setCommentVoiceReactions((prev) => ({
        ...prev,
        [commentId]: voiceReactions,
      }));
    } catch (error) {
      console.error("Error fetching voice reactions:", error);
    }
  };

  // Fetch replies for a comment
  const fetchReplies = async (commentId: string): Promise<Comment[]> => {
    try {
      const { data, error } = await supabase
        .from("comments")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `,
        )
        .eq("parent_comment_id", commentId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data || []).map((comment: any) => {
        const profileData = Array.isArray(comment.profiles)
          ? comment.profiles[0]
          : comment.profiles;
        return {
          ...comment,
          profiles: profileData || null,
          reactions: comment.reactions || {},
        };
      });
    } catch (error) {
      console.error("Error fetching replies:", error);
      return [];
    }
  };

  useEffect(() => {
    if (isExpanded) {
      fetchComments();
      getCommentCount().then(setCommentCount);
    }
  }, [clipId, isExpanded, sortBy]);

  // Subscribe to new comments and reactions
  useEffect(() => {
    if (!isExpanded) return;

    const channel = supabase
      .channel(`comments-${clipId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `clip_id=eq.${clipId}`,
        },
        async () => {
          await fetchComments();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "comments",
          filter: `clip_id=eq.${clipId}`,
        },
        async () => {
          await fetchComments();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comment_reactions",
        },
        async () => {
          await fetchComments();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "comment_reactions",
        },
        async () => {
          await fetchComments();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clipId, isExpanded]);

  // Get comment count
  const getCommentCount = async (): Promise<number> => {
    try {
      const { data, error } = await supabase.rpc("get_comment_count", {
        clip_uuid: clipId,
      });
      if (error) throw error;
      return data || 0;
    } catch (error) {
      console.error("Error getting comment count:", error);
      return 0;
    }
  };

  const [commentCount, setCommentCount] = useState(0);

  const handleSubmitComment = async () => {
    if (!newComment.trim() || !profileId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("comments").insert({
        clip_id: clipId,
        profile_id: profileId,
        content: newComment.trim(),
      });

      if (error) throw error;

      setNewComment("");
      await fetchComments();
      const count = await getCommentCount();
      setCommentCount(count);
      toast({
        title: "Success",
        description: "Comment added",
      });
    } catch (error: any) {
      console.error("Error adding comment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add comment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Voice comments will be handled via a custom recorder component (to be created)
  // For now, users can add text comments and voice reactions
  // TODO: Create VoiceCommentRecorder component (similar to VoiceReactionRecorder but allows up to 30s)

  const handleSubmitReply = async (parentCommentId: string) => {
    if (!replyContent.trim() || !profileId || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.from("comments").insert({
        clip_id: clipId,
        profile_id: profileId,
        parent_comment_id: parentCommentId,
        content: replyContent.trim(),
      });

      if (error) throw error;

      setReplyContent("");
      setReplyingTo(null);
      await fetchComments();
      const count = await getCommentCount();
      setCommentCount(count);
      toast({
        title: "Success",
        description: "Reply added",
      });
    } catch (error: any) {
      console.error("Error adding reply:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to add reply",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editContent.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase
        .from("comments")
        .update({ content: editContent.trim() })
        .eq("id", commentId);

      if (error) throw error;

      setEditingCommentId(null);
      setEditContent("");
      await fetchComments();
      toast({
        title: "Success",
        description: "Comment updated",
      });
    } catch (error: any) {
      console.error("Error updating comment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to update comment",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteComment = async () => {
    if (!deleteCommentId || isDeleting) return;

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from("comments")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", deleteCommentId);

      if (error) throw error;

      setDeleteCommentId(null);
      await fetchComments();
      const count = await getCommentCount();
      setCommentCount(count);
      toast({
        title: "Success",
        description: "Comment deleted",
      });
    } catch (error: any) {
      console.error("Error deleting comment:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete comment",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleReaction = async (commentId: string, emoji: string) => {
    if (!profileId) {
      toast({
        title: "Sign in required",
        description: "Please complete onboarding to react.",
        variant: "destructive",
      });
      return;
    }

    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("react-to-comment", {
        body: { commentId, emoji },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      if (data?.reactions) {
        setCommentReactions((prev) => ({
          ...prev,
          [commentId]: data.reactions as Record<string, number>,
        }));
        await fetchComments();
      }
    } catch (err: any) {
      console.error("Error reacting to comment:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to react",
        variant: "destructive",
      });
    }
  };

  const handleVoiceReaction = async (commentId: string, audioBase64: string, audioType: string, durationSeconds: number) => {
    if (!profileId) return;

    try {
      const deviceId = localStorage.getItem("deviceId");
      const { data, error } = await supabase.functions.invoke("add-comment-voice-reaction", {
        body: {
          commentId,
          audioBase64,
          audioType,
          durationSeconds,
        },
        headers: deviceId ? { "x-device-id": deviceId } : undefined,
      });

      if (error) throw error;

      if (data?.success) {
        await fetchCommentVoiceReactions(commentId);
        toast({
          title: "Success",
          description: "Voice reaction added",
        });
      }
    } catch (err: any) {
      console.error("Error adding voice reaction:", err);
      toast({
        title: "Error",
        description: err.message || "Failed to add voice reaction",
        variant: "destructive",
      });
    }
  };

  const CommentItem = ({
    comment,
    depth = 0,
  }: {
    comment: Comment;
    depth?: number;
  }) => {
    const [replies, setReplies] = useState<Comment[]>([]);
    const [showReplies, setShowReplies] = useState(false);
    const [isLoadingReplies, setIsLoadingReplies] = useState(false);
    const [isPlayingAudio, setIsPlayingAudio] = useState(false);
    const [audioUrl, setAudioUrl] = useState<string | null>(null);
    const [showVoiceReactions, setShowVoiceReactions] = useState(false);
    const [isVoiceReactionOpen, setIsVoiceReactionOpen] = useState(false);
    const isOwner = comment.profile_id === profileId;
    const isClipCreator = clipCreatorId === profileId;
    const canModerate = isOwner || isClipCreator;
    const reactions = commentReactions[comment.id] || comment.reactions || {};
    const voiceReactions = commentVoiceReactions[comment.id] || [];
    const { profile } = useProfile();
    // Get playback speed from user profile (default to 1.0)
    const playbackSpeed = profile?.playback_speed ? Number(profile.playback_speed) : 1.0;

    const loadReplies = async () => {
      if (showReplies || replies.length > 0) {
        setShowReplies(!showReplies);
        return;
      }

      setIsLoadingReplies(true);
      const fetchedReplies = await fetchReplies(comment.id);
      setReplies(fetchedReplies);
      setShowReplies(true);
      setIsLoadingReplies(false);
    };

    const handlePlayAudio = async () => {
      if (!comment.audio_path) return;

      if (isPlayingAudio && audioRefs.current[comment.id]) {
        audioRefs.current[comment.id].pause();
        setIsPlayingAudio(false);
        return;
      }

      try {
        const { getAudioUrl } = await import("@/utils/audioUrl");
        const audioUrl = await getAudioUrl(comment.audio_path, {
          expiresIn: 86400, // 24 hours for better CDN caching
        });

        const audio = new Audio(audioUrl);
        audioRefs.current[comment.id] = audio;
        // Apply user's playback speed preference
        audio.playbackRate = playbackSpeed;

        audio.onended = () => {
          setIsPlayingAudio(false);
        };

        audio.onerror = () => {
          setIsPlayingAudio(false);
          toast({
            title: "Error",
            description: "Failed to play audio",
            variant: "destructive",
          });
        };

        await audio.play();
        setIsPlayingAudio(true);
        setAudioUrl(audioUrl);
      } catch (error) {
        console.error("Error playing audio:", error);
        toast({
          title: "Error",
          description: "Failed to play audio",
          variant: "destructive",
        });
      }
    };

    useEffect(() => {
      return () => {
        if (audioRefs.current[comment.id]) {
          audioRefs.current[comment.id].pause();
          delete audioRefs.current[comment.id];
        }
        if (audioUrl) {
          URL.revokeObjectURL(audioUrl);
        }
      };
    }, [comment.id, audioUrl]);

    // Update playback speed when profile changes
    useEffect(() => {
      if (audioRefs.current[comment.id]) {
        audioRefs.current[comment.id].playbackRate = playbackSpeed;
      }
    }, [playbackSpeed, comment.id]);

    const totalReactions = Object.values(reactions).reduce((sum, count) => sum + count, 0);

    return (
      <div className={`space-y-2 ${depth > 0 ? "ml-8 border-l-2 border-primary/20 pl-4" : ""}`}>
        <Card className="p-3 rounded-2xl">
          <div className="flex items-start gap-3">
            <div className="text-2xl flex-shrink-0">
              {comment.profiles?.emoji_avatar || "🎧"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-sm">
                  {comment.profiles?.handle || "Anonymous"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(comment.created_at), {
                    addSuffix: true,
                  })}
                </span>
                {comment.updated_at !== comment.created_at && (
                  <span className="text-xs text-muted-foreground">(edited)</span>
                )}
                {comment.summary && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Sparkles className="h-3 w-3" />
                    Summary available
                  </span>
                )}
              </div>
              
              {/* Voice comment player */}
              {comment.audio_path && (
                <div className="mb-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePlayAudio}
                    className="rounded-xl"
                  >
                    {isPlayingAudio ? (
                      <>
                        <Pause className="mr-2 h-3 w-3" />
                        Pause
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-3 w-3" />
                        Play {comment.duration_seconds ? `${Math.round(comment.duration_seconds)}s` : ""}
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Text content */}
              {editingCommentId === comment.id ? (
                <div className="space-y-2">
                  <div className="relative">
                    <Textarea
                      ref={editTextareaRef}
                      value={editContent}
                      onChange={(e) => {
                        setEditContent(e.target.value);
                        setEditCursorPos(e.target.selectionStart);
                      }}
                      onKeyUp={(e) => {
                        setEditCursorPos((e.target as HTMLTextAreaElement).selectionStart);
                      }}
                      onClick={(e) => {
                        setEditCursorPos((e.target as HTMLTextAreaElement).selectionStart);
                      }}
                      placeholder="Edit your comment... (use @ to mention someone)"
                      className="min-h-[80px] rounded-xl"
                      maxLength={1000}
                    />
                    <div className="absolute bottom-full left-0 mb-1">
                      <MentionAutocomplete
                        value={editContent}
                        onChange={setEditContent}
                        onSelect={() => {}}
                        cursorPosition={editCursorPos}
                        profileId={profileId}
                        textareaRef={editTextareaRef}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleEditComment(comment.id)}
                      disabled={!editContent.trim() || isSubmitting}
                      className="rounded-xl"
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setEditingCommentId(null);
                        setEditContent("");
                      }}
                      className="rounded-xl"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                comment.content && (
                  <p className="text-sm whitespace-pre-wrap break-words">
                    <MentionText text={comment.content} />
                  </p>
                )
              )}

              {/* Comment summary */}
              {comment.summary && (
                <div className="mt-2 p-2 bg-muted/50 rounded-lg text-xs text-muted-foreground">
                  <Sparkles className="h-3 w-3 inline mr-1" />
                  {comment.summary}
                </div>
              )}

              {/* Reactions */}
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {REACTION_EMOJIS.map((emoji) => {
                  const count = reactions[emoji] || 0;
                  const hasReacted = count > 0;
                  return (
                    <Button
                      key={emoji}
                      variant={hasReacted ? "default" : "ghost"}
                      size="sm"
                      onClick={() => handleReaction(comment.id, emoji)}
                      className="h-auto px-2 py-1 text-xs rounded-full"
                    >
                      {emoji} {count > 0 && <span className="ml-1">{count}</span>}
                    </Button>
                  );
                })}
                {profileId && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setIsVoiceReactionOpen(true);
                      }}
                      className="h-auto px-2 py-1 text-xs rounded-full"
                    >
                      <Mic className="h-3 w-3 mr-1" />
                      Voice
                    </Button>
                    {voiceReactions.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (voiceReactions.length === 0) {
                            fetchCommentVoiceReactions(comment.id);
                          }
                          setShowVoiceReactions(!showVoiceReactions);
                        }}
                        className="h-auto px-2 py-1 text-xs rounded-full"
                      >
                        <Mic className="h-3 w-3 mr-1" />
                        {voiceReactions.length} voice {voiceReactions.length === 1 ? "reaction" : "reactions"}
                      </Button>
                    )}
                  </>
                )}
              </div>

              {/* Voice reactions list */}
              {showVoiceReactions && voiceReactions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {voiceReactions.map((vr) => (
                    <VoiceReactionPlayer key={vr.id} voiceReaction={vr} />
                  ))}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 mt-2">
                {!isOwner && profileId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setReplyingTo(comment.id);
                      setTimeout(() => replyTextareaRef.current?.focus(), 100);
                    }}
                    className="h-auto px-2 py-1 text-xs rounded-full"
                  >
                    <Reply className="mr-1 h-3 w-3" />
                    Reply
                  </Button>
                )}
                {comment.reply_count && comment.reply_count > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadReplies}
                    disabled={isLoadingReplies}
                    className="h-auto px-2 py-1 text-xs rounded-full"
                  >
                    {showReplies ? "Hide" : "Show"} {comment.reply_count}{" "}
                    {comment.reply_count === 1 ? "reply" : "replies"}
                  </Button>
                )}
                {canModerate && editingCommentId !== comment.id && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-2 py-1 text-xs rounded-full"
                      >
                        <MoreVertical className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="rounded-xl">
                      {isOwner && (
                        <>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditingCommentId(comment.id);
                              setEditContent(comment.content || "");
                            }}
                            className="rounded-lg"
                          >
                            <Edit2 className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem
                        onClick={() => setDeleteCommentId(comment.id)}
                        className="text-destructive rounded-lg"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        {isClipCreator && !isOwner ? "Moderate" : "Delete"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              {/* Reply form */}
              {replyingTo === comment.id && (
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <Textarea
                      ref={replyTextareaRef}
                      value={replyContent}
                      onChange={(e) => {
                        setReplyContent(e.target.value);
                        setReplyCursorPos(e.target.selectionStart);
                      }}
                      onKeyUp={(e) => {
                        setReplyCursorPos((e.target as HTMLTextAreaElement).selectionStart);
                      }}
                      onClick={(e) => {
                        setReplyCursorPos((e.target as HTMLTextAreaElement).selectionStart);
                      }}
                      placeholder="Write a reply... (use @ to mention someone)"
                      className="min-h-[80px] rounded-xl"
                      maxLength={1000}
                    />
                    <div ref={replyAutocompleteRef} className="absolute bottom-full left-0 mb-1">
                      <MentionAutocomplete
                        value={replyContent}
                        onChange={setReplyContent}
                        onSelect={() => {}}
                        cursorPosition={replyCursorPos}
                        profileId={profileId}
                        textareaRef={replyTextareaRef}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleSubmitReply(comment.id)}
                      disabled={!replyContent.trim() || isSubmitting}
                      className="rounded-xl"
                    >
                      <Send className="mr-2 h-3 w-3" />
                      Reply
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyContent("");
                      }}
                      className="rounded-xl"
                    >
                      Cancel
                    </Button>
                    {/* Voice replies feature - coming soon */}
                    {/* {profileId && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setVoiceCommentParentId(comment.id);
                          setIsVoiceCommentOpen(true);
                        }}
                        className="rounded-xl"
                      >
                        <Mic className="mr-2 h-3 w-3" />
                        Voice Reply
                      </Button>
                    )} */}
                  </div>
                </div>
              )}
            </div>
          </div>
        </Card>
        {showReplies && (
          <div className="space-y-2 mt-2">
            {replies.map((reply) => (
              <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}

        {/* Voice reaction recorder for this comment */}
        <VoiceReactionRecorder
          clipId={clipId}
          isOpen={isVoiceReactionOpen}
          onClose={() => setIsVoiceReactionOpen(false)}
          onSuccess={async () => {
            // Refresh voice reactions after adding
            await fetchCommentVoiceReactions(comment.id);
            setIsVoiceReactionOpen(false);
          }}
        />
      </div>
    );
  };

  if (!isExpanded) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsExpanded(true)}
        className="h-auto px-3 py-1 rounded-full text-xs text-muted-foreground hover:text-foreground"
      >
        <MessageCircle className="mr-1 h-3 w-3" />
        Comments
        {commentCount > 0 && <span className="ml-1">({commentCount})</span>}
      </Button>
    );
  }

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          <MessageCircle className="h-4 w-4" />
          Comments {commentCount > 0 && `(${commentCount})`}
        </h3>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger className="h-8 w-[140px] rounded-xl text-xs">
              <ArrowUpDown className="h-3 w-3 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="time">Sort by Time</SelectItem>
              <SelectItem value="relevance">Sort by Relevance</SelectItem>
              <SelectItem value="reactions">Sort by Reactions</SelectItem>
              <SelectItem value="voice_quality">Sort by Voice Quality</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(false)}
            className="h-auto px-2 py-1 text-xs rounded-full"
          >
            Hide
          </Button>
        </div>
      </div>

      {profileId && (
        <Card className="p-4 rounded-2xl">
          <div className="flex gap-2 mb-3 relative">
            <div className="flex-1 relative">
              <Textarea
                ref={textareaRef}
                value={newComment}
                onChange={(e) => {
                  setNewComment(e.target.value);
                  setNewCommentCursorPos(e.target.selectionStart);
                }}
                onKeyUp={(e) => {
                  setNewCommentCursorPos((e.target as HTMLTextAreaElement).selectionStart);
                }}
                onClick={(e) => {
                  setNewCommentCursorPos((e.target as HTMLTextAreaElement).selectionStart);
                }}
                placeholder="Add a comment... (use @ to mention someone)"
                className="min-h-[100px] rounded-xl flex-1"
                maxLength={1000}
              />
              <div ref={commentAutocompleteRef} className="absolute bottom-full left-0 mb-1">
                <MentionAutocomplete
                  value={newComment}
                  onChange={setNewComment}
                  onSelect={() => {}}
                  cursorPosition={newCommentCursorPos}
                  profileId={profileId}
                  textareaRef={textareaRef}
                />
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setVoiceCommentParentId(null);
                  setIsVoiceCommentOpen(true);
                }}
                className="rounded-xl"
              >
                <Mic className="mr-2 h-3 w-3" />
                Voice Comment
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {newComment.length}/1000
              </span>
              <Button
                onClick={handleSubmitComment}
                disabled={!newComment.trim() || isSubmitting}
                size="sm"
                className="rounded-xl"
              >
                <Send className="mr-2 h-3 w-3" />
                {isSubmitting ? "Posting..." : "Post"}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <Card key={i} className="p-3 rounded-2xl">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                  <div className="h-4 w-full bg-muted rounded animate-pulse" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : comments.length === 0 ? (
        <Card className="p-6 rounded-2xl text-center text-muted-foreground">
          <MessageCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p className="text-sm">No comments yet. Be the first to comment!</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      )}

      {/* Voice comment recorder */}
      <VoiceCommentRecorder
        clipId={clipId}
        parentCommentId={voiceCommentParentId}
        isOpen={isVoiceCommentOpen}
        onClose={() => {
          setIsVoiceCommentOpen(false);
          setVoiceCommentParentId(null);
        }}
        onSuccess={() => {
          fetchComments();
          getCommentCount().then(setCommentCount);
        }}
      />

      <AlertDialog
        open={deleteCommentId !== null}
        onOpenChange={(open) => !open && setDeleteCommentId(null)}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete comment?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this comment? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteComment}
              disabled={isDeleting}
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
