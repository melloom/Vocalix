import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkles, Users, TrendingUp } from "lucide-react";
import { useVoiceBasedCommunitySuggestions } from "@/hooks/useCommunity";
import { useCommunityMembership } from "@/hooks/useCommunity";
import { Badge } from "@/components/ui/badge";

export const VoiceBasedCommunitySuggestions = () => {
  const { data: suggestions, isLoading, error } = useVoiceBasedCommunitySuggestions(5);

  if (isLoading) {
    return (
      <Card className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Voice-Based Communities</h3>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (error || !suggestions || suggestions.length === 0) {
    return null; // Don't show if no suggestions
  }

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Communities for Your Voice</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Discover communities of people with similar voice characteristics
      </p>
      <div className="space-y-3">
        {suggestions.map((suggestion) => (
          <VoiceBasedCommunityCard
            key={suggestion.community_id}
            suggestion={suggestion}
          />
        ))}
      </div>
    </Card>
  );
};

interface VoiceBasedCommunityCardProps {
  suggestion: {
    community_id: string;
    community_name: string;
    community_slug: string;
    community_description: string;
    avatar_emoji: string;
    member_count: number;
    match_score: number;
    voice_similarity: number;
  };
}

const VoiceBasedCommunityCard = ({ suggestion }: VoiceBasedCommunityCardProps) => {
  const { isMember, toggleMembership, isJoining } = useCommunityMembership(suggestion.community_id);
  const matchPercentage = Math.round(suggestion.match_score * 100);

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:border-primary/30 hover:bg-muted/50 transition-all">
      <div className="text-2xl">{suggestion.avatar_emoji || "🎤"}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2 mb-1">
          <Link
            to={`/communities/${suggestion.community_slug}`}
            className="font-semibold hover:text-primary transition-colors line-clamp-1"
          >
            {suggestion.community_name}
          </Link>
          <Badge variant="secondary" className="text-xs shrink-0">
            {matchPercentage}% match
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {suggestion.community_description}
        </p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <Users className="h-3 w-3" />
            <span>{suggestion.member_count} members</span>
          </div>
        </div>
      </div>
      <Button
        size="sm"
        variant={isMember ? "outline" : "default"}
        onClick={toggleMembership}
        disabled={isJoining}
        className="shrink-0"
      >
        {isMember ? "Joined" : "Join"}
      </Button>
    </div>
  );
};

