import { useState, useRef } from "react";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

interface CoverImageUploadProps {
  onSuccess?: () => void;
}

export function CoverImageUpload({ onSuccess }: CoverImageUploadProps = {}) {
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
      const fileName = `${userId}/cover-image-${Date.now()}.${file.name.split('.').pop()}`;
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
      await updateProfile({ cover_image_url: publicUrl });
      toast.success("Cover image updated!");
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onSuccess?.();
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload cover image");
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemove = async () => {
    if (!profile?.cover_image_url) return;

    try {
      await updateProfile({ cover_image_url: null });
      toast.success("Cover image removed");
      setPreview(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to remove cover image");
    }
  };

  const currentImage = preview || profile?.cover_image_url || null;

  return (
    <Card className="p-6 rounded-3xl space-y-4">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">Cover Image</h3>
      </div>

      <div className="space-y-3">
        <div className="relative w-full h-48 rounded-2xl overflow-hidden border-2 border-border bg-muted">
          {currentImage ? (
            <img
              src={currentImage}
              alt="Cover"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <div className="text-center">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No cover image</p>
              </div>
            </div>
          )}
          {currentImage && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute top-2 right-2 h-8 w-8 rounded-full"
              onClick={handleRemove}
              disabled={isUpdating}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

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
            className="rounded-2xl flex-1"
          >
            <Upload className="h-4 w-4 mr-2" />
            {currentImage ? "Change Cover" : "Upload Cover"}
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
          Upload a JPG, PNG, or WebP image (max 5MB). Recommended size: 1200x400px.
        </p>
      </div>
    </Card>
  );
}

