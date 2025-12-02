import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Music, Share2, Sparkles, Trash2, Edit2, Heart, Compass, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useProfile } from "@/hooks/useProfile";
import { useFollowedCollections } from "@/hooks/useCollectionFollow";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { logError } from "@/lib/logger";
import { useToast } from "@/hooks/use-toast";
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

interface Playlist {
  id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  share_token: string | null;
  is_auto_generated: boolean;
  auto_generation_type: string | null;
  auto_generation_value: string | null;
  created_at: string;
  updated_at: string;
  clip_count?: number;
}

const Playlists = () => {
  const { profile, isLoading: isProfileLoading } = useProfile();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingPlaylistId, setDeletingPlaylistId] = useState<string | null>(null);
  const { toast } = useToast();
  const { followedCollections, isLoading: isLoadingFollowed } = useFollowedCollections();

  useEffect(() => {
    const loadPlaylists = async () => {
      if (!profile?.id) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        // First, generate/update auto-generated playlists
        await generateAutoPlaylists(profile.id);

        // Load user playlists with clip counts and stats
        const { data: playlistsData, error: playlistsError } = await supabase
          .from("playlists")
          .select(
            `
            *,
            playlist_clips(count)
          `,
          )
          .eq("profile_id", profile.id)
          .order("created_at", { ascending: false });

        if (playlistsError) {
          setError("Couldn't load playlists");
          logError("Error loading playlists", playlistsError);
        } else {
          const playlistsWithCounts = (playlistsData || []).map((playlist: any) => ({
            ...playlist,
            clip_count: Array.isArray(playlist.playlist_clips)
              ? playlist.playlist_clips[0]?.count || 0
              : 0,
          }));
          setPlaylists(playlistsWithCounts);
        }
      } catch (err) {
        setError("Couldn't load playlists");
        logError("Error loading playlists", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadPlaylists();
  }, [profile?.id]);

  const generateAutoPlaylists = async (profileId: string) => {
    try {
      // Get saved clips
      const { data: savedClipsData } = await supabase
        .from("saved_clips")
        .select(
          `
          clip_id,
          clips (
            id,
            mood_emoji,
            topic_id,
            tags,
            status
          )
        `,
        )
        .eq("profile_id", profileId);

      if (!savedClipsData) return;

      const liveClips = savedClipsData
        .map((saved: any) => {
          const clip = Array.isArray(saved.clips) ? saved.clips[0] : saved.clips;
          return clip;
        })
        .filter((clip: any) => clip && clip.status === "live");

      // Group by mood
      const moodGroups: Record<string, string[]> = {};
      liveClips.forEach((clip: any) => {
        if (clip.mood_emoji) {
          if (!moodGroups[clip.mood_emoji]) {
            moodGroups[clip.mood_emoji] = [];
          }
          moodGroups[clip.mood_emoji].push(clip.id);
        }
      });

      // Group by topic
      const topicGroups: Record<string, string[]> = {};
      liveClips.forEach((clip: any) => {
        if (clip.topic_id) {
          if (!topicGroups[clip.topic_id]) {
            topicGroups[clip.topic_id] = [];
          }
          topicGroups[clip.topic_id].push(clip.id);
        }
      });

      // Get existing auto-generated playlists
      const { data: existingPlaylists } = await supabase
        .from("playlists")
        .select("*")
        .eq("profile_id", profileId)
        .eq("is_auto_generated", true);

      const existingMap = new Map(
        (existingPlaylists || []).map((p: any) => [
          `${p.auto_generation_type}_${p.auto_generation_value}`,
          p,
        ]),
      );

      // Create/update mood playlists
      for (const [mood, clipIds] of Object.entries(moodGroups)) {
        if (clipIds.length < 2) continue; // Only create if 2+ clips

        const key = `mood_${mood}`;
        const existing = existingMap.get(key);

        const playlistName = `${mood} Mood`;
        const playlistDescription = `Auto-generated playlist of ${mood} clips`;

        if (existing) {
          // Update existing playlist clips
          const { data: currentClips } = await supabase
            .from("playlist_clips")
            .select("clip_id")
            .eq("playlist_id", existing.id);

          const currentClipIds = new Set((currentClips || []).map((c: any) => c.clip_id));
          const newClipIds = clipIds.filter((id) => !currentClipIds.has(id));

          // Add new clips
          if (newClipIds.length > 0) {
            await supabase.from("playlist_clips").insert(
              newClipIds.map((clipId, index) => ({
                playlist_id: existing.id,
                clip_id: clipId,
                position: (currentClips?.length || 0) + index,
              })),
            );
          }

          // Remove clips that are no longer saved
          const clipsToRemove = Array.from(currentClipIds).filter((id) => !clipIds.includes(id));
          if (clipsToRemove.length > 0) {
            await supabase
              .from("playlist_clips")
              .delete()
              .eq("playlist_id", existing.id)
              .in("clip_id", clipsToRemove);
          }
        } else {
          // Create new playlist
          const { data: newPlaylist } = await supabase
            .from("playlists")
            .insert({
              profile_id: profileId,
              name: playlistName,
              description: playlistDescription,
              is_auto_generated: true,
              auto_generation_type: "mood",
              auto_generation_value: mood,
              is_public: false,
            })
            .select()
            .single();

          if (newPlaylist) {
            // Add clips to playlist
            await supabase.from("playlist_clips").insert(
              clipIds.map((clipId, index) => ({
                playlist_id: newPlaylist.id,
                clip_id: clipId,
                position: index,
              })),
            );
          }
        }
      }

      // Create/update topic playlists
      for (const [topicId, clipIds] of Object.entries(topicGroups)) {
        if (clipIds.length < 2) continue; // Only create if 2+ clips

        // Get topic name
        const { data: topic } = await supabase.from("topics").select("title").eq("id", topicId).single();
        const topicName = topic?.title || "Unknown Topic";

        const key = `topic_${topicId}`;
        const existing = existingMap.get(key);

        const playlistName = `${topicName}`;
        const playlistDescription = `Auto-generated playlist from ${topicName}`;

        if (existing) {
          // Update existing playlist clips
          const { data: currentClips } = await supabase
            .from("playlist_clips")
            .select("clip_id")
            .eq("playlist_id", existing.id);

          const currentClipIds = new Set((currentClips || []).map((c: any) => c.clip_id));
          const newClipIds = clipIds.filter((id) => !currentClipIds.has(id));

          // Add new clips
          if (newClipIds.length > 0) {
            await supabase.from("playlist_clips").insert(
              newClipIds.map((clipId, index) => ({
                playlist_id: existing.id,
                clip_id: clipId,
                position: (currentClips?.length || 0) + index,
              })),
            );
          }

          // Remove clips that are no longer saved
          const clipsToRemove = Array.from(currentClipIds).filter((id) => !clipIds.includes(id));
          if (clipsToRemove.length > 0) {
            await supabase
              .from("playlist_clips")
              .delete()
              .eq("playlist_id", existing.id)
              .in("clip_id", clipsToRemove);
          }
        } else {
          // Create new playlist
          const { data: newPlaylist } = await supabase
            .from("playlists")
            .insert({
              profile_id: profileId,
              name: playlistName,
              description: playlistDescription,
              is_auto_generated: true,
              auto_generation_type: "topic",
              auto_generation_value: topicId,
              is_public: false,
            })
            .select()
            .single();

          if (newPlaylist) {
            // Add clips to playlist
            await supabase.from("playlist_clips").insert(
              clipIds.map((clipId, index) => ({
                playlist_id: newPlaylist.id,
                clip_id: clipId,
                position: index,
              })),
            );
          }
        }
      }
    } catch (err) {
      logError("Error generating auto-playlists", err);
    }
  };

  const handleCreatePlaylist = async () => {
    if (!profile?.id || !newPlaylistName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a playlist name",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);
    try {
      const { data, error: createError } = await supabase
        .from("playlists")
        .insert({
          profile_id: profile.id,
          name: newPlaylistName.trim(),
          description: newPlaylistDescription.trim() || null,
          is_public: false,
        })
        .select()
        .single();

      if (createError) {
        throw createError;
      }

      toast({
        title: "Success",
        description: "Playlist created!",
      });

      setNewPlaylistName("");
      setNewPlaylistDescription("");
      setIsCreateDialogOpen(false);

      // Reload playlists
      const { data: playlistsData } = await supabase
        .from("playlists")
        .select(
          `
          *,
          playlist_clips(count)
        `,
        )
        .eq("profile_id", profile.id)
        .order("created_at", { ascending: false });

      if (playlistsData) {
        const playlistsWithCounts = playlistsData.map((playlist: any) => ({
          ...playlist,
          clip_count: Array.isArray(playlist.playlist_clips)
            ? playlist.playlist_clips[0]?.count || 0
            : 0,
        }));
        setPlaylists(playlistsWithCounts);
      }
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to create playlist",
        variant: "destructive",
      });
      logError("Error creating playlist", err);
    } finally {
      setIsCreating(false);
    }
  };

  const handleDeletePlaylist = async (playlistId: string) => {
    try {
      const { error } = await supabase.from("playlists").delete().eq("id", playlistId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Playlist deleted",
      });

      setPlaylists(playlists.filter((p) => p.id !== playlistId));
      setDeletingPlaylistId(null);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to delete playlist",
        variant: "destructive",
      });
      logError("Error deleting playlist", err);
    }
  };

  if (isProfileLoading) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-8 w-32" />
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
          <Skeleton className="h-32 w-full rounded-3xl" />
          <Skeleton className="h-24 w-full rounded-3xl" />
        </main>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-background pb-24">
        <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
          <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Playlists</h1>
          </div>
        </header>
        <main className="max-w-2xl mx-auto px-4 py-6">
          <Card className="p-6 rounded-3xl space-y-3 text-center text-muted-foreground">
            <p>Please sign in to view your playlists.</p>
            <Button variant="outline" className="rounded-2xl mt-4" asChild>
              <Link to="/">Back to home</Link>
            </Button>
          </Card>
        </main>
      </div>
    );
  }

  const userPlaylists = playlists.filter((p) => !p.is_auto_generated);
  const autoGeneratedPlaylists = playlists.filter((p) => p.is_auto_generated);

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" asChild className="rounded-full">
              <Link to="/">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">Playlists</h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
              className="rounded-2xl"
            >
              <Link to="/collections">
                <Compass className="h-4 w-4 mr-2" />
                Discover
              </Link>
            </Button>
            <Button
              onClick={() => setIsCreateDialogOpen(true)}
              size="sm"
              className="rounded-2xl"
            >
              <Plus className="h-4 w-4 mr-2" />
              New
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-8">
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-32 w-full rounded-3xl" />
            ))}
          </div>
        ) : error ? (
          <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground">
            {error}
          </Card>
        ) : (
          <>
            {followedCollections.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Heart className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Followed Collections</h2>
                </div>
                <div className="grid gap-4">
                  {followedCollections.map((collection: any) => (
                    <Card
                      key={collection.id}
                      className="p-4 rounded-3xl hover:bg-card/80 transition-colors"
                    >
                      <Link to={`/playlist/${collection.share_token || collection.id}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Music className="h-4 w-4 text-primary" />
                              <h3 className="font-semibold">{collection.name}</h3>
                            </div>
                            {collection.description && (
                              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                {collection.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              <span className="font-medium">{collection.clip_count || 0} clips</span>
                              {collection.is_public && (
                                <>
                                  {collection.follower_count !== undefined && collection.follower_count > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Heart className="h-3 w-3" />
                                      <span className="font-medium">{collection.follower_count} {collection.follower_count === 1 ? "follower" : "followers"}</span>
                                    </span>
                                  )}
                                  {collection.view_count !== undefined && collection.view_count > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Eye className="h-3 w-3" />
                                      <span className="font-medium">{collection.view_count} {collection.view_count === 1 ? "view" : "views"}</span>
                                    </span>
                                  )}
                                </>
                              )}
                              {collection.profiles && (
                                <span>by @{collection.profiles.handle}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </Link>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {userPlaylists.length > 0 && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Your Playlists</h2>
                <div className="grid gap-4">
                  {userPlaylists.map((playlist) => (
                    <Card
                      key={playlist.id}
                      className="p-4 rounded-3xl hover:bg-card/80 transition-colors"
                    >
                      <Link to={`/playlist/${playlist.id}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Music className="h-4 w-4 text-primary" />
                              <h3 className="font-semibold">{playlist.name}</h3>
                            </div>
                            {playlist.description && (
                              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                {playlist.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap">
                              <span className="font-medium">{playlist.clip_count || 0} clips</span>
                              {playlist.is_public && (
                                <>
                                  <span className="flex items-center gap-1">
                                    <Share2 className="h-3 w-3" />
                                    Public
                                  </span>
                                  {playlist.follower_count !== undefined && playlist.follower_count > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Heart className="h-3 w-3" />
                                      <span className="font-medium">{playlist.follower_count} {playlist.follower_count === 1 ? "follower" : "followers"}</span>
                                    </span>
                                  )}
                                  {playlist.view_count !== undefined && playlist.view_count > 0 && (
                                    <span className="flex items-center gap-1">
                                      <Eye className="h-3 w-3" />
                                      <span className="font-medium">{playlist.view_count} {playlist.view_count === 1 ? "view" : "views"}</span>
                                    </span>
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {playlist.share_token && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 rounded-full"
                                onClick={(e) => {
                                  e.preventDefault();
                                  const shareUrl = `${window.location.origin}/playlist/${playlist.share_token}`;
                                  navigator.clipboard.writeText(shareUrl);
                                  toast({
                                    title: "Link copied!",
                                    description: "Share this playlist with others",
                                  });
                                }}
                              >
                                <Share2 className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              onClick={(e) => {
                                e.preventDefault();
                                setDeletingPlaylistId(playlist.id);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </Link>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {autoGeneratedPlaylists.length > 0 && (
              <section className="space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold">Auto-Generated</h2>
                </div>
                <div className="grid gap-4">
                  {autoGeneratedPlaylists.map((playlist) => (
                    <Card
                      key={playlist.id}
                      className="p-4 rounded-3xl hover:bg-card/80 transition-colors"
                    >
                      <Link to={`/playlist/${playlist.id}`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Sparkles className="h-4 w-4 text-primary" />
                              <h3 className="font-semibold">{playlist.name}</h3>
                            </div>
                            {playlist.description && (
                              <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                                {playlist.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 text-xs text-muted-foreground">
                              <span>{playlist.clip_count || 0} clips</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {userPlaylists.length === 0 && autoGeneratedPlaylists.length === 0 && (
              <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground space-y-3">
                <Music className="h-12 w-12 mx-auto opacity-50" />
                <p>No playlists yet.</p>
                <p className="text-sm">Create a playlist to organize your saved clips!</p>
                <Button
                  onClick={() => setIsCreateDialogOpen(true)}
                  className="rounded-2xl mt-4"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Playlist
                </Button>
              </Card>
            )}
          </>
        )}
      </main>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Create Playlist</DialogTitle>
            <DialogDescription>
              Organize your saved clips into playlists
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                placeholder="My Playlist"
                className="rounded-2xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleCreatePlaylist();
                  }
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={newPlaylistDescription}
                onChange={(e) => setNewPlaylistDescription(e.target.value)}
                placeholder="What's this playlist about?"
                className="rounded-2xl"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreatePlaylist}
              disabled={isCreating || !newPlaylistName.trim()}
              className="rounded-2xl"
            >
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deletingPlaylistId !== null}
        onOpenChange={(open) => !open && setDeletingPlaylistId(null)}
      >
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playlist?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the playlist and remove all clips from it. This action
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-2xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deletingPlaylistId && handleDeletePlaylist(deletingPlaylistId)}
              className="rounded-2xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Playlists;

