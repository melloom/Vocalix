import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Users, Bell, BellOff, Plus, TrendingUp, Mic, Heart, Sparkles, MessageCircle, ChevronUp, ChevronDown, Reply, CheckCircle2, HelpCircle, Minus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useProfile } from "@/hooks/useProfile";
import { useAdminStatus } from "@/hooks/useAdminStatus";
import { useTopicFollow } from "@/hooks/useTopicFollow";
import { format, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { usePagination } from "@/hooks/usePagination";
import { ErrorDisplay } from "@/components/ErrorDisplay";
import { PaginationControls } from "@/components/PaginationControls";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TopicDiscovery } from "@/components/TopicDiscovery";

interface Topic {
  id: string;
  title: string;
  date: string;
  description: string | null;
  is_active: boolean | null;
  community_id?: string | null;
  user_created_by?: string | null;
  clips_count?: number;
  trending_score?: number;
  communities?: {
    id: string;
    name: string;
    slug: string;
    avatar_emoji: string;
  } | null;
  profiles?: {
    id: string;
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
  listens_count: number;
  city: string | null;
  topic_id: string | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface TopicComment {
  id: string;
  topic_id: string;
  profile_id: string | null;
  parent_comment_id: string | null;
  content: string;
  is_question: boolean;
  is_answered: boolean;
  upvotes_count: number;
  replies_count: number;
  created_at: string;
  updated_at: string;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
  has_upvoted?: boolean;
  replies?: TopicComment[];
}

const Topic = () => {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { profile: viewerProfile } = useProfile();
  const { isAdmin } = useAdminStatus();
  const [topic, setTopic] = useState<Topic | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [subscriberCount, setSubscriberCount] = useState(0);
  const [isAddingComment, setIsAddingComment] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [commentSortBy, setCommentSortBy] = useState<'newest' | 'top' | 'questions'>('newest');
  const [collapsedComments, setCollapsedComments] = useState<Set<string>>(new Set());
  const { isFollowing, toggleFollow, isToggling } = useTopicFollow(topicId || null);
  const queryClient = useQueryClient();

  // Fetch topic comments
  const { data: comments, isLoading: isLoadingComments, refetch: refetchComments } = useQuery({
    queryKey: ['topic-comments', topicId, commentSortBy],
    queryFn: async () => {
      if (!topicId) return [];

      let query = supabase
        .from('topic_comments')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('topic_id', topicId)
        .is('parent_comment_id', null)
        .is('deleted_at', null);

      // Apply sorting
      if (commentSortBy === 'top') {
        query = query.order('upvotes_count', { ascending: false });
      } else if (commentSortBy === 'questions') {
        query = query.eq('is_question', true).order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data: topLevelComments, error } = await query;

      if (error) throw error;

      // Fetch replies for each top-level comment
      if (topLevelComments && topLevelComments.length > 0) {
        const commentIds = topLevelComments.map(c => c.id);
        const { data: replies, error: repliesError } = await supabase
          .from('topic_comments')
          .select(`
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `)
          .in('parent_comment_id', commentIds)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });

        if (!repliesError && replies) {
          // Check upvotes for viewer
          const viewerUpvotes = viewerProfile?.id ? await supabase
            .from('topic_comment_upvotes')
            .select('comment_id')
            .eq('profile_id', viewerProfile.id)
            .in('comment_id', [...commentIds, ...replies.map(r => r.id)]) : { data: [] };

          const upvotedIds = new Set((viewerUpvotes?.data || []).map((u: any) => u.comment_id));

          // Attach replies and upvote status
          const commentsWithReplies = topLevelComments.map((comment: any) => ({
            ...comment,
            has_upvoted: upvotedIds.has(comment.id),
            replies: replies
              .filter((r: any) => r.parent_comment_id === comment.id)
              .map((r: any) => ({
                ...r,
                has_upvoted: upvotedIds.has(r.id),
              })),
          }));

          return commentsWithReplies as TopicComment[];
        }
      }

      // Check upvotes for viewer
      if (topLevelComments && viewerProfile?.id) {
        const commentIds = topLevelComments.map((c: any) => c.id);
        const { data: viewerUpvotes } = await supabase
          .from('topic_comment_upvotes')
          .select('comment_id')
          .eq('profile_id', viewerProfile.id)
          .in('comment_id', commentIds);

        const upvotedIds = new Set((viewerUpvotes || []).map((u: any) => u.comment_id));

        return topLevelComments.map((comment: any) => ({
          ...comment,
          has_upvoted: upvotedIds.has(comment.id),
          replies: [],
        })) as TopicComment[];
      }

      return (topLevelComments || []).map((c: any) => ({ ...c, has_upvoted: false, replies: [] })) as TopicComment[];
    },
    enabled: !!topicId,
  });

  useEffect(() => {
    const loadTopic = async () => {
      if (!topicId) return;
      setIsLoading(true);
      setError(null);

      // Load topic with related data
      const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .select(`
          *,
          communities (
            id,
            name,
            slug,
            avatar_emoji
          ),
          profiles:user_created_by (
            id,
            handle,
            emoji_avatar
          )
        `)
        .eq("id", topicId)
        .single();

      if (topicError || !topicData) {
        setError("Topic not found");
        setIsLoading(false);
        return;
      }

      setTopic(topicData as Topic);

      // Load clips for this topic
      const { data: clipsData, error: clipsError } = await supabase
        .from("clips")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `,
        )
        .eq("topic_id", topicId)
        .in("status", ["live", "processing"])
        .order("created_at", { ascending: false })
        .limit(100);

      if (clipsError) {
        setError(clipsError.message || "Couldn't load clips");
      } else {
        setClips((clipsData as Clip[]) || []);
        setError(null);
        setRetryCount(0);
      }

      // Subscription status is now handled by useTopicFollow hook

      // Get subscriber count
      const { count } = await supabase
        .from("topic_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("topic_id", topicId);

      setSubscriberCount(count || 0);

      setIsLoading(false);
    };

    loadTopic();
  }, [topicId, viewerProfile?.id, retryCount]);

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1);
  };

  const {
    paginatedData: paginatedClips,
    currentPage,
    totalPages,
    goToPage,
  } = usePagination(clips, { pageSize: 20 });

  // Combine clips and comments into unified feed (Reddit-style)
  const unifiedFeed = useMemo(() => {
    const items: Array<{ type: 'clip' | 'comment'; data: Clip | TopicComment; created_at: string; upvotes?: number }> = [];
    
    // Add clips
    clips.forEach(clip => {
      items.push({ 
        type: 'clip', 
        data: clip, 
        created_at: clip.created_at,
        upvotes: 0 // Clips don't have upvotes in comments system
      });
    });
    
    // Add comments
    if (comments) {
      comments.forEach(comment => {
        items.push({ 
          type: 'comment', 
          data: comment, 
          created_at: comment.created_at,
          upvotes: comment.upvotes_count
        });
      });
    }
    
    // Sort based on selected sort mode
    if (commentSortBy === 'top') {
      // Sort by upvotes (comments) or listens (clips), then by date
      return items.sort((a, b) => {
        const aScore = a.type === 'comment' 
          ? (a.data as TopicComment).upvotes_count 
          : (a.data as Clip).listens_count || 0;
        const bScore = b.type === 'comment'
          ? (b.data as TopicComment).upvotes_count
          : (b.data as Clip).listens_count || 0;
        
        if (bScore !== aScore) {
          return bScore - aScore;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (commentSortBy === 'questions') {
      // Only show questions and clips
      return items
        .filter(item => item.type === 'clip' || (item.data as TopicComment).is_question)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      // Sort by created_at (newest first)
      return items.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  }, [clips, comments, commentSortBy]);

  const toggleCollapse = (commentId: string) => {
    setCollapsedComments(prev => {
      const newSet = new Set(prev);
      if (newSet.has(commentId)) {
        newSet.delete(commentId);
      } else {
        newSet.add(commentId);
      }
      return newSet;
    });
  };

  const handleFollow = () => {
    if (!viewerProfile?.id || !topicId) {
      toast.error("Please log in to follow topics");
      return;
    }

    toggleFollow();
    if (isFollowing) {
      setSubscriberCount((prev) => Math.max(0, prev - 1));
      toast.success("Unfollowed topic");
    } else {
      setSubscriberCount((prev) => prev + 1);
      toast.success("Following topic - you'll be notified of new clips");
    }
  };

  const handleAddComment = async () => {
    if (!viewerProfile?.id || !topicId) {
      toast.error("Please log in to comment");
      return;
    }

    if (!newCommentContent.trim()) {
      toast.error("Please enter a comment");
      return;
    }

    try {
      const { error } = await supabase
        .from('topic_comments')
        .insert({
          topic_id: topicId,
          profile_id: viewerProfile.id,
          content: newCommentContent.trim(),
          is_question: isQuestion,
        });

      if (error) throw error;

      toast.success(isQuestion ? "Question posted!" : "Comment posted!");
      setNewCommentContent("");
      setIsAddingComment(false);
      setIsQuestion(false);
      refetchComments();
    } catch (error: any) {
      console.error('Error adding comment:', error);
      toast.error(error.message || "Failed to post comment");
    }
  };

  const handleReply = async (parentId: string) => {
    if (!viewerProfile?.id || !topicId) {
      toast.error("Please log in to reply");
      return;
    }

    if (!replyContent.trim()) {
      toast.error("Please enter a reply");
      return;
    }

    try {
      const { error } = await supabase
        .from('topic_comments')
        .insert({
          topic_id: topicId,
          profile_id: viewerProfile.id,
          parent_comment_id: parentId,
          content: replyContent.trim(),
        });

      if (error) throw error;

      toast.success("Reply posted!");
      setReplyContent("");
      setReplyingToCommentId(null);
      refetchComments();
    } catch (error: any) {
      console.error('Error replying:', error);
      toast.error(error.message || "Failed to post reply");
    }
  };

  const handleUpvote = async (commentId: string, hasUpvoted: boolean) => {
    if (!viewerProfile?.id) {
      toast.error("Please log in to upvote");
      return;
    }

    try {
      if (hasUpvoted) {
        const { error } = await supabase
          .from('topic_comment_upvotes')
          .delete()
          .eq('comment_id', commentId)
          .eq('profile_id', viewerProfile.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('topic_comment_upvotes')
          .insert({
            comment_id: commentId,
            profile_id: viewerProfile.id,
          });

        if (error) throw error;
      }

      refetchComments();
    } catch (error: any) {
      console.error('Error upvoting:', error);
      toast.error(error.message || "Failed to upvote");
    }
  };

  const handleMarkAnswered = async (commentId: string) => {
    if (!viewerProfile?.id) {
      toast.error("Please log in");
      return;
    }

    try {
      // Check if user is the comment author or topic creator (admins can mark any as answered)
      const comment = comments?.find(c => c.id === commentId);
      if (!isAdmin && comment?.profile_id !== viewerProfile?.id && topic?.user_created_by !== viewerProfile?.id) {
        toast.error("Only the question author or topic creator can mark as answered");
        return;
      }

      const { error } = await supabase
        .from('topic_comments')
        .update({ is_answered: true })
        .eq('id', commentId);

      if (error) throw error;

      toast.success("Marked as answered!");
      refetchComments();
    } catch (error: any) {
      console.error('Error marking as answered:', error);
      toast.error(error.message || "Failed to update");
    }
  };

  if (!topicId) {
    return <div className="p-8 text-center text-muted-foreground">Topic ID missing.</div>;
  }

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading topic...</div>;
  }

  if (error || !topic) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Topic</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <ErrorDisplay
            title={error ? "Failed to load topic" : "Topic not found"}
            message={error ?? "The topic you're looking for doesn't exist."}
            onRetry={error ? handleRetry : undefined}
            variant="card"
          />
        </main>
      </div>
    );
  }

  const totalListens = clips.reduce((sum, clip) => sum + (clip.listens_count || 0), 0);
  const totalReactions = clips.reduce((sum, clip) => {
    const reactions = clip.reactions || {};
    return sum + Object.values(reactions).reduce((emojiSum, count) => {
      const numeric = typeof count === "number" ? count : Number(count);
      return emojiSum + (Number.isFinite(numeric) ? numeric : 0);
    }, 0);
  }, 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Hero Header */}
      <div className="relative bg-gradient-to-br from-primary/20 via-primary/10 to-background border-b border-border">
        <div className="absolute inset-0 bg-grid-pattern opacity-5" />
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div className="flex-1">
              <h1 className="text-lg font-semibold">Topic</h1>
            </div>
            {viewerProfile && (
              <Button
                variant={isFollowing ? "default" : "outline"}
                size="sm"
                onClick={handleFollow}
                disabled={isToggling}
                className="flex items-center gap-2"
              >
                {isFollowing ? (
                  <>
                    <BellOff className="h-4 w-4" />
                    Following
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4" />
                    Follow
                  </>
                )}
              </Button>
            )}
          </div>
        </header>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center shrink-0 border border-primary/20">
              {topic.communities ? (
                <span className="text-4xl">{topic.communities.avatar_emoji}</span>
              ) : (
                <Sparkles className="w-8 h-8 text-primary" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <h1 className="text-4xl font-bold mb-3 leading-tight">{topic.title}</h1>
                  {topic.description && (
                    <p className="text-lg text-muted-foreground leading-relaxed">{topic.description}</p>
                  )}
                </div>
              </div>

              {/* Meta Info */}
              <div className="flex items-center gap-4 flex-wrap mt-4">
                {topic.communities && (
                  <Link to={`/community/${topic.communities.slug}`}>
                    <Badge variant="secondary" className="text-sm px-3 py-1.5">
                      <span className="mr-1.5">{topic.communities.avatar_emoji}</span>
                      {topic.communities.name}
                    </Badge>
                  </Link>
                )}
                {topic.profiles && (
                  <Link to={`/profile/${topic.profiles.handle}`}>
                    <Badge variant="outline" className="text-sm px-3 py-1.5">
                      <span className="mr-1.5">{topic.profiles.emoji_avatar}</span>
                      @{topic.profiles.handle}
                    </Badge>
                  </Link>
                )}
                {topic.trending_score && topic.trending_score > 0 && (
                  <Badge variant="default" className="text-sm px-3 py-1.5">
                    <TrendingUp className="w-3 h-3 mr-1.5" />
                    Trending
                  </Badge>
                )}
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{format(new Date(topic.date), "MMM d, yyyy")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <Card className="p-4 rounded-2xl bg-background/60 backdrop-blur-sm border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Mic className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Clips</span>
              </div>
              <p className="text-2xl font-bold">{clips.length}</p>
            </Card>
            <Card className="p-4 rounded-2xl bg-background/60 backdrop-blur-sm border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Listens</span>
              </div>
              <p className="text-2xl font-bold">{totalListens.toLocaleString()}</p>
            </Card>
            <Card className="p-4 rounded-2xl bg-background/60 backdrop-blur-sm border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Heart className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Reactions</span>
              </div>
              <p className="text-2xl font-bold">{totalReactions.toLocaleString()}</p>
            </Card>
            <Card className="p-4 rounded-2xl bg-background/60 backdrop-blur-sm border-border/50">
              <div className="flex items-center gap-2 mb-2">
                <Bell className="w-4 h-4 text-primary" />
                <span className="text-xs text-muted-foreground uppercase tracking-wide">Followers</span>
              </div>
              <p className="text-2xl font-bold">{subscriberCount}</p>
            </Card>
          </div>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-8 space-y-8">

        {/* Discussion & Questions Section (Reddit-style) */}
        <section className="space-y-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold flex items-center gap-2 mb-1">
                <MessageCircle className="w-6 h-6 text-primary" />
                Discussion
              </h2>
              <p className="text-sm text-muted-foreground">
                Ask questions, share thoughts, and join the conversation
              </p>
            </div>
            {viewerProfile && (
              <Button
                variant="default"
                size="sm"
                onClick={() => setIsAddingComment(true)}
                className="flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {isAddingComment ? "Cancel" : "Comment"}
              </Button>
            )}
          </div>

          {/* Sort Options */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort by:</span>
            <Button
              variant={commentSortBy === 'newest' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCommentSortBy('newest')}
            >
              Newest
            </Button>
            <Button
              variant={commentSortBy === 'top' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCommentSortBy('top')}
            >
              Top
            </Button>
            <Button
              variant={commentSortBy === 'questions' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setCommentSortBy('questions')}
              className="flex items-center gap-1"
            >
              <HelpCircle className="w-3 h-3" />
              Questions
            </Button>
          </div>

          {/* Add Comment Form */}
          {isAddingComment && (
            <Card className="p-5 rounded-2xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-background">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="is-question"
                    checked={isQuestion}
                    onChange={(e) => setIsQuestion(e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="is-question" className="text-sm font-medium flex items-center gap-1 cursor-pointer">
                    <HelpCircle className="w-4 h-4" />
                    This is a question
                  </label>
                </div>
                <Textarea
                  placeholder={isQuestion ? "Ask your question about this topic..." : "Share your thoughts or start a conversation..."}
                  value={newCommentContent}
                  onChange={(e) => setNewCommentContent(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  className="text-base"
                />
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {newCommentContent.length}/2000 characters
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setIsAddingComment(false);
                        setNewCommentContent("");
                        setIsQuestion(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleAddComment}>
                      <Plus className="w-4 h-4 mr-1" />
                      {isQuestion ? "Ask Question" : "Post Comment"}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Unified Feed (Clips + Comments) - Reddit Style */}
          {isLoadingComments || isLoading ? (
            <Card className="p-8 rounded-2xl">
              <p className="text-muted-foreground text-center">Loading discussion...</p>
            </Card>
          ) : unifiedFeed.length > 0 ? (
            <div className="space-y-4">
              {unifiedFeed.map((item) => {
                if (item.type === 'clip') {
                  const clip = item.data as Clip;
                  return (
                    <div key={`clip-${clip.id}`} className="relative">
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary/20 rounded-full" />
                      <div className="ml-4">
                        <ClipCard
                          clip={clip}
                          captionsDefault={viewerProfile?.default_captions ?? true}
                        />
                      </div>
                    </div>
                  );
                } else {
                  const comment = item.data as TopicComment;
                  const isCollapsed = collapsedComments.has(comment.id);
                  
                  return (
                    <div key={`comment-${comment.id}`} className="relative">
                      {/* Reddit-style vertical line */}
                      <div className="absolute left-0 top-0 bottom-0 w-1 bg-border rounded-full" />
                      
                      <Card className={`ml-4 ${comment.is_question ? 'border-l-4 border-l-primary' : ''} ${isCollapsed ? 'opacity-60' : ''}`}>
                        {isCollapsed ? (
                          <div className="p-3 flex items-center gap-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => toggleCollapse(comment.id)}
                            >
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                            <div className="flex items-center gap-2 flex-1">
                              <span className="text-sm font-semibold">
                                {comment.profiles?.handle || 'Anonymous'}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {comment.upvotes_count} {comment.upvotes_count === 1 ? 'point' : 'points'}
                              </span>
                              {comment.is_question && (
                                <Badge variant="default" className="text-xs">
                                  <HelpCircle className="w-3 h-3 mr-1" />
                                  Question
                                </Badge>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 space-y-3">
                            {/* Comment Header */}
                            <div className="flex items-start gap-3">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 shrink-0"
                                onClick={() => toggleCollapse(comment.id)}
                              >
                                <Minus className="w-4 h-4 text-muted-foreground" />
                              </Button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  {comment.profiles && (
                                    <Link to={`/profile/${comment.profiles.handle}`}>
                                      <span className="font-semibold text-sm hover:text-primary transition-colors">
                                        {comment.profiles.handle}
                                      </span>
                                    </Link>
                                  )}
                                  <span className="text-xs text-muted-foreground">
                                    {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                  </span>
                                  {comment.is_question && (
                                    <Badge variant="default" className="text-xs">
                                      <HelpCircle className="w-3 h-3 mr-1" />
                                      Question
                                    </Badge>
                                  )}
                                  {comment.is_answered && (
                                    <Badge variant="secondary" className="text-xs">
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Answered
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm whitespace-pre-wrap break-words leading-relaxed mb-2">
                                  {comment.content}
                                </p>
                                
                                {/* Action Bar */}
                                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-7 px-2 text-xs ${comment.has_upvoted ? 'text-primary' : ''}`}
                                    onClick={() => handleUpvote(comment.id, comment.has_upvoted || false)}
                                  >
                                    <ChevronUp className={`w-3 h-3 mr-1 ${comment.has_upvoted ? 'fill-current' : ''}`} />
                                    {comment.upvotes_count}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => setReplyingToCommentId(replyingToCommentId === comment.id ? null : comment.id)}
                                  >
                                    <Reply className="w-3 h-3 mr-1" />
                                    Reply
                                  </Button>
                                  {comment.is_question && !comment.is_answered && (isAdmin || comment.profile_id === viewerProfile?.id || topic?.user_created_by === viewerProfile?.id) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => handleMarkAnswered(comment.id)}
                                    >
                                      <CheckCircle2 className="w-3 h-3 mr-1" />
                                      Mark Answered
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Reply Form */}
                            {replyingToCommentId === comment.id && (
                              <div className="ml-6 pl-4 border-l-2 border-primary/20">
                                <div className="space-y-2">
                                  <Textarea
                                    placeholder="Write a reply..."
                                    value={replyContent}
                                    onChange={(e) => setReplyContent(e.target.value)}
                                    rows={3}
                                    maxLength={2000}
                                    className="text-sm"
                                  />
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setReplyingToCommentId(null);
                                        setReplyContent("");
                                      }}
                                    >
                                      Cancel
                                    </Button>
                                    <Button size="sm" onClick={() => handleReply(comment.id)}>
                                      <Reply className="w-3 h-3 mr-1" />
                                      Reply
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Replies - Reddit-style threading */}
                            {comment.replies && comment.replies.length > 0 && (
                              <div className="ml-6 space-y-2">
                                {comment.replies.map((reply, idx) => (
                                  <div key={reply.id} className="relative pl-4 border-l-2 border-border/30">
                                    <div className="flex items-start gap-2 pt-2">
                                      <div className="text-lg shrink-0">
                                        {reply.profiles?.emoji_avatar || '👤'}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                          {reply.profiles && (
                                            <Link to={`/profile/${reply.profiles.handle}`}>
                                              <span className="font-semibold text-xs hover:text-primary transition-colors">
                                                {reply.profiles.handle}
                                              </span>
                                            </Link>
                                          )}
                                          <span className="text-xs text-muted-foreground">
                                            {formatDistanceToNow(new Date(reply.created_at), { addSuffix: true })}
                                          </span>
                                        </div>
                                        <p className="text-xs whitespace-pre-wrap break-words leading-relaxed mb-1">
                                          {reply.content}
                                        </p>
                                        <div className="flex items-center gap-2">
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className={`h-6 px-2 text-xs ${reply.has_upvoted ? 'text-primary' : ''}`}
                                            onClick={() => handleUpvote(reply.id, reply.has_upvoted || false)}
                                          >
                                            <ChevronUp className={`w-3 h-3 mr-0.5 ${reply.has_upvoted ? 'fill-current' : ''}`} />
                                            {reply.upvotes_count}
                                          </Button>
                                          <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 px-2 text-xs"
                                            onClick={() => {
                                              setReplyingToCommentId(comment.id);
                                              setReplyContent(`@${reply.profiles?.handle || ''} `);
                                            }}
                                          >
                                            <Reply className="w-3 h-3 mr-0.5" />
                                            Reply
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </Card>
                    </div>
                  );
                }
              })}
            </div>
          ) : (
            <Card className="p-12 rounded-2xl bg-gradient-to-br from-muted/50 to-background text-center border-2 border-dashed border-border">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              {viewerProfile ? (
                <>
                  <p className="text-lg font-semibold mb-2">No discussion yet</p>
                  <p className="text-muted-foreground mb-4">Be the first to share your voice or start a conversation!</p>
                  <div className="flex gap-2 justify-center">
                    <Button onClick={() => setIsAddingComment(true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Add Comment
                    </Button>
                    <Button variant="outline" asChild>
                      <Link to="/">
                        <Mic className="w-4 h-4 mr-2" />
                        Record Voice
                      </Link>
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-lg font-semibold mb-2">No discussion yet</p>
                  <p className="text-muted-foreground">Log in to join the discussion.</p>
                </>
              )}
            </Card>
          )}
        </section>
          </div>

          {/* Right Sidebar - Topic Discovery */}
          <aside className="hidden lg:block lg:col-span-4">
            <div className="sticky top-4">
              <TopicDiscovery
                profileId={viewerProfile?.id}
                currentTopicId={topicId || null}
                showRecommendations={true}
                showSimilar={true}
                showTrending={true}
              />
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default Topic;

