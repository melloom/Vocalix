import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Edit, Lock, History } from "lucide-react";
import { format } from "date-fns";
import { WikiEditor } from "./WikiEditor";
import { WikiHistory } from "./WikiHistory";

interface WikiPage {
  id: string;
  community_id: string;
  title: string;
  content: string;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
  created_by_profile_id: string | null;
  updated_by_profile_id: string | null;
}

interface WikiViewerProps {
  communityId: string;
  pageId?: string;
  canEdit?: boolean;
}

export function WikiViewer({ communityId, pageId, canEdit = false }: WikiViewerProps) {
  const { toast } = useToast();
  const [page, setPage] = useState<WikiPage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (pageId) {
      loadPage();
    }
  }, [pageId, communityId]);

  const loadPage = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from("wiki_pages")
        .select("*")
        .eq("id", pageId)
        .eq("community_id", communityId)
        .single();

      if (error) throw error;
      setPage(data);
    } catch (error: any) {
      console.error("Error loading wiki page:", error);
      toast({
        title: "Error",
        description: "Failed to load wiki page",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6">
          <Skeleton className="h-8 w-3/4 mb-4" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    );
  }

  if (!page) {
    return (
      <Card className="rounded-3xl">
        <CardContent className="p-6 text-center">
          <p className="text-muted-foreground">Wiki page not found</p>
        </CardContent>
      </Card>
    );
  }

  if (isEditing) {
    return (
      <WikiEditor
        pageId={page.id}
        initialTitle={page.title}
        initialContent={page.content}
        onSave={() => {
          setIsEditing(false);
          loadPage();
        }}
        onCancel={() => setIsEditing(false)}
      />
    );
  }

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="flex items-center gap-2">
              {page.title}
              {page.is_locked && (
                <Lock className="h-4 w-4 text-muted-foreground" />
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-2">
              Last updated {format(new Date(page.updated_at), "PPP")}
            </p>
          </div>
          <div className="flex gap-2">
            {canEdit && !page.is_locked && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="rounded-2xl"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(true)}
              className="rounded-2xl"
            >
              <History className="mr-2 h-4 w-4" />
              History
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div
          className="prose prose-sm dark:prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: page.content }}
        />
      </CardContent>
      {showHistory && (
        <WikiHistory
          pageId={page.id}
          open={showHistory}
          onOpenChange={setShowHistory}
        />
      )}
    </Card>
  );
}

