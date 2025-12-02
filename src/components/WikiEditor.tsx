import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useProfile } from "@/hooks/useProfile";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface WikiEditorProps {
  pageId: string;
  initialTitle: string;
  initialContent: string;
  onSave: () => void;
  onCancel: () => void;
}

export function WikiEditor({
  pageId,
  initialTitle,
  initialContent,
  onSave,
  onCancel,
}: WikiEditorProps) {
  const { profile } = useProfile();
  const { toast } = useToast();
  const [title, setTitle] = useState(initialTitle);
  const [content, setContent] = useState(initialContent);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Please enter a title",
        variant: "destructive",
      });
      return;
    }

    if (!content.trim()) {
      toast({
        title: "Error",
        description: "Please enter content",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsSaving(true);
      const { error } = await supabase
        .from("wiki_pages")
        .update({
          title: title.trim(),
          content: content.trim(),
          updated_by_profile_id: profile?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", pageId);

      if (error) throw error;

      // Create revision
      const { error: revisionError } = await supabase
        .from("wiki_revisions")
        .insert({
          wiki_page_id: pageId,
          title: title.trim(),
          content: content.trim(),
          edited_by_profile_id: profile?.id || null,
        });

      if (revisionError) {
        console.error("Error creating revision:", revisionError);
      }

      toast({
        title: "Saved!",
        description: "Wiki page updated successfully",
      });

      onSave();
    } catch (error: any) {
      console.error("Error saving wiki page:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to save wiki page",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle>Edit Wiki Page</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Title</Label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="rounded-2xl"
            placeholder="Page title"
          />
        </div>
        <div className="space-y-2">
          <Label>Content (Markdown supported)</Label>
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="rounded-2xl min-h-[300px] font-mono"
            placeholder="Write your wiki content here..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancel} className="rounded-2xl">
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || !title.trim() || !content.trim()}
            className="rounded-2xl"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

