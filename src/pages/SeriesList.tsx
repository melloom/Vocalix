import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, Filter, Radio } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CreateSeriesModal } from "@/components/CreateSeriesModal";

interface Series {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  category: string | null;
  episode_count: number;
  total_listens: number;
  follower_count: number;
  is_public: boolean;
  created_at: string;
  profiles: {
    handle: string;
    emoji_avatar: string;
  };
}

export default function SeriesList() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const { toast } = useToast();
  const [series, setSeries] = useState<Series[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"newest" | "popular" | "episodes">("newest");
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadSeries();
  }, [categoryFilter, sortBy, searchQuery]);

  const loadSeries = async () => {
    try {
      setIsLoading(true);
      let query = supabase
        .from("series")
        .select(`
          *,
          profiles:profile_id (
            handle,
            emoji_avatar
          )
        `)
        .eq("is_public", true);

      if (categoryFilter !== "all") {
        query = query.eq("category", categoryFilter);
      }

      if (searchQuery) {
        query = query.or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      let orderBy = "created_at";
      if (sortBy === "popular") {
        orderBy = "total_listens";
      } else if (sortBy === "episodes") {
        orderBy = "episode_count";
      }

      const { data, error } = await query
        .order(orderBy, { ascending: false })
        .limit(50);

      if (error) throw error;
      setSeries(data || []);
    } catch (error: any) {
      console.error("Error loading series:", error);
      toast({
        title: "Error",
        description: "Failed to load series",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeriesCreated = () => {
    setShowCreateModal(false);
    loadSeries();
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="w-full px-4 lg:px-8 py-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Series</h1>
              <p className="text-sm text-muted-foreground">Podcast-like content series</p>
            </div>
            {profile && (
              <Button
                onClick={() => setShowCreateModal(true)}
                className="rounded-2xl"
              >
                <Plus className="mr-2 h-4 w-4" />
                Create Series
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search series..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 rounded-2xl"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[140px] rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="general">General</SelectItem>
                <SelectItem value="music">Music</SelectItem>
                <SelectItem value="comedy">Comedy</SelectItem>
                <SelectItem value="storytelling">Storytelling</SelectItem>
                <SelectItem value="education">Education</SelectItem>
                <SelectItem value="news">News</SelectItem>
                <SelectItem value="entertainment">Entertainment</SelectItem>
                <SelectItem value="sports">Sports</SelectItem>
                <SelectItem value="tech">Tech</SelectItem>
                <SelectItem value="lifestyle">Lifestyle</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v: any) => setSortBy(v)}>
              <SelectTrigger className="w-[140px] rounded-2xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="popular">Popular</SelectItem>
                <SelectItem value="episodes">Most Episodes</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </header>

      <main className="w-full px-4 lg:px-8 py-6">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="rounded-3xl">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-full" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-32 w-full rounded-xl mb-4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : series.length === 0 ? (
          <div className="text-center py-12">
            <Radio className="h-16 w-16 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold mb-2">No series found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {searchQuery ? "Try a different search term" : "Be the first to create a series!"}
            </p>
            {profile && (
              <Button onClick={() => setShowCreateModal(true)} className="rounded-2xl">
                <Plus className="mr-2 h-4 w-4" />
                Create Series
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {series.map((s) => (
              <Card
                key={s.id}
                className="rounded-3xl hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => navigate(`/series/${s.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <CardTitle className="text-lg line-clamp-2">{s.title}</CardTitle>
                      <CardDescription className="flex items-center gap-2 mt-1">
                        <span>{s.profiles.emoji_avatar}</span>
                        <span>{s.profiles.handle}</span>
                      </CardDescription>
                    </div>
                  </div>
                  {s.category && (
                    <Badge variant="secondary" className="rounded-full">
                      {s.category}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent>
                  {s.cover_image_url ? (
                    <img
                      src={s.cover_image_url}
                      alt={s.title}
                      className="w-full h-32 object-cover rounded-xl mb-4"
                    />
                  ) : (
                    <div className="w-full h-32 bg-muted rounded-xl mb-4 flex items-center justify-center">
                      <Radio className="h-12 w-12 text-muted-foreground opacity-50" />
                    </div>
                  )}
                  {s.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                      {s.description}
                    </p>
                  )}
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>{s.episode_count} episodes</span>
                    <span>{s.total_listens.toLocaleString()} listens</span>
                    <span>{s.follower_count} followers</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {showCreateModal && (
        <CreateSeriesModal
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleSeriesCreated}
        />
      )}
    </div>
  );
}

