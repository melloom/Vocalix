import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Users, Mic, TrendingUp, Radio, ArrowRight, Newspaper, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useCommunities } from '@/hooks/useCommunity';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatDistanceToNow } from 'date-fns';
import { LazyImage } from '@/components/LazyImage';

interface LiveRoom {
  id: string;
  title: string;
  description: string | null;
  participant_count: number;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface NewsItem {
  id: string;
  title: string;
  content: string | null;
  created_at: string;
  community_id: string | null;
  communities?: {
    name: string;
    slug: string;
    avatar_emoji: string;
  } | null;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
  url?: string;
  source?: string;
  image?: string;
}

export const CommunityRecommendationsSidebar = () => {
  // Get trending/best communities (limit to 4 for homepage)
  const { communities, isLoading: isLoadingCommunities } = useCommunities({ limit: 4 });
  
  // Get live rooms
  const { data: liveRooms, isLoading: isLoadingRooms } = useQuery({
    queryKey: ['live-rooms-sidebar'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('live_rooms')
        .select(`
          id,
          title,
          description,
          participant_count,
          profiles (
            handle,
            emoji_avatar
          )
        `)
        .eq('status', 'live')
        .order('participant_count', { ascending: false })
        .limit(3);

      if (error) throw error;
      return (data || []) as LiveRoom[];
    },
  });

  // Get news from external API and community announcements
  const { data: newsItems, isLoading: isLoadingNews } = useQuery({
    queryKey: ['news-sidebar'],
    queryFn: async () => {
      const items: NewsItem[] = [];

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
                community_id: null,
                communities: null,
                profiles: null,
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
            ),
            profiles (
              handle,
              emoji_avatar
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
              profiles: Array.isArray(announcement.profiles) 
                ? announcement.profiles[0] 
                : announcement.profiles,
            });
          });
        }
      } catch (error) {
        // Silently fail if table doesn't exist
        console.debug('Could not load announcements:', error);
      }

      // Get recent news category clips
      try {
        const { data: newsClips, error: clipsError } = await supabase
          .from('clips')
          .select(`
            id,
            title,
            summary,
            created_at,
            profile_id,
            profiles (
              handle,
              emoji_avatar
            )
          `)
          .eq('status', 'live')
          .eq('category', 'news')
          .order('created_at', { ascending: false })
          .limit(2);

        if (!clipsError && newsClips) {
          newsClips.forEach((clip: any) => {
            items.push({
              id: clip.id,
              title: clip.title || 'News Update',
              content: clip.summary,
              created_at: clip.created_at,
              community_id: null,
              communities: null,
              profiles: Array.isArray(clip.profiles) 
                ? clip.profiles[0] 
                : clip.profiles,
            });
          });
        }
      } catch (error) {
        // Silently fail if category column doesn't exist
        console.debug('Could not load news clips:', error);
      }

      // Sort by date and return top 5
      return items
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 5);
    },
  });

  // Sort communities by trending score (member_count + clip_count + recency)
  // Limit to 3-4 communities for homepage display
  const trendingCommunities = communities
    ? [...communities].sort((a, b) => {
        const scoreA = a.member_count * 2 + a.clip_count * 3 + 
          (new Date(a.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 ? 10 : 0);
        const scoreB = b.member_count * 2 + b.clip_count * 3 + 
          (new Date(b.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000 ? 10 : 0);
        return scoreB - scoreA;
      }).slice(0, 4) // Show max 4 communities on homepage
    : [];

  return (
    <div className="space-y-6">
      {/* Best Communities */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Best Communities
          </h3>
          <Link 
            to="/communities" 
            className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          >
            See all
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        
        {isLoadingCommunities ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : trendingCommunities.length > 0 ? (
          <div className="space-y-3">
            {trendingCommunities.map((community) => (
              <Link
                key={community.id}
                to={`/community/${community.slug}`}
                className="block group"
              >
                <div className="p-3 rounded-xl border border-border/50 hover:border-primary/30 hover:bg-muted/50 transition-all">
                  <div className="flex items-start gap-3">
                    <div className="text-3xl shrink-0">{community.avatar_emoji}</div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">
                        {community.name}
                      </h4>
                      {community.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                          {community.description}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>{community.member_count.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Mic className="w-3 h-3" />
                          <span>{community.clip_count.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No communities yet
          </p>
        )}
      </Card>

      {/* News Section */}
      <Card className="p-4 rounded-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-primary" />
            News & Updates
          </h3>
        </div>
        
        {isLoadingNews ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : newsItems && newsItems.length > 0 ? (
          <div className="space-y-3">
            {newsItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border/50 hover:border-primary/30 hover:bg-muted/50 transition-all overflow-hidden group"
              >
                {item.url ? (
                  // External news article with image
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {item.image && (
                      <div className="relative w-full h-32 overflow-hidden bg-muted">
                        <LazyImage
                          src={item.image}
                          alt={item.title}
                          className="w-full h-full group-hover:scale-105 transition-transform duration-300"
                          width={undefined}
                          height={128}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent pointer-events-none" />
                      </div>
                    )}
                    <div className="p-3">
                      <div className="flex items-start gap-2 mb-2">
                        {!item.image && (
                          <Newspaper className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                            {item.title}
                          </h4>
                          {item.source && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Newspaper className="w-3 h-3" />
                              {item.source}
                            </p>
                          )}
                        </div>
                      </div>
                      {item.content && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
                          {item.content}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </a>
                ) : item.communities ? (
                  // Community announcement
                  <Link
                    to={`/community/${item.communities.slug}`}
                    className="block group"
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3 mb-2">
                        <div className="text-3xl shrink-0 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-2">
                          {item.communities.avatar_emoji}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {item.communities.name}
                          </p>
                        </div>
                      </div>
                      {item.content && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
                          {item.content}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </Link>
                ) : (
                  // News clip
                  <Link
                    to={`/clip/${item.id}`}
                    className="block group"
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3 mb-2">
                        {item.profiles && (
                          <div className="text-2xl shrink-0 bg-gradient-to-br from-primary/10 to-primary/5 rounded-lg p-2">
                            {item.profiles.emoji_avatar}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-sm line-clamp-2 group-hover:text-primary transition-colors">
                            {item.title}
                          </h4>
                          {item.profiles && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <Mic className="w-3 h-3" />
                              @{item.profiles.handle}
                            </p>
                          )}
                        </div>
                      </div>
                      {item.content && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-2 leading-relaxed">
                          {item.content}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground text-center py-4">
            No news updates
          </p>
        )}
      </Card>

      {/* Live Rooms */}
      {liveRooms && liveRooms.length > 0 && (
        <Card className="p-4 rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Radio className="w-5 h-5 text-primary" />
              Live Now
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
              {liveRooms.slice(0, 3).map((room) => (
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
                        {room.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                            {room.description}
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            <span>{room.participant_count}</span>
                          </div>
                          {room.profiles && (
                            <span className="truncate">@{room.profiles.handle}</span>
                          )}
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
    </div>
  );
};

