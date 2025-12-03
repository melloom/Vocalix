import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Calendar, Users, Bell, BellOff, Plus, TrendingUp, Mic, Heart, Sparkles, MessageCircle, ChevronUp, ChevronDown, Reply, CheckCircle2, HelpCircle, Minus, Headphones, Star, Zap, Award, Flame, Radio, Compass, Type, Activity } from "lucide-react";
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
import { CreatePostModal } from "@/components/CreatePostModal";
import { PostCard } from "@/components/PostCard";

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
  tags?: string[] | null;
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

interface Post {
  id: string;
  profile_id: string | null;
  community_id: string | null;
  topic_id: string | null;
  post_type: 'text' | 'video' | 'audio' | 'link';
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
  const [isCreatingPost, setIsCreatingPost] = useState(false);
  const [newCommentContent, setNewCommentContent] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);
  const [replyingToCommentId, setReplyingToCommentId] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState("");
  const [commentSortBy, setCommentSortBy] = useState<'newest' | 'top' | 'questions'>('newest');
  const [collapsedComments, setCollapsedComments] = useState<Set<string>>(new Set());
  const { isFollowing, toggleFollow, isToggling } = useTopicFollow(topicId || null);
  const queryClient = useQueryClient();

  // Fetch topic posts
  const { data: posts, isLoading: isLoadingPosts, refetch: refetchPosts } = useQuery({
    queryKey: ['topic-posts', topicId],
    queryFn: async () => {
      if (!topicId) return [];
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          ),
          communities (
            name,
            slug
          ),
          clip_flairs (
            id,
            name,
            color,
            background_color
          )
        `)
        .eq('topic_id', topicId)
        .eq('status', 'live')
        .is('deleted_at', null)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as Post[];
    },
    enabled: !!topicId,
  });

  // Fetch featured/top content for Welcome Garden
  const { data: featuredClips } = useQuery({
    queryKey: ['featured-clips-welcome-garden', topicId],
    queryFn: async () => {
      if (!topicId || topic?.title !== "Welcome Garden") return [];
      // Get top clips by listens and reactions
      const { data, error } = await supabase
        .from('clips')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('topic_id', topicId)
        .eq('status', 'live')
        .order('listens_count', { ascending: false })
        .limit(3);
      
      if (error) throw error;
      return (data || []) as Clip[];
    },
    enabled: !!topicId && topic?.title === "Welcome Garden",
  });

  // Fetch new voices (recent clips from new users)
  const { data: newVoices } = useQuery({
    queryKey: ['new-voices-welcome-garden', topicId],
    queryFn: async () => {
      if (!topicId || topic?.title !== "Welcome Garden") return [];
      // Get recent clips from users who joined recently or have few clips
      const { data, error } = await supabase
        .from('clips')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar,
            joined_at
          )
        `)
        .eq('topic_id', topicId)
        .eq('status', 'live')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return (data || []) as Clip[];
    },
    enabled: !!topicId && topic?.title === "Welcome Garden",
  });

  // Fetch trending posts for Welcome Garden
  const { data: trendingPosts } = useQuery({
    queryKey: ['trending-posts-welcome-garden', topicId],
    queryFn: async () => {
      if (!topicId || topic?.title !== "Welcome Garden") return [];
      const { data, error } = await supabase
        .from('posts')
        .select(`
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('topic_id', topicId)
        .eq('status', 'live')
        .is('deleted_at', null)
        .order('vote_score', { ascending: false })
        .limit(5);
      
      if (error) throw error;
      return (data || []) as Post[];
    },
    enabled: !!topicId && topic?.title === "Welcome Garden",
  });

  // Fetch news for Welcome Garden
  const { data: newsItems } = useQuery({
    queryKey: ['news-welcome-garden'],
    queryFn: async () => {
      if (topic?.title !== "Welcome Garden") return [];
      const items: any[] = [];

      // Get news from external API via Edge Function
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const { data: { session } } = await supabase.auth.getSession();
        const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
        const token = session?.access_token || anonKey;

        const response = await fetch(`${supabaseUrl}/functions/v1/fetch-news`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.ok) {
          const newsData = await response.json();
          if (newsData.news && Array.isArray(newsData.news)) {
            newsData.news.forEach((article: any) => {
              items.push({
                id: `news-${article.id}`,
                title: article.title,
                content: article.content,
                created_at: article.publishedAt,
                url: article.url,
                source: article.source,
                image: article.image,
              });
            });
          }
        }
      } catch (error) {
        console.debug('Could not load external news:', error);
      }

      // Get recent community announcements
      try {
        const { data: announcements, error: announcementsError } = await supabase
          .from('community_announcements')
          .select(`
            id,
            title,
            content,
            created_at,
            community_id,
            communities (
              name,
              slug,
              avatar_emoji
            )
          `)
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(3);

        if (!announcementsError && announcements) {
          announcements.forEach((announcement: any) => {
            items.push({
              id: announcement.id,
              title: announcement.title,
              content: announcement.content,
              created_at: announcement.created_at,
              community_id: announcement.community_id,
              communities: Array.isArray(announcement.communities) 
                ? announcement.communities[0] 
                : announcement.communities,
            });
          });
        }
      } catch (error) {
        console.debug('Could not load announcements:', error);
      }

      return items
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8);
    },
    enabled: topic?.title === "Welcome Garden",
  });

  // Fetch trending topics
  const { data: trendingTopics } = useQuery({
    queryKey: ['trending-topics-welcome-garden'],
    queryFn: async () => {
      if (topic?.title !== "Welcome Garden") return [];
      const { data, error } = await supabase
        .from('topics')
        .select(`
          id,
          title,
          description,
          trending_score,
          clips_count,
          date,
          communities (
            name,
            slug,
            avatar_emoji
          )
        `)
        .eq('is_active', true)
        .not('trending_score', 'is', null)
        .order('trending_score', { ascending: false })
        .limit(6);
      
      if (error) throw error;
      return (data || []) as Topic[];
    },
    enabled: topic?.title === "Welcome Garden",
  });

  // Fetch popular communities
  const { data: popularCommunities } = useQuery({
    queryKey: ['popular-communities-welcome-garden'],
    queryFn: async () => {
      if (topic?.title !== "Welcome Garden") return [];
      const { data, error } = await supabase
        .from('communities')
        .select(`
          id,
          name,
          slug,
          avatar_emoji,
          description,
          member_count,
          clip_count
        `)
        .eq('is_active', true)
        .order('member_count', { ascending: false })
        .limit(6);
      
      if (error) throw error;
      return (data || []);
    },
    enabled: topic?.title === "Welcome Garden",
  });

  // Fetch recent activity (all recent clips/posts across platform)
  const { data: recentActivity } = useQuery({
    queryKey: ['recent-activity-welcome-garden'],
    queryFn: async () => {
      if (topic?.title !== "Welcome Garden") return [];
      const { data: clips, error: clipsError } = await supabase
        .from('clips')
        .select(`
          id,
          title,
          created_at,
          listens_count,
          reactions_count,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('status', 'live')
        .order('created_at', { ascending: false })
        .limit(5);
      
      if (clipsError) throw clipsError;
      return (clips || []);
    },
    enabled: topic?.title === "Welcome Garden",
  });

  // Fetch top creators
  const { data: topCreators } = useQuery({
    queryKey: ['top-creators-welcome-garden'],
    queryFn: async () => {
      if (topic?.title !== "Welcome Garden") return [];
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          handle,
          emoji_avatar,
          bio
        `)
        .not('handle', 'is', null)
        .limit(8);
      
      if (error) throw error;
      return (data || []);
    },
    enabled: topic?.title === "Welcome Garden",
  });

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

  // Combine clips, posts, and comments into unified feed (Reddit-style)
  const unifiedFeed = useMemo(() => {
    const items: Array<{ type: 'clip' | 'post' | 'comment'; data: Clip | Post | TopicComment; created_at: string; upvotes?: number }> = [];
    
    // Add clips
    clips.forEach(clip => {
      items.push({ 
        type: 'clip', 
        data: clip, 
        created_at: clip.created_at,
        upvotes: 0
      });
    });
    
    // Add posts
    if (posts) {
      posts.forEach(post => {
        items.push({ 
          type: 'post', 
          data: post, 
          created_at: post.created_at,
          upvotes: post.vote_score
        });
      });
    }
    
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
      // Sort by upvotes/votes (comments/posts) or listens (clips), then by date
      return items.sort((a, b) => {
        const aScore = a.type === 'comment' 
          ? (a.data as TopicComment).upvotes_count 
          : a.type === 'post'
          ? (a.data as Post).vote_score
          : (a.data as Clip).listens_count || 0;
        const bScore = b.type === 'comment'
          ? (b.data as TopicComment).upvotes_count
          : b.type === 'post'
          ? (b.data as Post).vote_score
          : (b.data as Clip).listens_count || 0;
        
        if (bScore !== aScore) {
          return bScore - aScore;
        }
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (commentSortBy === 'questions') {
      // Only show questions and clips
      return items
        .filter(item => item.type === 'clip' || item.type === 'post' || (item.data as TopicComment).is_question)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else {
      // Sort by created_at (newest first)
      return items.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    }
  }, [clips, posts, comments, commentSortBy]);

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" asChild className="rounded-full">
                <Link to="/">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div>
                <h1 className="text-xl font-bold">Topic</h1>
              </div>
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
        </div>
      </header>

      <div className={`${topic.title === "Welcome Garden" ? "w-full" : "max-w-7xl mx-auto"} px-4 sm:px-6 lg:px-8 py-6`}>
        <div className="flex gap-6">
          {/* Left Sidebar - Only for Welcome Garden */}
          {topic.title === "Welcome Garden" && (
            <aside className="hidden lg:block w-80 shrink-0">
            <div className="sticky top-4 space-y-4">
              {topic.title === "Welcome Garden" ? (
                <>
                  {/* News & Updates */}
                  {newsItems && newsItems.length > 0 && (
                    <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Radio className="w-4 h-4 text-primary" />
                          <h3 className="font-semibold text-sm">News & Updates</h3>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {newsItems.slice(0, 5).map((item) => (
                          <div key={item.id} className="pb-2 border-b border-black/10 dark:border-border/30 last:border-0 last:pb-0 hover:bg-primary/5 dark:hover:bg-muted/30 rounded px-2 py-1 -mx-2 transition-colors">
                            {item.url ? (
                              <a href={item.url} target="_blank" rel="noopener noreferrer" className="block group">
                                <h4 className="font-medium text-sm mb-1 line-clamp-2 group-hover:text-primary transition-colors">
                                  {item.title}
                                </h4>
                                {item.content && (
                                  <p className="text-xs text-muted-foreground line-clamp-2 mb-1">
                                    {item.content}
                                  </p>
                                )}
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {item.source && <span>{item.source}</span>}
                                  {item.communities && (
                                    <Link to={`/community/${item.communities.slug}`} className="hover:text-foreground">
                                      <span className="flex items-center gap-1">
                                        <span>{item.communities.avatar_emoji}</span>
                                        <span>r/{item.communities.name}</span>
                                      </span>
                                    </Link>
                                  )}
                                </div>
                              </a>
                            ) : (
                              <div>
                                <h4 className="font-medium text-sm mb-1">{item.title}</h4>
                                {item.content && (
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {item.content}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Trending Topics */}
                  {trendingTopics && trendingTopics.length > 0 && (
                    <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-primary" />
                          <h3 className="font-semibold text-sm">Trending Topics</h3>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {trendingTopics.map((t) => (
                          <Link
                            key={t.id}
                            to={`/topic/${t.id}`}
                            className="block p-2 rounded border border-black/10 dark:border-transparent hover:border-primary/40 dark:hover:border-border/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer"
                          >
                            <div className="flex items-start gap-2">
                              {t.communities && (
                                <span className="text-base shrink-0">{t.communities.avatar_emoji}</span>
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm mb-0.5 line-clamp-1">{t.title}</h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {t.communities && <span>r/{t.communities.name}</span>}
                                  <span>•</span>
                                  <span>{t.clips_count || 0} clips</span>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Popular Communities */}
                  {popularCommunities && popularCommunities.length > 0 && (
                    <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-primary" />
                          <h3 className="font-semibold text-sm">Popular Communities</h3>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {popularCommunities.map((community: any) => (
                          <Link
                            key={community.id}
                            to={`/community/${community.slug}`}
                            className="block p-2 rounded border border-black/10 dark:border-transparent hover:border-primary/40 dark:hover:border-border/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-lg shrink-0">{community.avatar_emoji}</span>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm mb-0.5">r/{community.name}</h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  <span>{community.member_count || 0} members</span>
                                  <span>•</span>
                                  <span>{community.clip_count || 0} clips</span>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Recent Activity */}
                  {recentActivity && recentActivity.length > 0 && (
                    <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Activity className="w-4 h-4 text-primary" />
                          <h3 className="font-semibold text-sm">Recent Activity</h3>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {recentActivity.slice(0, 4).map((clip: any) => (
                          <Link
                            key={clip.id}
                            to={`/clip/${clip.id}`}
                            className="block p-2 rounded hover:bg-muted/50 transition-colors"
                          >
                            <div className="flex items-start gap-2">
                              {clip.profiles && (
                                <span className="text-base shrink-0">{clip.profiles.emoji_avatar}</span>
                              )}
                              <div className="flex-1 min-w-0">
                                <h4 className="font-medium text-sm mb-0.5 line-clamp-1">
                                  {clip.title || 'Untitled Clip'}
                                </h4>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                  {clip.profiles && <span>u/{clip.profiles.handle}</span>}
                                  <span>•</span>
                                  <span>{clip.listens_count || 0} listens</span>
                                </div>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Top Creators */}
                  {topCreators && topCreators.length > 0 && (
                    <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Award className="w-4 h-4 text-primary" />
                          <h3 className="font-semibold text-sm">Featured Creators</h3>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {topCreators.slice(0, 6).map((creator: any) => (
                          <Link
                            key={creator.id}
                            to={`/profile/${creator.handle}`}
                            className="flex flex-col items-center gap-1 p-2 rounded hover:bg-muted/50 transition-colors"
                            title={creator.handle}
                          >
                            <span className="text-xl">{creator.emoji_avatar || '👤'}</span>
                            <span className="text-xs font-medium text-center line-clamp-1">u/{creator.handle}</span>
                          </Link>
                        ))}
                      </div>
                    </Card>
                  )}

                  {/* Getting Started Guide */}
                  <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors bg-muted/30">
                    <h3 className="font-semibold text-sm mb-2">Getting Started</h3>
                    <div className="space-y-2 text-xs">
                      <div>
                        <p className="font-medium text-foreground mb-0.5 flex items-center gap-1">
                          <Headphones className="h-3 w-3 text-primary" /> Listen First
                        </p>
                        <p className="text-muted-foreground">
                          Play a few voices to get the vibe.
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-0.5 flex items-center gap-1">
                          <Mic className="h-3 w-3 text-primary" /> Share Your Voice
                        </p>
                        <p className="text-muted-foreground">
                          30 seconds max. Keep it real.
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-foreground mb-0.5 flex items-center gap-1">
                          <MessageCircle className="h-3 w-3 text-primary" /> Engage
                        </p>
                        <p className="text-muted-foreground">
                          Reply, react, or upvote what resonates.
                        </p>
                      </div>
                    </div>
                  </Card>
                </>
              ) : (
                <TopicDiscovery
                  profileId={viewerProfile?.id}
                  currentTopicId={topicId || null}
                  showRecommendations={true}
                  showSimilar={true}
                  showTrending={true}
                />
              )}
            </div>
          </aside>
          )}

          {/* Regular Topic Sidebar - For non-Welcome Garden topics */}
          {topic.title !== "Welcome Garden" && (
            <aside className="hidden lg:block w-80 shrink-0">
              <div className="sticky top-4 space-y-4">
                <TopicDiscovery
                  profileId={viewerProfile?.id}
                  currentTopicId={topicId || null}
                  showRecommendations={true}
                  showSimilar={true}
                  showTrending={true}
                />
              </div>
            </aside>
          )}

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Welcome Garden Hub - Reddit Style */}
            {topic.title === "Welcome Garden" ? (
              <>
                {/* Hub Header - Clean & Simple */}
                <Card className="p-5 mb-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-3xl">🌱</span>
                      </div>
                      <div>
                        <h1 className="text-2xl font-bold mb-1">FIRST VOICES</h1>
                        <p className="text-sm text-muted-foreground">
                          The front door of FIRST VOICES. Introduce yourself and connect with the community.
                        </p>
                      </div>
                    </div>
                    {viewerProfile && (
                      <Button
                        variant={isFollowing ? "default" : "outline"}
                        size="sm"
                        onClick={handleFollow}
                        disabled={isToggling}
                      >
                        {isFollowing ? (
                          <>
                            <BellOff className="h-4 w-4 mr-1" />
                            Joined
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-1" />
                            Join
                          </>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Stats Row */}
                  <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/30 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span className="font-medium text-foreground">{subscriberCount}</span>
                      <span>members</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mic className="w-4 h-4" />
                      <span className="font-medium text-foreground">{clips.length}</span>
                      <span>voices</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MessageCircle className="w-4 h-4" />
                      <span className="font-medium text-foreground">{posts?.length || 0}</span>
                      <span>posts</span>
                    </div>
                  </div>

                  {/* Quick Actions - Horizontal */}
                  {viewerProfile && (
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border/30">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCreatingPost(true)}
                        className="flex items-center gap-2"
                      >
                        <Type className="w-4 h-4" />
                        Create Post
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setIsAddingComment(true)}
                        className="flex items-center gap-2"
                      >
                        <MessageCircle className="w-4 h-4" />
                        Comment
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate('/')}
                        className="flex items-center gap-2"
                      >
                        <Mic className="w-4 h-4" />
                        Record
                      </Button>
                    </div>
                  )}
                </Card>

                {/* Main Feed - Clean Feed Only */}
                <div className="space-y-3">
                  {/* Featured Voices - Show in feed */}
                  {featuredClips && featuredClips.length > 0 && (
                    <>
                      {featuredClips.map((clip) => (
                        <div key={clip.id} className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-border/30 rounded-full" />
                          <div className="ml-4">
                            <ClipCard
                              clip={clip}
                              captionsDefault={viewerProfile?.default_captions ?? true}
                            />
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Trending Posts - Show in feed */}
                  {trendingPosts && trendingPosts.length > 0 && (
                    <>
                      {trendingPosts.map((post) => (
                        <div key={post.id} className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-border/30 rounded-full" />
                          <div className="ml-4">
                            <PostCard post={post as any} onPostUpdate={() => refetchPosts()} />
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* New Voices - Show in feed */}
                  {newVoices && newVoices.length > 0 && (
                    <>
                      {newVoices.map((clip) => (
                        <div key={clip.id} className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-border/30 rounded-full" />
                          <div className="ml-4">
                            <ClipCard
                              clip={clip}
                              captionsDefault={viewerProfile?.default_captions ?? true}
                            />
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* Regular Topic Header - Reddit Style */}
                <Card className="p-4 mb-4 border border-border/30">
                  <div className="flex gap-3">
                    {/* Left Icon */}
                    <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center shrink-0">
                      {topic.communities ? (
                        <span className="text-2xl">{topic.communities.avatar_emoji}</span>
                      ) : (
                        <Sparkles className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <h1 className="text-2xl font-bold mb-2">{topic.title}</h1>
                      
                      {/* Meta Info - Reddit Style */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mb-3">
                        {topic.communities && (
                          <Link to={`/community/${topic.communities.slug}`} className="hover:text-foreground">
                            <span className="flex items-center gap-1">
                              <span>{topic.communities.avatar_emoji}</span>
                              <span className="font-medium">r/{topic.communities.name}</span>
                            </span>
                          </Link>
                        )}
                        {topic.profiles && (
                          <Link to={`/profile/${topic.profiles.handle}`} className="hover:text-foreground">
                            <span className="flex items-center gap-1">
                              <span>Posted by</span>
                              <span className="font-medium">u/{topic.profiles.handle}</span>
                            </span>
                          </Link>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{format(new Date(topic.date), "MMM d, yyyy")}</span>
                        </span>
                        {topic.trending_score && topic.trending_score > 0 && (
                          <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                            🔥 Trending
                          </Badge>
                        )}
                      </div>

                      {/* Description */}
                      {topic.description && (
                        <p className="text-sm text-muted-foreground leading-relaxed">{topic.description}</p>
                      )}
                    </div>
                  </div>

                  {/* Stats - Simple Row */}
                  <div className="flex items-center gap-6 mt-4 pt-4 border-t border-border/30 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Mic className="w-4 h-4" />
                      <span className="font-medium text-foreground">{clips.length}</span>
                      <span>clips</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="w-4 h-4" />
                      <span className="font-medium text-foreground">{totalListens.toLocaleString()}</span>
                      <span>listens</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Heart className="w-4 h-4" />
                      <span className="font-medium text-foreground">{totalReactions.toLocaleString()}</span>
                      <span>reactions</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Bell className="w-4 h-4" />
                      <span className="font-medium text-foreground">{subscriberCount}</span>
                      <span>followers</span>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {/* Discussion Section */}
            <section className="space-y-4">
              {/* Daily reflection helper for today's topic */}
              {topic.date === new Date().toISOString().slice(0, 10) && (
                <Card className="p-3 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors bg-muted/30">
                  <p className="text-sm font-medium mb-1">Daily reflection</p>
                  <p className="text-xs text-muted-foreground">
                    How did today feel? Share a short voice or comment about your day.
                  </p>
                </Card>
              )}

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold">Discussion</h2>
                {viewerProfile && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => setIsCreatingPost(true)}
                      className="flex items-center gap-2"
                    >
                      <Plus className="w-4 h-4" />
                      Create Post
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsAddingComment(true)}
                      className="flex items-center gap-2"
                    >
                      <MessageCircle className="w-4 h-4" />
                      {isAddingComment ? "Cancel" : "Comment"}
                    </Button>
                  </div>
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
                <Card className="p-4 mb-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
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

              {/* Unified Feed (Clips + Posts + Comments) - Reddit Style */}
              {isLoadingComments || isLoadingPosts || isLoading ? (
                <Card className="p-8 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                  <p className="text-muted-foreground text-center">Loading discussion...</p>
                </Card>
              ) : unifiedFeed.length > 0 ? (
                <div className="space-y-3">
                  {unifiedFeed.map((item) => {
                    if (item.type === 'clip') {
                      const clip = item.data as Clip;
                      return (
                        <div key={`clip-${clip.id}`} className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-border/30 rounded-full" />
                          <div className="ml-4">
                            <ClipCard
                              clip={clip}
                              captionsDefault={viewerProfile?.default_captions ?? true}
                            />
                          </div>
                        </div>
                      );
                    } else if (item.type === 'post') {
                      const post = item.data as Post;
                      return (
                        <div key={`post-${post.id}`} className="relative">
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-border/30 rounded-full" />
                          <div className="ml-4">
                            <PostCard post={post} onPostUpdate={() => refetchPosts()} />
                          </div>
                        </div>
                      );
                    } else {
                      const comment = item.data as TopicComment;
                      const isCollapsed = collapsedComments.has(comment.id);
                      
                      return (
                        <div key={`comment-${comment.id}`} className="relative">
                          {/* Reddit-style vertical line */}
                          <div className="absolute left-0 top-0 bottom-0 w-1 bg-border/30 rounded-full" />
                          
                          <Card className={`ml-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors ${comment.is_question ? 'border-l-2 border-l-primary' : ''} ${isCollapsed ? 'opacity-60' : ''}`}>
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
                                    <Badge variant="secondary" className="text-xs h-5 px-1.5">
                                      <HelpCircle className="w-3 h-3 mr-1" />
                                      Question
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <div className="p-3 space-y-2">
                                {/* Comment Header */}
                                <div className="flex items-start gap-2">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 w-6 p-0 shrink-0"
                                    onClick={() => toggleCollapse(comment.id)}
                                  >
                                    <Minus className="w-4 h-4 text-muted-foreground" />
                                  </Button>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap text-xs">
                                      {comment.profiles && (
                                        <Link to={`/profile/${comment.profiles.handle}`}>
                                          <span className="font-semibold hover:text-primary transition-colors">
                                            u/{comment.profiles.handle}
                                          </span>
                                        </Link>
                                      )}
                                      <span className="text-muted-foreground">
                                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                                      </span>
                                      {comment.is_question && (
                                        <Badge variant="secondary" className="h-4 px-1.5 text-xs">
                                          <HelpCircle className="w-3 h-3 mr-0.5" />
                                          Question
                                        </Badge>
                                      )}
                                      {comment.is_answered && (
                                        <Badge variant="secondary" className="h-4 px-1.5 text-xs">
                                          <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                          Answered
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm whitespace-pre-wrap break-words leading-relaxed mb-2">
                                      {comment.content}
                                    </p>
                                    
                                    {/* Action Bar */}
                                    <div className="flex items-center gap-2 pt-2 border-t border-border/30">
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

                                    {/* Reply Form */}
                                    {replyingToCommentId === comment.id && (
                                      <div className="ml-6 pl-4 border-l-2 border-primary/20 mt-2">
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
                                      <div className="ml-6 space-y-2 mt-2">
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
                                                        u/{reply.profiles.handle}
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
                                </div>
                              </div>
                            )}
                          </Card>
                        </div>
                  );
                }
              })}
            </div>
              ) : (
                <Card className="p-12 text-center border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
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
          </main>

          {/* Right Sidebar - Only for Welcome Garden */}
          {topic.title === "Welcome Garden" && (
            <aside className="hidden lg:block w-80 shrink-0">
              <div className="sticky top-4 space-y-4">
                {/* Recent Activity */}
                {recentActivity && recentActivity.length > 0 && (
                  <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold text-sm">Recent Activity</h3>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {recentActivity.slice(0, 4).map((clip: any) => (
                        <Link
                          key={clip.id}
                          to={`/clip/${clip.id}`}
                          className="block p-2 rounded hover:bg-muted/50 transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            {clip.profiles && (
                              <span className="text-base shrink-0">{clip.profiles.emoji_avatar}</span>
                            )}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm mb-0.5 line-clamp-1">
                                {clip.title || 'Untitled Clip'}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                {clip.profiles && <span>u/{clip.profiles.handle}</span>}
                                <span>•</span>
                                <span>{clip.listens_count || 0} listens</span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </Card>
                )}

                {/* Top Creators */}
                {topCreators && topCreators.length > 0 && (
                  <Card className="p-4 border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Award className="w-4 h-4 text-primary" />
                        <h3 className="font-semibold text-sm">Featured Creators</h3>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {topCreators.slice(0, 6).map((creator: any) => (
                        <Link
                          key={creator.id}
                          to={`/profile/${creator.handle}`}
                          className="flex flex-col items-center gap-1 p-2 rounded hover:bg-muted/50 transition-colors"
                          title={creator.handle}
                        >
                          <span className="text-xl">{creator.emoji_avatar || '👤'}</span>
                          <span className="text-xs font-medium text-center line-clamp-1">u/{creator.handle}</span>
                        </Link>
                      ))}
                    </div>
                  </Card>
                )}

                {/* TopicDiscovery for Welcome Garden */}
                <TopicDiscovery
                  profileId={viewerProfile?.id}
                  currentTopicId={topicId || null}
                  showRecommendations={true}
                  showSimilar={false}
                  showTrending={true}
                />
              </div>
            </aside>
          )}

          {/* Right Sidebar - For regular topics */}
          {topic.title !== "Welcome Garden" && (
            <aside className="hidden lg:block w-80 shrink-0">
              <div className="sticky top-4 space-y-4">
                <TopicDiscovery
                  profileId={viewerProfile?.id}
                  currentTopicId={topicId || null}
                  showRecommendations={true}
                  showSimilar={true}
                  showTrending={true}
                />
              </div>
            </aside>
          )}

        </div>
      </div>

      {topicId && (
        <CreatePostModal
          open={isCreatingPost}
          onOpenChange={setIsCreatingPost}
          topicId={topicId}
          onSuccess={() => {
            refetchPosts();
            queryClient.invalidateQueries({ queryKey: ['topic-feed', topicId] });
          }}
        />
      )}
    </div>
  );
};

export default Topic;

