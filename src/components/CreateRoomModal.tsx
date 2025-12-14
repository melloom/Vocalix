import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useNavigate } from "react-router-dom";
import { logError } from "@/lib/logger";

interface CreateRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const CreateRoomModal = ({
  isOpen,
  onClose,
  onSuccess,
}: CreateRoomModalProps) => {
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [recordingEnabled, setRecordingEnabled] = useState(true);
  const [transcriptionEnabled, setTranscriptionEnabled] = useState(true);
  const [maxSpeakers, setMaxSpeakers] = useState(10);
  const [maxListeners, setMaxListeners] = useState(100);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduledTime, setScheduledTime] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAMA, setIsAMA] = useState(false);
  const [amaQuestionDeadline, setAmaQuestionDeadline] = useState("");
  const [initialSpeakers, setInitialSpeakers] = useState<string>(""); // Comma-separated handles

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!profile?.id) {
      toast({
        title: "Authentication required",
        description: "Please log in to create a room",
        variant: "destructive",
      });
      return;
    }

    if (!title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a room title",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSubmitting(true);

      // Validate room limits
      const { data: limitsValidation, error: limitsError } = await supabase
        .rpc('validate_room_limits', {
          max_speakers_param: maxSpeakers,
          max_listeners_param: maxListeners,
        });

      if (limitsError) throw limitsError;
      if (!limitsValidation || limitsValidation.length === 0 || !limitsValidation[0].is_valid) {
        throw new Error(limitsValidation?.[0]?.reason || 'Invalid room limits');
      }

      // Check if user can create a live room (rate limiting)
      const { data: canCreate, error: canCreateError } = await supabase
        .rpc('can_create_live_room', { profile_id_param: profile.id });

      if (canCreateError) throw canCreateError;
      if (!canCreate || canCreate.length === 0 || !canCreate[0].can_create) {
        throw new Error(canCreate?.[0]?.reason || 'Cannot create live room at this time');
      }

      const roomData: any = {
        title: title.trim(),
        description: description.trim() || null,
        host_profile_id: profile.id,
        is_public: isPublic,
        recording_enabled: recordingEnabled,
        transcription_enabled: transcriptionEnabled,
        max_speakers: maxSpeakers,
        max_listeners: maxListeners,
        status: isScheduled && scheduledTime ? "scheduled" : "live",
        is_ama: isAMA,
        ama_host_profile_id: isAMA ? profile.id : null,
        ama_question_submission_enabled: isAMA,
      };

      if (isScheduled && scheduledTime) {
        roomData.scheduled_start_time = new Date(scheduledTime).toISOString();
        if (isAMA) {
          roomData.ama_scheduled_start_time = new Date(scheduledTime).toISOString();
        }
      } else {
        roomData.started_at = new Date().toISOString();
      }

      if (isAMA && amaQuestionDeadline) {
        roomData.ama_question_deadline = new Date(amaQuestionDeadline).toISOString();
      }

      const { data, error } = await supabase
        .from("live_rooms")
        .insert(roomData)
        .select()
        .single();

      if (error) throw error;

      // Add host as participant
      await supabase.from("room_participants").insert({
        room_id: data.id,
        profile_id: profile.id,
        role: "host",
      });

      // Add initial speakers if provided
      if (initialSpeakers.trim()) {
        const handles = initialSpeakers
          .split(",")
          .map((h) => h.trim())
          .filter((h) => h.length > 0);

        if (handles.length > 0) {
          // Look up profiles by handle
          const { data: profiles, error: profilesError } = await supabase
            .from("profiles")
            .select("id")
            .in("handle", handles);

          if (!profilesError && profiles) {
            // Add each profile as a speaker (excluding the host)
            const speakerProfiles = profiles.filter((p) => p.id !== profile.id);
            if (speakerProfiles.length > 0) {
              await supabase.from("room_participants").insert(
                speakerProfiles.map((p) => ({
                  room_id: data.id,
                  profile_id: p.id,
                  role: "speaker",
                }))
              );
            }
          }
        }
      }

      toast({
        title: "Room created!",
        description: isScheduled ? "Your room is scheduled" : "Starting your room...",
      });

      // Reset form
      setTitle("");
      setDescription("");
      setIsPublic(true);
      setRecordingEnabled(true);
      setTranscriptionEnabled(true);
      setMaxSpeakers(10);
      setMaxListeners(100);
      setIsScheduled(false);
      setScheduledTime("");
      setInitialSpeakers("");

      onSuccess?.();
      onClose();

      // Navigate to the room
      navigate(`/live-room/${data.id}`);
    } catch (error: any) {
      logError("Error creating room", error);
      toast({
        title: "Failed to create room",
        description: error.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create Live Room</DialogTitle>
          <DialogDescription>
            Start a live audio discussion room where people can join and speak
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Room Title *</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Tech Talk Tuesday"
              maxLength={100}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What will this room be about?"
              rows={3}
              maxLength={500}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="ama">AMA (Ask Me Anything)</Label>
              <Switch
                id="ama"
                checked={isAMA}
                onCheckedChange={setIsAMA}
              />
            </div>
            {isAMA && (
              <p className="text-sm text-muted-foreground">
                Allow users to submit audio questions for you to answer
              </p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="scheduled">Schedule for later</Label>
              <Switch
                id="scheduled"
                checked={isScheduled}
                onCheckedChange={setIsScheduled}
              />
            </div>
            {isScheduled && (
              <>
                <Input
                  type="datetime-local"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                  min={new Date().toISOString().slice(0, 16)}
                  placeholder="Room start time"
                />
                {isAMA && (
                  <Input
                    type="datetime-local"
                    value={amaQuestionDeadline}
                    onChange={(e) => setAmaQuestionDeadline(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    max={scheduledTime || undefined}
                    placeholder="Question submission deadline"
                  />
                )}
              </>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxSpeakers">Max Speakers</Label>
              <Input
                id="maxSpeakers"
                type="number"
                min={1}
                max={50}
                value={maxSpeakers}
                onChange={(e) => setMaxSpeakers(parseInt(e.target.value) || 10)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxListeners">Max Listeners</Label>
              <Input
                id="maxListeners"
                type="number"
                min={1}
                max={1000}
                value={maxListeners}
                onChange={(e) => setMaxListeners(parseInt(e.target.value) || 100)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="initialSpeakers">Initial Speakers (Optional)</Label>
            <Input
              id="initialSpeakers"
              value={initialSpeakers}
              onChange={(e) => setInitialSpeakers(e.target.value)}
              placeholder="Enter handles separated by commas (e.g., user1, user2)"
            />
            <p className="text-xs text-muted-foreground">
              Add users who will start as speakers. Enter their handles separated by commas.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="public">Public Room</Label>
              <Switch
                id="public"
                checked={isPublic}
                onCheckedChange={setIsPublic}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="recording">Enable Recording</Label>
              <Switch
                id="recording"
                checked={recordingEnabled}
                onCheckedChange={setRecordingEnabled}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="transcription">Enable Transcription</Label>
              <Switch
                id="transcription"
                checked={transcriptionEnabled}
                onCheckedChange={setTranscriptionEnabled}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : isScheduled ? "Schedule Room" : "Start Room"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};

