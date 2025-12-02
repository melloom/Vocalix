import { useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, TrendingUp, Calendar, Users, Plus, Search, Sparkles, Clock, Filter, MessageCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { CreateTopicModal } from '@/components/CreateTopicModal';
import { useProfile } from '@/hooks/useProfile';
import { TopicDiscovery } from '@/components/TopicDiscovery';

interface Topic {
  id: string;
  title: string;
  description: string | null;
  date: string;
  is_active: boolean;
  clips_count: number;
  trending_score: number;
  community_id: string | null;
  user_created_by: string | null;
  created_at: string;
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

export default function AllTopics() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'trending' | 'newest' | 'oldest' | 'most_clips'>('trending');
  const [filterBy, setFilterBy] = useState<'all' | 'trending' | 'community' | 'user_created'>('all');
  const [isCreateTopicOpen, setIsCreateTopicOpen] = useState(false);

  // Fetch all topics
  const { data: topics, isLoading, refetch } = useQuery({
    queryKey: ['all-topics', sortBy, filterBy],
    queryFn: async () => {
      let query = supabase
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
        .eq('is_active', true);

      // Apply filters
      if (filterBy === 'trending') {
        query = query.gt('trending_score', 0);
      } else if (filterBy === 'community') {
        query = query.not('community_id', 'is', null);
      } else if (filterBy === 'user_created') {
        query = query.not('user_created_by', 'is', null);
      }

      // Apply sorting
      if (sortBy === 'trending') {
        query = query.order('trending_score', { ascending: false });
      } else if (sortBy === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sortBy === 'oldest') {
        query = query.order('created_at', { ascending: true });
      } else if (sortBy === 'most_clips') {
        query = query.order('clips_count', { ascending: false });
      }

      // Add secondary sort
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query.limit(1000);

      if (error) throw error;
      return (data || []) as Topic[];
    },
  });

  // Filter by search query
  const filteredTopics = useMemo(() => {
    if (!topics) return [];
    const trimmedQuery = searchQuery.trim();
    if (!trimmedQuery) return topics;

    const query = trimmedQuery.toLowerCase();
    const queryWords = query.split(/\s+/).filter(word => word.length > 0);
    
    return topics.filter((topic) => {
      // Build searchable text from all fields
      const searchableText = [
        topic.title?.toLowerCase() ?? '',
        topic.description?.toLowerCase() ?? '',
        topic.communities?.name?.toLowerCase() ?? '',
        topic.profiles?.handle?.toLowerCase() ?? '',
      ].join(' ');

      // Check if all query words are found in the searchable text
      // This allows for more flexible matching (e.g., "tech news" matches "technology news")
      return queryWords.every(word => searchableText.includes(word));
    });
  }, [topics, searchQuery]);

  const handleCreateSuccess = () => {
    refetch();
    setIsCreateTopicOpen(false);
    // Navigate to the new topic after a short delay
    setTimeout(() => {
      // The refetch will show the new topic in the list
    }, 500);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 py-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => navigate(-1)}
                className="rounded-full hover:bg-muted"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-2xl font-bold">All Topics</h1>
                <p className="text-sm text-muted-foreground">
                  Discover and explore discussion topics
                </p>
              </div>
            </div>
            {profile && (
              <Button
                onClick={() => setIsCreateTopicOpen(true)}
                className="flex items-center gap-2"
                size="default"
              >
                <Plus className="w-4 h-4" />
                Create Topic
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Main Content - Reddit Style Feed */}
          <main className="flex-1 min-w-0">
            {/* Search and Filters */}
            <div className="space-y-4 mb-6">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  placeholder="Search topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-9 rounded-md border-border/30"
                />
              </div>

              {/* Filter Tabs and Sort */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  <Button
                    variant={filterBy === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterBy('all')}
                    className="h-8 rounded-md"
                  >
                    All
                  </Button>
                  <Button
                    variant={filterBy === 'trending' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterBy('trending')}
                    className="h-8 rounded-md flex items-center gap-1.5"
                  >
                    <TrendingUp className="w-3.5 h-3.5" />
                    Trending
                  </Button>
                  <Button
                    variant={filterBy === 'community' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterBy('community')}
                    className="h-8 rounded-md"
                  >
                    Communities
                  </Button>
                  <Button
                    variant={filterBy === 'user_created' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setFilterBy('user_created')}
                    className="h-8 rounded-md"
                  >
                    User Created
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                    <SelectTrigger className="w-[140px] h-8 rounded-md border-border/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="trending">Trending</SelectItem>
                      <SelectItem value="newest">Newest</SelectItem>
                      <SelectItem value="oldest">Oldest</SelectItem>
                      <SelectItem value="most_clips">Most Clips</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Topics Feed - Reddit Style */}
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 10 }).map((_, i) => (
                  <Card key={i} className="p-4 border-border/30">
                    <div className="flex gap-4">
                      <Skeleton className="w-10 h-20 rounded" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-1/2" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : filteredTopics.length === 0 ? (
              <Card className="p-12 text-center border-border/30">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-muted-foreground" />
                </div>
                <h3 className="text-xl font-semibold mb-2">
                  {searchQuery ? 'No topics found' : 'No topics yet'}
                </h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {searchQuery
                    ? 'Try adjusting your search or filters'
                    : 'Be the first to create a topic!'}
                </p>
                {profile && !searchQuery && (
                  <Button 
                    onClick={() => setIsCreateTopicOpen(true)}
                    size="default"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create First Topic
                  </Button>
                )}
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredTopics.map((topic) => (
                  <Link
                    key={topic.id}
                    to={`/topic/${topic.id}`}
                    className="block"
                  >
                    <Card className="border border-black/20 dark:border-border/30 hover:border-primary/50 dark:hover:border-primary/30 transition-colors bg-card">
                      <div className="flex gap-3 p-3">
                        {/* Left Side - Icon/Vote Area (Reddit Style) */}
                        <div className="flex flex-col items-center gap-1 pt-1">
                          <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
                            {topic.communities ? (
                              <span className="text-xl">{topic.communities.avatar_emoji}</span>
                            ) : topic.profiles ? (
                              <span className="text-xl">{topic.profiles.emoji_avatar}</span>
                            ) : (
                              <TrendingUp className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>

                        {/* Main Content */}
                        <div className="flex-1 min-w-0">
                          {/* Title */}
                          <h3 className="font-semibold text-base mb-1 hover:text-primary transition-colors line-clamp-2">
                            {topic.title}
                          </h3>

                          {/* Description */}
                          {topic.description && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                              {topic.description}
                            </p>
                          )}

                          {/* Metadata Row - Reddit Style */}
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            {topic.communities && (
                              <span className="flex items-center gap-1">
                                <span>{topic.communities.avatar_emoji}</span>
                                <span className="font-medium hover:text-foreground">r/{topic.communities.name}</span>
                              </span>
                            )}
                            {topic.profiles && (
                              <span className="flex items-center gap-1">
                                <span>Posted by</span>
                                <span className="font-medium hover:text-foreground">u/{topic.profiles.handle}</span>
                              </span>
                            )}
                            {topic.created_at && (
                              <span>{formatDistanceToNow(new Date(topic.created_at), { addSuffix: true })}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <MessageCircle className="w-3 h-3" />
                              <span>{topic.clips_count || 0} {topic.clips_count === 1 ? 'clip' : 'clips'}</span>
                            </span>
                            {topic.trending_score > 0 && (
                              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                                🔥 Trending
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </main>

          {/* Right Sidebar */}
          <aside className="hidden lg:block w-80 shrink-0">
            <div className="sticky top-4 space-y-4">
              <TopicDiscovery
                profileId={profile?.id}
                showRecommendations={true}
                showSimilar={false}
                showTrending={true}
              />
            </div>
          </aside>
        </div>
      </div>

      <CreateTopicModal
        open={isCreateTopicOpen}
        onOpenChange={setIsCreateTopicOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

