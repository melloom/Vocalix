import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Share2, Plus, Trash2, X, Heart, Eye, Users, UserPlus, UserMinus, Play, Shuffle, SkipForward, SkipBack } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ClipCard } from "@/components/ClipCard";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlaylistSkeleton, PageHeaderSkeleton } from "@/components/ui/content-skeletons";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { useCollectionFollow, useTrackCollectionView } from "@/hooks/useCollectionFollow";
import { logError } from "@/lib/logger";
import { useAudioPlayer } from "@/context/AudioPlayerContext";
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
  const [isCollaboratorsDialogOpen, setIsCollaboratorsDialogOpen] = useState(false);
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [isLoadingCollaborators, setIsLoadingCollaborators] = useState(false);
  const [inviteHandle, setInviteHandle] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const { toast } = useToast();
  const { isFollowing, toggleFollow, isToggling } = useCollectionFollow(playlist?.id || null);
  const trackView = useTrackCollectionView();
  const audioPlayer = useAudioPlayer();

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
          ),
          playlist_clips(count)
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
            ),
            playlist_clips(count)
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

  useEffect(() => {
    loadPlaylist();

    // Real-time subscription for playlist updates
    if (!playlistId) return;

    const channel = supabase
      .channel(`playlist-${playlistId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "playlist_clips",
          filter: `playlist_id=eq.${playlistId}`,
        },
        async (payload) => {
          // Reload clips when new clip is added
          loadPlaylist();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "playlist_clips",
          filter: `playlist_id=eq.${playlistId}`,
        },
        async (payload) => {
          // Reload clips when clip is removed
          loadPlaylist();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "playlists",
          filter: `id=eq.${playlistId}`,
        },
        async (payload) => {
          // Reload playlist when updated
          loadPlaylist();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "playlist_collaborators",
          filter: `playlist_id=eq.${playlistId}`,
        },
        async (payload) => {
          // Reload collaborators when changed
          if (isCollaboratorsDialogOpen) {
            // Reload collaborators list if dialog is open
            const { data } = await supabase.rpc("get_playlist_collaborators", {
              playlist_id_param: playlistId,
            });
            if (data) {
              setCollaborators(data);
            }
          }
        }
      )
      .subscribe((status, err) => {
        if (err && (err.message?.includes("WebSocket") || err.message?.includes("websocket"))) {
          // Suppress WebSocket errors - non-critical
          return;
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [playlistId, profile?.id, isCollaboratorsDialogOpen]);

  // Set playlist queue when clips are loaded
  useEffect(() => {
    if (clips.length > 0) {
      const playlistClips = clips.map(c => ({
        id: c.id,
        title: c.title || undefined,
        summary: c.summary || undefined,
        audio_path: c.audio_path,
        profiles: c.profiles || undefined,
      }));
      // Only update queue if it's different or empty
      if (audioPlayer.playlistQueue.length === 0 || 
          audioPlayer.playlistQueue.length !== playlistClips.length ||
          audioPlayer.playlistQueue[0]?.id !== playlistClips[0]?.id) {
        audioPlayer.setPlaylistQueue(playlistClips);
      }
    }
  }, [clips, audioPlayer]);

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
      description: "Share this collection with others",
    });
    setIsShareDialogOpen(false);
  };

  const handleNativeShare = async () => {
    if (!playlist?.share_token) return;

    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({
          title: playlist.name,
          text: playlist.description || `Check out this collection: ${playlist.name}`,
          url: `${window.location.origin}/playlist/${playlist.share_token}`,
        });
        setIsShareDialogOpen(false);
      } catch (error: any) {
        // User cancelled or error occurred
        if (error.name !== "AbortError") {
          logError("Failed to share", error);
        }
      }
    }
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
  
  // Check if user can edit (owner or editor collaborator)
  const canEdit = async () => {
    if (!profile || !playlist) return false;
    if (isOwner) return true;
    
    const { data } = await supabase.rpc('can_edit_playlist', {
      playlist_id_param: playlist.id,
      profile_id_param: profile.id,
    });
    return data || false;
  };

  const loadCollaborators = async () => {
    if (!playlist?.id) return;
    
    setIsLoadingCollaborators(true);
    try {
      const { data, error } = await supabase.rpc('get_playlist_collaborators', {
        playlist_id_param: playlist.id,
      });
      
      if (error) throw error;
      setCollaborators(data || []);
    } catch (err) {
      logError('Error loading collaborators', err);
      toast({
        title: 'Error',
        description: 'Failed to load collaborators',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingCollaborators(false);
    }
  };

  const handleInviteCollaborator = async () => {
    if (!playlist || !profile || !inviteHandle.trim()) return;
    
    setIsInviting(true);
    try {
      // Find user by handle
      const { data: targetProfile, error: findError } = await supabase
        .from('profiles')
        .select('id')
        .eq('handle', inviteHandle.trim())
        .single();
      
      if (findError || !targetProfile) {
        toast({
          title: 'User not found',
          description: `No user found with handle @${inviteHandle.trim()}`,
          variant: 'destructive',
        });
        return;
      }
      
      if (targetProfile.id === profile.id) {
        toast({
          title: 'Error',
          description: 'You cannot invite yourself',
          variant: 'destructive',
        });
        return;
      }
      
      // Add collaborator
      const { error: inviteError } = await supabase
        .from('playlist_collaborators')
        .insert({
          playlist_id: playlist.id,
          profile_id: targetProfile.id,
          role: 'editor',
          invited_by: profile.id,
        });
      
      if (inviteError) throw inviteError;
      
      toast({
        title: 'Success',
        description: `@${inviteHandle.trim()} has been added as a collaborator`,
      });
      
      setInviteHandle('');
      await loadCollaborators();
    } catch (err) {
      logError('Error inviting collaborator', err);
      toast({
        title: 'Error',
        description: 'Failed to invite collaborator',
        variant: 'destructive',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRemoveCollaborator = async (collaboratorId: string) => {
    if (!playlist) return;
    
    try {
      const { error } = await supabase
        .from('playlist_collaborators')
        .delete()
        .eq('playlist_id', playlist.id)
        .eq('profile_id', collaboratorId);
      
      if (error) throw error;
      
      toast({
        title: 'Success',
        description: 'Collaborator removed',
      });
      
      await loadCollaborators();
    } catch (err) {
      logError('Error removing collaborator', err);
      toast({
        title: 'Error',
        description: 'Failed to remove collaborator',
        variant: 'destructive',
      });
    }
  };

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
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <div className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    <span className="font-medium">{clips.length} {clips.length === 1 ? "clip" : "clips"}</span>
                  </div>
                  {playlist.is_public && (
                    <>
                      {playlist.follower_count !== undefined && (
                        <div className="flex items-center gap-1">
                          <Heart className="h-4 w-4" />
                          <span className="font-medium">{playlist.follower_count || 0} {playlist.follower_count === 1 ? "follower" : "followers"}</span>
                        </div>
                      )}
                      {playlist.view_count !== undefined && (
                        <div className="flex items-center gap-1">
                          <Eye className="h-4 w-4" />
                          <span className="font-medium">{playlist.view_count || 0} {playlist.view_count === 1 ? "view" : "views"}</span>
                        </div>
                      )}
                    </>
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
                          setIsCollaboratorsDialogOpen(true);
                          loadCollaborators();
                        }}
                        className="rounded-2xl"
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Collaborators
                      </Button>
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
          {clips.length > 0 && (
            <Card className="p-4 rounded-3xl bg-muted/50">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Button
                    onClick={() => {
                      const playlistClips = clips.map(c => ({
                        id: c.id,
                        title: c.title || undefined,
                        summary: c.summary || undefined,
                        audio_path: c.audio_path,
                        profiles: c.profiles || undefined,
                      }));
                      audioPlayer.setPlaylistQueue(playlistClips, 0);
                      if (playlistClips.length > 0) {
                        audioPlayer.playClip(playlistClips[0]);
                      }
                    }}
                    className="rounded-2xl"
                  >
                    <Play className="h-4 w-4 mr-2" />
                    Play All
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={audioPlayer.playPrevious}
                    disabled={!audioPlayer.hasPrevious}
                    className="rounded-2xl"
                  >
                    <SkipBack className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={audioPlayer.playNext}
                    disabled={!audioPlayer.hasNext}
                    className="rounded-2xl"
                  >
                    <SkipForward className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={audioPlayer.autoPlayEnabled}
                      onCheckedChange={audioPlayer.setAutoPlayEnabled}
                    />
                    <Label className="text-sm">Auto-play</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant={audioPlayer.shuffleEnabled ? "default" : "outline"}
                      size="sm"
                      onClick={() => audioPlayer.setShuffleEnabled(!audioPlayer.shuffleEnabled)}
                      className="rounded-2xl"
                    >
                      <Shuffle className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}
          {clips.length === 0 ? (
            <Card className="p-6 rounded-3xl bg-muted text-center text-muted-foreground space-y-3">
              <p>No clips in this playlist yet.</p>
              {isOwner && (
                <p className="text-sm">Add clips from your saved clips!</p>
              )}
            </Card>
          ) : (
            <div className="space-y-4">
              {clips.map((clip, index) => (
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
            <DialogTitle>Share Collection</DialogTitle>
            <DialogDescription>
              {isPublic
                ? "Anyone with the link can view this collection"
                : "Make the collection public to share it"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {isPublic && playlist.share_token ? (
              <div className="space-y-3">
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
                {typeof navigator !== "undefined" && "share" in navigator && (
                  <Button
                    onClick={handleNativeShare}
                    variant="outline"
                    className="w-full rounded-2xl"
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Share via...
                  </Button>
                )}
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

      <Dialog open={isCollaboratorsDialogOpen} onOpenChange={setIsCollaboratorsDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>Collaborators</DialogTitle>
            <DialogDescription>
              Invite others to help manage this playlist
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Invite by Handle</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="@username"
                  value={inviteHandle}
                  onChange={(e) => setInviteHandle(e.target.value)}
                  className="rounded-2xl"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !isInviting && inviteHandle.trim()) {
                      handleInviteCollaborator();
                    }
                  }}
                />
                <Button
                  onClick={handleInviteCollaborator}
                  disabled={isInviting || !inviteHandle.trim()}
                  className="rounded-2xl"
                >
                  <UserPlus className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Current Collaborators</Label>
              {isLoadingCollaborators ? (
                <div className="space-y-2">
                  {Array.from({ length: 2 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-2xl" />
                  ))}
                </div>
              ) : collaborators.length === 0 ? (
                <Card className="p-4 rounded-2xl text-center text-muted-foreground text-sm">
                  No collaborators yet
                </Card>
              ) : (
                <div className="space-y-2">
                  {collaborators.map((collab) => (
                    <Card key={collab.profile_id} className="p-3 rounded-2xl">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{collab.emoji_avatar}</div>
                          <div>
                            <p className="font-semibold text-sm">@{collab.handle}</p>
                            <p className="text-xs text-muted-foreground capitalize">{collab.role}</p>
                          </div>
                        </div>
                        {isOwner && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 rounded-full"
                            onClick={() => handleRemoveCollaborator(collab.profile_id)}
                          >
                            <UserMinus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsCollaboratorsDialogOpen(false)}
              className="rounded-2xl"
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlaylistDetail;

