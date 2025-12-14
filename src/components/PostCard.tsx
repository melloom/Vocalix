import React, { useState, useRef } from "react";
import { MessageCircle, Share2, Bookmark, BookmarkCheck, MoreHorizontal, Play, Pause, Link as LinkIcon, Eye, Lock } from "lucide-react";
import { VoteButtons } from "@/components/VoteButtons";
import { FlairBadge } from "@/components/FlairBadge";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getEmojiAvatar } from "@/utils/avatar";
import { formatDistanceToNow } from "date-fns";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logError } from "@/lib/logger";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PostComments } from "@/components/PostComments";

type PostType = "text" | "video" | "audio" | "link";

interface Post {
  id: string;
  profile_id: string | null;
  community_id: string | null;
  topic_id: string | null;
  post_type: PostType;
  title: string | null;
  content: string | null;
  video_path: string | null;
  video_thumbnail_path: string | null;
  audio_path: string | null;
  link_url: string | null;
  link_preview: Record<string, any> | null;
  duration_seconds: number | null;
  tags: string[] | null;
  upvote_count: number;
  downvote_count: number;
  vote_score: number;
  comment_count: number;
  view_count: number;
  is_nsfw: boolean;
  flair_id: string | null;
  created_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  communities?: {
    name: string;
    slug: string;
  } | null;
  clip_flairs?: {
    id: string;
    name: string;
    color: string;
    background_color: string;
  } | null;
}

interface PostCardProps {
  post: Post;
  onPostUpdate?: () => void;
}

export const PostCard = ({ post, onPostUpdate }: PostCardProps) => {
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Get video/audio URLs
  const videoUrl = post.video_path
    ? supabase.storage.from("videos").getPublicUrl(post.video_path).data.publicUrl
    : post.video_path
    ? supabase.storage.from("audio").getPublicUrl(post.video_path).data.publicUrl
    : null;

  const audioUrl = post.audio_path
    ? supabase.storage.from("audio").getPublicUrl(post.audio_path).data.publicUrl
    : null;

  const thumbnailUrl = post.video_thumbnail_path
    ? supabase.storage.from("videos").getPublicUrl(post.video_thumbnail_path).data.publicUrl
    : null;

  // Check if post is saved
  const { data: savedPost } = useQuery({
    queryKey: ["saved-post", post.id],
    queryFn: async () => {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) return null;
      const { data } = await supabase
        .from("saved_posts")
        .select("id")
        .eq("post_id", post.id)
        .eq("profile_id", profileId)
        .single();
      return data;
    },
  });

  // Toggle save
  const saveMutation = useMutation({
    mutationFn: async () => {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) throw new Error("Not logged in");

      if (isSaved) {
        const { error } = await supabase
          .from("saved_posts")
          .delete()
          .eq("post_id", post.id)
          .eq("profile_id", profileId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("saved_posts")
          .insert({ post_id: post.id, profile_id: profileId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setIsSaved(!isSaved);
      queryClient.invalidateQueries({ queryKey: ["saved-post", post.id] });
    },
    onError: (error: any) => {
      logError("Error saving post", error);
      toast({
        title: "Error",
        description: "Failed to save post",
        variant: "destructive",
      });
    },
  });

  // Upvote/Downvote
  const voteMutation = useMutation({
    mutationFn: async (voteType: "upvote" | "downvote") => {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) throw new Error("Not logged in");

      // Check if user already voted
      const { data: existingVote } = await supabase
        .from("post_votes")
        .select("vote_type")
        .eq("post_id", post.id)
        .eq("profile_id", profileId)
        .single();

      if (existingVote) {
        if (existingVote.vote_type === voteType) {
          // Remove vote
          const { error } = await supabase
            .from("post_votes")
            .delete()
            .eq("post_id", post.id)
            .eq("profile_id", profileId);
          if (error) throw error;
        } else {
          // Update vote
          const { error } = await supabase
            .from("post_votes")
            .update({ vote_type: voteType })
            .eq("post_id", post.id)
            .eq("profile_id", profileId);
          if (error) throw error;
        }
      } else {
        // Create new vote
        const { error } = await supabase
          .from("post_votes")
          .insert({ post_id: post.id, profile_id: profileId, vote_type: voteType });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["posts"] });
      onPostUpdate?.();
    },
    onError: (error: any) => {
      logError("Error voting on post", error);
      toast({
        title: "Error",
        description: "Failed to vote",
        variant: "destructive",
      });
    },
  });

  const handleVote = (voteType: "upvote" | "downvote") => {
    voteMutation.mutate(voteType);
  };

  const toggleVideoPlayback = () => {
    if (!videoRef.current) return;
    if (isPlayingVideo) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlayingVideo(!isPlayingVideo);
  };

  const toggleAudioPlayback = () => {
    if (!audioRef.current) return;
    if (isPlayingAudio) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlayingAudio(!isPlayingAudio);
  };

  const handleShare = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied!",
        description: "Post link copied to clipboard",
      });
    } catch (error) {
      logError("Error copying link", error);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <Link to={`/profile/${post.profiles?.handle}`}>
            <Avatar className="h-8 w-8">
              <AvatarFallback>
                {getEmojiAvatar(post.profiles?.emoji_avatar || "🎧")}
              </AvatarFallback>
            </Avatar>
          </Link>
          <div className="flex flex-col">
            <Link
              to={`/profile/${post.profiles?.handle}`}
              className="font-semibold hover:underline"
            >
              {post.profiles?.handle || "Anonymous"}
            </Link>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {post.communities && (
                <>
                  <Link
                    to={`/community/${post.communities.slug}`}
                    className="hover:underline"
                  >
                    r/{post.communities.name}
                  </Link>
                  <span>•</span>
                </>
              )}
              <span>{formatDistanceToNow(new Date(post.created_at), { addSuffix: true })}</span>
            </div>
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => saveMutation.mutate()}>
              {isSaved ? (
                <>
                  <BookmarkCheck className="h-4 w-4 mr-2" />
                  Unsave
                </>
              ) : (
                <>
                  <Bookmark className="h-4 w-4 mr-2" />
                  Save
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Flair */}
      {post.clip_flairs && (
        <FlairBadge flair={post.clip_flairs} />
      )}

      {/* NSFW Badge */}
      {post.is_nsfw && (
        <Badge variant="destructive">NSFW</Badge>
      )}

      {/* Title */}
      {post.title && (
        <h3 className="text-lg font-semibold">{post.title}</h3>
      )}

      {/* Content based on post type */}
      {post.post_type === "text" && post.content && (
        <div className="prose prose-sm max-w-none">
          <p className="whitespace-pre-wrap">{post.content}</p>
        </div>
      )}

      {post.post_type === "video" && videoUrl && (
        <div className="relative">
          <video
            ref={videoRef}
            src={videoUrl}
            poster={thumbnailUrl || undefined}
            className="w-full rounded-lg max-h-96"
            onEnded={() => setIsPlayingVideo(false)}
            controls
          />
        </div>
      )}

      {post.post_type === "audio" && audioUrl && (
        <div className="space-y-2">
          {post.content && (
            <p className="text-sm text-muted-foreground">{post.content}</p>
          )}
          <audio ref={audioRef} src={audioUrl} controls className="w-full" />
        </div>
      )}

      {post.post_type === "link" && post.link_url && (
        <div className="border rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            <a
              href={post.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {post.link_url}
            </a>
          </div>
          {post.link_preview && (
            <div className="mt-2">
              {post.link_preview.image && (
                <img
                  src={post.link_preview.image}
                  alt={post.link_preview.title || ""}
                  className="w-full rounded-lg max-h-48 object-cover"
                />
              )}
              {post.link_preview.title && (
                <h4 className="font-semibold mt-2">{post.link_preview.title}</h4>
              )}
              {post.link_preview.description && (
                <p className="text-sm text-muted-foreground">{post.link_preview.description}</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tags */}
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {post.tags.map((tag) => (
            <Badge key={tag} variant="secondary">
              #{tag}
            </Badge>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-4 pt-2 border-t">
        <VoteButtons
          upvotes={post.upvote_count}
          downvotes={post.downvote_count}
          score={post.vote_score}
          onUpvote={() => handleVote("upvote")}
          onDownvote={() => handleVote("downvote")}
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowComments(!showComments)}
        >
          <MessageCircle className="h-4 w-4 mr-2" />
          {post.comment_count} {post.comment_count === 1 ? "comment" : "comments"}
        </Button>
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Eye className="h-4 w-4" />
          {post.view_count}
        </div>
      </div>

      {/* Comments Section */}
      {showComments && (
        <div className="pt-4 border-t">
          <PostComments postId={post.id} />
        </div>
      )}
    </Card>
  );
};

