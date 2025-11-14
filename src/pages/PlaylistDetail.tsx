import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Share2, Plus, Trash2, X, Heart, Eye, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlaylistSkeleton, PageHeaderSkeleton } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { useCollectionFollow, useTrackCollectionView } from "@/hooks/useCollectionFollow";
import { logError } from "@/lib/logger";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

interface Clip {
  id: string;
  profile_id: string | null;
  audio_path: string;
  mood_emoji: string;
  duration_seconds: number;
  captions: string | null;
  summary: string | null;
  status: string;
  reactions: Record<string, number>;
  created_at: string;
  listens_count: number;
  city: string | null;
  waveform?: number[];
  topic_id: string | null;
  moderation?: Record<string, unknown> | null;
  content_rating?: "general" | "sensitive";
  title: string | null;
  tags: string[] | null;
  profiles: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  share_token: string | null;
  is_auto_generated: boolean;
  profile_id: string;
  follower_count?: number;
  view_count?: number;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  };
}

const PlaylistDetail = () => {
  const { playlistId } = useParams<{ playlistId: string }>();
  const { profile, isLoading: isProfileLoading } = useProfile();
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [clips, setClips] = useState<Clip[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isPublic, setIsPublic] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [removingClipId, setRemovingClipId] = useState<string | null>(null);
  const [isAddClipsDialogOpen, setIsAddClipsDialogOpen] = useState(false);
  const [savedClips, setSavedClips] = useState<Clip[]>([]);
  const [isLoadingSavedClips, setIsLoadingSavedClips] = useState(false);
  const { toast } = useToast();
  const { isFollowing, toggleFollow, isToggling } = useCollectionFollow(playlist?.id || null);
  const trackView = useTrackCollectionView();

  useEffect(() => {
    const loadPlaylist = async () => {
      if (!playlistId) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // Try to load by ID first (for owned playlists)
        let query = supabase
          .from("playlists")
          .select(
            `
            *,
            profiles (
              handle,
              emoji_avatar
            )
          `,
          )
          .eq("id", playlistId)
          .single();

        let { data: playlistData, error: playlistError } = await query;

        // If not found, try loading by share_token (for shared playlists)
        if (playlistError && playlistId.length > 36) {
          const { data, error } = await supabase
            .from("playlists")
            .select(
              `
              *,
              profiles (
                handle,
                emoji_avatar
              )
            `,
            )
            .eq("share_token", playlistId)
            .single();

          if (!error && data) {
            playlistData = data;
            playlistError = null;
          }
        }

        if (playlistError || !playlistData) {
          setError("Playlist not found");
          setIsLoading(false);
          return;
        }

        setPlaylist(playlistData);
        setIsPublic(playlistData.is_public);

        // Load clips in playlist
        const { data: clipsData, error: clipsError } = await supabase
          .from("playlist_clips")
          .select(
            `
            clip_id,
            position,
            clips (
              *,
              profiles (
                handle,
                emoji_avatar
              )
            )
          `,
          )
          .eq("playlist_id", playlistData.id)
          .order("position", { ascending: true });

        if (clipsError) {
          setError("Couldn't load clips");
          logError("Error loading clips", clipsError);
        } else {
          const transformedClips = (clipsData || [])
            .map((item: any) => {
              const clip = Array.isArray(item.clips) ? item.clips[0] : item.clips;
              return clip as Clip | null;
            })
            .filter((clip): clip is Clip => clip !== null && clip !== undefined && clip.status === "live");

          setClips(transformedClips);
        }
      } catch (err) {
        setError("Couldn't load playlist");
        logError("Error loading playlist", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPlaylist();
  }, [playlistId, profile?.id]);

  // Track view when playlist is loaded and is public
  useEffect(() => {
    if (playlist && playlist.is_public && playlist.profile_id !== profile?.id) {
      trackView.mutate(playlist.id);
    }
  }, [playlist?.id, playlist?.is_public, playlist?.profile_id, profile?.id]);

  const handleTogglePublic = async () => {
    if (!playlist || !profile || playlist.profile_id !== profile.id) return;

    setIsUpdating(true);
    try {
      const newIsPublic = !isPublic;
      let shareToken = playlist.share_token;

      // Generate share token if making public and doesn't have one
      if (newIsPublic && !shareToken) {
        // Generate a random token
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        shareToken = Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }

      const { error } = await supabase
        .from("playlists")
        .update({
          is_public: newIsPublic,
          share_token: shareToken,
        })
        .eq("id", playlist.id);

      if (error) throw error;

      setIsPublic(newIsPublic);
      setPlaylist({ ...playlist, is_public: newIsPublic, share_token: shareToken });

      toast({
        title: "Success",
        description: newIsPublic ? "Playlist is now public" : "Playlist is now private",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to update playlist",
        variant: "destructive",
      });
      logError("Error updating playlist", err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleRemoveClip = async (clipId: string) => {
    if (!playlist) return;

    try {
      const { error } = await supabase
        .from("playlist_clips")
        .delete()
        .eq("playlist_id", playlist.id)
        .eq("clip_id", clipId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Clip removed from playlist",
      });

      setClips(clips.filter((c) => c.id !== clipId));
      setRemovingClipId(null);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to remove clip",
        variant: "destructive",
      });
      logError("Error removing clip", err);
    }
  };

  const copyShareLink = () => {
    if (!playlist?.share_token) return;

    const shareUrl = `${window.location.origin}/playlist/${playlist.share_token}`;
    navigator.clipboard.writeText(shareUrl);
    toast({
      title: "Link copied!",
      description: "Share this playlist with others",
    });
    setIsShareDialogOpen(false);
  };

  const loadSavedClips = async () => {
    if (!profile?.id || !playlist) return;

    setIsLoadingSavedClips(true);
    try {
      // Get saved clips
      const { data: savedClipsData } = await supabase
        .from("saved_clips")
        .select(
          `
          clip_id,
          clips (
            *,
            profiles (
              handle,
              emoji_avatar
            )
          )
        `,
        )
        .eq("profile_id", profile.id);

      if (savedClipsData) {
        const transformedClips = savedClipsData
          .map((saved: any) => {
            const clip = Array.isArray(saved.clips) ? saved.clips[0] : saved.clips;
            return clip as Clip | null;
          })
          .filter((clip): clip is Clip => clip !== null && clip !== undefined && clip.status === "live");

        // Filter out clips already in playlist
        const existingClipIds = new Set(clips.map((c) => c.id));
        const availableClips = transformedClips.filter((clip) => !existingClipIds.has(clip.id));

        setSavedClips(availableClips);
      }
    } catch (err) {
      logError("Error loading saved clips", err);
    } finally {
      setIsLoadingSavedClips(false);
    }
  };

  const handleAddClipToPlaylist = async (clipId: string) => {
    if (!playlist) return;

    try {
      const { error } = await supabase.from("playlist_clips").insert({
        playlist_id: playlist.id,
        clip_id: clipId,
        position: clips.length,
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Clip added to playlist",
      });

      // Reload playlist clips
      const { data: clipsData } = await supabase
        .from("playlist_clips")
        .select(
          `
          clip_id,
          position,
          clips (
            *,
            profiles (
              handle,
              emoji_avatar
            )
          )
        `,
        )
        .eq("playlist_id", playlist.id)
        .order("position", { ascending: true });

      if (clipsData) {
        const transformedClips = clipsData
          .map((item: any) => {
            const clip = Array.isArray(item.clips) ? item.clips[0] : item.clips;
            return clip as Clip | null;
          })
          .filter((clip): clip is Clip => clip !== null && clip !== undefined && clip.status === "live");

        setClips(transformedClips);
        setSavedClips(savedClips.filter((c) => c.id !== clipId));
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to add clip to playlist",
        variant: "destructive",
      });
      logError("Error adding clip to playlist", err);
    }
  };

  const isOwner = profile && playlist && playlist.profile_id === profile.id;

  if (isProfileLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <PageHeaderSkeleton />
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
          <PlaylistSkeleton />
        </main>
      </div>
    );
  }

  if (error || !playlist) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/playlists">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Playlist</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl space-y-3 text-center text-muted-foreground">
            <p>{error || "Playlist not found"}</p>
            <Button variant="outline" className="rounded-2xl mt-4" asChild>
              <Link to="/playlists">Back to Playlists</Link>
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/playlists">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold line-clamp-1">{playlist.name}</h1>
          </div>
          {isOwner && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              onClick={() => setIsShareDialogOpen(true)}
            >
              <Share2 className="h-5 w-5" />
            </Button>
          )}
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        <section className="space-y-4">
          <Card className="p-6 rounded-3xl">
            <div className="space-y-3">
              <div>
                <h2 className="text-2xl font-bold mb-2">{playlist.name}</h2>
                {playlist.description && (
                  <p className="text-muted-foreground">{playlist.description}</p>
                )}
              </div>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span>{clips.length} {clips.length === 1 ? "clip" : "clips"}</span>
                  </div>
                  {playlist.follower_count !== undefined && playlist.follower_count > 0 && (
                    <div className="flex items-center gap-1">
                      <Heart className="h-4 w-4" />
                      <span>{playlist.follower_count} {playlist.follower_count === 1 ? "follower" : "followers"}</span>
                    </div>
                  )}
                  {playlist.view_count !== undefined && playlist.view_count > 0 && (
                    <div className="flex items-center gap-1">
                      <Eye className="h-4 w-4" />
                      <span>{playlist.view_count} {playlist.view_count === 1 ? "view" : "views"}</span>
                    </div>
                  )}
                  {playlist.profiles && (
                    <span>
                      by @{playlist.profiles.handle}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!isOwner && playlist.is_public && (
                    <Button
                      variant={isFollowing ? "default" : "outline"}
                      size="sm"
                      onClick={toggleFollow}
                      disabled={isToggling}
                      className="rounded-2xl"
                    >
                      <Heart className={`h-4 w-4 mr-2 ${isFollowing ? "fill-current" : ""}`} />
                      {isFollowing ? "Following" : "Follow"}
                    </Button>
                  )}
                  {isOwner && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setIsAddClipsDialogOpen(true);
                          loadSavedClips();
                        }}
                        className="rounded-2xl"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Clips
                      </Button>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={isPublic}
                          onCheckedChange={handleTogglePublic}
                          disabled={isUpdating}
                        />
                        <Label className="text-sm">Public</Label>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="space-y-4">
          {clips.length === 0 ? (
            <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground space-y-3">
              <p>No clips in this playlist yet.</p>
              {isOwner && (
                <p className="text-sm">Add clips from your saved clips!</p>
              )}
            </Card>
          ) : (
            <div className="space-y-4">
              {clips.map((clip) => (
                <div key={clip.id} className="relative">
                  <ClipCard
                    clip={clip}
                    captionsDefault={profile?.default_captions ?? true}
                  />
                  {isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-2 right-2 h-8 w-8 rounded-full bg-background/80 backdrop-blur-sm"
                      onClick={() => setRemovingClipId(clip.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <Dialog open={isShareDialogOpen} onOpenChange={setIsShareDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Share Playlist</DialogTitle>
            <DialogDescription>
              {isPublic
                ? "Anyone with the link can view this playlist"
                : "Make the playlist public to share it"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isPublic && playlist.share_token ? (
              <div className="space-y-2">
                <Label>Share Link</Label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/playlist/${playlist.share_token}`}
                    className="flex-1 rounded-2xl border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button onClick={copyShareLink} className="rounded-2xl">
                    Copy
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Enable "Public" to generate a shareable link
              </p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsShareDialogOpen(false)}
              className="rounded-2xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddClipsDialogOpen} onOpenChange={setIsAddClipsDialogOpen}>
        <DialogContent className="sm:max-w-2xl rounded-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add Clips to Playlist</DialogTitle>
            <DialogDescription>
              Select clips from your saved clips to add to this playlist
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isLoadingSavedClips ? (
              <div className="space-y-2">
                <Skeleton className="h-24 w-full rounded-2xl" />
                <Skeleton className="h-24 w-full rounded-2xl" />
              </div>
            ) : savedClips.length === 0 ? (
              <Card className="p-6 rounded-3xl text-center text-muted-foreground">
                <p>No saved clips available to add.</p>
                <p className="text-sm mt-2">Save some clips first!</p>
              </Card>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {savedClips.map((clip) => (
                  <Card key={clip.id} className="p-4 rounded-2xl">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-lg">{clip.mood_emoji}</span>
                          {clip.title && (
                            <span className="font-medium truncate">{clip.title}</span>
                          )}
                        </div>
                        {clip.summary && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {clip.summary}
                          </p>
                        )}
                        {clip.profiles && (
                          <p className="text-xs text-muted-foreground mt-1">
                            @{clip.profiles.handle}
                          </p>
                        )}
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleAddClipToPlaylist(clip.id)}
                        className="rounded-2xl ml-4"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddClipsDialogOpen(false)}
              className="rounded-2xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={removingClipId !== null}
        onOpenChange={(open) => !open && setRemovingClipId(null)}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Clip?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the clip from the playlist. The clip itself won't be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removingClipId && handleRemoveClip(removingClipId)}
              className="rounded-2xl"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PlaylistDetail;

