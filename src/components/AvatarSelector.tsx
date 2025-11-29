import { useState, useRef } from "react";
import { useProfile } from "@/hooks/useProfile";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getEmojiAvatar } from "@/utils/avatar";
import { Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Same avatar types as onboarding
type AvatarType = 
  | 'avatar1' | 'avatar2' | 'avatar3' | 'avatar4' | 'avatar5' | 'avatar6'
  | 'avatar7' | 'avatar8' | 'avatar9' | 'avatar10' | 'avatar11' | 'avatar12'
  | 'avatar13' | 'avatar14' | 'avatar15' | 'avatar16' | 'avatar17' | 'avatar18'
  | 'avatar19' | 'avatar20' | 'avatar21' | 'avatar22' | 'avatar23' | 'avatar24';

const AVATAR_TYPES: AvatarType[] = [
  'avatar1', 'avatar2', 'avatar3', 'avatar4', 'avatar5', 'avatar6',
  'avatar7', 'avatar8', 'avatar9', 'avatar10', 'avatar11', 'avatar12',
  'avatar13', 'avatar14', 'avatar15', 'avatar16', 'avatar17', 'avatar18',
  'avatar19', 'avatar20', 'avatar21', 'avatar22', 'avatar23', 'avatar24',
];

// Map avatar types to emojis for display
const AVATAR_TYPE_TO_EMOJI: Record<AvatarType, string> = {
  avatar1: '👤', avatar2: '👥', avatar3: '👨', avatar4: '👩', avatar5: '🧑', avatar6: '👤',
  avatar7: '👥', avatar8: '👨', avatar9: '👩', avatar10: '🧑', avatar11: '👤', avatar12: '👥',
  avatar13: '👨', avatar14: '👩', avatar15: '🧑', avatar16: '👤', avatar17: '👥', avatar18: '👨',
  avatar19: '👩', avatar20: '🧑', avatar21: '👤', avatar22: '👥', avatar23: '👨', avatar24: '👩',
};

// DiceBear avatar URL generator - avoiding "initials" style to prevent letter avatars
const getDiceBearAvatarUrl = (avatarId: AvatarType): string => {
  const seed = avatarId.replace('avatar', '');
  const avatarNum = parseInt(seed) || 1;
  // Removed 'initials' style to prevent "EA" or letter avatars
  // Using only visual styles that generate proper avatars
  const styles = ['avataaars', 'personas', 'identicon', 'bottts', 'lorelei', 'micah'];
  const styleIndex = (avatarNum - 1) % styles.length;
  const style = styles[styleIndex];
  // Create truly unique seed to ensure each avatar is different
  const uniqueSeed = `echo-${avatarNum}-${avatarNum * 23 + styleIndex * 17}-${Date.now() % 100000}`;
  const bgColorSets = [
    'b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf',
    'ffd5dc,ffdfbf,b6e3f4,c0aede,d1d4f9',
    'd1d4f9,ffd5dc,ffdfbf,b6e3f4,c0aede',
    'c0aede,d1d4f9,ffd5dc,ffdfbf,b6e3f4',
  ];
  const bgColors = bgColorSets[Math.floor((avatarNum - 1) / 6) % bgColorSets.length];
  return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(uniqueSeed)}&backgroundColor=${bgColors}&radius=50`;
};

// Avatar Icon Component
const AvatarIcon = ({ 
  type, 
  className = "" 
}: { 
  type: AvatarType; 
  className?: string;
}) => {
  const avatarUrl = getDiceBearAvatarUrl(type);
  
  return (
    <div 
      className={`rounded-full flex items-center justify-center overflow-hidden ${className}`}
      style={{ minWidth: '100%', minHeight: '100%', aspectRatio: '1' }}
    >
      <img 
        src={avatarUrl}
        alt={`Avatar ${type}`}
        className="w-full h-full object-cover rounded-full"
        loading="lazy"
        onError={(e) => {
          const target = e.target as HTMLImageElement;
          target.style.display = 'none';
          const parent = target.parentElement;
          if (parent && !parent.querySelector('.fallback')) {
            const fallback = document.createElement('div');
            fallback.className = 'fallback w-full h-full flex items-center justify-center text-white text-xl font-bold bg-gradient-to-br from-red-600 to-rose-600 rounded-full';
            fallback.textContent = AVATAR_TYPE_TO_EMOJI[type] || '👤';
            parent.appendChild(fallback);
          }
        }}
      />
    </div>
  );
};

export function AvatarSelector() {
  const { profile, updateProfile, isUpdating } = useProfile();
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarType | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Find current avatar type from emoji_avatar
  const getCurrentAvatarType = (): AvatarType | null => {
    if (!profile?.emoji_avatar) return null;
    const emoji = profile.emoji_avatar;
    // Try to match current emoji to avatar types
    for (const [type, emojiValue] of Object.entries(AVATAR_TYPE_TO_EMOJI)) {
      if (emojiValue === emoji) {
        return type as AvatarType;
      }
    }
    return null;
  };

  const currentAvatarType = selectedAvatar || getCurrentAvatarType() || AVATAR_TYPES[0];

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be less than 5MB");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      setPreview(reader.result as string);
      setSelectedAvatar(null); // Clear avatar selection when uploading custom image
    };
    reader.readAsDataURL(file);
  };

  const handleUploadCustom = async () => {
    const file = fileInputRef.current?.files?.[0];
    if (!file || !profile?.id) return;

    setIsUploading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || profile.id;

      const fileName = `${userId}/avatar-${Date.now()}.${file.name.split('.').pop()}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-images")
        .upload(fileName, file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("profile-images")
        .getPublicUrl(fileName);

      await updateProfile({ profile_picture_url: publicUrl });
      toast.success("Avatar updated!");
      setPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(error.message || "Failed to upload avatar");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedAvatar) {
      toast.info("Please select an avatar first");
      return;
    }

    try {
      const emoji = AVATAR_TYPE_TO_EMOJI[selectedAvatar];
      await updateProfile({ emoji_avatar: emoji });
      toast.success("Avatar updated!");
      setSelectedAvatar(null);
    } catch (error: any) {
      console.error("Failed to update avatar:", error);
      toast.error(error.message || "Failed to update avatar");
    }
  };

  const currentImage = preview || profile?.profile_picture_url || null;

  return (
    <Card className="p-6 rounded-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Avatar</h3>
          <p className="text-sm text-muted-foreground">
            Upload a custom image or choose from preset avatars.
          </p>
        </div>
        <div className="relative">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            {currentImage ? (
              <AvatarImage src={currentImage} alt="Avatar" />
            ) : (
              <AvatarFallback className="text-3xl">
                {getEmojiAvatar(profile?.emoji_avatar, "🎧")}
              </AvatarFallback>
            )}
          </Avatar>
          {currentImage && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full"
              onClick={async () => {
                await updateProfile({ profile_picture_url: null });
                setPreview(null);
                toast.success("Avatar removed");
              }}
              disabled={isUpdating}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Custom Image Upload */}
      <div className="space-y-3">
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
            {currentImage ? "Change Image" : "Upload Custom Image"}
          </Button>
          {preview && (
            <Button
              onClick={handleUploadCustom}
              disabled={isUploading || isUpdating}
              className="rounded-2xl"
            >
              {isUploading ? "Uploading..." : "Save"}
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Or choose from preset avatars below
        </p>
      </div>

      {/* Preset Avatars */}
      <div className="grid grid-cols-6 gap-3 p-4 rounded-xl bg-gradient-to-br from-red-950/30 via-amber-950/20 to-slate-900/40 dark:from-red-950/20 dark:via-amber-950/10 dark:to-slate-900/30 border border-red-900/30 dark:border-red-800/20 max-h-64 overflow-y-auto">
        {AVATAR_TYPES.map((avatarType) => {
          const isSelected = selectedAvatar === avatarType || (!selectedAvatar && avatarType === currentAvatarType);
          return (
            <button
              key={avatarType}
              type="button"
              onClick={() => {
                setSelectedAvatar(avatarType);
                setPreview(null);
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }}
              className={`flex h-12 w-full items-center justify-center rounded-lg transition-all duration-200 ${
                isSelected
                  ? "ring-2 ring-primary scale-110 bg-primary/10"
                  : "hover:scale-105 active:scale-95 hover:bg-slate-700/30"
              }`}
            >
              <AvatarIcon type={avatarType} className="w-10 h-10" />
            </button>
          );
        })}
      </div>

      {selectedAvatar && selectedAvatar !== getCurrentAvatarType() && (
        <Button
          onClick={handleSave}
          disabled={isUpdating}
          className="w-full rounded-2xl"
        >
          {isUpdating ? "Saving..." : "Save Avatar"}
        </Button>
      )}
    </Card>
  );
}

