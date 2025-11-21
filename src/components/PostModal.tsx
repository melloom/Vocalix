import { useState, useRef, useEffect } from "react";
import { X, Type, Video, Mic, Link as LinkIcon, Upload, Play, Pause, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { useProfile } from "@/hooks/useProfile";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useQuery } from "@tanstack/react-query";

type PostType = "text" | "video" | "audio" | "link";

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  communityId?: string | null;
  topicId?: string | null;
}

export const PostModal = ({ isOpen, onClose, onSuccess, communityId, topicId }: PostModalProps) => {
  const [postType, setPostType] = useState<PostType>("text");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [audioPreview, setAudioPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [isNSFW, setIsNSFW] = useState(false);
  const [selectedFlairId, setSelectedFlairId] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { profile } = useProfile();
  const videoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const audioPlayerRef = useRef<HTMLAudioElement>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // Fetch communities for selection
  const { data: communities } = useQuery({
    queryKey: ["communities"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("id, name, slug")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  // Fetch flairs for selected community
  const { data: flairs } = useQuery({
    queryKey: ["flairs", communityId],
    queryFn: async () => {
      if (!communityId) return [];
      const { data, error } = await supabase
        .from("clip_flairs")
        .select("id, name, color, background_color")
        .eq("community_id", communityId);
      if (error) throw error;
      return data;
    },
    enabled: !!communityId,
  });

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setPostType("text");
      setTitle("");
      setContent("");
      setLinkUrl("");
      setVideoFile(null);
      setAudioFile(null);
      setVideoPreview(null);
      setAudioPreview(null);
      setTags([]);
      setTagInput("");
      setIsNSFW(false);
      setSelectedFlairId(null);
    }
  }, [isOpen]);

  // Handle video file selection
  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      toast({
        title: "Invalid file type",
        description: "Please select a video file",
        variant: "destructive",
      });
      return;
    }

    // Check file size (max 100MB)
    if (file.size > 100 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Video must be less than 100MB",
        variant: "destructive",
      });
      return;
    }

    setVideoFile(file);
    const previewUrl = URL.createObjectURL(file);
    setVideoPreview(previewUrl);
  };

  // Handle audio file selection
  const handleAudioSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("audio/")) {
      toast({
        title: "Invalid file type",
        description: "Please select an audio file",
        variant: "destructive",
      });
      return;
    }

    setAudioFile(file);
    const previewUrl = URL.createObjectURL(file);
    setAudioPreview(previewUrl);
  };

  // Parse tags from input
  const parseTags = (value: string): string[] => {
    return value
      .split(/[,\s]+/)
      .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
      .filter((tag, index, all) => tag.length > 0 && all.indexOf(tag) === index);
  };

  const handleTagInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setTagInput(value);
    const newTags = parseTags(value);
    setTags(newTags);
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((tag) => tag !== tagToRemove));
    setTagInput(tags.filter((tag) => tag !== tagToRemove).join(", "));
  };

  // Handle video playback
  const toggleVideoPlayback = () => {
    if (!videoPlayerRef.current) return;
    if (isPlayingVideo) {
      videoPlayerRef.current.pause();
    } else {
      videoPlayerRef.current.play();
    }
    setIsPlayingVideo(!isPlayingVideo);
  };

  // Handle audio playback
  const toggleAudioPlayback = () => {
    if (!audioPlayerRef.current) return;
    if (isPlayingAudio) {
      audioPlayerRef.current.pause();
    } else {
      audioPlayerRef.current.play();
    }
    setIsPlayingAudio(!isPlayingAudio);
  };

  // Submit post
  const handleSubmit = async () => {
    if (!profile?.id) {
      toast({
        title: "Profile missing",
        description: "Please finish onboarding before posting",
        variant: "destructive",
      });
      return;
    }

    // Validation
    if (postType === "text" && !title.trim() && !content.trim()) {
      toast({
        title: "Content required",
        description: "Please add a title or content to your post",
        variant: "destructive",
      });
      return;
    }

    if (postType === "video" && !videoFile) {
      toast({
        title: "Video required",
        description: "Please select a video file",
        variant: "destructive",
      });
      return;
    }

    if (postType === "audio" && !audioFile) {
      toast({
        title: "Audio required",
        description: "Please select an audio file",
        variant: "destructive",
      });
      return;
    }

    if (postType === "link" && !linkUrl.trim()) {
      toast({
        title: "Link required",
        description: "Please enter a URL",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      let videoPath: string | null = null;
      let videoThumbnailPath: string | null = null;
      let audioPath: string | null = null;
      let durationSeconds: number | null = null;

      // Upload video
      if (postType === "video" && videoFile) {
        const fileName = `${profile.id}/posts/videos/${Date.now()}-${videoFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("videos")
          .upload(fileName, videoFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) {
          // If videos bucket doesn't exist, try uploading to audio bucket as fallback
          const { error: fallbackError } = await supabase.storage
            .from("audio")
            .upload(fileName, videoFile);
          if (fallbackError) throw fallbackError;
          videoPath = fileName;
        } else {
          videoPath = fileName;
        }

        // Generate thumbnail (simplified - in production, use video processing)
        // For now, we'll use the first frame or a placeholder
        videoThumbnailPath = videoPath.replace(/\.[^/.]+$/, "-thumb.jpg");
      }

      // Upload audio
      if (postType === "audio" && audioFile) {
        const fileName = `${profile.id}/posts/audio/${Date.now()}-${audioFile.name}`;
        const { error: uploadError } = await supabase.storage
          .from("audio")
          .upload(fileName, audioFile, {
            cacheControl: "3600",
            upsert: false,
          });

        if (uploadError) throw uploadError;
        audioPath = fileName;

        // Get audio duration
        const audio = new Audio(URL.createObjectURL(audioFile));
        await new Promise((resolve) => {
          audio.addEventListener("loadedmetadata", () => {
            durationSeconds = Math.floor(audio.duration);
            resolve(null);
          });
        });
      }

      // Create post
      const { data: post, error: insertError } = await supabase
        .from("posts")
        .insert({
          profile_id: profile.id,
          community_id: communityId || null,
          topic_id: topicId || null,
          post_type: postType,
          title: title.trim() || null,
          content: content.trim() || null,
          video_path: videoPath,
          video_thumbnail_path: videoThumbnailPath,
          audio_path: audioPath,
          link_url: postType === "link" ? linkUrl.trim() : null,
          duration_seconds: durationSeconds,
          tags: tags.length > 0 ? tags : null,
          is_nsfw: isNSFW,
          content_rating: isNSFW ? "sensitive" : "general",
          flair_id: selectedFlairId,
          status: "live",
          visibility: "public",
        })
        .select()
        .single();

      if (insertError) throw insertError;

      toast({
        title: "Post created!",
        description: "Your post has been published",
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      logError("Error creating post", error);
      toast({
        title: "Failed to create post",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create a Post</DialogTitle>
          <DialogDescription>
            Share your thoughts, videos, audio, or links with the community
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Post Type Selector */}
          <Tabs value={postType} onValueChange={(v) => setPostType(v as PostType)}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="text">
                <Type className="h-4 w-4 mr-2" />
                Text
              </TabsTrigger>
              <TabsTrigger value="video">
                <Video className="h-4 w-4 mr-2" />
                Video
              </TabsTrigger>
              <TabsTrigger value="audio">
                <Mic className="h-4 w-4 mr-2" />
                Audio
              </TabsTrigger>
              <TabsTrigger value="link">
                <LinkIcon className="h-4 w-4 mr-2" />
                Link
              </TabsTrigger>
            </TabsList>

            {/* Text Post */}
            <TabsContent value="text" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title (Optional)</Label>
                <Input
                  id="title"
                  placeholder="Add a title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={300}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Content *</Label>
                <Textarea
                  id="content"
                  placeholder="What's on your mind?"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={6}
                  maxLength={10000}
                />
                <p className="text-xs text-muted-foreground">
                  {content.length}/10000 characters
                </p>
              </div>
            </TabsContent>

            {/* Video Post */}
            <TabsContent value="video" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title (Optional)</Label>
                <Input
                  id="title"
                  placeholder="Add a title for your video..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={300}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Description (Optional)</Label>
                <Textarea
                  id="content"
                  placeholder="Describe your video..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>
              <div className="space-y-2">
                <Label>Video File *</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => videoInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {videoFile ? "Change Video" : "Select Video"}
                  </Button>
                  <input
                    ref={videoInputRef}
                    type="file"
                    accept="video/*"
                    onChange={handleVideoSelect}
                    className="hidden"
                  />
                  {videoFile && (
                    <Badge variant="secondary">
                      {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(2)} MB)
                    </Badge>
                  )}
                </div>
                {videoPreview && (
                  <div className="relative mt-2">
                    <video
                      ref={videoPlayerRef}
                      src={videoPreview}
                      className="w-full rounded-lg max-h-64"
                      onEnded={() => setIsPlayingVideo(false)}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={toggleVideoPlayback}
                    >
                      {isPlayingVideo ? (
                        <Pause className="h-4 w-4" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Audio Post */}
            <TabsContent value="audio" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title (Optional)</Label>
                <Input
                  id="title"
                  placeholder="Add a title for your audio..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={300}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Description (Optional)</Label>
                <Textarea
                  id="content"
                  placeholder="Describe your audio..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>
              <div className="space-y-2">
                <Label>Audio File *</Label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => audioInputRef.current?.click()}
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    {audioFile ? "Change Audio" : "Select Audio"}
                  </Button>
                  <input
                    ref={audioInputRef}
                    type="file"
                    accept="audio/*"
                    onChange={handleAudioSelect}
                    className="hidden"
                  />
                  {audioFile && (
                    <Badge variant="secondary">
                      {audioFile.name} ({(audioFile.size / 1024 / 1024).toFixed(2)} MB)
                    </Badge>
                  )}
                </div>
                {audioPreview && (
                  <div className="mt-2">
                    <audio
                      ref={audioPlayerRef}
                      src={audioPreview}
                      controls
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Link Post */}
            <TabsContent value="link" className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="linkUrl">URL *</Label>
                <Input
                  id="linkUrl"
                  type="url"
                  placeholder="https://example.com"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="title">Title (Optional)</Label>
                <Input
                  id="title"
                  placeholder="Add a title..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={300}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="content">Description (Optional)</Label>
                <Textarea
                  id="content"
                  placeholder="Add a description..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={3}
                  maxLength={1000}
                />
              </div>
            </TabsContent>
          </Tabs>

          {/* Common Fields */}
          <div className="space-y-4 pt-4 border-t">
            {/* Tags */}
            <div className="space-y-2">
              <Label htmlFor="tags">Tags (Optional)</Label>
              <Input
                id="tags"
                placeholder="Add tags separated by commas..."
                value={tagInput}
                onChange={handleTagInputChange}
              />
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {tags.map((tag) => (
                    <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                      #{tag} <X className="h-3 w-3 ml-1" />
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Community Selection */}
            {!communityId && communities && communities.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="community">Post to Community (Optional)</Label>
                <Select onValueChange={(v) => {}}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a community" />
                  </SelectTrigger>
                  <SelectContent>
                    {communities.map((comm) => (
                      <SelectItem key={comm.id} value={comm.id}>
                        {comm.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Flair Selection */}
            {flairs && flairs.length > 0 && (
              <div className="space-y-2">
                <Label>Flair (Optional)</Label>
                <div className="flex flex-wrap gap-2">
                  {flairs.map((flair) => (
                    <Badge
                      key={flair.id}
                      variant={selectedFlairId === flair.id ? "default" : "outline"}
                      className="cursor-pointer"
                      style={{
                        backgroundColor: selectedFlairId === flair.id ? flair.background_color : undefined,
                        color: selectedFlairId === flair.id ? flair.color : undefined,
                      }}
                      onClick={() => setSelectedFlairId(selectedFlairId === flair.id ? null : flair.id)}
                    >
                      {flair.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* NSFW Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="nsfw">NSFW Content</Label>
                <p className="text-xs text-muted-foreground">
                  Mark if this post contains sensitive content
                </p>
              </div>
              <Switch id="nsfw" checked={isNSFW} onCheckedChange={setIsNSFW} />
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={isUploading}>
              {isUploading ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

