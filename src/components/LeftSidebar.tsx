import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { TrendingUp, Radio, Users, Sparkles, ArrowRight, Clock, Plus, Compass } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { CreateTopicModal } from './CreateTopicModal';

interface Topic {
  id: string;
  title: string;
  description: string | null;
  date: string;
  is_active?: boolean;
  clips_count?: number;
  trending_score?: number;
  community_id?: string | null;
  user_created_by?: string | null;
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

interface LiveRoom {
  id: string;
  title: string;
  description: string | null;
  participant_count: number;
}

export const LeftSidebar = () => {
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);

  // Get live rooms
  const { data: liveRooms, isLoading: isLoadingRooms } = useQuery({
    queryKey: ['live-rooms-left-sidebar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_rooms')
        .select(`
          id,
          title,
          description,
          participant_count
        `)
        .eq('status', 'live')
        .order('participant_count', { ascending: false })
        .limit(2);

      if (error) throw error;
      return (data || []) as LiveRoom[];
    },
  });

  // Get trending topics using the RPC function (max 8)
  // Falls back to recent topics if no trending topics exist
  const { data: topics, isLoading: isLoadingTopics, refetch: refetchTopics } = useQuery({
    queryKey: ['trending-topics'],
    queryFn: async () => {
      // First try to get trending topics
      const { data: trendingData, error: trendingError } = await supabase.rpc('get_trending_topics', { p_limit: 8 });

      if (!trendingError && trendingData && trendingData.length > 0) {
        // We have trending topics, return them
        return trendingData as Topic[];
      }

      // No trending topics yet, fall back to recent topics
      // Try with RPC first, then fallback to direct query
      if (trendingError) {
        // RPC might not exist yet, try direct query
        const { data: recentData, error: recentError } = await supabase
          .from('topics')
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
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(8);

        if (recentError) throw recentError;
        return (recentData || []) as Topic[];
      }

      // RPC worked but returned empty, get recent topics
      const { data: recentData, error: recentError } = await supabase
        .from('topics')
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
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(8);

      if (recentError) throw recentError;
      return (recentData || []) as Topic[];
    },
  });

  return (
    <div className="space-y-6">
      {/* Trending Topics */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Trending Topics
          </h3>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setIsCreateTopicOpen(true)}
            title="Create Topic"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        
        {isLoadingTopics ? (
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : topics && topics.length > 0 ? (
          <div className="space-y-3">
            {topics.map((topic) => (
              <Link
                key={topic.id}
                to={`/topic/${topic.id}`}
                className="block group"
              >
                <div className="p-3 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-muted/50 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      {topic.communities ? (
                        <span className="text-xl">{topic.communities.avatar_emoji}</span>
                      ) : (
                        <TrendingUp className="w-5 h-5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                        {topic.title}
                      </h4>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {topic.communities && (
                          <Badge variant="secondary" className="text-xs">
                            {topic.communities.name}
                          </Badge>
                        )}
                        {topic.profiles && (
                          <Badge variant="outline" className="text-xs">
                            @{topic.profiles.handle}
                          </Badge>
                        )}
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>
                            {new Date(topic.date).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                            })}
                          </span>
                        </div>
                        {topic.clips_count !== undefined && topic.clips_count > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {topic.clips_count} {topic.clips_count === 1 ? 'clip' : 'clips'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="text-center py-4 space-y-2">
            <p className="text-sm text-muted-foreground">
              No topics available yet
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsCreateTopicOpen(true)}
              className="text-xs"
            >
              <Plus className="w-3 h-3 mr-1" />
              Create First Topic
            </Button>
          </div>
        )}

        {/* View All Topics Button */}
        <Link
          to="/topics"
          className="block w-full mt-4"
        >
          <Button
            variant="outline"
            className="w-full flex items-center justify-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            View All Topics
          </Button>
        </Link>
      </Card>

      <CreateTopicModal
        open={isCreateTopicOpen}
        onOpenChange={setIsCreateTopicOpen}
        onSuccess={() => {
          refetchTopics();
          setIsCreateTopicOpen(false);
        }}
      />

      {/* Live Rooms Preview */}
      {liveRooms && liveRooms.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              Live Rooms
            </h3>
            <Link 
              to="/live-rooms" 
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
            >
              See all
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          
          {isLoadingRooms ? (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {liveRooms.slice(0, 2).map((room) => (
                <Link
                  key={room.id}
                  to={`/live-room/${room.id}`}
                  className="block group"
                >
                  <div className="p-3 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-muted/50 transition-all">
                    <div className="flex items-start gap-3">
                      <div className="relative shrink-0">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <Radio className="w-5 h-5 text-primary" />
                        </div>
                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-background animate-pulse" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                          {room.title}
                        </h4>
                        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                          <Users className="w-3 h-3" />
                          <span>{room.participant_count} participants</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Quick Stats */}
      <Card className="p-4 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5">
        <h3 className="text-lg font-semibold mb-4">Quick Links</h3>
        <div className="space-y-2">
          <Link
            to="/communities"
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-primary/10 transition-colors text-sm"
          >
            <Users className="w-4 h-4" />
            <span>Explore Communities</span>
          </Link>
          <Link
            to="/live-rooms"
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-primary/10 transition-colors text-sm"
          >
            <Radio className="w-4 h-4" />
            <span>Join Live Rooms</span>
          </Link>
          <Link
            to="/challenges"
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-primary/10 transition-colors text-sm"
          >
            <Sparkles className="w-4 h-4" />
            <span>Daily Challenges</span>
          </Link>
          <Link
            to="/discovery"
            className="flex items-center gap-2 p-2 rounded-lg hover:bg-primary/10 transition-colors text-sm"
          >
            <Compass className="w-4 h-4" />
            <span>Discovery</span>
          </Link>
        </div>
      </Card>
    </div>
  );
};

