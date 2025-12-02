import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Users, Mic, TrendingUp, Radio, ArrowRight, Clock, Newspaper, ExternalLink } from 'lucide-react';
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
          host_profile:host_profile_id (
            handle,
            emoji_avatar
          )
        `)
        .eq('status', 'live')
        .order('participant_count', { ascending: false })
        .limit(3);

      if (error) throw error;
      // Map host_profile to profiles for consistency with interface
      return ((data || []) as any[]).map((room: any) => ({
        ...room,
        profiles: Array.isArray(room.host_profile) ? room.host_profile[0] : room.host_profile,
      })) as LiveRoom[];
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
      {/* Best Communities - Reddit Style */}
      <Card className="p-4 !border-black/30 dark:!border-border/30 hover:!border-primary/50 dark:hover:!border-primary/30 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
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
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded" />
            ))}
          </div>
        ) : trendingCommunities.length > 0 ? (
          <div className="space-y-1">
            {trendingCommunities.map((community) => (
              <Link
                key={community.id}
                to={`/community/${community.slug}`}
                className="block"
              >
                <div className="flex gap-3 p-2 rounded border border-black/10 dark:border-transparent hover:border-primary/40 dark:hover:border-border/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer">
                  {/* Left Side - Icon Area */}
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                      <span className="text-lg">{community.avatar_emoji}</span>
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold text-sm mb-1 hover:text-primary transition-colors line-clamp-1">
                      {community.name}
                    </h4>
                    {community.description && (
                      <p className="text-xs text-muted-foreground mb-1.5 line-clamp-1">
                        {community.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        <span>{community.member_count.toLocaleString()} members</span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Mic className="w-3 h-3" />
                        <span>{community.clip_count.toLocaleString()} clips</span>
                      </span>
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

      {/* News & Updates - Reddit Style */}
      <Card className="p-4 !border-black/30 dark:!border-border/30 hover:!border-primary/50 dark:hover:!border-primary/30 transition-colors">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Newspaper className="h-4 w-4 text-primary" />
            News & Updates
          </h3>
        </div>
        
        {isLoadingNews ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded" />
            ))}
          </div>
        ) : newsItems && newsItems.length > 0 ? (
          <div className="space-y-1">
            {newsItems.map((item) => (
              <div key={item.id}>
                {item.url ? (
                  // External news article
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    <div className="flex gap-3 p-2 rounded border border-black/10 dark:border-transparent hover:border-primary/40 dark:hover:border-border/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer">
                      {/* Left Side - Icon Area */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {item.image ? (
                            <LazyImage
                              src={item.image}
                              alt={item.title}
                              className="w-8 h-8 rounded-full object-cover"
                              width={32}
                              height={32}
                            />
                          ) : (
                            <Newspaper className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Main Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1.5 mb-1">
                          <h4 className="font-semibold text-sm hover:text-primary transition-colors line-clamp-2 flex-1">
                            {item.title}
                          </h4>
                          <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />
                        </div>
                        {item.content && (
                          <p className="text-xs text-muted-foreground mb-1.5 line-clamp-2">
                            {item.content}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {item.source && (
                            <span className="font-medium">{item.source}</span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </a>
                ) : item.communities ? (
                  // Community announcement
                  <Link
                    to={`/community/${item.communities.slug}`}
                    className="block"
                  >
                    <div className="flex gap-3 p-2 rounded border border-black/10 dark:border-transparent hover:border-primary/40 dark:hover:border-border/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer">
                      {/* Left Side - Icon Area */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <span className="text-lg">{item.communities.avatar_emoji}</span>
                        </div>
                      </div>

                      {/* Main Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm mb-1 hover:text-primary transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        {item.content && (
                          <p className="text-xs text-muted-foreground mb-1.5 line-clamp-2">
                            {item.content}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1">
                            <span>{item.communities.avatar_emoji}</span>
                            <span className="font-medium hover:text-foreground">r/{item.communities.name}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  // News clip
                  <Link
                    to={`/clip/${item.id}`}
                    className="block"
                  >
                    <div className="flex gap-3 p-2 rounded border border-black/10 dark:border-transparent hover:border-primary/40 dark:hover:border-border/30 hover:bg-primary/5 dark:hover:bg-muted/50 transition-all cursor-pointer">
                      {/* Left Side - Icon Area */}
                      <div className="flex flex-col items-center gap-1 pt-1">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                          {item.profiles ? (
                            <span className="text-lg">{item.profiles.emoji_avatar}</span>
                          ) : (
                            <Mic className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>

                      {/* Main Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-sm mb-1 hover:text-primary transition-colors line-clamp-2">
                          {item.title}
                        </h4>
                        {item.content && (
                          <p className="text-xs text-muted-foreground mb-1.5 line-clamp-2">
                            {item.content}
                          </p>
                        )}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                          {item.profiles && (
                            <span className="flex items-center gap-1">
                              <span>Posted by</span>
                              <span className="font-medium hover:text-foreground">u/{item.profiles.handle}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}</span>
                          </span>
                        </div>
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
        <Card className="p-4 border border-border/30">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Radio className="h-4 w-4 text-primary" />
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
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded" />
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              {liveRooms.slice(0, 3).map((room) => (
                <Link
                  key={room.id}
                  to={`/live-room/${room.id}`}
                  className="block"
                >
                  <div className="flex gap-3 p-2 rounded hover:bg-muted/50 transition-colors border border-transparent hover:border-border/30">
                    {/* Left Side - Icon Area */}
                    <div className="flex flex-col items-center gap-1 pt-1">
                      <div className="relative w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Radio className="w-4 h-4 text-primary" />
                        <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border border-background animate-pulse" />
                      </div>
                    </div>

                    {/* Main Content */}
                    <div className="flex-1 min-w-0">
                      <h4 className="font-semibold text-sm mb-1 hover:text-primary transition-colors line-clamp-1">
                        {room.title}
                      </h4>
                      {room.description && (
                        <p className="text-xs text-muted-foreground mb-1.5 line-clamp-1">
                          {room.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          <span>{room.participant_count} listening</span>
                        </span>
                        {room.profiles && (
                          <span className="font-medium hover:text-foreground">@{room.profiles.handle}</span>
                        )}
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

