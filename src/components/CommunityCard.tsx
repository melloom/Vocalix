import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Users, Mic, Shield, TrendingUp, Sparkles, ArrowRight, Heart, HeartOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CommunityWithDetails } from '@/hooks/useCommunity';
import { useCommunityFollow } from '@/hooks/useCommunityFollow';
import { formatDistanceToNow } from 'date-fns';
import { toast } from 'sonner';

interface CommunityCardProps {
  community: CommunityWithDetails;
}

export const CommunityCard = ({ community }: CommunityCardProps) => {
  const isNew = new Date(community.created_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
  const isTrending = community.member_count > 10 && community.clip_count > 5;
  const { isFollowing, toggleFollow, isFollowingCommunity, isUnfollowingCommunity } = useCommunityFollow(community.id);

  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFollow();
    toast.success(isFollowing ? 'Unfollowed community' : 'Following community');
  };

  return (
    <Link to={`/community/${community.slug}`}>
      <Card className="group p-6 space-y-4 cursor-pointer transition-all duration-300 hover:shadow-xl hover:scale-[1.02] border-2 hover:border-primary/20 bg-gradient-to-br from-card to-card/50">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className="relative shrink-0">
              <div className="text-5xl transition-transform duration-300 group-hover:scale-110">
                {community.avatar_emoji}
              </div>
              {isNew && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-background animate-pulse" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start gap-2">
                <h3 className="text-xl font-bold text-foreground truncate group-hover:text-primary transition-colors">
                  {community.name}
                </h3>
                {isTrending && (
                  <Badge variant="default" className="shrink-0 text-xs flex items-center gap-1">
                    <TrendingUp className="w-3 h-3" />
                    Trending
                  </Badge>
                )}
                {isNew && (
                  <Badge variant="secondary" className="shrink-0 text-xs flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    New
                  </Badge>
                )}
              </div>
              {community.description && (
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                  {community.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div className="flex items-center gap-2">
              {community.is_following !== undefined && (
                <Button
                  variant={isFollowing ? "default" : "outline"}
                  size="sm"
                  onClick={handleFollowClick}
                  disabled={isFollowingCommunity || isUnfollowingCommunity}
                  className="rounded-full h-8 w-8 p-0"
                  title={isFollowing ? "Unfollow" : "Follow"}
                >
                  {isFollowing ? (
                    <Heart className="w-4 h-4 fill-current" />
                  ) : (
                    <HeartOff className="w-4 h-4" />
                  )}
                </Button>
              )}
              {community.is_member && (
                <Badge variant="default" className="shrink-0 flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  Member
                </Badge>
              )}
            </div>
            <ArrowRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        
        <div className="flex items-center justify-between pt-3 border-t border-border/50">
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-1.5 font-medium">
              <Users className="w-4 h-4 text-primary" />
              <span className="text-foreground">{community.member_count.toLocaleString()}</span>
              <span className="hidden sm:inline">members</span>
            </div>
            <div className="flex items-center gap-1.5 font-medium">
              <Mic className="w-4 h-4 text-primary" />
              <span className="text-foreground">{community.clip_count.toLocaleString()}</span>
              <span className="hidden sm:inline">clips</span>
            </div>
            {community.follower_count !== undefined && community.follower_count > 0 && (
              <div className="flex items-center gap-1.5 font-medium">
                <Heart className="w-4 h-4 text-primary" />
                <span className="text-foreground">{community.follower_count.toLocaleString()}</span>
                <span className="hidden sm:inline">followers</span>
              </div>
            )}
            {!community.is_public && (
              <div className="flex items-center gap-1.5">
                <Shield className="w-4 h-4" />
                <span>Private</span>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground">
            {formatDistanceToNow(new Date(community.created_at), { addSuffix: true })}
          </div>
        </div>
      </Card>
    </Link>
  );
};

