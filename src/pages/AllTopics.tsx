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
import { ArrowLeft, TrendingUp, Calendar, Users, Plus, Search, Sparkles, Clock, Filter } from 'lucide-react';
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
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/20 pb-24">
      {/* Header with gradient */}
      <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl border-b border-border/30 shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between gap-4">
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
                <h1 className="text-3xl font-bold flex items-center gap-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
                    <Sparkles className="w-5 h-5 text-primary-foreground" />
                  </div>
                  All Topics
                </h1>
                <p className="text-sm text-muted-foreground mt-1.5">
                  Discover and explore trending discussion topics
                </p>
              </div>
            </div>
            {profile && (
              <Button
                onClick={() => setIsCreateTopicOpen(true)}
                className="flex items-center gap-2 shadow-md hover:shadow-lg transition-shadow bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                size="lg"
              >
                <Plus className="w-4 h-4" />
                Create Topic
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="w-full">
          {/* Main Content */}
          <div>
        {/* Search and Filters */}
        <div className="space-y-6 mb-8">
          {/* Search Bar */}
          <div className="relative group">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground w-5 h-5 group-focus-within:text-primary transition-colors" />
            <Input
              placeholder="Search topics by title, description, community, or creator..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 pr-4 h-12 text-base rounded-xl border focus:border-primary/20 transition-all shadow-sm"
            />
          </div>

          {/* Filter Tabs */}
          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
            <Button
              variant={filterBy === 'all' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterBy('all')}
              className={`rounded-full px-4 h-9 transition-all ${
                filterBy === 'all' 
                  ? 'bg-gradient-to-r from-primary to-primary/80 shadow-md' 
                  : 'hover:bg-muted'
              }`}
            >
              All
            </Button>
            <Button
              variant={filterBy === 'trending' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterBy('trending')}
              className={`flex items-center gap-1.5 rounded-full px-4 h-9 transition-all ${
                filterBy === 'trending' 
                  ? 'bg-gradient-to-r from-primary to-primary/80 shadow-md' 
                  : 'hover:bg-muted'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              Trending
            </Button>
            <Button
              variant={filterBy === 'community' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterBy('community')}
              className={`rounded-full px-4 h-9 transition-all ${
                filterBy === 'community' 
                  ? 'bg-gradient-to-r from-primary to-primary/80 shadow-md' 
                  : 'hover:bg-muted'
              }`}
            >
              Communities
            </Button>
            <Button
              variant={filterBy === 'user_created' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterBy('user_created')}
              className={`rounded-full px-4 h-9 transition-all ${
                filterBy === 'user_created' 
                  ? 'bg-gradient-to-r from-primary to-primary/80 shadow-md' 
                  : 'hover:bg-muted'
              }`}
            >
              User Created
            </Button>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
                <SelectTrigger className="w-[200px] rounded-xl border-2 h-10">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="trending">🔥 Trending</SelectItem>
                  <SelectItem value="newest">🆕 Newest</SelectItem>
                  <SelectItem value="oldest">📅 Oldest</SelectItem>
                  <SelectItem value="most_clips">📊 Most Clips</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              <span className="text-foreground font-semibold">{filteredTopics.length}</span>{' '}
              {filteredTopics.length === 1 ? 'topic' : 'topics'} found
            </div>
          </div>
        </div>

        {/* Topics Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-3xl" />
            ))}
          </div>
        ) : filteredTopics.length === 0 ? (
          <Card className="p-16 rounded-3xl text-center border-2 bg-gradient-to-br from-card to-card/50 shadow-xl">
            <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>
            <h3 className="text-2xl font-bold mb-3">
              {searchQuery ? 'No topics found' : 'No topics yet'}
            </h3>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              {searchQuery
                ? 'Try adjusting your search or filters to find what you\'re looking for'
                : 'Be the first to create a topic and start the conversation!'}
            </p>
            {profile && !searchQuery && (
              <Button 
                onClick={() => setIsCreateTopicOpen(true)}
                size="lg"
                className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create First Topic
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTopics.map((topic) => (
              <Link
                key={topic.id}
                to={`/topic/${topic.id}`}
                className="block group"
              >
                <Card className="p-6 rounded-3xl h-full border hover:border-primary/20 hover:shadow-xl transition-all duration-300 bg-gradient-to-br from-card to-card/50 group-hover:scale-[1.02] overflow-hidden relative">
                  {/* Gradient overlay on hover */}
                  <div className="absolute inset-0 bg-gradient-to-br from-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:to-transparent transition-all duration-300 rounded-3xl" />
                  
                  <div className="space-y-4 relative z-10">
                    {/* Header */}
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-all duration-300 ${
                        topic.communities 
                          ? 'bg-gradient-to-br from-primary/20 to-primary/10' 
                          : 'bg-gradient-to-br from-primary/20 to-primary/10'
                      } group-hover:scale-110 group-hover:shadow-lg`}>
                        {topic.communities ? (
                          <span className="text-3xl">{topic.communities.avatar_emoji}</span>
                        ) : (
                          <TrendingUp className="w-7 h-7 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-xl line-clamp-2 group-hover:text-primary transition-colors mb-2">
                          {topic.title}
                        </h3>
                        {topic.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                            {topic.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      {topic.communities && (
                        <Badge variant="secondary" className="text-xs px-3 py-1 rounded-full font-medium">
                          <span className="mr-1.5">{topic.communities.avatar_emoji}</span>
                          {topic.communities.name}
                        </Badge>
                      )}
                      {topic.profiles && (
                        <Badge variant="outline" className="text-xs px-3 py-1 rounded-full font-medium">
                          @{topic.profiles.handle}
                        </Badge>
                      )}
                      {topic.trending_score > 0 && (
                        <Badge className="text-xs px-3 py-1 rounded-full font-medium bg-gradient-to-r from-orange-500 to-red-500 text-white border-0">
                          🔥 Trending
                        </Badge>
                      )}
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-5 text-xs text-muted-foreground pt-4 border-t border-border/30">
                      <div className="flex items-center gap-1.5 font-medium">
                        <Users className="w-4 h-4" />
                        <span>{topic.clips_count || 0} clips</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        <span>{format(new Date(topic.date), 'MMM d, yyyy')}</span>
                      </div>
                      {topic.created_at && (
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          <span>{formatDistanceToNow(new Date(topic.created_at), { addSuffix: true })}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
          </div>

          {/* Right Sidebar - Topic Discovery */}
          <aside className="hidden lg:block lg:col-span-4">
            <div className="sticky top-4">
              <TopicDiscovery
                profileId={profile?.id}
                showRecommendations={true}
                showSimilar={false}
                showTrending={true}
              />
            </div>
          </aside>
        </div>
      </main>

      <CreateTopicModal
        open={isCreateTopicOpen}
        onOpenChange={setIsCreateTopicOpen}
        onSuccess={handleCreateSuccess}
      />
    </div>
  );
}

