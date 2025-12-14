import { useState } from "react";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { getEmojiAvatar } from "@/utils/avatar";
import { Link } from "react-router-dom";
import { logError } from "@/lib/logger";
import { VoteButtons } from "@/components/VoteButtons";

interface PostComment {
  id: string;
  post_id: string;
  profile_id: string;
  content: string;
  audio_path: string | null;
  parent_comment_id: string | null;
  upvote_count: number;
  downvote_count: number;
  vote_score: number;
  created_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  replies?: PostComment[];
}

interface PostCommentsProps {
  postId: string;
}

export const PostComments = ({ postId }: PostCommentsProps) => {
  const [commentText, setCommentText] = useState("");
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch comments
  const { data: comments, isLoading } = useQuery({
    queryKey: ["post-comments", postId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("post_comments")
        .select(`
          *,
          profiles:profile_id (
            handle,
            emoji_avatar
          )
        `)
        .eq("post_id", postId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Organize comments into threads
      const topLevel: PostComment[] = [];
      const repliesMap = new Map<string, PostComment[]>();

      data.forEach((comment: any) => {
        const commentData: PostComment = {
          ...comment,
          profiles: comment.profiles,
          replies: [],
        };

        if (comment.parent_comment_id) {
          if (!repliesMap.has(comment.parent_comment_id)) {
            repliesMap.set(comment.parent_comment_id, []);
          }
          repliesMap.get(comment.parent_comment_id)!.push(commentData);
        } else {
          topLevel.push(commentData);
        }
      });

      // Attach replies to their parents
      topLevel.forEach((comment) => {
        const attachReplies = (c: PostComment) => {
          c.replies = repliesMap.get(c.id) || [];
          c.replies.forEach(attachReplies);
        };
        attachReplies(comment);
      });

      return topLevel;
    },
  });

  // Submit comment
  const submitMutation = useMutation({
    mutationFn: async () => {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) throw new Error("Not logged in");

      const { error } = await supabase.from("post_comments").insert({
        post_id: postId,
        profile_id: profileId,
        content: commentText.trim(),
        parent_comment_id: replyingTo,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      setCommentText("");
      setReplyingTo(null);
      queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
      queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (error: any) => {
      logError("Error submitting comment", error);
      toast({
        title: "Error",
        description: "Failed to post comment",
        variant: "destructive",
      });
    },
  });

  // Vote on comment
  const voteMutation = useMutation({
    mutationFn: async ({ commentId, voteType }: { commentId: string; voteType: "upvote" | "downvote" }) => {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) throw new Error("Not logged in");

      // Check if user already voted
      const { data: existingVote } = await supabase
        .from("post_comment_votes")
        .select("vote_type")
        .eq("comment_id", commentId)
        .eq("profile_id", profileId)
        .single();

      if (existingVote) {
        if (existingVote.vote_type === voteType) {
          // Remove vote
          const { error } = await supabase
            .from("post_comment_votes")
            .delete()
            .eq("comment_id", commentId)
            .eq("profile_id", profileId);
          if (error) throw error;
        } else {
          // Update vote
          const { error } = await supabase
            .from("post_comment_votes")
            .update({ vote_type: voteType })
            .eq("comment_id", commentId)
            .eq("profile_id", profileId);
          if (error) throw error;
        }
      } else {
        // Create new vote
        const { error } = await supabase
          .from("post_comment_votes")
          .insert({ comment_id: commentId, profile_id: profileId, vote_type: voteType });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["post-comments", postId] });
    },
    onError: (error: any) => {
      logError("Error voting on comment", error);
    },
  });

  const handleSubmit = () => {
    if (!commentText.trim()) return;
    submitMutation.mutate();
  };

  const CommentItem = ({ comment, depth = 0 }: { comment: PostComment; depth?: number }) => (
    <div className={`space-y-2 ${depth > 0 ? "ml-6 border-l-2 pl-4" : ""}`}>
      <div className="flex items-start gap-2">
        <Link to={`/profile/${comment.profiles?.handle}`}>
          <Avatar className="h-6 w-6">
            <AvatarFallback>
              {getEmojiAvatar(comment.profiles?.emoji_avatar || "🎧")}
            </AvatarFallback>
          </Avatar>
        </Link>
        <div className="flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <Link
              to={`/profile/${comment.profiles?.handle}`}
              className="text-sm font-semibold hover:underline"
            >
              {comment.profiles?.handle || "Anonymous"}
            </Link>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
          <div className="flex items-center gap-4">
            <VoteButtons
              upvotes={comment.upvote_count}
              downvotes={comment.downvote_count}
              score={comment.vote_score}
              onUpvote={() => voteMutation.mutate({ commentId: comment.id, voteType: "upvote" })}
              onDownvote={() => voteMutation.mutate({ commentId: comment.id, voteType: "downvote" })}
              size="sm"
            />
            {depth < 3 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReplyingTo(replyingTo === comment.id ? null : comment.id)}
              >
                Reply
              </Button>
            )}
          </div>
        </div>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="space-y-2 mt-2">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Comment Form */}
      <div className="space-y-2">
        {replyingTo && (
          <div className="text-sm text-muted-foreground">
            Replying to comment...
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setReplyingTo(null)}
              className="ml-2"
            >
              Cancel
            </Button>
          </div>
        )}
        <div className="flex gap-2">
          <Textarea
            placeholder="Add a comment..."
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            rows={2}
            className="flex-1"
          />
          <Button onClick={handleSubmit} disabled={!commentText.trim() || submitMutation.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Comments List */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading comments...</div>
      ) : comments && comments.length > 0 ? (
        <div className="space-y-4">
          {comments.map((comment) => (
            <CommentItem key={comment.id} comment={comment} />
          ))}
        </div>
      ) : (
        <div className="text-sm text-muted-foreground text-center py-4">
          No comments yet. Be the first to comment!
        </div>
      )}
    </div>
  );
};

