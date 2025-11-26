import { useState, useEffect } from "react";
import { Edit3, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useProfile } from "@/hooks/useProfile";
import { toast } from "sonner";

export function ProfileBioEditor() {
  const { profile, updateProfile, isUpdating } = useProfile();
  const [bio, setBio] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (profile?.bio) {
      setBio(profile.bio);
    }
  }, [profile]);

  const handleSave = async () => {
    try {
      await updateProfile({ bio: bio.trim() || null });
      toast.success("Bio updated!");
      setIsEditing(false);
    } catch (error: any) {
      toast.error(error.message || "Failed to update bio");
    }
  };

  const handleCancel = () => {
    setBio(profile?.bio || "");
    setIsEditing(false);
  };

  return (
    <Card className="p-6 rounded-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Edit3 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Bio</h3>
        </div>
        {!isEditing && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsEditing(true)}
            className="rounded-2xl"
          >
            <Edit3 className="h-4 w-4 mr-2" />
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-3">
          <div>
            <Label htmlFor="bio">Tell people about yourself</Label>
            <Textarea
              id="bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write a short bio..."
              className="mt-2 rounded-xl min-h-[100px]"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {bio.length}/500 characters
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={isUpdating}
              className="rounded-2xl flex-1"
            >
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isUpdating}
              className="rounded-2xl"
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div>
          {profile?.bio ? (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">
              {profile.bio}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              No bio yet. Click Edit to add one.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

