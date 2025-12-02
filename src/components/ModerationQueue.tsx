import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle, XCircle, Eye, Clock, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDistanceToNow } from "date-fns";

interface ModerationItem {
  id: string;
  item_type: string;
  item_id: string;
  reason: string;
  workflow_state: string;
  priority: number;
  created_at: string;
  reported_by_profile_id?: string;
  auto_flagged_by_rule_id?: string;
  moderation_notes?: string;
  assigned_to?: string;
}

interface ModerationQueueProps {
  communityId: string;
  isHost: boolean;
}

export const ModerationQueue = ({ communityId, isHost }: ModerationQueueProps) => {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [selectedItem, setSelectedItem] = useState<ModerationItem | null>(null);
  const [isActionDialogOpen, setIsActionDialogOpen] = useState(false);
  const [action, setAction] = useState<"approve" | "remove" | "hide">("approve");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    loadQueue();
  }, [communityId, filter]);

  const loadQueue = async () => {
    try {
      let query = supabase
        .from("community_moderation_queue")
        .select("*")
        .eq("community_id", communityId)
        .order("priority", { ascending: false })
        .order("created_at", { ascending: false });

      if (filter !== "all") {
        query = query.eq("workflow_state", filter);
      }

      const { data, error } = await query;

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error("Error loading moderation queue:", error);
      toast({
        title: "Error loading queue",
        description: "Could not load moderation queue.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAction = async () => {
    if (!selectedItem) return;

    try {
      const profileId = localStorage.getItem("profileId");
      if (!profileId) {
        toast({
          title: "Error",
          description: "Please log in to take action.",
          variant: "destructive",
        });
        return;
      }

      // Update the item in the queue
      const { error: updateError } = await supabase
        .from("community_moderation_queue")
        .update({
          workflow_state: action === "approve" ? "resolved" : "actioned",
          reviewed_at: new Date().toISOString(),
          reviewed_by: profileId,
          moderation_notes: notes || null,
        })
        .eq("id", selectedItem.id);

      if (updateError) throw updateError;

      // If removing or hiding, update the actual content
      if (action === "remove" && selectedItem.item_type === "clip") {
        const { error: clipError } = await supabase
          .from("clips")
          .update({ status: "removed" })
          .eq("id", selectedItem.item_id);

        if (clipError) throw clipError;
      } else if (action === "hide" && selectedItem.item_type === "clip") {
        const { error: clipError } = await supabase
          .from("clips")
          .update({ status: "hidden" })
          .eq("id", selectedItem.item_id);

        if (clipError) throw clipError;
      }

      toast({
        title: "Action taken",
        description: `Item has been ${action === "approve" ? "approved" : action === "remove" ? "removed" : "hidden"}.`,
      });

      setIsActionDialogOpen(false);
      setSelectedItem(null);
      setNotes("");
      loadQueue();
    } catch (error) {
      console.error("Error taking action:", error);
      toast({
        title: "Error",
        description: "Could not complete action. Please try again.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Moderation Queue</h3>
          <p className="text-sm text-muted-foreground">
            Review and take action on reported content.
          </p>
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px] rounded-2xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Items</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_review">In Review</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
            <SelectItem value="actioned">Actioned</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {items.length === 0 ? (
        <Card className="p-8 text-center rounded-2xl">
          <CheckCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No items in the moderation queue.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Card key={item.id} className="p-4 rounded-2xl">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge variant="outline">{item.item_type}</Badge>
                    <Badge
                      variant={
                        item.priority >= 7
                          ? "destructive"
                          : item.priority >= 4
                          ? "default"
                          : "secondary"
                      }
                    >
                      Priority: {item.priority}
                    </Badge>
                    <Badge
                      variant={
                        item.workflow_state === "pending"
                          ? "default"
                          : item.workflow_state === "in_review"
                          ? "secondary"
                          : "outline"
                      }
                    >
                      {item.workflow_state}
                    </Badge>
                    {item.auto_flagged_by_rule_id && (
                      <Badge variant="outline">Auto-flagged</Badge>
                    )}
                  </div>
                  <p className="font-medium mb-1">Reason: {item.reason}</p>
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </p>
                  {item.moderation_notes && (
                    <p className="text-sm text-muted-foreground mt-2">
                      Notes: {item.moderation_notes}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedItem(item);
                      setIsActionDialogOpen(true);
                    }}
                    className="rounded-xl"
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Review
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isActionDialogOpen} onOpenChange={setIsActionDialogOpen}>
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>Take Action</DialogTitle>
            <DialogDescription>
              Review the item and decide on an action.
            </DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={action} onValueChange={(value: any) => setAction(value)}>
                  <SelectTrigger className="rounded-2xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="approve">Approve (Resolve)</SelectItem>
                    <SelectItem value="hide">Hide Content</SelectItem>
                    <SelectItem value="remove">Remove Content</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Moderation Notes (Optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add notes about this decision..."
                  className="rounded-2xl min-h-[100px]"
                  maxLength={500}
                />
              </div>

              <div className="p-4 bg-muted rounded-2xl">
                <p className="text-sm font-medium mb-2">Item Details:</p>
                <p className="text-sm text-muted-foreground">
                  Type: {selectedItem.item_type}
                </p>
                <p className="text-sm text-muted-foreground">
                  Reason: {selectedItem.reason}
                </p>
                <p className="text-sm text-muted-foreground">
                  Priority: {selectedItem.priority}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsActionDialogOpen(false);
                setSelectedItem(null);
                setNotes("");
              }}
              className="rounded-2xl"
            >
              Cancel
            </Button>
            <Button onClick={handleAction} className="rounded-2xl">
              {action === "approve" ? "Approve" : action === "remove" ? "Remove" : "Hide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

