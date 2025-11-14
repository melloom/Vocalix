import React, { useState, useEffect, useRef } from "react";
import { MessageCircle, Send, MoreVertical, Edit2, Trash2, Reply } from "lucide-react";
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
} from "@/components/ui/dropdown-menu";
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

interface Comment {
  id: string;
  clip_id: string;
  profile_id: string | null;
  parent_comment_id: string | null;
  content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
  reply_count?: number;
}

interface CommentsProps {
  clipId: string;
  profileId?: string | null;
}

export const Comments = ({ clipId, profileId }: CommentsProps) => {
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
  const { toast } = useToast();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch comments
  const fetchComments = async () => {
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
        .eq("clip_id", clipId)
        .is("parent_comment_id", null)
        .order("created_at", { ascending: true });

      if (error) throw error;

      // Fetch reply counts for each comment
      const commentsWithReplies = await Promise.all(
        (data || []).map(async (comment: any) => {
          const { data: replyData, error: replyError } = await supabase
            .from("comments")
            .select("id", { count: "exact", head: true })
            .eq("parent_comment_id", comment.id)
            .is("deleted_at", null);

          const profileData = Array.isArray(comment.profiles)
            ? comment.profiles[0]
            : comment.profiles;

          return {
            ...comment,
            profiles: profileData || null,
            reply_count: replyError ? 0 : (replyData?.length || 0),
          };
        }),
      );

      setComments(commentsWithReplies);
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
        .order("created_at", { ascending: true });

      if (error) throw error;

      return (data || []).map((comment: any) => {
        const profileData = Array.isArray(comment.profiles)
          ? comment.profiles[0]
          : comment.profiles;
        return {
          ...comment,
          profiles: profileData || null,
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
  }, [clipId, isExpanded]);

  // Subscribe to new comments
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
    const isOwner = comment.profile_id === profileId;

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

    return (
      <div className={`space-y-2 ${depth > 0 ? "ml-6 border-l-2 border-muted pl-4" : ""}`}>
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
              </div>
              {editingCommentId === comment.id ? (
                <div className="space-y-2">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    placeholder="Edit your comment..."
                    className="min-h-[80px] rounded-xl"
                    maxLength={1000}
                  />
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
                <p className="text-sm whitespace-pre-wrap break-words">
                  {comment.content}
                </p>
              )}
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
                {isOwner && editingCommentId !== comment.id && (
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
                      <DropdownMenuItem
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditContent(comment.content);
                        }}
                        className="rounded-lg"
                      >
                        <Edit2 className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteCommentId(comment.id)}
                        className="text-destructive rounded-lg"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              {replyingTo === comment.id && (
                <div className="mt-3 space-y-2">
                  <Textarea
                    ref={replyTextareaRef}
                    value={replyContent}
                    onChange={(e) => setReplyContent(e.target.value)}
                    placeholder="Write a reply..."
                    className="min-h-[80px] rounded-xl"
                    maxLength={1000}
                  />
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
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsExpanded(false)}
          className="h-auto px-2 py-1 text-xs rounded-full"
        >
          Hide
        </Button>
      </div>

      {profileId && (
        <Card className="p-4 rounded-2xl">
          <Textarea
            ref={textareaRef}
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            placeholder="Add a comment..."
            className="min-h-[100px] rounded-xl mb-3"
            maxLength={1000}
          />
          <div className="flex items-center justify-between">
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

