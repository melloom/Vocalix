import { useState, useEffect } from "react";
import { Edit, Save, X, Volume2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { logError } from "@/lib/logger";

interface CaptionEditorProps {
  clipId: string;
  currentCaption: string | null;
  transcription: string | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (caption: string) => void;
}

export const CaptionEditor = ({
  clipId,
  currentCaption,
  transcription,
  isOpen,
  onClose,
  onSave,
}: CaptionEditorProps) => {
  const [caption, setCaption] = useState(currentCaption || transcription || "");
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      setCaption(currentCaption || transcription || "");
    }
  }, [isOpen, currentCaption, transcription]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('clips')
        .update({ captions: caption.trim() || null })
        .eq('id', clipId);

      if (error) throw error;

      onSave(caption.trim());
      toast({
        title: "Caption saved",
        description: "Your caption has been updated",
      });
      onClose();
    } catch (error) {
      logError('Failed to save caption', error);
      toast({
        title: "Failed to save caption",
        description: "Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleUseTranscription = () => {
    if (transcription) {
      setCaption(transcription);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit Caption</DialogTitle>
          <DialogDescription>
            Edit the caption for this clip. Captions help make your content more accessible.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="caption">Caption</Label>
              {transcription && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUseTranscription}
                  className="text-xs"
                >
                  <Volume2 className="h-3 w-3 mr-1" />
                  Use Transcription
                </Button>
              )}
            </div>
            <Textarea
              id="caption"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              placeholder="Enter caption text..."
              className="min-h-[150px]"
              maxLength={1000}
            />
            <p className="text-xs text-muted-foreground">
              {caption.length}/1000 characters
            </p>
          </div>

          {transcription && transcription !== caption && (
            <div className="p-3 rounded-lg bg-muted/40">
              <p className="text-xs font-medium mb-1">Original Transcription</p>
              <p className="text-xs text-muted-foreground">{transcription}</p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? "Saving..." : "Save Caption"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

