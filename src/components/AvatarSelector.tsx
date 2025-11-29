import { useState, useRef, useEffect } from "react";
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

// Free Avatar Icon APIs - Multiple sources for diverse profile avatars
const getAvatarUrl = (avatarId: AvatarType): string => {
  const seed = avatarId.replace('avatar', '');
  const avatarNum = parseInt(seed) || 1;
  
  // Use different avatar APIs - ONLY visual icons, NO letters/initials/emojis
  // All free, no API key needed, all show actual profile picture icons
  const avatarSources = [
    // DiceBear - avataaars (cartoon faces) - NO identicon/initials
    () => {
      const styles = ['avataaars', 'personas', 'bottts', 'lorelei', 'micah', 'big-ears', 'big-smile', 'notionists'];
      const styleIndex = (avatarNum - 1) % styles.length;
      const style = styles[styleIndex];
      const uniqueSeed = `echo-avatar-${avatarNum}-style-${styleIndex}-seed-${avatarNum * 127 + styleIndex * 31}`;
      const bgColors = ['b6e3f4', 'c0aede', 'd1d4f9', 'ffd5dc', 'ffdfbf', 'e0bbff', 'ffbea3', 'a8e6cf'][avatarNum % 8];
      return `https://api.dicebear.com/7.x/${style}/svg?seed=${encodeURIComponent(uniqueSeed)}&backgroundColor=${bgColors}&radius=50`;
    },
    // Pixel Art avatars - fun pixel style
    () => {
      const seed = `echo-avatar-${avatarNum}-pixel-${avatarNum * 47}`;
      return `https://api.dicebear.com/7.x/pixel-art/svg?seed=${encodeURIComponent(seed)}&size=128`;
    },
    // Funky avatars - colorful fun style
    () => {
      const seed = `echo-avatar-${avatarNum}-funky-${avatarNum * 73}`;
      return `https://api.dicebear.com/7.x/funky/svg?seed=${encodeURIComponent(seed)}&size=128`;
    },
    // Open Peeps - illustrated people
    () => {
      const seed = `echo-avatar-${avatarNum}-peeps-${avatarNum * 89}`;
      return `https://api.dicebear.com/7.x/open-peeps/svg?seed=${encodeURIComponent(seed)}&size=128`;
    },
    // RoboHash - robot/icon avatars (visual only, no letters)
    () => {
      const seed = `echo-avatar-${avatarNum}`;
      const sets = ['set1', 'set2', 'set3', 'set4', 'set5'][Math.floor((avatarNum - 1) / 5) % 5];
      return `https://robohash.org/${encodeURIComponent(seed)}?set=${sets}&size=128x128&bgset=bg1`;
    },
  ];
  
  // Distribute avatars across different sources - ensures variety
  const sourceIndex = (avatarNum - 1) % avatarSources.length;
  return avatarSources[sourceIndex]();
};

// Avatar Icon Component - uses multiple free avatar APIs
const AvatarIcon = ({ 
  type, 
  className = "" 
}: { 
  type: AvatarType; 
  className?: string;
}) => {
  const [avatarUrl, setAvatarUrl] = useState<string>(getAvatarUrl(type));
  const [imageError, setImageError] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  
  const handleImageError = () => {
    if (!imageError) {
      setImageError(true);
      // Try fallback avatar URL
      const fallbackUrl = getAvatarUrl(type);
      if (fallbackUrl !== avatarUrl) {
        setAvatarUrl(fallbackUrl);
        setImageError(false);
        setImageLoaded(false);
      }
    }
  };
  
  return (
    <div 
      className={`rounded-full flex items-center justify-center overflow-hidden bg-gradient-to-br from-red-600/20 to-rose-600/20 ${className}`}
      style={{ minWidth: '100%', minHeight: '100%', aspectRatio: '1' }}
    >
      {!imageError ? (
        <img 
          src={avatarUrl}
          alt={`Avatar ${type}`}
          className={`w-full h-full object-cover rounded-full transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
          loading="lazy"
          onLoad={() => setImageLoaded(true)}
          onError={handleImageError}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-600 to-gray-700 rounded-full">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
        </div>
      )}
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
    <Card className="p-6 rounded-3xl space-y-6 bg-gradient-to-br from-red-950/50 via-amber-950/40 to-red-900/30 dark:from-red-950/40 dark:via-amber-950/30 dark:to-red-900/25 border border-red-900/40 dark:border-red-800/30">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold text-gray-900 dark:text-white">Avatar</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Upload a custom image or choose from preset avatars
          </p>
        </div>
        <div className="relative">
          <Avatar className="h-16 w-16 border-2 border-red-500/40 dark:border-red-400/40 ring-2 ring-red-500/20">
            {currentImage ? (
              <AvatarImage src={currentImage} alt="Avatar" className="object-cover" />
            ) : currentAvatarType ? (
              <AvatarIcon type={currentAvatarType} className="w-full h-full" />
            ) : (
              <AvatarFallback className="text-3xl bg-gradient-to-br from-red-600 to-rose-600">
                {getEmojiAvatar(profile?.emoji_avatar, "🎧")}
              </AvatarFallback>
            )}
          </Avatar>
          {currentImage && (
            <Button
              variant="destructive"
              size="icon"
              className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-red-600 hover:bg-red-700"
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
            className="rounded-xl flex-1 border-red-900/40 dark:border-red-800/30 hover:bg-red-950/40 dark:hover:bg-red-950/30 text-gray-900 dark:text-gray-100 bg-white/90 dark:bg-gray-800/90 hover:bg-white dark:hover:bg-gray-800"
          >
            <Upload className="h-4 w-4 mr-2" />
            {currentImage ? "Change Image" : "Upload Custom Image"}
          </Button>
          {preview && (
            <Button
              onClick={handleUploadCustom}
              disabled={isUploading || isUpdating}
              className="rounded-xl bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white"
            >
              {isUploading ? "Uploading..." : "Save"}
            </Button>
          )}
        </div>
      </div>

      {/* Preset Avatars */}
      <div className="space-y-3">
        <p className="text-xs font-semibold text-gray-300 dark:text-gray-300">
          Choose from preset avatars
        </p>
        <div className="grid grid-cols-6 gap-3 p-4 rounded-xl bg-gradient-to-br from-red-950/50 via-amber-950/40 to-red-900/30 dark:from-red-950/40 dark:via-amber-950/30 dark:to-red-900/25 border border-red-900/40 dark:border-red-800/30 max-h-72 overflow-y-auto">
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
                className={`flex h-14 w-full items-center justify-center rounded-xl transition-all duration-200 ${
                  isSelected
                    ? "ring-2 ring-red-400 scale-110 bg-red-900/40 dark:bg-red-900/30 shadow-lg shadow-red-500/30"
                    : "hover:scale-105 active:scale-95 hover:bg-red-900/30 dark:hover:bg-red-900/20"
                }`}
              >
                <AvatarIcon type={avatarType} className="w-12 h-12" />
              </button>
            );
          })}
        </div>
      </div>

      {selectedAvatar && selectedAvatar !== getCurrentAvatarType() && (
        <Button
          onClick={handleSave}
          disabled={isUpdating}
          className="w-full rounded-xl bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-700 hover:to-red-700 text-white font-semibold"
        >
          {isUpdating ? "Saving..." : "Save Avatar"}
        </Button>
      )}
    </Card>
  );
}

