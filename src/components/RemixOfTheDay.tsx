import { useEffect, useState } from "react";
import { Sparkles, Calendar, TrendingUp } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { ClipCard } from "@/components/ClipCard";
import { Link } from "react-router-dom";

interface RemixOfTheDay {
  remix_clip_id: string;
  featured_date: string;
  reason: string | null;
  remix_clip?: {
    id: string;
    title: string | null;
    summary: string | null;
    audio_path: string;
    duration_seconds: number;
    listens_count: number;
    reactions_count: number;
    created_at: string;
    profiles?: {
      handle: string;
      emoji_avatar: string;
    } | null;
    remix_of?: {
      id: string;
      title: string | null;
      profiles?: {
        handle: string;
        emoji_avatar: string;
      } | null;
    } | null;
  } | null;
}

export function RemixOfTheDay() {
  const [featuredRemix, setFeaturedRemix] = useState<RemixOfTheDay | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadRemixOfTheDay();
  }, []);

  const loadRemixOfTheDay = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase.rpc('get_remix_of_the_day', {
        p_date: new Date().toISOString().split('T')[0],
      });

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (data && data.length > 0) {
        const remixId = data[0].remix_clip_id;
        
        // Load full remix details
        const { data: remixData, error: remixError } = await supabase
          .from("clips")
          .select(`
            id,
            title,
            summary,
            audio_path,
            duration_seconds,
            listens_count,
            reactions_count,
            created_at,
            remix_of_clip_id,
            profiles:profile_id (
              handle,
              emoji_avatar
            ),
            remix_of:remix_of_clip_id (
              id,
              title,
              profiles:profile_id (
                handle,
                emoji_avatar
              )
            )
          `)
          .eq("id", remixId)
          .eq("status", "live")
          .single();

        if (!remixError && remixData) {
          setFeaturedRemix({
            remix_clip_id: remixId,
            featured_date: data[0].featured_date,
            reason: data[0].reason,
            remix_clip: remixData as any,
          });
        }
      }
    } catch (error) {
      console.error("Error loading remix of the day:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl border-2 border-primary/20">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!featuredRemix || !featuredRemix.remix_clip) {
    return null; // No remix of the day
  }

  const remix = featuredRemix.remix_clip;

  return (
    <Card className="rounded-3xl border-2 border-primary/20 bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl">Remix of the Day</CardTitle>
              <CardDescription className="flex items-center gap-1 mt-1">
                <Calendar className="h-3 w-3" />
                {new Date(featuredRemix.featured_date).toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </CardDescription>
            </div>
          </div>
          <Badge variant="default" className="rounded-full">
            Featured
          </Badge>
        </div>
        {featuredRemix.reason && (
          <p className="text-sm text-muted-foreground mt-2">{featuredRemix.reason}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {/* Remix Info */}
          <div className="rounded-xl bg-muted/40 p-3">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="rounded-full">
                <Sparkles className="h-3 w-3 mr-1" />
                Remix
              </Badge>
              {remix.remix_of && (
                <span className="text-xs text-muted-foreground">
                  Remix of @{remix.remix_of.profiles?.handle || "Anonymous"}
                </span>
              )}
            </div>
            <p className="text-sm font-medium mb-1">
              {remix.title || "Untitled Remix"}
            </p>
            {remix.summary && (
              <p className="text-xs text-muted-foreground line-clamp-2">{remix.summary}</p>
            )}
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              <span>{remix.listens_count} listens</span>
            </div>
            <div>
              <span>{remix.reactions_count} reactions</span>
            </div>
          </div>

          {/* Clip Card */}
          <div className="mt-2">
            <ClipCard
              clip={{
                id: remix.id,
                audio_path: remix.audio_path,
                mood_emoji: "🎵",
                duration_seconds: remix.duration_seconds,
                captions: remix.summary,
                summary: remix.summary,
                status: "live",
                reactions: {},
                created_at: remix.created_at,
                listens_count: remix.listens_count,
                topic_id: null,
                profiles: remix.profiles || null,
              }}
              showTopic={false}
            />
          </div>

          <Link
            to={`/clip/${remix.id}`}
            className="block text-center text-sm text-primary hover:underline mt-2"
          >
            Listen to Remix →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

