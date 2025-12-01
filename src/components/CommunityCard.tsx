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
  const hasActivity = community.member_count > 0 || community.clip_count > 0;

  // Clean up description - remove timestamps and "add more info" type messages
  const cleanDescription = community.description 
    ? community.description
        .replace(/\d+\s*(days?|hours?|minutes?|weeks?|months?)\s*ago/gi, '')
        .replace(/add\s+more\s+info/gi, '')
        .replace(/make\s+.*?better/gi, '')
        .replace(/wtf/gi, '')
        .trim()
    : null;

  const handleFollowClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFollow();
    toast.success(isFollowing ? 'Unfollowed community' : 'Following community');
  };

  return (
    <Link to={`/community/${community.slug}`}>
      <Card className="group relative p-6 space-y-5 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:shadow-primary/5 hover:scale-[1.02] border border-border/20 hover:border-border/30 bg-gradient-to-br from-card via-card/98 to-card/95 rounded-3xl overflow-hidden backdrop-blur-sm">
        {/* Decorative gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/0 via-primary/0 to-primary/0 group-hover:from-primary/5 group-hover:via-primary/3 group-hover:to-primary/0 transition-all duration-500 pointer-events-none rounded-3xl" />
        
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-start gap-5 flex-1 min-w-0">
            <div className="relative shrink-0">
              {/* Avatar with animated background */}
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-accent/20 rounded-2xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                <div className="relative text-7xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 drop-shadow-lg">
                  {community.avatar_emoji || '🎙️'}
                </div>
              </div>
              {isNew && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-br from-green-400 to-green-600 rounded-full border-2 border-background animate-pulse shadow-lg shadow-green-500/50 z-10" />
              )}
            </div>
            <div className="flex-1 min-w-0 space-y-3">
              <div className="flex items-start gap-3 flex-wrap">
                <h3 className="text-2xl font-extrabold text-foreground truncate group-hover:text-primary transition-colors bg-gradient-to-r from-foreground to-foreground group-hover:from-primary group-hover:to-primary/80 bg-clip-text">
                  {community.name}
                </h3>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {isTrending && (
                    <Badge variant="default" className="shrink-0 text-xs flex items-center gap-1.5 bg-gradient-to-r from-primary/15 to-primary/10 text-primary border-primary/30 shadow-sm">
                      <TrendingUp className="w-3.5 h-3.5" />
                      <span className="font-semibold">Trending</span>
                    </Badge>
                  )}
                  {isNew && (
                    <Badge variant="secondary" className="shrink-0 text-xs flex items-center gap-1.5 shadow-sm">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span className="font-semibold">New</span>
                    </Badge>
                  )}
                  {!community.is_public && (
                    <Badge variant="outline" className="shrink-0 text-xs flex items-center gap-1.5 border-muted-foreground/30">
                      <Shield className="w-3.5 h-3.5" />
                      <span className="font-medium">Private</span>
                    </Badge>
                  )}
                </div>
              </div>
              {cleanDescription && cleanDescription.length > 0 ? (
                <p className="text-sm text-muted-foreground line-clamp-2 leading-relaxed group-hover:text-foreground/80 transition-colors">
                  {cleanDescription}
                </p>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground/70 italic">
                  <Sparkles className="w-4 h-4 opacity-50" />
                  <span>{hasActivity ? 'Join the conversation!' : 'Be the first to share your voice!'}</span>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-3 shrink-0">
            <div className="flex items-center gap-2">
              {community.is_following !== undefined && (
                <Button
                  variant={isFollowing ? "default" : "outline"}
                  size="sm"
                  onClick={handleFollowClick}
                  disabled={isFollowingCommunity || isUnfollowingCommunity}
                  className="rounded-full h-10 w-10 p-0 shadow-md hover:shadow-lg transition-all hover:scale-110"
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
                <Badge variant="default" className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 shadow-sm">
                  <Users className="w-3.5 h-3.5" />
                  <span className="text-xs font-semibold">Member</span>
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1 text-primary opacity-0 group-hover:opacity-100 transition-all">
              <span className="text-xs font-medium">Explore</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </div>
        
        <div className="relative flex items-center justify-between pt-5 border-t border-border/30">
          <div className="flex items-center gap-6 text-sm">
            <div className={`flex items-center gap-3 font-medium transition-all ${hasActivity ? 'text-foreground' : 'text-muted-foreground/50'}`}>
              <div className={`p-2 rounded-xl transition-all ${hasActivity ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-muted/50'} shadow-sm`}>
                <Users className={`w-5 h-5 transition-colors ${hasActivity ? 'text-primary' : 'text-muted-foreground/50'}`} />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold leading-tight">{community.member_count.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground/80 font-medium hidden sm:inline">members</span>
              </div>
            </div>
            <div className={`flex items-center gap-3 font-medium transition-all ${hasActivity ? 'text-foreground' : 'text-muted-foreground/50'}`}>
              <div className={`p-2 rounded-xl transition-all ${hasActivity ? 'bg-primary/10 group-hover:bg-primary/15' : 'bg-muted/50'} shadow-sm`}>
                <Mic className={`w-5 h-5 transition-colors ${hasActivity ? 'text-primary' : 'text-muted-foreground/50'}`} />
              </div>
              <div className="flex flex-col">
                <span className="text-lg font-bold leading-tight">{community.clip_count.toLocaleString()}</span>
                <span className="text-xs text-muted-foreground/80 font-medium hidden sm:inline">clips</span>
              </div>
            </div>
            {community.follower_count !== undefined && community.follower_count > 0 && (
              <div className="flex items-center gap-3 font-medium">
                <div className="p-2 rounded-xl bg-primary/10 group-hover:bg-primary/15 transition-all shadow-sm">
                  <Heart className="w-5 h-5 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-lg font-bold leading-tight">{community.follower_count.toLocaleString()}</span>
                  <span className="text-xs text-muted-foreground/80 font-medium hidden sm:inline">followers</span>
                </div>
              </div>
            )}
          </div>
          <div className="text-xs text-muted-foreground/70 font-semibold px-2 py-1 rounded-lg bg-muted/30">
            {formatDistanceToNow(new Date(community.created_at), { addSuffix: true })}
          </div>
        </div>
      </Card>
    </Link>
  );
};

