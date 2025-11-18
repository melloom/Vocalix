import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface Revision {
  id: string;
  title: string;
  content: string;
  edited_by_profile_id: string | null;
  created_at: string;
  profiles?: {
    handle: string;
    emoji_avatar: string;
  } | null;
}

interface WikiHistoryProps {
  pageId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WikiHistory({ pageId, open, onOpenChange }: WikiHistoryProps) {
  const { toast } = useToast();
  const [revisions, setRevisions] = useState<Revision[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadRevisions();
    }
  }, [open, pageId]);

  const loadRevisions = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("wiki_revisions")
        .select(
          `
          *,
          profiles (
            handle,
            emoji_avatar
          )
        `
        )
        .eq("wiki_page_id", pageId)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setRevisions(data || []);
    } catch (error: any) {
      console.error("Error loading revisions:", error);
      toast({
        title: "Error",
        description: "Failed to load revision history",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Revision History</DialogTitle>
          <DialogDescription>
            View all changes made to this wiki page
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {isLoading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : revisions.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No revisions yet
            </p>
          ) : (
            revisions.map((revision, index) => (
              <div
                key={revision.id}
                className="border rounded-2xl p-4 space-y-2"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {revision.profiles && (
                      <span className="text-xl">
                        {revision.profiles.emoji_avatar}
                      </span>
                    )}
                    <div>
                      <p className="font-medium">
                        {revision.profiles?.handle || "Anonymous"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(revision.created_at), "PPP p")}
                      </p>
                    </div>
                  </div>
                  {index === 0 && (
                    <Badge variant="default">Current</Badge>
                  )}
                </div>
                <div className="text-sm">
                  <p className="font-medium">{revision.title}</p>
                  <p className="text-muted-foreground line-clamp-2">
                    {revision.content.substring(0, 200)}
                    {revision.content.length > 200 && "..."}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

