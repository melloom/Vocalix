import { useState, useEffect } from "react";
import { Mic, Check, X, Clock, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { logError } from "@/lib/logger";
import { useProfile } from "@/hooks/useProfile";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";

interface ConsentRequest {
  id: string;
  requester_id: string;
  requester_handle: string;
  requester_emoji_avatar: string;
  source_clip_id: string;
  source_clip_title: string;
  purpose: string;
  message: string;
  created_at: string;
}

export function VoiceCloningConsentManagement() {
  const { toast } = useToast();
  const { profile } = useProfile();
  const [requests, setRequests] = useState<ConsentRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [responseMessage, setResponseMessage] = useState("");
  const [isResponding, setIsResponding] = useState(false);

  useEffect(() => {
    if (profile?.id) {
      loadRequests();
    }
  }, [profile?.id]);

  const loadRequests = async () => {
    if (!profile?.id) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .rpc("get_pending_voice_cloning_requests", {
          p_creator_id: profile.id,
        });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      logError("Failed to load voice cloning requests", error);
      toast({
        title: "Error",
        description: "Failed to load voice cloning requests.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRespond = async (requestId: string, status: "approved" | "rejected") => {
    setIsResponding(true);
    try {
      const { error } = await supabase
        .from("voice_cloning_consents")
        .update({
          status,
          response_message: responseMessage || null,
          responded_at: new Date().toISOString(),
        })
        .eq("id", requestId);

      if (error) throw error;

      toast({
        title: status === "approved" ? "Request approved" : "Request rejected",
        description: `The voice cloning request has been ${status}.`,
      });

      setRespondingTo(null);
      setResponseMessage("");
      loadRequests();
    } catch (error) {
      logError("Failed to respond to voice cloning request", error);
      toast({
        title: "Error",
        description: "Failed to respond to request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsResponding(false);
    }
  };

  const getPurposeLabel = (purpose: string) => {
    switch (purpose) {
      case "accessibility":
        return "Accessibility";
      case "translation":
        return "Translation";
      case "content_creation":
        return "Content Creation";
      default:
        return "Other";
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 rounded-3xl">
        <p className="text-sm text-muted-foreground">Loading requests...</p>
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <Card className="p-6 rounded-3xl">
        <div className="text-center py-8">
          <Mic className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            No pending voice cloning requests
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="p-6 rounded-3xl">
        <div className="flex items-center gap-2 mb-4">
          <Mic className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Voice Cloning Requests</h3>
          <Badge variant="secondary">{requests.length}</Badge>
        </div>

        <div className="space-y-4">
          {requests.map((request) => (
            <Card key={request.id} className="p-4 rounded-2xl">
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="text-2xl">
                      {request.requester_emoji_avatar || "👤"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Link
                        to={`/profile/${request.requester_handle}`}
                        className="font-medium hover:underline"
                      >
                        @{request.requester_handle}
                      </Link>
                      <p className="text-sm text-muted-foreground">
                        wants to clone your voice
                      </p>
                      <Link
                        to={`/clip/${request.source_clip_id}`}
                        className="text-sm text-primary hover:underline mt-1 block"
                      >
                        From: {request.source_clip_title || "Untitled Clip"}
                      </Link>
                    </div>
                  </div>
                  <Badge variant="outline" className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {getPurposeLabel(request.purpose)}
                  </Badge>
                </div>

                {request.message && (
                  <div className="p-3 bg-muted rounded-xl">
                    <p className="text-sm">{request.message}</p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRespondingTo(request.id);
                      setResponseMessage("");
                    }}
                    className="rounded-2xl flex-1"
                  >
                    <X className="h-4 w-4 mr-2" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => {
                      setRespondingTo(request.id);
                      setResponseMessage("");
                    }}
                    className="rounded-2xl flex-1"
                  >
                    <Check className="h-4 w-4 mr-2" />
                    Approve
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Card>

      <Dialog
        open={respondingTo !== null}
        onOpenChange={(open) => {
          if (!open) {
            setRespondingTo(null);
            setResponseMessage("");
          }
        }}
      >
        <DialogContent className="sm:max-w-lg rounded-3xl">
          <DialogHeader>
            <DialogTitle>Respond to Request</DialogTitle>
            <DialogDescription>
              {requests.find((r) => r.id === respondingTo) && (
                <>
                  Respond to @
                  {requests.find((r) => r.id === respondingTo)?.requester_handle}
                  's voice cloning request
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="response">Response Message (optional)</Label>
              <Textarea
                id="response"
                placeholder="Add a message to explain your decision..."
                value={responseMessage}
                onChange={(e) => setResponseMessage(e.target.value)}
                className="rounded-2xl min-h-[100px]"
                maxLength={500}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  if (respondingTo) {
                    handleRespond(respondingTo, "rejected");
                  }
                }}
                className="rounded-2xl"
                disabled={isResponding}
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
              <Button
                onClick={() => {
                  if (respondingTo) {
                    handleRespond(respondingTo, "approved");
                  }
                }}
                className="rounded-2xl"
                disabled={isResponding}
              >
                <Check className="h-4 w-4 mr-2" />
                Approve
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

