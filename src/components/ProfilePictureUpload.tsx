import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { getEmojiAvatar } from "@/utils/avatar";

interface ProfilePictureUploadProps {
  onSuccess?: () => void;
}

export function ProfilePictureUpload({ onSuccess }: ProfilePictureUploadProps = {}) {
  const { profile, updateProfile, isUpdating } = useProfile();
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    // Validate file size (5MB limit)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !profile?.id) return;

    setIsUploading(true);
    try {
      // Get auth user ID for folder structure
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || profile.id;

      // Upload to storage
      const fileName = `${userId}/profile-picture-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("profile-images")
        .getPublicUrl(fileName);

      // Update profile
      await updateProfile({ profile_picture_url: publicUrl });
      toast.success("Profile picture updated!");
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onSuccess?.();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload profile picture");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!profile?.profile_picture_url) return;

    try {
      await updateProfile({ profile_picture_url: null });
      toast.success("Profile picture removed");
      setPreview(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to remove profile picture");
    }
  };

  const currentImage = preview || profile?.profile_picture_url || null;

  return (
    <Card className="p-6 rounded-3xl space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Profile Picture</h3>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative">
          <Avatar className="h-24 w-24 border-4 border-primary/20">
            {currentImage ? (
              <AvatarImage src={currentImage} alt="Profile" />
            ) : (
              <AvatarFallback className="text-4xl">
                {getEmojiAvatar(profile?.emoji_avatar, "🎧")}
              </AvatarFallback>
            )}
          </Avatar>
          {currentImage && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              onClick={handleRemove}
              disabled={isUpdating}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isUpdating}
              className="rounded-2xl"
            >
              <Upload className="h-4 w-4 mr-2" />
              {currentImage ? "Change Picture" : "Upload Picture"}
            </Button>
            {preview && (
              <Button
                onClick={handleUpload}
                disabled={isUploading || isUpdating}
                className="rounded-2xl"
              >
                {isUploading ? "Uploading..." : "Save"}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Upload a JPG, PNG, or WebP image (max 5MB). Your picture will be visible to everyone.
          </p>
        </div>
      </div>
    </Card>
  );
}

